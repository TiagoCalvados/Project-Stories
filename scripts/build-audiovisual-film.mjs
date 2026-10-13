import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const projectRoot = process.cwd();
const sourceDirectory = path.join(projectRoot, "audiovisual");
const webDirectory = path.join(sourceDirectory, "web");
// Playback numbers follow this order; original source filenames stay intact.
const sourceFiles = ["1.mp4", "Sunday Morning.mp4", "2.mp4", "3.mp4", "4.mp4", "5.mp4", "6.mp4"];
// Normalize each original soundtrack independently, rather than stacking gains
// on earlier exports. Match measured loudness and limit brief peaks, leaving
// headroom for AAC encoding. Verify the actual encoded result before joining.
const audioTarget = { integrated: -20, peakCeiling: -4 };
const normalizedAudio = new Map();
const profiles = [
  { name: "desktop", width: 960, height: 540, maxRate: "850k", bufferSize: "1700k" },
  { name: "mobile", width: 540, height: 1170, maxRate: "620k", bufferSize: "1240k" },
];
const joinOnly = process.argv.includes("--join-only");
const audioOnly = process.argv.includes("--audio-only");
const requestedSegment = process.argv.find((argument) => argument.startsWith("--segment="))?.split("=")[1];
const requestedProfile = process.argv.find((argument) => argument.startsWith("--profile="))?.split("=")[1];
const activeProfiles = requestedProfile
  ? profiles.filter((profile) => profile.name === requestedProfile)
  : profiles;

if (!ffmpegPath) {
  throw new Error("ffmpeg-static did not provide an FFmpeg executable for this platform.");
}

if (requestedProfile && activeProfiles.length === 0) {
  throw new Error(`Unknown profile "${requestedProfile}". Use desktop or mobile.`);
}

if (joinOnly && audioOnly) {
  throw new Error("Use either --join-only or --audio-only, not both.");
}

if (requestedSegment && (!/^\d+$/.test(requestedSegment) || Number(requestedSegment) < 1 || Number(requestedSegment) > sourceFiles.length)) {
  throw new Error(`Unknown segment "${requestedSegment}". Use a number from 1 to ${sourceFiles.length}.`);
}

await mkdir(webDirectory, { recursive: true });

if (!joinOnly) {
  for (const [index, sourceFile] of sourceFiles.entries()) {
    if (!requestedSegment || index + 1 === Number(requestedSegment)) {
      normalizedAudio.set(sourceFile, await normalizeAudio(sourceFile));
    }
  }
}

for (const profile of activeProfiles) {
  await buildProfile(profile);
}

async function buildProfile(profile) {
  const segmentDirectory = path.join(webDirectory, `segments-${profile.name}`);
  const concatListPath = path.join(webDirectory, `concat-${profile.name}.txt`);
  const finalPath = path.join(webDirectory, `audiovisual-film-${profile.name}.mp4`);

  await mkdir(segmentDirectory, { recursive: true });

  if (!joinOnly) {
    for (const [index, sourceFile] of sourceFiles.entries()) {
      if (requestedSegment && index + 1 !== Number(requestedSegment)) {
        continue;
      }

      const inputPath = path.join(sourceDirectory, sourceFile);
      const outputPath = path.join(segmentDirectory, segmentFilename(sourceFile));
      const duration = readDuration(inputPath);

      if (audioOnly) {
        await validateSegmentTiming(outputPath, duration);
        const temporaryPath = outputPath.replace(/\.mp4$/, ".balanced.mp4");
        console.log(`Updating soundtrack ${index + 1}/${sourceFiles.length} for ${profile.name}...`);
        runFfmpeg([
          "-y", "-hide_banner", "-loglevel", "warning",
          "-i", outputPath, "-i", normalizedAudio.get(sourceFile),
          "-map", "0:v:0", "-map", "1:a:0", "-c", "copy",
          "-map_metadata", "-1", "-movflags", "+faststart", temporaryPath,
        ]);
        await validateSegmentTiming(temporaryPath, duration);
        await rename(temporaryPath, outputPath);
        continue;
      }
      const useCleanDesktopCanvas = profile.name === "desktop" && ["1.mp4", "Sunday Morning.mp4", "2.mp4", "3.mp4"].includes(sourceFile);
      // Keep source timestamps: original 4.mp4 changes resolution, reinitializing
      // the filters. A frame-count setpts expression resets at that point and
      // drops pictures while the uninterrupted dialogue continues.
      const videoFilter = useCleanDesktopCanvas
        ? `fps=30,scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:color=0x08080a,format=yuv420p,setsar=1`
        : [
            "[0:v]fps=30,split=2[background][foreground]",
            `[background]scale=${profile.width}:${profile.height}:force_original_aspect_ratio=increase,crop=${profile.width}:${profile.height},gblur=sigma=32,eq=brightness=-0.14:saturation=0.78[blurred]`,
            `[foreground]scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease[contained]`,
            "[blurred][contained]overlay=(W-w)/2:(H-h)/2,format=yuv420p,setsar=1[video]",
          ].join(";");
      const videoArguments = useCleanDesktopCanvas
        ? ["-vf", videoFilter, "-map", "0:v:0"]
        : ["-filter_complex", videoFilter, "-map", "[video]"];

      console.log(
        `Normalizing ${sourceFile} for ${profile.name} (${index + 1}/${sourceFiles.length}, ${duration.toFixed(2)}s)...`
      );
      runFfmpeg([
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-fflags",
        "+genpts",
        "-i",
        inputPath,
        "-i",
        normalizedAudio.get(sourceFile),
        ...videoArguments,
        "-map",
        "1:a:0",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "28",
        "-maxrate",
        profile.maxRate,
        "-bufsize",
        profile.bufferSize,
        "-profile:v",
        "high",
        "-level:v",
        "3.1",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "copy",
        "-fps_mode",
        "cfr",
        "-t",
        duration.toFixed(3),
        "-map_metadata",
        "-1",
        "-movflags",
        "+faststart",
        outputPath,
      ]);
    }
  }

  // Check every segment, including reused ones, before publishing a joined film.
  for (const sourceFile of sourceFiles) {
    const segmentPath = path.join(segmentDirectory, segmentFilename(sourceFile));
    await validateSegmentTiming(segmentPath, readDuration(path.join(sourceDirectory, sourceFile)));
  }

  const concatList = sourceFiles
    .map((sourceFile) => {
      const segmentPath = path.join(segmentDirectory, segmentFilename(sourceFile));
      return `file '${segmentPath.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
    })
    .join("\n");

  await writeFile(concatListPath, `${concatList}\n`, "utf8");

  console.log(`Joining the ${sourceFiles.length} normalized ${profile.name} parts...`);
  runFfmpeg([
    "-y",
    "-hide_banner",
    "-loglevel",
    "warning",
    "-fflags",
    "+genpts",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c:v",
    "copy",
    "-af",
    "aresample=48000:async=1:first_pts=0,asetpts=N/SR/TB",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
    "-avoid_negative_ts",
    "make_zero",
    "-movflags",
    "+faststart",
    finalPath,
  ]);

  console.log(`Built ${path.relative(projectRoot, finalPath)}.`);
}

async function normalizeAudio(sourceFile) {
  const inputPath = path.join(sourceDirectory, sourceFile);
  const duration = readDuration(inputPath);
  const audioDirectory = path.join(webDirectory, "normalized-audio");
  await mkdir(audioDirectory, { recursive: true });
  const outputPath = path.join(audioDirectory, segmentFilename(sourceFile).replace(/\.mp4$/, ".m4a"));
  const prepare = "aresample=48000:async=1:first_pts=0,asetpts=N/SR/TB,aformat=sample_rates=48000:channel_layouts=stereo";
  const measured = measureAudio(inputPath, prepare);
  let gain = audioTarget.integrated - measured.integrated;
  const limit = 10 ** (audioTarget.peakCeiling / 20);
  console.log(`Balancing ${sourceFile}: ${measured.integrated} LUFS to ${audioTarget.integrated} LUFS.`);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    runFfmpeg([
      "-y", "-hide_banner", "-loglevel", "warning", "-i", inputPath,
      "-map", "0:a:0", "-vn",
      "-af", `${prepare},volume=${gain.toFixed(3)}dB,alimiter=limit=${limit}:level=false:latency=true,apad`,
      "-t", duration.toFixed(3), "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
      "-map_metadata", "-1", "-movflags", "+faststart", outputPath,
    ]);
    const result = measureAudio(outputPath);
    const difference = audioTarget.integrated - result.integrated;
    if (Math.abs(difference) <= 0.5 && result.truePeak <= -1) {
      console.log(`Audio verified for ${sourceFile}: ${result.integrated} LUFS, ${result.truePeak} dBTP.`);
      return outputPath;
    }
    if (result.truePeak > -1) {
      throw new Error(`Encoded audio peak exceeds safe headroom for ${sourceFile}: ${result.truePeak} dBTP.`);
    }
    gain += difference;
  }
  throw new Error(`Could not match the listening level for ${sourceFile}.`);
}

function measureAudio(inputPath, prepare = "anull") {
  const analysis = spawnSync(ffmpegPath, [
    "-hide_banner", "-i", inputPath, "-map", "0:a:0", "-vn",
    "-af", `${prepare},ebur128=peak=true`, "-f", "null", "-",
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (analysis.error || analysis.status !== 0) {
    throw analysis.error || new Error(`Audio measurement failed: ${analysis.stderr}`);
  }
  const summary = analysis.stderr.slice(analysis.stderr.lastIndexOf("Summary:"));
  const integrated = Number(summary.match(/I:\s*(-?\d+(?:\.\d+)?|-inf)/)?.[1]);
  const truePeak = Number(summary.match(/Peak:\s*(-?\d+(?:\.\d+)?|-inf)/)?.[1]);
  if (!Number.isFinite(integrated) || !Number.isFinite(truePeak)) {
    throw new Error(`Cannot normalize a silent or invalid soundtrack: ${inputPath}.`);
  }
  return { integrated, truePeak };
}

function segmentFilename(sourceFile) {
  const stem = path.basename(sourceFile, ".mp4");
  return /^\d+$/.test(stem)
    ? `${stem.padStart(2, "0")}.mp4`
    : `${stem.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.mp4`;
}

function runFfmpeg(args) {
  const result = spawnSync(ffmpegPath, args, { stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`FFmpeg exited with code ${result.status}.`);
  }
}

function readDuration(inputPath) {
  const result = spawnSync(ffmpegPath, ["-hide_banner", "-i", inputPath], {
    encoding: "utf8",
  });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const match = output.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);

  if (!match) {
    throw new Error(`Could not read the duration of ${path.relative(projectRoot, inputPath)}.`);
  }

  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

async function validateSegmentTiming(segmentPath, expectedDuration) {
  const buffer = await readFile(segmentPath);
  const moov = mp4Boxes(buffer).find((box) => box.type === "moov");
  const durations = {};

  for (const track of mp4Boxes(moov?.data).filter((box) => box.type === "trak")) {
    const media = mp4Boxes(track.data).find((box) => box.type === "mdia");
    const mediaBoxes = mp4Boxes(media?.data);
    const handler = mediaBoxes.find((box) => box.type === "hdlr");
    const header = mediaBoxes.find((box) => box.type === "mdhd");

    if (!handler || !header) {
      continue;
    }

    const kind = handler.data.toString("ascii", 8, 12);
    const version = header.data[0];
    const timescale = header.data.readUInt32BE(version === 1 ? 20 : 12);
    const ticks = version === 1
      ? Number(header.data.readBigUInt64BE(24))
      : header.data.readUInt32BE(16);
    durations[kind] = ticks / timescale;
  }

  const { vide: videoDuration, soun: audioDuration } = durations;
  const tolerance = 0.1; // Allow frame rounding and AAC encoder padding.

  if (
    !Number.isFinite(videoDuration) || !Number.isFinite(audioDuration) ||
    Math.abs(videoDuration - expectedDuration) > tolerance ||
    Math.abs(audioDuration - expectedDuration) > tolerance ||
    Math.abs(videoDuration - audioDuration) > tolerance
  ) {
    throw new Error(
      `Refusing to join ${path.relative(projectRoot, segmentPath)}: ` +
      `picture ${videoDuration?.toFixed(3)}s, audio ${audioDuration?.toFixed(3)}s, ` +
      `source ${expectedDuration.toFixed(3)}s. Rebuild the mismatched segment.`
    );
  }

  console.log(`Timing verified for ${path.relative(projectRoot, segmentPath)}: picture ${videoDuration.toFixed(3)}s, audio ${audioDuration.toFixed(3)}s.`);
}

function mp4Boxes(buffer) {
  const boxes = [];

  if (!buffer) {
    return boxes;
  }

  for (let offset = 0; offset + 8 <= buffer.length;) {
    const compactSize = buffer.readUInt32BE(offset);
    const headerSize = compactSize === 1 ? 16 : 8;
    if (offset + headerSize > buffer.length) {
      break;
    }
    const size = compactSize === 1
      ? Number(buffer.readBigUInt64BE(offset + 8))
      : compactSize || buffer.length - offset;
    if (size < headerSize || offset + size > buffer.length) {
      break;
    }

    boxes.push({
      type: buffer.toString("ascii", offset + 4, offset + 8),
      data: buffer.subarray(offset + headerSize, offset + size),
    });
    offset += size;
  }

  return boxes;
}

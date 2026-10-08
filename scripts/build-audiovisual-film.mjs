import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const projectRoot = process.cwd();
const sourceDirectory = path.join(projectRoot, "audiovisual");
const webDirectory = path.join(sourceDirectory, "web");
const sourceFiles = ["1.mp4", "2.mp4", "3.mp4", "4.mp4", "5.mp4", "6.mp4"];
const profiles = [
  { name: "desktop", width: 960, height: 540, maxRate: "850k", bufferSize: "1700k" },
  { name: "mobile", width: 540, height: 1170, maxRate: "620k", bufferSize: "1240k" },
];
const joinOnly = process.argv.includes("--join-only");
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

if (requestedSegment && !sourceFiles.includes(`${requestedSegment}.mp4`)) {
  throw new Error(`Unknown segment "${requestedSegment}". Use a number from 1 to ${sourceFiles.length}.`);
}

await mkdir(webDirectory, { recursive: true });

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
      if (requestedSegment && sourceFile !== `${requestedSegment}.mp4`) {
        continue;
      }

      const inputPath = path.join(sourceDirectory, sourceFile);
      const outputPath = path.join(segmentDirectory, `${String(index + 1).padStart(2, "0")}.mp4`);
      const duration = readDuration(inputPath);
      const useCleanDesktopCanvas = profile.name === "desktop" && index < 3;
      // Keep source timestamps: Movie 4 changes resolution, which reinitializes
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
        ...videoArguments,
        "-map",
        "0:a:0",
        "-af",
        "aresample=48000:async=1:first_pts=0,asetpts=N/SR/TB,apad",
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
        "aac",
        "-b:a",
        "128k",
        "-ar",
        "48000",
        "-ac",
        "2",
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
  for (const [index, sourceFile] of sourceFiles.entries()) {
    const segmentPath = path.join(segmentDirectory, `${String(index + 1).padStart(2, "0")}.mp4`);
    await validateSegmentTiming(segmentPath, readDuration(path.join(sourceDirectory, sourceFile)));
  }

  const concatList = sourceFiles
    .map((_, index) => {
      const segmentPath = path.join(segmentDirectory, `${String(index + 1).padStart(2, "0")}.mp4`);
      return `file '${segmentPath.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`;
    })
    .join("\n");

  await writeFile(concatListPath, `${concatList}\n`, "utf8");

  console.log(`Joining the six normalized ${profile.name} parts...`);
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

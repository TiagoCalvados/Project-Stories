import { mkdir, writeFile } from "node:fs/promises";
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
      const inputPath = path.join(sourceDirectory, sourceFile);
      const outputPath = path.join(segmentDirectory, `${String(index + 1).padStart(2, "0")}.mp4`);
      const duration = readDuration(inputPath);
      const useCleanDesktopCanvas = profile.name === "desktop" && index < 3;
      const videoFilter = useCleanDesktopCanvas
        ? `fps=30,scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2:color=0x08080a,format=yuv420p,setsar=1,setpts=N/(30*TB)`
        : [
            "[0:v]fps=30,split=2[background][foreground]",
            `[background]scale=${profile.width}:${profile.height}:force_original_aspect_ratio=increase,crop=${profile.width}:${profile.height},gblur=sigma=32,eq=brightness=-0.14:saturation=0.78[blurred]`,
            `[foreground]scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease[contained]`,
            "[blurred][contained]overlay=(W-w)/2:(H-h)/2,format=yuv420p,setsar=1,setpts=N/(30*TB)[video]",
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
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ar",
    "48000",
    "-ac",
    "2",
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

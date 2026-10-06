import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const projectRoot = process.cwd();
const sourceDirectory = path.join(projectRoot, "audiovisual");
const webDirectory = path.join(sourceDirectory, "web");
const segmentDirectory = path.join(webDirectory, "segments");
const concatListPath = path.join(webDirectory, "concat.txt");
const finalPath = path.join(webDirectory, "audiovisual-film.mp4");
const sourceFiles = ["1.mp4", "2.mp4", "3.mp4", "4.mp4", "5.mp4", "6.mp4"];
const joinOnly = process.argv.includes("--join-only");

if (!ffmpegPath) {
  throw new Error("ffmpeg-static did not provide an FFmpeg executable for this platform.");
}

await mkdir(segmentDirectory, { recursive: true });

if (!joinOnly) {
  for (const [index, sourceFile] of sourceFiles.entries()) {
    const inputPath = path.join(sourceDirectory, sourceFile);
    const outputPath = path.join(segmentDirectory, `${String(index + 1).padStart(2, "0")}.mp4`);
    const duration = readDuration(inputPath);

    console.log(`Normalizing ${sourceFile} (${index + 1}/${sourceFiles.length}, ${duration.toFixed(2)}s)...`);
    runFfmpeg([
      "-y",
      "-hide_banner",
      "-loglevel",
      "warning",
      "-fflags",
      "+genpts",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-vf",
      "fps=30,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black,setsar=1,setpts=N/(30*TB)",
      "-af",
      "aresample=48000:async=1:first_pts=0,asetpts=N/SR/TB,apad",
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "26",
      "-maxrate",
      "2000k",
      "-bufsize",
      "4000k",
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

console.log("Joining the six normalized parts...");
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

import { mkdir, rename, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

const root = fileURLToPath(new URL("../", import.meta.url));
const input = path.join(root, "Tiago/padel/Tiago Padel game, Padel Next club Amsterdam.mp4");
const outputDirectory = path.join(root, "Tiago/padel/web");
const output = path.join(outputDirectory, "tiago-padel-game.mp4");
const temporaryOutput = path.join(outputDirectory, "tiago-padel-game-building.mp4");
const passLog = path.join(outputDirectory, "padel-720p-pass");
const maximumBytes = 190_000_000;

if (!ffmpeg) throw new Error("FFmpeg is unavailable on this platform.");
await stat(input);
await mkdir(outputDirectory, { recursive: true });

// One shared MP4 avoids storing two full copies of this 18-minute match.
// Two-pass encoding keeps the complete 720p court at a predictable ~180 MB.
const common = [
  "-y", "-hide_banner", "-loglevel", "warning", "-stats", "-stats_period", "30",
  "-i", input, "-map", "0:v:0",
  "-vf", "scale=1280:720:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
  "-c:v", "libx264", "-preset", "fast", "-b:v", "1200k",
  "-maxrate", "1800k", "-bufsize", "3600k",
  "-profile:v", "high", "-level:v", "3.1", "-pix_fmt", "yuv420p",
  "-r", "30", "-g", "60", "-passlogfile", passLog,
];

for (const pass of [1, 2]) {
  console.log(`Encoding shared 720p Padel MP4, pass ${pass}/2; preserving the whole court...`);
  const tail = pass === 1
    ? ["-an", "-f", "null", "-"]
    : ["-map", "0:a:0", "-c:a", "aac", "-b:a", "96k", "-ar", "48000",
      "-map_metadata", "-1", "-metadata", "title=Tiago Padel game — Padel Next club Amsterdam",
      "-movflags", "+faststart", temporaryOutput];
  const result = spawnSync(ffmpeg, [...common, "-pass", String(pass), ...tail], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`FFmpeg failed on pass ${pass}: ${result.status}.`);
}

const { size } = await stat(temporaryOutput);
if (size > maximumBytes) throw new Error(`Encoded video exceeds the ${maximumBytes / 1e6} MB storage budget; nothing was uploaded.`);
await rename(temporaryOutput, output);
console.log(`Built ${path.relative(root, output)} (${(size / 1e6).toFixed(1)} MB), shared by phone and desktop.`);

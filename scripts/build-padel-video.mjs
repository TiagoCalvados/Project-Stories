import { mkdir, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ffmpeg from "ffmpeg-static";

const root = fileURLToPath(new URL("../", import.meta.url));
const input = path.join(root, "Tiago/padel/Tiago Padel game, Padel Next club Amsterdam.mp4");
const outputDirectory = path.join(root, "Tiago/padel/web");
const profiles = [
  { name: "desktop", width: 1280, height: 720, crf: "25", maxRate: "1800k", buffer: "3600k" },
  { name: "mobile", width: 960, height: 540, crf: "27", maxRate: "1000k", buffer: "2000k" },
];

if (!ffmpeg) throw new Error("FFmpeg is unavailable on this platform.");
await stat(input);
await mkdir(outputDirectory, { recursive: true });

for (const profile of profiles) {
  const output = path.join(outputDirectory, `tiago-padel-game-${profile.name}.mp4`);
  console.log(`Preparing the ${profile.name} MP4 (${profile.width} × ${profile.height}); preserving the whole court...`);
  const result = spawnSync(ffmpeg, [
    "-y", "-hide_banner", "-loglevel", "warning", "-stats", "-stats_period", "15",
    "-i", input, "-map", "0:v:0", "-map", "0:a:0",
    "-vf", `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1`,
    "-c:v", "libx264", "-preset", "fast", "-crf", profile.crf,
    "-maxrate", profile.maxRate, "-bufsize", profile.buffer,
    "-profile:v", "high", "-level:v", "3.1", "-pix_fmt", "yuv420p",
    "-r", "30", "-g", "60", "-c:a", "aac", "-b:a", "128k", "-ar", "48000",
    "-map_metadata", "-1", "-metadata", "title=Tiago Padel game — Padel Next club Amsterdam",
    "-movflags", "+faststart", output,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`FFmpeg failed for ${profile.name}: ${result.status}.`);
  console.log(`Built ${path.relative(root, output)} (${((await stat(output)).size / 1e6).toFixed(1)} MB).`);
}

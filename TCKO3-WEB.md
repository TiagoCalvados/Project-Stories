# TCKO3 browser studio

Open `/tcko3.html`. The homepage music stack places it directly above TCKO2. Both instruments have 44 px return and switch-app links, using the same tab so audio is paused on navigation.

Three sources: one recorded TCKO2 take or optional live synth, plus two device audio files. Each has Chorus, Phaser, Flanger, Tremolo, Ring mod, Drive, FX amount, pan, volume, tone, echo, mute, solo, speed and independent looping of recordings. Live synthesis reuses the existing TCKO2 engine. Effects use native Web Audio nodes, with parallel wet mixing; they are original digital effects, not hardware emulations.

Stop and pause work across all sources. File imports and recent takes start playback after decoding. Browsers may require the explicit Open & play button after navigating from TCKO2. Stop ends live notes and clears echo buffers. Playback pauses when the page is hidden. Non-looping audio finishes and resets after its effect tail.

Record mix captures the actual stereo output, including effects and loops, for up to 3 minutes; preview and download as WAV. Imports accept up to 3 minutes / 40 MB per file and 128 MB of decoded audio for the session. Imported sounds and recorded mixes stay in the tab until downloaded. No audio is uploaded.

TCKO2 saves finished WAV takes in IndexedDB on the same device and origin. TCKO3 offers Open latest and dated recents. Remix in TCKO3 links a specific take. Device storage is capped at 20 recordings / 96 MB; no existing takes are automatically deleted. If storage is unavailable or full, recording/download still work and the UI explains manual WAV import. Browser data can be evicted; Download WAV is the durable backup. Existing desktop recordings must be opened manually; web pages cannot silently read the desktop Music folder.

## Verification

Run `node --test scripts/test-tcko3.mjs` for synth patches, stereo recorder and WAV samples. With `node serve-project.mjs`, open `/scripts/test-tcko3-browser.html` and run audio checks for every effect, dry bypass, combined effects and device recording storage. `/scripts/test-tcko3-responsive.html?width=320` checks responsive cards and touch targets; also use 390 and 768. The test pages are outside the deployment output.

The production build copies root HTML/CSS/JS automatically. No audio samples, new Blob objects, external assets or runtime dependencies are needed. Existing Blob manifest entries are reused. Publish with the existing Vercel workflow.

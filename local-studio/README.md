# TCK03 Layer Studio — local experiment

Start the existing project server from the Project Stories folder:

```powershell
node serve-project.mjs
```

Open **http://localhost:8765/local-studio/** in a recent Chrome, Edge, Firefox or Safari browser. Use **Try a little demo** to hear three tiny sounds generated entirely on your device.

## Play and remix

- Source 01 is one live TCKO2 synth layer, or a recorded TCKO2 take. Download a WAV from the existing synth, then use **Open TCKO2 take** here. The two modes share one channel and never play together.
- Sources 02 and 03 open audio files from your own device. Browser codec support determines which formats open; WAV and MP3 are good starting points.
- Press **Play mix** to start all loaded files together. Each source has volume, mute, looping, a low-pass tone control and echo. File sources also have speed/pitch. Pause preserves each source's position; Stop rewinds and clears echo tails. Escape stops all sound.
- Play the mini keyboard with touch, a pointer, computer keys A W S E D F T G Y H U J K, or focus an individual piano key and hold Space/Enter. The existing synth engine is reused with one layer and four voices.
- Choose **Record mix**, play/change controls, then **Finish take**. Preview and download the 16-bit stereo WAV. A take stops automatically at three minutes. Preview playback pauses the live mix.
- Playback pauses when the page is hidden. Leaving the keyboard releases held notes. Opening files/mode changes are disabled while recording. Download the mix before refreshing or closing; this prototype does not save sessions permanently.

## Storage and publication

No accounts, API calls, file uploads, cloud audio storage, external fonts or new runtime dependencies. Files are decoded in browser memory. The demo is synthesized in memory. Mixes are recorded and downloaded locally.

File limits: 25 MiB per imported file, three minutes per clip, mono/stereo only, and 64 MiB of decoded audio shared by the three sources. The current mix adds at most about 35 MB at 48 kHz; high sample rates are capped at 12 million stereo frames. Only one downloaded-mix preview is retained at a time. Existing TCKO2 recordings can be opened without conversion.

This directory is excluded from Vercel uploads and is outside the root-only HTML/CSS/JS build lists. No homepage or icon routes were changed. Keep this experiment local until publication is explicitly requested.

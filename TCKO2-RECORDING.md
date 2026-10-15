# Online synth recording

The recording controls are directly below the online synth's audio/safety bar on desktop and mobile layouts.

1. Press **Record**, play your notes and effects, and let echoes fade.
2. Press **Stop recording**. Preview the take with the audio player.
3. Choose **Download WAV**. In the desktop **TCK03 Layer Studio**, use **Import WAV** to put it on its own channel. Repeat for each layer.

Each take is an ordinary 16-bit stereo PCM WAV at the browser audio context's actual sample rate (commonly 44.1 or 48 kHz). TCK03 supports both. The captured signal is the synth output after effects, tape speed and Master gain, before device speaker volume. It does not capture the microphone, system audio, other browser tabs or preview playback. No microphone permission or audio upload is used.

Earlier takes remain selectable in the current tab. Download every take you want before refreshing, navigating away or closing the tab: the list is held in browser memory, not permanent storage. A leave-page warning is requested for recordings or takes not yet downloaded; browser warning support varies. **Clear saved takes** releases tab memory after confirmation and never deletes files already downloaded.

Each take is limited to five minutes, with approximately 96 MB shared storage for all takes in the tab. If storage fills, download and clear takes before continuing. Leaving the synth tab stops and finalizes recording. Stop sound also finishes the take; Panic clears the sound but leaves recording active so you can decide when the take ends. Interrupted engine/flush failures offer a partial take when complete received audio buffers are available.

Recordings start only when Record is pressed. Playing a key still starts the instrument without a separate Start Audio button. Desktop synth recording and the TCK03 desktop app are unchanged by this website update.

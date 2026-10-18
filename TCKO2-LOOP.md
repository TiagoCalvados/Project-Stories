# Independent audio loop / continuous performance

This update applies to the online Project Stories synth. The installed Windows synth is not changed.

## Make and build a loop

1. Press **Make loop**, then play a phrase, with any live effects you want captured.
2. Press **Loop it**. The phrase repeats independently while the live keys remain available.
3. Select another sound and play over the loop. This does not stop or replace the loop.
4. Press **Add layer** to record exactly one additional cycle into the loop. It automatically finishes after that cycle. Press it again for another pass.
5. **Pause loop** pauses only the loop. **Play loop** resumes from its paused position. **Clear loop** removes only this loop, after confirmation. **New loop** replaces it only after confirmation.

The loop records the live synth output, including its effects, not the loop's own playback: overdubbing does not recursively feed the recorded bed into itself. Overdubs merge into one fixed-length stereo buffer; they are not separate tracks and cannot individually be removed. There is no tempo grid or automatic quantization. The phrase length sets the loop length, up to thirty seconds; a shorter-than-0.1-second recording is rejected. At the maximum length capture automatically becomes playback. Small boundary fades reduce seam clicks.

**Live volume** controls the keys and live effects; **Loop volume** controls the recorded bed independently. Pitch/speed and effect changes affect the live sound, not the already captured loop. The loop does not change keyboard timing or the sound source. Summed playback has a soft output ceiling for safety. With no loop, the existing sound output is unchanged.

## Change instruments without cutting off sound

Selecting a sound in the menu or Vintage sound lab now selects the timbre for subsequent notes. Existing active notes keep their source model, envelope and frozen timbre settings. The live voice budget remains four on compact/mobile screens and eight on wider screens; when full, a new note steals the oldest voice. Sustained/drone notes from different sound selections may coexist within this budget. Use the loop to retain additional captured layers without extra synth voices.

Sustain, Drone, Glitch, Fragments, glitch gain, pitch, current echo time and Bloom are preserved across sound selections. The current echo/reverb mix is also preserved rather than being replaced by the selected patch's defaults. Original patch definitions and default destructive initialization are unchanged; only live selections use the new non-destructive path. The nineteen sounds are checked against the previous engine's stereo output sample for sample before live layering.

Normal note-off still releases an ordinary key. Enable Sustain or Drone if you want live notes to continue after release. Re-selecting the same MIDI note in another sound selection can create another voice. Turning the latch off releases its held notes; Panic clears live voices and tails immediately.

## Safety, recording and persistence

- Panic and Stop silence both live synth and loop immediately, retaining the loop in a paused state. Resume sound does not silently restart the loop; use Play loop deliberately.
- Fade affects live output and loop playback together, retaining the paused loop at the end. A fresh note cancels an unfinished fade; after a completed fade it brings back the live keys, not the paused loop.
- Switching away from the tab suspends audio and pauses the loop for safety. Returning does not automatically restart loop playback.
- Loops are in-memory audio only: they are not uploaded or saved in browser settings. Refreshing, closing the tab, or losing the audio engine loses the loop. A leave-page warning is shown while a loop exists.
- To keep the mixed performance, use the existing **Record → Stop recording → Download WAV** controls. The WAV includes audible live synth and loop output. For independent TCK03 tracks, keep separate WAV takes before overdubbing; a merged loop cannot be separated into stems afterward.

Validation includes both 44.1 and 48 kHz, original-sound byte equality, retained instruments and tails, exact-length stereo looping, independent live playback, one-cycle overdubs, zero-input feedback protection, boundary safety, capture limits, voice stealing, mixed WAV capture, startup cancellation, and Stop/Panic/Fade behavior. Browser checks use localhost only.

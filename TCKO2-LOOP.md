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

**Keep playing** is on by default. Released keys continue with their original held-key envelope; it does not force Drone, raise sustain or add Bloom. Tap the same held key again to release it. Percussive sounds still decay naturally: use the loop to repeat a phrase. Turn Keep playing off to restore normal note release; its existing held notes then release naturally (explicit Sustain/Drone/pedals still behave as latches).

While Keep playing is on, selecting another sound parks the complete running instrument and its effects in an independent live layer. Its oscillator phases, note envelopes, Glitch buffers, Fragments grains, echo/reverb buffers and pitch transport continue in place, not reset or cloned. Play new keys for the new sound. Turning on Glitch or Fragments, or changing an enabled Glitch type, also parks the old chain and seeds the new chain with the current held notes. A new effect chain warms its own audio-history buffers; the old chain continues throughout. Effect Off, strength, pitch, echo and other sliders edit the current chain only. Live volume is global across live chains. Previously captured loop playback stays independent.

The compact layer strip shows each kept sound/effect. Its **×** button removes only that layer with a 20ms fade. **Clear kept layers** removes the parked layers, leaving current keys, loop playback and the WAV recorder alone. Desktop has four live chains / eight voices total; compact/mobile has two chains / four voices total. Engines are allocated at startup rather than constructed during sound changes. At capacity, new layers/notes are refused with an explanation instead of stealing existing ones. A refused selection restores the controls to the actual running sound. Record layers into the loop to retain more sound without using live voices. Layer count includes the current editable chain, even before playing a key.

Keep playing Off retains the earlier per-voice non-destructive preset behavior within the current chain; existing parked chains finish their releases/tails. Original patch definitions and destructive initialization are unchanged. The nineteen sounds are checked against the earlier engine sample for sample, including Keep playing note-off versus a physically held key. Computer letter notes also work while sound dropdowns or effect sliders have focus; text fields and modified shortcuts are excluded.

## Safety, recording and persistence

- Panic and Stop clear all live chains and silence both live synth and loop immediately, retaining the loop in a paused state. Resume sound does not silently restart the loop; use Play loop deliberately. Keep playing stays selected but never starts notes on its own.
- Fade affects live output and loop playback together, retaining the paused loop at the end. A fresh note cancels an unfinished fade; after a completed fade it brings back the live keys, not the paused loop.
- Switching away from the tab suspends audio and pauses the loop for safety. Returning does not automatically restart loop playback.
- Loops are in-memory audio only: they are not uploaded or saved in browser settings. Refreshing, closing the tab, or losing the audio engine loses the loop. A leave-page warning is shown while a loop exists.
- To keep the mixed performance, use the existing **Record → Stop recording → Download WAV** controls. The WAV includes audible live synth and loop output. For independent TCK03 tracks, keep separate WAV takes before overdubbing; a merged loop cannot be separated into stems afterward.

Validation includes both 44.1 and 48 kHz, original-sound byte equality, independent live instrument/FX chains, capacity refusal, layer removal, focused dropdown/slider keyboard input, exact-length stereo looping, independent live playback, one-cycle overdubs, zero-input feedback protection, boundary safety, capture limits, mixed WAV capture, startup cancellation, and Stop/Panic/Fade behavior. Browser checks use localhost only.

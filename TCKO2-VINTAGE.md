# TCKO2: keys first / vintage sound lab

The piano now comes first. The compact laptop layout places keys and effects together; mobile keeps the piano visible while scrolling. The eight large macro panels and their Learn buttons are removed; existing saved sound parameters and MIDI mappings remain supported. The eleven original presets keep their original indexes and DSP behavior.

Eight new, original vintage-inspired patches are available beside Glitch and Fragments, and in the Sound menu. These are synthesized sounds, not samples, branded hardware emulations or recreations of film recordings:

- **Laser Zap**: rapidly descending pitch envelope; tap a key.
- **Robot Bleeps**: stepped, warbling tone sequences; hold a key.
- **Solar Wind**: gusting filtered noise with a faint whistle.
- **Ocean Swell**: low, rolling noise swells.
- **Acid Machine**: saw/sub/pulse source through a sharp resonant envelope.
- **Stereo Skyline**: a pulse-and-saw pad with an always-on wide chorus.
- **Crystal FM**: bright, metallic FM chimes with a decaying modulation index.
- **Cinema Convergence**: a slow convergence from detuned pitches into a sci-fi chord.

Select a vintage patch, then play the keys. Online selections now choose the sound for new notes without cutting off previously held instruments or effects. These are keyboard-sound selectors, not one-shot sample pads. The online loop captures a phrase and allows additional live sounds or one-cycle overdubs; see TCKO2-LOOP.md. Use separate WAV takes in TCK03 when you need independently editable tracks.

**Fade out** fades live synth output, including held notes, glitches and echo/reverb tails, over 1, 3 or 8 real seconds, independent of tape pitch/speed. Online it also fades and pauses the loop without deleting it. On completion it clears live notes and tails. Playing a new note cancels an unfinished fade and smoothly restores output. Live volume is not changed. Fade keeps a recording running, allowing the fade itself to be captured; use Stop recording afterward. Panic is still the immediate safety cut and online it retains the loop paused.

The desktop synth uses the same eight sound designs and fade behavior. Device selection, recording, Export WAV and Send to TCK03 remain on its main window. Existing sound-session and knob-mapping files must not be overwritten during installation.

Validation covers the eleven original sound identities at neutral macro values; new patches are checked at their intended settings and over time, because a transient laser or decaying FM strike cannot be identified by a late steady-state spectrum alone. All nineteen patches are checked for bounded, finite output. Fade timing, clean silence, cancellation and replay are checked at normal, half and double speed. Recording regressions and desktop/mobile layout checks remain separate.

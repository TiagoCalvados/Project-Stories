# Sound Technologies / DATA RIOT

Choose a technology in the centre box, then **play the keyboard**. Selecting a technology is silent. The on-screen piano, computer keys and MIDI input play notes and chords using that technology. Note-off, sustain, Drone, pitch/speed, Glitch, Fragments, Master, Fade, Panic and REC use the synth's existing controls. **Character** explores the texture and **Volume** balances its keyboard voices. There is no separate Play, Repeat or note-number control in this section. Choosing a normal keyboard preset returns to the original synthesis sounds.

All twelve are original procedural sounds. They do not require downloads, microphone access, sample packs or an account. The desktop and browser use the same arithmetic and deterministic seed; their generated stereo PCM is compared in verification. At different device sample rates they follow the same time and frequency parameters.

| Friendly label | Technique | Implementation and Character control |
| --- | --- | --- |
| Granular / grains | Granular synthesis | Up to sixteen overlapping Hann-windowed grains of a generated impact, with random positions, reversed playback and stereo scattering. Character raises event density. |
| Vibrating objects | Physical modelling | A damped digital waveguide excited by a pluck. Character adjusts damping from a dull to a ringing string-like object. |
| Frozen spectrum | Spectral freezing | A discrete Fourier analysis captures the magnitude spectrum of an original impact. Band-limited periodic resynthesis holds that spectrum. Character changes the breathing and stereo drift speed. |
| Resonant metal | Modal resonance | Eight damped second-order resonators at inharmonic mode ratios, excited by intermittent strikes. Character changes strike spacing. |
| Friction / scrape | Friction synthesis | An accumulating displacement releases at irregular thresholds, exciting the resonator bank alongside surface noise. Character increases scraping speed and force. |
| Liquid / bubbles | Liquid sound model | Up to sixteen damped bubble oscillators with rising frequency and random size, lifetime and position. Character moves from separated drops toward a dense stream. |
| Wavefold | Wavefolding | A driven sine is folded through a triangular transfer function, evaluated twice per sample and filtered. Character increases the drive. |
| Frequency shift | Frequency shifting | Each known analytic partial of an inharmonic metal-like strike receives the same additive frequency offset. Character moves the offset from negative through zero to positive. |
| Inside an object | Convolution processing | A generated percussive excitation is convolved with a fixed 128-tap, decaying imaginary-object impulse response. Character changes the space between strikes. |
| Broken / random | Stochastic synthesis | A seeded, bounded pitch walk and irregular noise/tone bursts. Character increases event density. |
| Moving in stereo | Spatial modulation | A resonant, noise-excited surface moves through equal-power stereo panning. Character controls travel speed. Stereo output is needed to hear direction. |
| Spectral morph | Spectral morphing | Interpolation between two phase-aligned original magnitude envelopes, with slow movement around the chosen Character position. Band-limited wavetable banks avoid excessive upper harmonics at high notes. |

These are compact experimental sound models, not calibrated measurements of specific rocks, glass objects or fluid dynamics. Freeze and Morph use generated source spectra; they do not yet capture or transform the file opened with Open sound. The new section supplies keyboard voices, rather than an independently playing loop. Settings restore without playing any notes. The browser keeps its existing Keep playing mode: technology changes can retain the previous live layer, and selecting the new technology does not seed notes into the new layer.

## Research basis

- Julius O. Smith, [Physical Audio Signal Processing](https://dsprelated.com/freebooks/pasp/): digital waveguides, modal representations and damped resonators.
- Julius O. Smith, [Spectral Audio Signal Processing](https://www.dsprelated.com/freebooks/sasp/): Fourier analysis and spectral resynthesis.
- Kees van den Doel, [Physically-Based Models for Liquid Sounds](https://repository.gatech.edu/server/api/core/bitstreams/d5d2bbeb-62d6-47fa-960d-8524b5a987ee/content), ICAD 2004: populations of damped bubble sounds. Our compact model follows that principle, without a coupled fluid solver.
- GRAME, [Faust physical modelling library](https://faustlibraries.grame.fr/libs/physmodels/): waveguide and modal model families.

No source code or sound recordings are copied from these references.

## Verification

Build, then run `bin\TCKO2Synth.exe --technologies-test <new-output-directory>` for bounded audio, extreme settings, recorder integration, keyboard selection, chords, MIDI message routing, note releases, sustain, settings and layout checks. It opens no live audio or MIDI devices. The Project Stories counterpart also tests all twelve techniques through its real AudioWorklet and browser recording controls, plus desktop/mobile layouts. Physical listening remains a user check: numeric signal tests establish operation and stability, not subjective realism.

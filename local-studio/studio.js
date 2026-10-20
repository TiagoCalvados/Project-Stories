import { PATCHES } from '../tcko2-engine.js';
import { encodeWav } from '../tcko2-recording.js';

const $ = id => document.getElementById(id);
const colours = ['#a6e6c7', '#ff9b7a', '#c0afff'];
const FILE_LIMIT = 25 * 1024 * 1024;
const MEMORY_LIMIT = 64 * 1024 * 1024;
const tracks = Array.from({ length: 3 }, (_, index) => ({
  index, mode: index ? 'file' : 'synth', buffer: null, name: '',
  volume: .7, tone: 100, echo: 0, rate: 1, loop: true, muted: false,
  source: null, input: null, analyser: null, graph: null, offset: 0,
}));
let context, startup, synth, capture, master, mixAnalyser;
let playing = false, position = 0, startedAt = 0, transportBusy = false, transportVersion = 0;
let recording = null, nextTake = 0, mixUrl = null, unsaved = false;
let loading = false, loadQueue = Promise.resolve(), preset = 3;
let lastFrame = 0, visualFrame = 0;
const noteOwners = new Map();
const message = text => { $('status').textContent = text; };
const time = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.floor(Math.max(0, seconds)) % 60).padStart(2, '0')}`;
const cursor = () => position + (playing && context ? Math.max(0, context.currentTime - startedAt) : 0);

for (const track of tracks) {
  const i = track.index, card = document.createElement('article');
  card.className = 'track'; card.dataset.track = i;
  card.setAttribute('aria-label', `Sound source ${i + 1}`);
  card.innerHTML = `
    <div class="track-header"><span class="track-number">0${i + 1} / ${i ? 'SOUND' : 'TCKO2'}</span><span class="track-subtitle">${i ? 'YOUR OWN AUDIO' : 'ONE SYNTH LAYER'}</span></div>
    <h2 class="source-name" id="name-${i}">${i ? 'Add a sound' : 'Play something new'}</h2>
    <p class="source-detail" id="detail-${i}">${i ? 'A recording, a rhythm, a little texture.' : 'Live synth or a take you recorded earlier.'}</p>
    <canvas class="track-wave" id="wave-${i}" width="400" height="65" aria-label="Waveform for sound source ${i + 1}"></canvas>
    ${i === 0 ? '<div class="mode-toggle" aria-label="First source mode"><button id="live-mode" type="button" aria-pressed="true">Live synth</button><button id="take-mode" type="button" aria-pressed="false">Recorded take</button></div>' : ''}
    <label class="file-button">↥ ${i ? 'Open audio from device' : 'Open TCKO2 take'}<input id="file-${i}" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.flac,.aiff" aria-label="Open audio for sound source ${i + 1}"></label>
    ${i === 0 ? '<div class="synth-controls" id="synth-controls"><label for="preset">SOUND</label><select id="preset" aria-label="Synth sound"></select><div class="keys" id="keys" aria-label="Synth keyboard"></div><p class="synth-hint">Touch the keys · computer keys A W S E D F T G Y H U J K</p></div>' : ''}
    <div class="channel-controls"><button id="mute-${i}" type="button" aria-pressed="false">Mute</button><button id="loop-${i}" type="button" aria-pressed="true">Loop on</button><button id="clear-${i}" class="clear" type="button" aria-label="Clear audio from sound source ${i + 1}" disabled>×</button></div>
    <div class="faders">
      <label>VOLUME <output id="volume-value-${i}">70%</output><input data-control="volume" data-track="${i}" aria-label="Source ${i + 1} volume" type="range" min="0" max="100" value="70"></label>
      <label>TONE <output id="tone-value-${i}">Open</output><input data-control="tone" data-track="${i}" aria-label="Source ${i + 1} tone" type="range" min="0" max="100" value="100"></label>
      <label>ECHO <output id="echo-value-${i}">Dry</output><input data-control="echo" data-track="${i}" aria-label="Source ${i + 1} echo" type="range" min="0" max="65" value="0"></label>
      <label>SPEED / PITCH <output id="rate-value-${i}">1.00×</output><input data-control="rate" data-track="${i}" aria-label="Source ${i + 1} speed and pitch" type="range" min="50" max="150" value="100" step="1"></label>
    </div>
    <p class="track-note" id="note-${i}">${i ? 'WAV, MP3 & other browser-supported audio. Opens locally.' : 'Choose Live synth to play. Open a WAV to remix an earlier take.'}</p>`;
  $('tracks').append(card);
  $(`file-${i}`).addEventListener('change', event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (file) loadQueue = loadQueue.then(() => loadFile(track, file)).catch(() => message('That sound could not be opened. Please try another audio file.'));
  });
  $(`mute-${i}`).onclick = () => { track.muted = !track.muted; updateTrack(track); };
  $(`loop-${i}`).onclick = () => {
    track.loop = !track.loop;
    if (track.source) { track.source.loop = track.loop; if (!track.loop) track.source.loopEnd = 0; }
    updateTrack(track);
  };
  $(`clear-${i}`).onclick = () => {
    stopTransport(); track.buffer = null; track.name = ''; updateTrack(track);
    message(`Source ${i + 1} cleared from this session. Your original file is still on your device.`);
  };
}

PATCHES.forEach((patch, i) => $('preset').add(new Option(patch.name, i)));
$('preset').value = preset;
$('preset').onchange = () => { preset = Number($('preset').value); releaseNotes(); synth?.port.postMessage({ type: 'preset', index: preset }); };
const keyboardCodes = ['KeyA', 'KeyW', 'KeyS', 'KeyE', 'KeyD', 'KeyF', 'KeyT', 'KeyG', 'KeyY', 'KeyH', 'KeyU', 'KeyJ', 'KeyK'];
const labels = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'C'];
for (let i = 0; i < 13; i++) {
  const button = document.createElement('button'), note = 48 + i;
  button.type = 'button'; button.className = `key${[1, 3, 6, 8, 10].includes(i) ? ' black' : ''}`;
  button.textContent = labels[i]; button.dataset.note = note;
  button.setAttribute('aria-label', `Play ${labels[i]}${i === 12 ? '4' : '3'}`);
  button.setAttribute('aria-pressed', 'false');
  button.onpointerdown = event => { event.preventDefault(); button.setPointerCapture(event.pointerId); void noteOn(note, `pointer-${event.pointerId}`); };
  button.onpointerup = event => noteOff(note, `pointer-${event.pointerId}`);
  button.onpointercancel = button.onpointerup;
  button.onlostpointercapture = button.onpointerup;
  button.onkeydown = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); if (!event.repeat) void noteOn(note, `button-${note}`); } };
  button.onkeyup = event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); noteOff(note, `button-${note}`); } };
  button.onblur = () => noteOff(note, `button-${note}`);
  $('keys').append(button);
}
document.addEventListener('keydown', event => {
  if (event.code === 'Escape') { stopTransport(); message('All sound stopped. Your files and mix are still here.'); return; }
  if (event.repeat || event.ctrlKey || event.altKey || event.metaKey || /^(INPUT|TEXTAREA|SELECT|BUTTON|A)$/.test(event.target.tagName)) return;
  const i = keyboardCodes.indexOf(event.code); if (i < 0) return;
  event.preventDefault(); void noteOn(48 + i, event.code);
});
document.addEventListener('keyup', event => { const i = keyboardCodes.indexOf(event.code); if (i >= 0) noteOff(48 + i, event.code); });
window.addEventListener('blur', releaseNotes);

async function ensureAudio() {
  if (!context) {
    startup = (async () => {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw Error('This browser does not support Web Audio. Try a recent Chrome, Edge, Firefox or Safari.');
      context = new Audio({ latencyHint: 'interactive' });
      await context.audioWorklet.addModule(new URL('./studio-audio.js', import.meta.url));
      const bus = context.createGain(), limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -9; limiter.knee.value = 6; limiter.ratio.value = 12;
      limiter.attack.value = .003; limiter.release.value = .18;
      master = context.createGain(); master.gain.value = Number($('master').value) / 100;
      mixAnalyser = context.createAnalyser(); mixAnalyser.fftSize = 1024;
      capture = new AudioWorkletNode(context, 'studio-capture', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: 'explicit' });
      bus.connect(limiter).connect(master).connect(mixAnalyser).connect(capture).connect(context.destination);
      capture.port.onmessage = ({ data }) => receiveRecording(data);
      capture.onprocessorerror = () => { abortRecording('The audio recorder was interrupted. A partial take is available if any audio arrived.'); };
      for (const track of tracks) {
        const input = context.createGain(), tone = context.createBiquadFilter(), gain = context.createGain(), analyser = context.createAnalyser();
        const send = context.createGain(), delay = context.createDelay(1), feedback = context.createGain(), wet = context.createGain();
        tone.type = 'lowpass'; tone.Q.value = .6; analyser.fftSize = 512;
        delay.delayTime.value = .31 + track.index * .047; feedback.gain.value = .3;
        input.connect(tone).connect(gain).connect(analyser).connect(bus);
        gain.connect(send).connect(delay).connect(wet).connect(analyser); delay.connect(feedback).connect(delay);
        track.input = input; track.analyser = analyser; track.graph = { tone, gain, send, delay, feedback, wet };
        updateTrack(track);
      }
      synth = new AudioWorkletNode(context, 'studio-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      const synthGate = context.createGain();
      synthGate.gain.value = tracks[0].mode === 'synth' ? 1 : 0;
      tracks[0].synthGate = synthGate;
      synth.connect(synthGate).connect(tracks[0].input);
      synth.port.postMessage({ type: 'preset', index: preset });
      synth.onprocessorerror = () => { stopTransport(); message('The synth engine stopped. Download any recorded mix, then refresh to start again.'); };
      context.onstatechange = () => {
        if (context.state !== 'running' && playing) {
          pauseTransport();
          message('Audio was interrupted. Press Play to continue; files stay in this session.');
        }
      };
    })().catch(async error => {
      const broken = context; context = null; startup = null;
      if (broken && broken.state !== 'closed') await broken.close().catch(() => {});
      throw error;
    });
  }
  await startup;
  if (context.state !== 'running') await context.resume();
  if (context.state !== 'running') throw Error('Audio is paused by this browser. Tap Play again to enable sound.');
}

function updateTrack(track) {
  const i = track.index, live = i === 0 && track.mode === 'synth';
  $(`name-${i}`).textContent = live ? 'Play something new' : track.buffer ? track.name : i ? 'Add a sound' : 'Open your TCKO2 take';
  $(`detail-${i}`).textContent = live ? 'One live TCKO2 layer. Four-note polyphony.' : track.buffer ? `${track.buffer.duration.toFixed(1)} seconds · local audio` : 'Choose an audio file from your device.';
  $(`clear-${i}`).disabled = !track.buffer || Boolean(recording) || loading;
  $(`mute-${i}`).setAttribute('aria-pressed', track.muted);
  $(`mute-${i}`).textContent = track.muted ? 'Muted' : 'Mute';
  $(`loop-${i}`).disabled = live;
  $(`loop-${i}`).setAttribute('aria-pressed', track.loop);
  $(`loop-${i}`).textContent = track.loop ? 'Loop on' : 'Loop off';
  document.querySelector(`input[data-track='${i}'][data-control='rate']`).disabled = live;
  if (track.graph) {
    const now = context.currentTime;
    track.graph.gain.gain.setTargetAtTime(track.muted ? 0 : track.volume, now, .015);
    track.graph.tone.frequency.setTargetAtTime(Math.min(context.sampleRate * .45, 180 * (20000 / 180) ** (track.tone / 100)), now, .025);
    track.graph.send.gain.setTargetAtTime(track.muted ? 0 : track.echo, now, .025);
    track.graph.wet.gain.setTargetAtTime(track.muted ? 0 : 1, now, .015);
  }
  if (i === 0) {
    $('live-mode').setAttribute('aria-pressed', live); $('take-mode').setAttribute('aria-pressed', !live);
    $('synth-controls').hidden = !live;
    if (track.synthGate) track.synthGate.gain.setTargetAtTime(live ? 1 : 0, context.currentTime, .01);
  }
}
function setMode(mode) {
  if (recording || loading || tracks[0].mode === mode) return;
  stopTransport(); tracks[0].mode = mode; updateTrack(tracks[0]);
  message(mode === 'synth' ? 'Live synth selected. Play the keys to hear it with your other sounds.' : 'Recorded take selected. Open a TCKO2 WAV from your device.');
}
$('live-mode').onclick = () => setMode('synth');
$('take-mode').onclick = () => setMode('file');

async function loadFile(track, file) {
  if (recording) return;
  if (!file.size || file.size > FILE_LIMIT) { message('Choose an audio file smaller than 25 MB. Short clips work best.'); return; }
  loading = true; updateAvailability(); message(`Opening ${file.name} on this device…`);
  try {
    await ensureAudio();
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    const used = tracks.reduce((bytes, candidate) => bytes + (candidate === track || !candidate.buffer ? 0 : bufferBytes(candidate.buffer)), 0);
    if (buffer.duration > 180 || buffer.numberOfChannels > 2 || used + bufferBytes(buffer) > MEMORY_LIMIT) throw Error('Use shorter mono or stereo clips: up to 3 minutes each, within 64 MB of decoded audio for all sources.');
    stopTransport(); track.buffer = buffer; track.name = file.name;
    if (track.index === 0) track.mode = 'file';
    updateTrack(track); message(`${file.name} is ready in source ${track.index + 1}. It stays on this device.`);
  } catch (error) { message(error.message?.startsWith('Use shorter') ? error.message : 'Could not open that sound. Try a WAV or MP3 file supported by your browser.'); }
  finally { loading = false; updateAvailability(); }
}
const bufferBytes = buffer => buffer.length * buffer.numberOfChannels * 4;

function stopSources() {
  for (const track of tracks) if (track.source) { const source = track.source; track.source = null; source.onended = null; try { source.stop(); } catch {} source.disconnect(); }
}
function scheduleSource(track, at, offset = track.offset) {
  if (!track.buffer || track.index === 0 && track.mode === 'synth') return;
  if (!track.loop && offset >= track.buffer.duration) return;
  const source = context.createBufferSource(); source.buffer = track.buffer;
  source.loop = track.loop; source.playbackRate.value = track.rate;
  source.connect(track.input); track.source = source;
  source.onended = () => { if (track.source === source) { track.source = null; source.disconnect(); } };
  source.start(at, track.loop ? offset % track.buffer.duration : offset);
}
async function playTransport() {
  const version = transportVersion;
  await ensureAudio();
  if (document.hidden || version !== transportVersion) return;
  if (playing) return;
  $('mix-preview').pause();
  startedAt = context.currentTime + .025;
  tracks.forEach(track => scheduleSource(track, startedAt));
  playing = true; updateAvailability();
  message('Mix playing. Shape each sound while you listen, or play the synth over the top.');
}
function rebasePosition() {
  if (!playing || !context) return;
  const elapsed = Math.max(0, context.currentTime - startedAt);
  position += elapsed;
  tracks.forEach(track => { track.offset += elapsed * track.rate; });
  startedAt = context.currentTime;
}
function pauseTransport() {
  transportVersion++; rebasePosition(); playing = false; stopSources(); releaseNotes(); finishRecording(); updateAvailability();
}
function stopTransport() {
  transportVersion++; playing = false; position = 0; tracks.forEach(track => { track.offset = 0; }); stopSources(); releaseNotes(); finishRecording();
  if (context && master) {
    master.gain.cancelScheduledValues(context.currentTime); master.gain.setValueAtTime(0, context.currentTime);
    master.gain.setValueAtTime(Number($('master').value) / 100, context.currentTime + .045);
    // Replace delay buffers so Stop does not leave old echoes in the next performance.
    for (const track of tracks) if (track.graph) {
      const graph = track.graph; graph.send.disconnect(); graph.delay.disconnect(); graph.feedback.disconnect();
      graph.delay = context.createDelay(1); graph.delay.delayTime.value = .31 + track.index * .047;
      graph.send.connect(graph.delay); graph.delay.connect(graph.feedback).connect(graph.delay);
      graph.delay.connect(graph.wet);
    }
  }
  updateAvailability();
}

async function guarded(action) {
  if (transportBusy) return;
  transportBusy = true; updateAvailability();
  try { await action(); } catch (error) { message(error.message || 'Audio could not start. Try pressing Play again.'); }
  finally { transportBusy = false; updateAvailability(); }
}
$('play').onclick = () => void guarded(async () => { if (playing) { pauseTransport(); message('Mix paused. Press Play to continue.'); } else await playTransport(); });
$('stop').onclick = () => { stopTransport(); message('Stopped and rewound. Your sounds are ready for another pass.'); };

async function noteOn(note, owner) {
  if (tracks[0].mode !== 'synth') return;
  const owners = noteOwners.get(note) || new Set(); owners.add(owner); noteOwners.set(note, owners); paintKeys();
  const version = transportVersion;
  if (synth && context?.state === 'running' && playing) {
    synth.port.postMessage({ type: 'on', note }); return;
  }
  try {
    await playTransport();
    if (version !== transportVersion || !playing || tracks[0].mode !== 'synth') return;
    synth.port.postMessage({ type: 'on', note });
    // Keep a quick first tap audible even if its key was released while audio initialized.
    if (!noteOwners.has(note)) setTimeout(() => {
      if (version === transportVersion && !noteOwners.has(note)) synth?.port.postMessage({ type: 'off', note });
    }, 60);
  } catch (error) { releaseNotes(); message(error.message || 'The synth could not start. Try again.'); }
}
function noteOff(note, owner) {
  const owners = noteOwners.get(note); owners?.delete(owner);
  if (!owners?.size) { noteOwners.delete(note); synth?.port.postMessage({ type: 'off', note }); }
  paintKeys();
}
function releaseNotes() { noteOwners.clear(); synth?.port.postMessage({ type: 'panic' }); paintKeys(); }
function paintKeys() { for (const key of $('keys').children) { const held = noteOwners.has(Number(key.dataset.note)); key.classList.toggle('held', held); key.setAttribute('aria-pressed', held); } }

document.querySelectorAll('[data-control]').forEach(input => input.addEventListener('input', () => {
  const track = tracks[Number(input.dataset.track)], key = input.dataset.control, value = Number(input.value);
  if (key === 'rate') {
    // Rebase the transport so a rate change never jumps back to the old file position.
    if (playing) { rebasePosition(); stopSources(); }
    track.rate = value / 100;
    if (playing) tracks.forEach(candidate => scheduleSource(candidate, context.currentTime));
  } else track[key] = key === 'tone' ? value : value / 100;
  $(`${key}-value-${track.index}`).textContent = key === 'rate' ? `${track.rate.toFixed(2)}×` : key === 'tone' ? value === 100 ? 'Open' : `${value}%` : key === 'echo' && !value ? 'Dry' : `${value}%`;
  updateTrack(track);
}));
$('master').oninput = () => { $('master-value').textContent = `${$('master').value}%`; if (master) master.gain.setTargetAtTime(Number($('master').value) / 100, context.currentTime, .02); };

function updateAvailability() {
  $('play').textContent = playing ? 'Ⅱ Pause' : '▶ Play mix';
  $('play').disabled = transportBusy || loading;
  $('record').textContent = recording ? recording.finishing ? 'Finishing…' : '■ Finish take' : '● Record mix';
  $('record').setAttribute('aria-pressed', Boolean(recording));
  $('record').disabled = transportBusy || loading || Boolean(recording?.finishing);
  $('demo').disabled = Boolean(recording) || loading;
  $('live-mode').disabled = $('take-mode').disabled = Boolean(recording) || loading;
  for (const track of tracks) { $(`file-${track.index}`).disabled = Boolean(recording) || loading; $(`clear-${track.index}`).disabled = !track.buffer || Boolean(recording) || loading; }
}
$('record').onclick = () => void guarded(async () => {
  if (recording) { finishRecording(); return; }
  if (unsaved && !window.confirm('Replace the mix you have not downloaded yet? Choose Cancel to download it first.')) return;
  await playTransport(); if (!playing) return;
  $('mix-preview').pause();
  recording = { id: ++nextTake, chunks: [], frames: 0, started: context.currentTime, finishing: false, timer: null };
  capture.port.postMessage({ type: 'start', id: recording.id });
  $('recording-status').textContent = 'Recording your mix. Play, move the controls, then choose Finish take. Maximum 3 minutes.';
  updateAvailability();
});
function finishRecording() {
  if (!recording || recording.finishing) return;
  recording.finishing = true; capture?.port.postMessage({ type: 'stop' });
  recording.timer = setTimeout(() => abortRecording('The recorder was interrupted. Check the partial take before keeping it.'), 2500);
  updateAvailability();
}
function receiveRecording(data) {
  if (!recording || data.id !== recording.id) return;
  if (data.type === 'recordingChunk') { recording.chunks.push(data.buffer); recording.frames += data.frames; }
  if (data.type === 'recordingFinished') completeRecording(data.reason === 'limit' ? 'Recording limit reached. Your take is ready to download.' : 'Your take is ready. Preview it, then download the WAV.');
}
function completeRecording(status) {
  if (!recording) return;
  clearTimeout(recording.timer);
  const take = recording; recording = null;
  if (take.frames) {
    const blob = encodeWav(take.chunks, context.sampleRate);
    if (mixUrl) URL.revokeObjectURL(mixUrl);
    mixUrl = URL.createObjectURL(blob); $('mix-preview').src = mixUrl;
    $('download').href = mixUrl; $('download').download = `TCK03-mix-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.wav`;
    $('mix-result').hidden = false; unsaved = true;
    $('recording-status').textContent = `${status} ${time(take.frames / context.sampleRate)} · ${(blob.size / 1e6).toFixed(1)} MB.`;
  } else $('recording-status').textContent = 'That take was too short. Press Record mix and try again.';
  updateAvailability();
  if (document.hidden && context?.state === 'running') void context.suspend();
}
function abortRecording(text) { if (recording) { capture?.port.postMessage({ type: 'stop', reason: 'partial' }); completeRecording(text); } }
$('download').onclick = () => { unsaved = false; $('recording-status').textContent = 'Download requested. Keep the WAV on your device before closing this page.'; };
$('mix-preview').onplay = () => { pauseTransport(); message('Previewing the saved take. Live playback is paused.'); };

$('demo').onclick = () => void guarded(async () => {
  if (tracks.some(track => track.buffer) && !window.confirm('Replace the sounds in this session with a small generated demo? Your original files stay on your device.')) return;
  await ensureAudio(); stopTransport();
  for (const track of tracks) {
    const duration = 4, buffer = context.createBuffer(2, context.sampleRate * duration, context.sampleRate);
    for (let c = 0; c < 2; c++) {
      const samples = buffer.getChannelData(c);
      for (let n = 0; n < samples.length; n++) {
        const t = n / context.sampleRate, step = t % .5;
        if (track.index === 0) samples[n] = .15 * Math.sin(2 * Math.PI * [130.81, 155.56, 196, 233.08][Math.floor(t) % 4] * t) * Math.sin(Math.PI * step / .5) ** 2;
        else if (track.index === 1) samples[n] = .35 * Math.sin(2 * Math.PI * (50 * step + 2 * (1 - Math.exp(-step * 30)))) * Math.exp(-step * 18);
        else samples[n] = .11 * (Math.sin(t * 2 * Math.PI * 392) + Math.sin(t * 2 * Math.PI * (587.33 + c * .6))) * Math.sin(Math.PI * t / duration) ** 2;
      }
    }
    track.buffer = buffer; track.name = ['A little bass', 'Soft pulse', 'Floating colour'][track.index];
    track.mode = 'file'; track.muted = false; track.loop = true; track.rate = 1;
    document.querySelector(`input[data-track='${track.index}'][data-control='rate']`).value = 100;
    $(`rate-value-${track.index}`).textContent = '1.00×'; updateTrack(track);
  }
  await playTransport(); message('A tiny demo, made on this device. Try the faders, mute a source, or choose Live synth.');
});

function fitCanvas(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2), width = Math.round(canvas.clientWidth * ratio), height = Math.round(canvas.clientHeight * ratio);
  if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
  return { width, height, ratio };
}
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const liveData = tracks.map(() => new Float32Array(512));
function drawFrame(timestamp) {
  visualFrame = requestAnimationFrame(drawFrame);
  if (timestamp - lastFrame < (reducedMotion.matches ? 180 : 1000 / 30)) return;
  lastFrame = timestamp;
  const canvas = $('mix-visual'), { width, height, ratio } = fitCanvas(canvas), ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#9caeaa12'; ctx.lineWidth = ratio;
  for (let x = 0; x < width; x += 44 * ratio) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, height); ctx.stroke(); }
  let energy = 0;
  for (const track of tracks) {
    const data = liveData[track.index]; data.fill(0);
    if (context?.state === 'running') track.analyser?.getFloatTimeDomainData(data);
    const rms = Math.sqrt(data.reduce((sum, value) => sum + value * value, 0) / data.length); energy += rms;
    const centre = height * (.32 + track.index * .18);
    ctx.beginPath(); ctx.lineWidth = ratio * 1.5; ctx.strokeStyle = colours[track.index];
    ctx.globalAlpha = track.muted ? .15 : .75;
    for (let n = 0; n < data.length; n++) { const x = n / (data.length - 1) * width, y = centre + data[n] * height * .85; if (!n) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.globalAlpha = 1;
    const mini = $(`wave-${track.index}`), size = fitCanvas(mini), paint = mini.getContext('2d');
    paint.clearRect(0, 0, size.width, size.height); paint.strokeStyle = colours[track.index]; paint.lineWidth = size.ratio;
    paint.globalAlpha = track.muted ? .25 : .85; paint.beginPath();
    if (track.buffer && !(track.index === 0 && track.mode === 'synth')) {
      const samples = track.buffer.getChannelData(0), bins = Math.max(1, Math.floor(size.width / 3));
      for (let bin = 0; bin < bins; bin++) {
        const start = Math.floor(bin / bins * samples.length), end = Math.floor((bin + 1) / bins * samples.length);
        let peak = 0;
        for (let n = start; n < end; n += Math.max(1, Math.floor((end - start) / 20))) peak = Math.max(peak, Math.abs(samples[n]));
        const x = bin / bins * size.width, amp = Math.max(1, peak * size.height * .45);
        paint.moveTo(x, size.height / 2 - amp); paint.lineTo(x, size.height / 2 + amp);
      }
    } else for (let n = 0; n < data.length; n++) { const x = n / (data.length - 1) * size.width, y = size.height / 2 + data[n] * size.height; if (!n) paint.moveTo(x, y); else paint.lineTo(x, y); }
    paint.stroke(); paint.globalAlpha = 1;
  }
  $('visual-state').textContent = energy > .002 ? 'A little electricity in the room' : playing ? 'Ready for your next sound' : 'Waiting for a little noise';
  $('clock').textContent = recording ? `REC ${time(context.currentTime - recording.started)}` : time(cursor());
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseTransport(); $('mix-preview').pause(); cancelAnimationFrame(visualFrame); if (context && !recording) void context.suspend(); }
  else { visualFrame = requestAnimationFrame(drawFrame); if (context) message('Playback paused while you were away. Press Play when you are ready.'); }
});
window.addEventListener('beforeunload', event => { if (recording || unsaved) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('pagehide', () => { capture?.port.postMessage({ type: 'stop' }); if (context) void context.suspend(); });
tracks.forEach(updateTrack); updateAvailability();
visualFrame = requestAnimationFrame(drawFrame);

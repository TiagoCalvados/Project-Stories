import { PATCHES, GLITCH_TYPES, clamp } from './tcko2-engine.js';
import { TakeRecorder } from './tcko2-recorder.js';

const byId = id => document.getElementById(id);
const KEY_CODES = ['KeyA','KeyW','KeyS','KeyE','KeyD','KeyF','KeyT','KeyG','KeyY','KeyH','KeyU','KeyJ','KeyK','KeyO','KeyL','KeyP','Semicolon','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8'];
const KEY_LABELS = ['A','W','S','E','D','F','T','G','Y','H','U','J','K','O','L','P',';','1','2','3','4','5','6','7','8'];
const CONTROL_RANGES = {
  master: [0,.8], pitch: [-12,12], bloom: [0,1], echo: [.08,4], glitchAmount: [0,1], fragmentsAmount: [0,1], glitchVolume: [0,4], glitchType: [0,6],
};
const STORAGE_KEY = 'project-stories-tcko2-v1';
const compactScreen = window.matchMedia('(max-width: 700px)').matches;
const state = {
  preset: 3, macros: [...PATCHES[3].values], octave: 4, keys: compactScreen ? 13 : 25,
  master: .2, pitch: 0, bloom: .75, echo: .85, glitch: false, fragments: false, hold: false, drone: false, clarity: true,
  glitchAmount: .65, fragmentsAmount: .65, glitchVolume: 2, glitchType: 0,
};
let mappings = Array(8).fill(-1);
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  if (saved && typeof saved === 'object') {
    state.preset = Math.round(clamp(saved.preset ?? 3, 0, PATCHES.length - 1));
    state.macros = PATCHES[state.preset].values.map((value, index) => clamp(saved.macros?.[index] ?? value, 0, 1));
    state.octave = Math.round(clamp(saved.octave ?? 4, 1, 7));
    for (const [name, range] of Object.entries(CONTROL_RANGES)) state[name] = clamp(saved[name] ?? state[name], ...range);
    state.pitch = Math.round(state.pitch); state.glitchType = Math.round(state.glitchType);
    for (const name of ['glitch','fragments','clarity']) if (typeof saved[name] === 'boolean') state[name] = saved[name];
    if (Array.isArray(saved.mappings)) mappings = mappings.map((value, index) => Number.isInteger(saved.mappings[index]) && saved.mappings[index] >= -1 && saved.mappings[index] < 2048 ? saved.mappings[index] : value);
  }
} catch {}

let context, synthNode, analyser, starting, stopped = false, ready = false, midiAccess, midiInput;
let keysDown = new Map(), pointers = new Map(), activeNotes = new Set();
const pendingNotes = new Map();
let fading = false, fadeAcknowledged = false;
const send = message => synthNode?.port.postMessage(message);
const announce = message => { byId('audio-status').textContent = message; };
const isRunning = () => ready && context?.state === 'running' && !stopped;
const takeRecorder = new TakeRecorder({ startAudio, isRunning, send });

function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, hold: false, drone: false, mappings })); } catch {} }
function control(name, value) { state[name] = value; send({ type: 'control', name, value }); save(); }
function syncEngine() {
  send({ type: 'preset', index: state.preset });
  state.macros.forEach((value, index) => send({ type: 'macro', index, value }));
  for (const name of [...Object.keys(CONTROL_RANGES), 'clarity','hold','drone','glitch','fragments']) send({ type: 'control', name, value: state[name] });
}

PATCHES.forEach((patch, index) => byId('preset').add(new Option(`${String(index + 1).padStart(2, '0')}  ${patch.name}`, index)));
GLITCH_TYPES.forEach((name, index) => byId('glitch-type').add(new Option(name, index)));
const vintageButtons = new Map();
PATCHES.forEach((patch, index) => {
  if (!patch.vintage) return;
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = patch.name; button.className = 'vintage-sound';
  button.title = patch.description; button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => choosePreset(index));
  vintageButtons.set(index, button); byId('vintage-sounds').append(button);
});

function setMacro(index, value) {
  state.macros[index] = clamp(value, 0, 1);
  send({ type: 'macro', index, value: state.macros[index] });
  save();
}
const rangeBindings = [
  ['master','master',100, value => `${Math.round(value * 100)}%`],
  ['glitch-amount','glitchAmount',100, value => `${Math.round(value * 100)}%`],
  ['fragments-amount','fragmentsAmount',100, value => `${Math.round(value * 100)}%`],
  ['glitch-volume','glitchVolume',100, value => `${Math.round(value * 100)}%`],
  ['bloom','bloom',100, value => `${Math.round(value * 100)}%`],
  ['echo','echo',1000, value => `${value.toFixed(2)} s`],
];
for (const [id, name, scale, format] of rangeBindings) {
  byId(id).addEventListener('input', () => { control(name, Number(byId(id).value) / scale); byId(`${id}-value`).textContent = format(state[name]); });
}
function renderControls() {
  byId('preset').value = state.preset; byId('preset-description').textContent = PATCHES[state.preset].description;
  vintageButtons.forEach((button, index) => button.setAttribute('aria-pressed', String(state.preset === index)));
  for (const [id, name, scale, format] of rangeBindings) { byId(id).value = Math.round(state[name] * scale); byId(`${id}-value`).textContent = format(state[name]); }
  for (const name of ['hold','drone','glitch','fragments']) {
    byId(name).setAttribute('aria-pressed', String(state[name]));
    if (name === 'glitch' || name === 'fragments') byId(name).textContent = state[name] ? 'On' : 'Off';
  }
  byId('glitch-type').value = state.glitchType; byId('clarity').checked = state.clarity;
  byId('pitch-value').textContent = `${(2 ** (state.pitch / 12)).toFixed(2)}× / ${state.pitch > 0 ? '+' : ''}${state.pitch} st`;
  byId('slower').disabled = state.pitch <= -12; byId('faster').disabled = state.pitch >= 12;
  byId('key-count').value = state.keys;
}
for (const name of ['hold','drone','glitch','fragments']) byId(name).addEventListener('click', () => {
  const enabled = !state[name];
  if (name === 'hold' && enabled) state.drone = false;
  if (name === 'drone' && enabled) state.hold = false;
  control(name, enabled); renderControls();
});
byId('clarity').addEventListener('change', () => control('clarity', byId('clarity').checked));
byId('glitch-type').addEventListener('change', () => control('glitchType', Number(byId('glitch-type').value)));
function changePitch(value) { control('pitch', Math.round(clamp(value, -12, 12))); renderControls(); }
byId('slower').addEventListener('click', () => changePitch(state.pitch - 1));
byId('normal').addEventListener('click', () => changePitch(0));
byId('faster').addEventListener('click', () => changePitch(state.pitch + 1));
function choosePreset(index) {
  fading = fadeAcknowledged = false; byId('fade').textContent = 'Fade out';
  releaseComputer(); releasePointers();
  state.preset = index;
  const patch = PATCHES[state.preset];
  state.macros = [...patch.values]; state.hold = state.glitch = state.fragments = false; state.drone = Boolean(patch.drone);
  state.bloom = patch.drone ? .9 : .75; state.echo = patch.echo || .85;
  activeNotes.clear(); syncEngine(); renderControls(); highlightKeys(); save();
}
byId('preset').addEventListener('change', () => choosePreset(Number(byId('preset').value)));
byId('fade').addEventListener('click', () => {
  if (!isRunning()) { announce('Play a note first, then use Fade out.'); return; }
  send({ type: 'fade', seconds: Number(byId('fade-time').value) });
  fading = true; fadeAcknowledged = false; byId('fade').textContent = 'Fading…';
  announce('Fading the notes and echoes. Play a new key to cancel the fade.');
});

async function startAudio() {
  if (isRunning()) return true;
  if (starting) {
    if (context?.state === 'suspended') context.resume().catch(() => {});
    return starting;
  }
  starting = (async () => {
    announce('Starting the sound engine…');
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('Web Audio is not available in this browser. Try an up-to-date browser.');
        context = new AudioContextClass({ latencyHint: 'interactive' });
        const resumed = context.resume();
        if (!context.audioWorklet) { resumed.catch(() => {}); throw new Error('AudioWorklet is unavailable. Use this site over HTTPS in an up-to-date browser.'); }
        await Promise.all([resumed, context.audioWorklet.addModule(new URL('./tcko2-worklet.js', import.meta.url))]);
        synthNode = new AudioWorkletNode(context, 'tcko2-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { voiceLimit: compactScreen ? 4 : 8 } });
        analyser = context.createAnalyser(); analyser.fftSize = 512;
        synthNode.connect(analyser); analyser.connect(context.destination);
        const engineStarted = new Promise((resolve, reject) => {
          synthNode.port.onmessage = ({ data }) => {
            if (takeRecorder.handleMessage(data)) return;
            if (data.type !== 'meter') return;
            resolve();
            activeNotes = new Set(data.notes); highlightKeys();
            if (fading && data.fading) fadeAcknowledged = true;
            if (fading && fadeAcknowledged && !data.fading) {
              fading = false; byId('fade').textContent = 'Fade out';
              if (data.faded) {
                state.hold = state.drone = state.glitch = state.fragments = false;
                keysDown.clear(); pointers.clear(); pendingNotes.clear(); renderControls(); save();
                announce('Fade complete. Play a new key to return. Recording continues until you stop it.');
              }
            }
            const level = Math.min(100, Math.round(data.peak * 160));
            byId('meter-fill').style.width = `${level}%`; document.querySelector('.meter').setAttribute('aria-valuenow', String(level));
            byId('signal-light').classList.toggle('active', level > 0);
            if (data.invalidSamples > 0) announce('An unstable signal was cleared. Press Panic before continuing.');
          };
          synthNode.onprocessorerror = () => {
            takeRecorder.recover('The sound engine stopped.');
            ready = false; pendingNotes.clear();
            const error = new Error('The sound engine stopped. Reload this page to restart it.');
            announce(error.message); reject(error);
          };
        });
        context.onstatechange = updateAudioStatus;
        syncEngine(); await engineStarted; ready = true;
      } else if (!ready) { throw new Error('The sound engine needs a fresh start. Reload this page.'); }
      await context.resume();
      stopped = false; send({ type: 'stop', value: false });
      byId('stop').textContent = 'Stop'; byId('stop').disabled = false;
      updateAudioStatus();
      return isRunning();
    } catch (error) {
      announce(error.message || 'Could not start audio. Play a key to try again, or reload this page.');
      if (!ready && context) { await context.close().catch(() => {}); context = synthNode = analyser = null; }
      return false;
    }
  })();
  try { return await starting; } finally { starting = undefined; }
}
function updateAudioStatus() {
  if (!ready) return;
  const running = context.state === 'running';
  announce(stopped ? 'Stopped. Press Resume to play again.' : running ? 'Audio ready · play the keys. Start with low speaker volume.' : 'Audio paused. Play a key or tap the synth to continue.');
}
function wakeAudio() { if (!stopped && !isRunning()) void startAudio(); }
for (const eventName of ['pointerdown', 'pointerup', 'click', 'keydown']) document.addEventListener(eventName, wakeAudio, { capture: true });
function playNote(note, velocity, channel) {
  if (!canPlay()) return;
  if (fading) { fading = fadeAcknowledged = false; byId('fade').textContent = 'Fade out'; }
  const key = `${channel}:${note}`;
  if (isRunning()) { pendingNotes.delete(key); send({ type: 'noteOn', note, velocity, channel }); return; }
  const pending = { channel, released: false };
  pendingNotes.set(key, pending);
  void startAudio().then(started => {
    if (pendingNotes.get(key) !== pending) return;
    if (!started || stopped || document.hidden) { pendingNotes.delete(key); return; }
    send({ type: 'noteOn', note, velocity, channel });
    setTimeout(() => {
      if (pendingNotes.get(key) !== pending) return;
      pendingNotes.delete(key);
      if (pending.released) send({ type: 'noteOff', note, channel });
    }, 120);
  });
}
function releaseNote(note, channel) {
  const key = `${channel}:${note}`, pending = pendingNotes.get(key);
  if (pending) { pending.released = true; return; }
  pendingNotes.delete(key); send({ type: 'noteOff', note, channel });
}
function releaseChannel(channel) {
  for (const [key, pending] of pendingNotes) if (pending.channel === channel) pendingNotes.delete(key);
  send({ type: 'release', channel });
}
function panic() {
  pendingNotes.clear(); keysDown.clear(); pointers.clear(); activeNotes.clear(); fading = false; byId('fade').textContent = 'Fade out';
  state.hold = state.drone = state.glitch = state.fragments = false;
  send({ type: 'panic' }); renderControls(); highlightKeys(); save();
  announce('Panic: notes, latches and effect tails cleared.');
}
byId('panic').addEventListener('click', panic);
byId('stop').addEventListener('click', () => {
  if (stopped) { void startAudio(); return; }
  void takeRecorder.stop('sound-stopped');
  const next = !stopped; panic(); stopped = next; send({ type: 'stop', value: stopped });
  byId('stop').textContent = stopped ? 'Resume' : 'Stop';
  announce(stopped ? 'Stopped. Press Resume to play again.' : 'Sound resumed.');
});

const blackNotes = new Set([1,3,6,8,10]);
const noteNames = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function noteLabel(note) { return `${noteNames[note % 12]}${Math.floor(note / 12) - 1}`; }
function renderKeyboard() {
  const keyboard = byId('keyboard'); keyboard.replaceChildren();
  const base = state.octave * 12, whiteCount = state.keys === 13 ? 8 : 15;
  let whiteIndex = 0;
  for (let index = 0; index < state.keys; index++) {
    const note = base + index, black = blackNotes.has(note % 12), key = document.createElement('button');
    key.type = 'button'; key.className = `key${black ? ' black' : ''}`; key.dataset.note = note;
    key.setAttribute('aria-label', `Play ${noteLabel(note)}, keyboard ${KEY_LABELS[index]}`); key.setAttribute('aria-pressed', 'false');
    const shortcut = document.createElement('kbd'); shortcut.textContent = KEY_LABELS[index]; key.append(shortcut);
    const label = document.createElement('span'); label.className = 'note-name'; label.textContent = noteLabel(note); key.append(label);
    if (black) { key.style.left = `${(whiteIndex - .31) / whiteCount * 100}%`; key.style.width = `${.62 / whiteCount * 100}%`; } else whiteIndex++;
    key.addEventListener('click', event => {
      if (event.detail !== 0) return;
      if (!canPlay()) return;
      playNote(note, 100, 17);
      setTimeout(() => releaseNote(note, 17), 180);
    });
    keyboard.append(key);
  }
  byId('octave-label').textContent = `${noteLabel(base)} — ${noteLabel(base + state.keys - 1)}`;
  byId('octave-down').disabled = state.octave <= 1; byId('octave-up').disabled = state.octave >= 7;
  highlightKeys();
}
function canPlay() {
  if (!stopped) return true;
  announce('Sound is stopped. Press Resume to play.');
  return false;
}
function highlightKeys() {
  document.querySelectorAll('.key').forEach(key => {
    const note = Number(key.dataset.note), active = activeNotes.has(note) || [...keysDown.values()].includes(note) || [...pointers.values()].includes(note);
    key.classList.toggle('active', active); key.setAttribute('aria-pressed', String(active));
  });
}
function releaseComputer() { keysDown.clear(); releaseChannel(16); highlightKeys(); }
function releasePointers() { pointers.clear(); releaseChannel(17); highlightKeys(); }
function changeOctave(amount) { releaseComputer(); releasePointers(); state.octave = clamp(state.octave + amount, 1, 7); renderKeyboard(); save(); }
byId('octave-down').addEventListener('click', () => changeOctave(-1)); byId('octave-up').addEventListener('click', () => changeOctave(1));
byId('key-count').addEventListener('change', () => { releaseComputer(); releasePointers(); state.keys = Number(byId('key-count').value); renderKeyboard(); save(); });
const keyboard = byId('keyboard');
function pointerNote(event) {
  const element = document.elementFromPoint(event.clientX, event.clientY)?.closest('.key');
  return element && keyboard.contains(element) ? Number(element.dataset.note) : null;
}
function movePointer(pointerId, note) {
  const old = pointers.get(pointerId);
  if (old === note) return;
  pointers.delete(pointerId);
  if (old != null && ![...pointers.values()].includes(old)) releaseNote(old, 17);
  if (note != null) {
    if (![...pointers.values()].includes(note)) playNote(note, 100, 17);
    pointers.set(pointerId, note);
  } else pointers.set(pointerId, null);
  highlightKeys();
}
keyboard.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  if (!canPlay()) return;
  keyboard.setPointerCapture(event.pointerId); movePointer(event.pointerId, pointerNote(event));
});
keyboard.addEventListener('pointermove', event => { if (pointers.has(event.pointerId)) { event.preventDefault(); movePointer(event.pointerId, pointerNote(event)); } });
function releasePointer(event) {
  const note = pointers.get(event.pointerId); pointers.delete(event.pointerId);
  if (note != null && ![...pointers.values()].includes(note)) releaseNote(note, 17);
  highlightKeys();
}
keyboard.addEventListener('pointerup', releasePointer); keyboard.addEventListener('pointercancel', releasePointer); keyboard.addEventListener('lostpointercapture', releasePointer);
window.addEventListener('keydown', event => {
  if (event.code === 'Escape') { event.preventDefault(); panic(); return; }
  if (event.ctrlKey || event.metaKey || event.altKey || event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
  if (event.code === 'KeyZ' || event.code === 'KeyX') { event.preventDefault(); if (!event.repeat) changeOctave(event.code === 'KeyZ' ? -1 : 1); return; }
  const index = KEY_CODES.indexOf(event.code);
  if (index < 0) return;
  event.preventDefault();
  if (event.repeat || keysDown.has(event.code) || !canPlay()) return;
  const note = state.octave * 12 + index; keysDown.set(event.code, note); playNote(note, 100, 16); highlightKeys();
});
window.addEventListener('keyup', event => {
  if (!keysDown.has(event.code)) return;
  releaseNote(keysDown.get(event.code), 16); keysDown.delete(event.code); highlightKeys();
});
window.addEventListener('blur', () => { releaseComputer(); releasePointers(); });
document.addEventListener('visibilitychange', async () => {
  if (!document.hidden || !context) return;
  panic(); await takeRecorder.stop('hidden');
  if (document.hidden) context.suspend().catch(() => {});
});
window.addEventListener('pagehide', () => { void takeRecorder.stop('hidden'); send({ type: 'panic' }); context?.suspend().catch(() => {}); });

function disconnectMidi() {
  if (midiInput) midiInput.onmidimessage = null;
  for (const [key, pending] of pendingNotes) if (pending.channel < 16) pendingNotes.delete(key);
  for (let channel = 0; channel < 16; channel++) send({ type: 'midi', data: [176 + channel, 123, 0] });
  midiInput = undefined;
}
function chooseMidi() {
  disconnectMidi();
  midiInput = midiAccess?.inputs.get(byId('midi-input').value);
  if (!midiInput) { byId('midi-status').textContent = 'No MIDI keyboard found. Connect it, then choose it here. Touch and computer keys still work.'; return; }
  midiInput.onmidimessage = event => {
    const data = [...event.data];
    if (data.length < 3) return;
    const command = data[0] & 240, channel = data[0] & 15, cc = data[1];
    if (command === 144 && data[2] > 0) { playNote(cc, data[2], channel); return; }
    if (command === 128 || command === 144) { releaseNote(cc, channel); return; }
    if (!isRunning()) return;
    if (command === 176 && ![64,120,121,123].includes(cc)) {
      const mapping = channel * 128 + cc;
      mappings.forEach((value, index) => { if (value === mapping) setMacro(index, data[2] / 127); });
    }
    send({ type: 'midi', data: data.slice(0, 3) });
  };
  byId('midi-status').textContent = `Connected · ${midiInput.name}. Play your keyboard. If audio is paused, tap the synth once. Close other apps if the device is unavailable.`;
}
function refreshMidi() {
  const select = byId('midi-input'), previous = select.value;
  select.replaceChildren();
  const inputs = [...midiAccess.inputs.values()].filter(input => input.state === 'connected');
  for (const input of inputs) select.add(new Option(input.name || 'MIDI keyboard', input.id));
  select.disabled = inputs.length === 0;
  if (!inputs.length) select.add(new Option('No MIDI keyboard connected', ''));
  else select.value = inputs.some(input => input.id === previous) ? previous : inputs.find(input => /MPK|Akai/i.test(input.name))?.id || inputs[0].id;
  chooseMidi();
}
byId('connect-midi').addEventListener('click', async () => {
  if (!navigator.requestMIDIAccess) { byId('midi-status').textContent = 'This browser does not offer Web MIDI. Touch and computer keys work without it; try a browser with Web MIDI support for USB hardware.'; return; }
  try { midiAccess = await navigator.requestMIDIAccess({ sysex: false }); midiAccess.onstatechange = refreshMidi; refreshMidi(); }
  catch { byId('midi-status').textContent = 'MIDI was not connected or permission was declined. Touch and computer keys still work.'; }
});
byId('midi-input').addEventListener('change', chooseMidi);
const scope = byId('scope'), pen = scope.getContext('2d'), waveform = new Float32Array(512);
function drawScope() {
  requestAnimationFrame(drawScope);
  if (!pen || compactScreen || document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  pen.clearRect(0, 0, scope.width, scope.height); pen.strokeStyle = '#81d5b7'; pen.lineWidth = 2; pen.beginPath();
  if (analyser && context.state === 'running') analyser.getFloatTimeDomainData(waveform); else waveform.fill(0);
  for (let index = 0; index < waveform.length; index++) { const horizontal = index / (waveform.length - 1) * scope.width, vertical = scope.height / 2 - waveform[index] * 150; if (index === 0) pen.moveTo(horizontal, vertical); else pen.lineTo(horizontal, vertical); }
  pen.stroke();
}
renderControls(); renderKeyboard(); drawScope();

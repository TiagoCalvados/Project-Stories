import { PATCHES, GLITCH_TYPES, clamp } from './tcko2-engine.js';

const byId = id => document.getElementById(id);
const MACROS = [
  ['Tone','dark → open'], ['Squelch','filter resonance'], ['Drift','detune + wander'], ['Grit','soft saturation'],
  ['Tape echo','long repeats'], ['Room','larger reverb'], ['Metal','ring modulation'], ['Motion','slow → restless'],
];
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

let context, synthNode, analyser, starting, stopped = false, ready = false, learning = -1, midiAccess, midiInput;
let keysDown = new Map(), pointers = new Map(), activeNotes = new Set();
const macroElements = [];
const send = message => synthNode?.port.postMessage(message);
const announce = message => { byId('audio-status').textContent = message; };
const isRunning = () => ready && context?.state === 'running' && !stopped;

function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, hold: false, drone: false, mappings })); } catch {} }
function control(name, value) { state[name] = value; send({ type: 'control', name, value }); save(); }
function syncEngine() {
  send({ type: 'preset', index: state.preset });
  state.macros.forEach((value, index) => send({ type: 'macro', index, value }));
  for (const name of [...Object.keys(CONTROL_RANGES), 'clarity','hold','drone','glitch','fragments']) send({ type: 'control', name, value: state[name] });
}

PATCHES.forEach((patch, index) => byId('preset').add(new Option(`${String(index + 1).padStart(2, '0')}  ${patch.name}`, index)));
GLITCH_TYPES.forEach((name, index) => byId('glitch-type').add(new Option(name, index)));
if (compactScreen) { byId('effects-panel').open = false; byId('macros-panel').open = false; }

MACROS.forEach(([title, hint], index) => {
  const card = document.createElement('div');
  card.className = 'macro';
  card.innerHTML = `<div class="macro-heading"><label for="macro-${index}">${title}</label><button class="learn" type="button" aria-pressed="false" aria-label="Learn a MIDI knob for ${title}">LEARN</button></div><div class="macro-value"><span class="dial" aria-hidden="true"></span><div><output for="macro-${index}">00</output><p class="macro-hint">${hint}</p></div></div><input id="macro-${index}" aria-label="${title}" type="range" min="0" max="100" value="0"><p class="mapping">No MIDI knob assigned</p>`;
  const slider = card.querySelector('input'), learn = card.querySelector('button');
  slider.addEventListener('input', () => setMacro(index, Number(slider.value) / 100));
  learn.addEventListener('click', () => {
    if (!midiInput) { byId('midi-status').textContent = 'Choose Connect MIDI first, then assign a knob.'; document.querySelector('.help-panel').open = true; byId('connect-midi').focus(); return; }
    learning = learning === index ? -1 : index;
    updateMappings();
    byId('midi-status').textContent = learning < 0 ? 'Knob learning cancelled.' : `Turn the MIDI knob for ${title}. Press Learn again or Escape to cancel.`;
  });
  macroElements.push({ card, slider, learn, output: card.querySelector('output'), dial: card.querySelector('.dial'), mapping: card.querySelector('.mapping') });
  byId('macros').append(card);
});

function setMacro(index, value) {
  state.macros[index] = clamp(value, 0, 1);
  send({ type: 'macro', index, value: state.macros[index] });
  renderMacro(index); save();
}
function renderMacro(index) {
  const value = Math.round(state.macros[index] * 100), elements = macroElements[index];
  elements.slider.value = value; elements.output.textContent = String(value).padStart(2, '0'); elements.dial.style.setProperty('--rotation', `${-135 + value * 2.7}deg`);
}
function updateMappings() {
  macroElements.forEach((elements, index) => {
    elements.learn.setAttribute('aria-pressed', String(index === learning)); elements.learn.textContent = index === learning ? 'TURN KNOB' : 'LEARN';
    elements.mapping.textContent = mappings[index] < 0 ? 'No MIDI knob assigned' : `CC ${mappings[index] % 128} · channel ${Math.floor(mappings[index] / 128) + 1}`;
  });
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
  state.macros.forEach((value, index) => renderMacro(index));
  for (const [id, name, scale, format] of rangeBindings) { byId(id).value = Math.round(state[name] * scale); byId(`${id}-value`).textContent = format(state[name]); }
  for (const name of ['hold','drone','glitch','fragments']) {
    byId(name).setAttribute('aria-pressed', String(state[name]));
    if (name === 'glitch' || name === 'fragments') byId(name).textContent = state[name] ? 'On' : 'Off';
  }
  byId('glitch-type').value = state.glitchType; byId('clarity').checked = state.clarity;
  byId('pitch-value').textContent = `${(2 ** (state.pitch / 12)).toFixed(2)}× / ${state.pitch > 0 ? '+' : ''}${state.pitch} st`;
  byId('slower').disabled = state.pitch <= -12; byId('faster').disabled = state.pitch >= 12;
  byId('key-count').value = state.keys;
  updateMappings();
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
byId('preset').addEventListener('change', () => {
  releaseComputer(); releasePointers();
  state.preset = Number(byId('preset').value);
  const patch = PATCHES[state.preset];
  state.macros = [...patch.values]; state.hold = state.glitch = state.fragments = false; state.drone = Boolean(patch.drone);
  state.bloom = patch.drone ? .9 : .75; state.echo = patch.echo || .85;
  activeNotes.clear(); syncEngine(); renderControls(); highlightKeys(); save();
});

async function startAudio() {
  if (starting) return starting;
  starting = (async () => {
    const button = byId('start-audio'); button.disabled = true;
    announce('Starting the sound engine…');
    try {
      if (!context) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) throw new Error('Web Audio is not available in this browser. Try an up-to-date browser.');
        context = new AudioContextClass({ latencyHint: 'interactive' });
        const resumed = context.resume();
        if (!context.audioWorklet) { await resumed; throw new Error('AudioWorklet is unavailable. Use this site over HTTPS in an up-to-date browser.'); }
        await context.audioWorklet.addModule(new URL('./tcko2-worklet.js', import.meta.url));
        synthNode = new AudioWorkletNode(context, 'tcko2-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2], processorOptions: { voiceLimit: compactScreen ? 4 : 8 } });
        analyser = context.createAnalyser(); analyser.fftSize = 512;
        synthNode.connect(analyser); analyser.connect(context.destination);
        synthNode.port.onmessage = ({ data }) => {
          if (data.type !== 'meter') return;
          activeNotes = new Set(data.notes); highlightKeys();
          const level = Math.min(100, Math.round(data.peak * 160));
          byId('meter-fill').style.width = `${level}%`; document.querySelector('.meter').setAttribute('aria-valuenow', String(level));
          byId('signal-light').classList.toggle('active', level > 0);
          if (data.invalidSamples > 0) announce('An unstable signal was cleared. Press Panic before continuing.');
        };
        synthNode.onprocessorerror = () => { ready = false; announce('The sound engine stopped. Reload this page to restart it.'); button.textContent = 'Reload to restart'; };
        context.onstatechange = updateAudioStatus;
        syncEngine(); ready = true;
        await resumed;
      } else if (!ready) { throw new Error('The sound engine needs a fresh start. Reload this page.'); }
      await context.resume();
      stopped = false; send({ type: 'stop', value: false });
      byId('stop').textContent = 'Stop'; byId('stop').disabled = false;
      updateAudioStatus();
    } catch (error) {
      announce(error.message || 'Could not start audio. Try reloading this page.'); button.textContent = 'Try audio again';
      if (!ready && context) { await context.close().catch(() => {}); context = synthNode = analyser = null; }
    } finally { button.disabled = false; starting = undefined; }
  })();
  return starting;
}
function updateAudioStatus() {
  if (!ready) return;
  const running = context.state === 'running';
  byId('start-audio').textContent = running ? '✓ Audio ready' : '▶ Resume audio';
  announce(running ? stopped ? 'Stopped. Press Resume to play again.' : 'Audio ready · play the keys. Start with low speaker volume.' : 'Audio paused. Tap Resume audio to continue.');
}
byId('start-audio').addEventListener('click', startAudio);
function panic() {
  keysDown.clear(); pointers.clear(); activeNotes.clear(); learning = -1;
  state.hold = state.drone = state.glitch = state.fragments = false;
  send({ type: 'panic' }); renderControls(); highlightKeys(); save();
  announce('Panic: notes, latches and effect tails cleared.');
}
byId('panic').addEventListener('click', panic);
byId('stop').addEventListener('click', () => {
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
      send({ type: 'noteOn', note, velocity: 100, channel: 17 });
      setTimeout(() => send({ type: 'noteOff', note, channel: 17 }), 180);
    });
    keyboard.append(key);
  }
  byId('octave-label').textContent = `${noteLabel(base)} — ${noteLabel(base + state.keys - 1)}`;
  byId('octave-down').disabled = state.octave <= 1; byId('octave-up').disabled = state.octave >= 7;
  highlightKeys();
}
function canPlay() {
  if (isRunning()) return true;
  announce(stopped ? 'Sound is stopped. Press Resume to play.' : 'Tap Start audio or Resume audio first, then play the keys.');
  return false;
}
function highlightKeys() {
  document.querySelectorAll('.key').forEach(key => {
    const note = Number(key.dataset.note), active = activeNotes.has(note) || [...keysDown.values()].includes(note) || [...pointers.values()].includes(note);
    key.classList.toggle('active', active); key.setAttribute('aria-pressed', String(active));
  });
}
function releaseComputer() { keysDown.clear(); send({ type: 'release', channel: 16 }); highlightKeys(); }
function releasePointers() { pointers.clear(); send({ type: 'release', channel: 17 }); highlightKeys(); }
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
  if (old != null && ![...pointers.values()].includes(old)) send({ type: 'noteOff', note: old, channel: 17 });
  if (note != null) {
    if (![...pointers.values()].includes(note)) send({ type: 'noteOn', note, velocity: 100, channel: 17 });
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
  if (note != null && ![...pointers.values()].includes(note)) send({ type: 'noteOff', note, channel: 17 });
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
  const note = state.octave * 12 + index; keysDown.set(event.code, note); send({ type: 'noteOn', note, velocity: 100, channel: 16 }); highlightKeys();
});
window.addEventListener('keyup', event => {
  if (!keysDown.has(event.code)) return;
  send({ type: 'noteOff', note: keysDown.get(event.code), channel: 16 }); keysDown.delete(event.code); highlightKeys();
});
window.addEventListener('blur', () => { releaseComputer(); releasePointers(); });
document.addEventListener('visibilitychange', () => {
  if (!document.hidden || !context) return;
  panic(); context.suspend().catch(() => {});
});
window.addEventListener('pagehide', () => { send({ type: 'panic' }); context?.suspend().catch(() => {}); });

function disconnectMidi() {
  if (midiInput) midiInput.onmidimessage = null;
  for (let channel = 0; channel < 16; channel++) send({ type: 'midi', data: [176 + channel, 123, 0] });
  midiInput = undefined; learning = -1; updateMappings();
}
function chooseMidi() {
  disconnectMidi();
  midiInput = midiAccess?.inputs.get(byId('midi-input').value);
  if (!midiInput) { byId('midi-status').textContent = 'No MIDI keyboard found. Connect it, then choose it here. Touch and computer keys still work.'; return; }
  midiInput.onmidimessage = event => {
    const data = [...event.data];
    if (data.length < 3 || !isRunning()) return;
    const command = data[0] & 240, channel = data[0] & 15, cc = data[1];
    if (command === 176 && ![64,120,121,123].includes(cc)) {
      const mapping = channel * 128 + cc;
      if (learning >= 0) { mappings = mappings.map(value => value === mapping ? -1 : value); mappings[learning] = mapping; learning = -1; updateMappings(); save(); byId('midi-status').textContent = 'Knob assigned. Your mappings stay in this browser.'; }
      mappings.forEach((value, index) => { if (value === mapping) setMacro(index, data[2] / 127); });
    }
    send({ type: 'midi', data: data.slice(0, 3) });
  };
  byId('midi-status').textContent = `Connected · ${midiInput.name}. Start audio before playing. Close other apps if the device is unavailable.`;
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

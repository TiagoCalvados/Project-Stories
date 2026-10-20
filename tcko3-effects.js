export const EFFECTS = [
  ['chorus', 'Chorus'], ['phaser', 'Phaser'], ['flanger', 'Flanger'],
  ['tremolo', 'Tremolo'], ['ring', 'Ring mod'], ['drive', 'Drive'],
];
// Native Web Audio keeps the small rack responsive on phones, without samples or libraries.
export function createEffects(context) {
  const input = context.createGain(), output = context.createGain(), dry = context.createGain();
  input.connect(dry).connect(output);
  const branches = new Map(), oscillators = [];
  function lfo(frequency, amount, parameter) {
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.frequency.value = frequency; gain.gain.value = amount;
    oscillator.connect(gain); for (const target of Array.isArray(parameter) ? parameter : [parameter]) gain.connect(target);
    oscillator.start(); oscillators.push(oscillator);
  }
  function branch(name, first, last = first) {
    const gain = context.createGain(); gain.gain.value = 0;
    input.connect(first); last.connect(gain).connect(output); branches.set(name, gain);
  }
  const chorus = context.createDelay(.1); chorus.delayTime.value = .016; lfo(.8, .005, chorus.delayTime); branch('chorus', chorus);
  const phases = Array.from({ length: 4 }, () => { const node = context.createBiquadFilter(); node.type = 'allpass'; node.frequency.value = 800; node.Q.value = .6; return node; });
  lfo(.25, 650, phases.map(node => node.frequency));
  phases.forEach((node, i) => { if (i) phases[i - 1].connect(node); });
  const phaser = context.createGain(); phaser.gain.value = .5; input.connect(phaser); phases[3].connect(phaser); branch('phaser', phases[0], phaser);
  const flanger = context.createDelay(.03); flanger.delayTime.value = .0025; lfo(.22, .002, flanger.delayTime);
  const flangeMix = context.createGain(); flangeMix.gain.value = .5; input.connect(flangeMix); flanger.connect(flangeMix); branch('flanger', flanger, flangeMix);
  const tremolo = context.createGain(); tremolo.gain.value = .58; lfo(5, .42, tremolo.gain); branch('tremolo', tremolo);
  const ring = context.createGain(); ring.gain.value = 0; lfo(57, 1, ring.gain); branch('ring', ring);
  const drive = context.createWaveShaper(), curve = new Float32Array(2048);
  for (let i = 0; i < curve.length; i++) curve[i] = Math.tanh((i / (curve.length - 1) * 2 - 1) * 7) / 2.5;
  drive.curve = curve; drive.oversample = '2x'; branch('drive', drive);
  return {
    input, output,
    update(enabled, amount) {
      const count = EFFECTS.filter(([name]) => enabled.has(name)).length, depth = count ? Math.max(0, Math.min(1, amount)) : 0;
      dry.gain.setTargetAtTime(1 - depth, context.currentTime, .015);
      for (const [name, gain] of branches) gain.gain.setTargetAtTime(enabled.has(name) && count ? depth / count : 0, context.currentTime, .015);
    },
    dispose() { for (const oscillator of oscillators) oscillator.stop(); input.disconnect(); output.disconnect(); },
  };
}

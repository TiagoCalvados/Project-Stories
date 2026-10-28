import assert from "node:assert/strict";
import { test } from "node:test";
import { SkyConversation } from "../daao-conversation.js";
import { VoiceConversation } from "../daao-voice.js";
import { CameraZoomConversation } from "../daao-zoom.js";
import { chooseVoice, configureSpeech } from "../daao-speech.js";
import { skyObjects } from "../daao-sky.js";

const objects = [
  { name: "Vega", kind: "star", magnitude: 0.03, altitude: 40, azimuth: 90 },
  { name: "Jupiter", kind: "planet", magnitude: -2.7, altitude: 60, azimuth: 220 },
];
const flush = async () => { for (let i = 0; i < 12; i += 1) await Promise.resolve(); };

test("selected target survives movement, lowering, refresh and follow-up questions", () => {
  const chat = new SkyConversation();
  assert.match(chat.reply("What is this bright light in front of me?", objects, { bearing: 90, elevation: 40 }), /suggests Vega/);
  const snapshot = structuredClone(chat.target);
  for (const direction of [{ bearing: 220, elevation: 60 }, { bearing: 0, elevation: -70 }, null]) {
    assert.match(chat.reply("Tell me more about it", objects.map(o => ({ ...o, azimuth: o.azimuth + 1 })), direction), /still talking about Vega/);
    assert.match(chat.reply("What is it?", objects, direction), /still talking about Vega/);
    assert.match(chat.reply("What is that made of?", objects, direction), /still talking about Vega/);
    assert.deepEqual(chat.target, snapshot);
  }
  assert.match(chat.reply("What is this other light?", objects, { bearing: 220, elevation: 60 }), /suggests Jupiter/);
  assert.equal(chat.target.name, "Jupiter");
});

test("directional identification requires location and real direction and rejects ambiguity", () => {
  const chat = new SkyConversation();
  assert.match(chat.reply("What is this light?", [], { bearing: 90, elevation: 40 }), /need your location/);
  assert.match(chat.reply("What is this light?", objects, null), /recent compass direction/);
  assert.match(chat.reply("What is this light?", objects, { bearing: 90, elevation: -1 }), /below the horizon/);
  assert.match(chat.reply("What is this light?", objects, { bearing: 0, elevation: 40 }), /cannot reliably match/);
  assert.match(chat.reply("What is this light?", [...objects, { ...objects[1], azimuth: 91, altitude: 40 }], { bearing: 90, elevation: 40 }), /ambiguous/);
  assert.equal(chat.target, null);
  chat.reply("What is this light?", objects, { bearing: 90, elevation: 40 });
  chat.reply("What is this new light?", [], null);
  assert.equal(chat.target.name, "Vega", "unsuccessful new identification preserves previous topic");
});

test("named object and sky calculations remain available; unknown details are honest", () => {
  const sky = skyObjects(52.37, 4.9, Date.UTC(2026, 9, 28, 20));
  assert.ok(sky.length > 30);
  assert.ok(sky.every(o => Number.isFinite(o.altitude) && o.azimuth >= 0 && o.azimuth < 360));
  const chat = new SkyConversation();
  assert.match(chat.reply("Where is the Moon?", sky, null), /Moon is (?:about|below)/);
  assert.match(chat.reply("Tell me more about it", sky, null), /Earth's natural satellite/);
  assert.match(chat.reply("How hot is it?", sky, null), /do not have a verified answer/);
});

function setup(t, { supported = true, closeMicrophone = true } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const recognitions = [], spoken = [], states = [], recovery = [], questions = [];
  class Recognition {
    constructor() { recognitions.push(this); }
    start() { this.onstart?.(); }
    abort() { this.aborted = true; if (closeMicrophone) this.onend?.(); }
    result(text) { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: text }], { isFinal: true })] }); }
  }
  const synthesis = {
    speak(utterance) { assert.ok(!voice.turn, "microphone must finish before speech"); spoken.push(utterance); },
    cancel() { spoken.at(-1)?.onend?.(); },
  };
  const voice = new VoiceConversation({
    Recognition: supported ? Recognition : null,
    synthesis, Utterance: class { constructor(text) { this.text = text; } },
    onQuestion: question => { questions.push(question); void voice.say(`Answer to ${question}`); },
    onState: state => states.push(state), onRecovery: message => recovery.push(message),
  });
  return { voice, recognitions, spoken, recovery, questions, states, endSpeech: async () => { spoken.at(-1).onend(); await flush(); } };
}

test("greeting, listen-answer-listen loop and delayed self-output suppression", async t => {
  const { voice, recognitions, spoken, questions, endSpeech } = setup(t);
  void voice.start("Welcome to DAAO"); await flush();
  assert.equal(spoken[0].text, "Welcome to DAAO");
  assert.equal(recognitions.length, 0);
  await endSpeech(); t.mock.timers.tick(650);
  assert.equal(recognitions.length, 1);
  const first = recognitions[0];
  first.result("What is this light?"); await flush();
  assert.equal(first.aborted, true);
  assert.equal(spoken.length, 2);
  first.result("Answer to What is this light?");
  assert.deepEqual(questions, ["What is this light?"]);
  t.mock.timers.tick(10000);
  assert.equal(recognitions.length, 1, "no listening during answer");
  await endSpeech(); t.mock.timers.tick(650);
  assert.equal(recognitions.length, 2);
  recognitions[1].result("Tell me more"); await flush();
  assert.deepEqual(questions, ["What is this light?", "Tell me more"]);
  voice.stop(); await flush();
  t.mock.timers.tick(10000);
  assert.equal(recognitions.length, 2, "stop prevents restart");
});

test("permission denial does not loop and can recover with an explicit tap", async t => {
  const { voice, recognitions, recovery } = setup(t);
  voice.resume(); recognitions[0].onerror({ error: "not-allowed" }); recognitions[0].onend();
  t.mock.timers.tick(10000);
  assert.equal(recognitions.length, 1);
  assert.match(recovery[0], /permission was declined/);
  voice.resume();
  assert.equal(recognitions.length, 2);
  voice.stop(); await flush();
});

test("unsupported recognition exposes manual recovery", async t => {
  const { voice, recovery } = setup(t, { supported: false });
  voice.resume();
  assert.match(recovery[0], /does not support voice/);
  voice.stop(); await flush();
});

test("speech waits for microphone closure and fails closed on missing end event", async t => {
  const { voice, recognitions, spoken, recovery } = setup(t, { closeMicrophone: false });
  voice.resume(); recognitions[0].result("Question"); await flush();
  assert.equal(spoken.length, 0);
  t.mock.timers.tick(2000); await flush();
  assert.equal(spoken.length, 0);
  assert.match(recovery[0], /microphone did not close/);
  voice.stop(); recognitions[0].onend(); await flush();
});

test("permission explanations queue behind a full answer without interruption", async t => {
  const { voice, spoken, recognitions, endSpeech } = setup(t);
  void voice.start("Full answer"); await flush();
  void voice.say("Location ready"); await flush();
  assert.equal(spoken.length, 1);
  await endSpeech();
  assert.equal(spoken[1].text, "Location ready");
  t.mock.timers.tick(1000);
  assert.equal(recognitions.length, 0);
  await endSpeech(); t.mock.timers.tick(650);
  assert.equal(recognitions.length, 1);
  voice.stop(); await flush();
});

test("background suspension does not restart the microphone", async t => {
  const { voice, recognitions } = setup(t);
  voice.resume(); voice.suspended = true; await voice.stopListening();
  t.mock.timers.tick(10000);
  assert.equal(recognitions.length, 1);
  voice.stop(); await flush();
});

test("zoom confirmation is scoped to the offered target and expires on other speech", () => {
  const applied = [];
  const zoom = new CameraZoomConversation({ hasCamera: () => true, applyScale: value => applied.push(value) });
  const target = { name: "Jupiter" };
  assert.match(zoom.reply("Yes", target), /no pending zoom offer/);
  assert.equal(zoom.scale, 1);
  assert.match(zoom.offer(target), /only digital magnification/);
  assert.equal(zoom.reply("Where is it?", target), null);
  assert.match(zoom.reply("yes", target), /no pending/);
  zoom.offer(target);
  assert.match(zoom.reply("no", target), /no zoom/);
  assert.equal(zoom.scale, 1);
  zoom.offer(target);
  assert.match(zoom.reply("yes please", target), /magnified 2 times digitally/);
  assert.deepEqual(target, { name: "Jupiter" });
  assert.deepEqual(applied, [2]);
  assert.match(zoom.reply("zoom in", target), /magnified 3 times/);
  assert.match(zoom.reply("zoom in", target), /magnification limit/);
  assert.match(zoom.reply("reset zoom", target), /normal view/);
  assert.equal(zoom.scale, 1);
  zoom.offer(target);
  assert.match(zoom.reply("yes", { name: "Vega" }), /no pending/);
  assert.equal(zoom.scale, 1);
});

test("zoom never substitutes imagery when a live camera is unavailable", () => {
  const zoom = new CameraZoomConversation({ hasCamera: () => false, applyScale: () => assert.fail("must not magnify") });
  assert.equal(zoom.offer({ name: "Jupiter" }), "");
  assert.match(zoom.reply("zoom in", { name: "Jupiter" }), /camera is not running/);
});

test("voice audition and answers use the same real, selected browser voice", () => {
  const basic = { name: "Microsoft David", lang: "en-US", voiceURI: "david", default: true };
  const google = { name: "Google UK English Female", lang: "en-GB", voiceURI: "google" };
  const natural = { name: "English Natural", lang: "en-US", voiceURI: "natural" };
  const voices = [basic, google, natural];
  assert.equal(chooseVoice(voices), natural);
  assert.equal(chooseVoice([basic, google]), google);
  assert.equal(chooseVoice(voices, "david"), basic, "explicit preference wins");
  const susan = { name: "Microsoft Susan - English (United Kingdom)", lang: "en-GB", voiceURI: "Microsoft Susan - English (United Kingdom)" };
  assert.equal(chooseVoice([basic, susan]), susan);
  assert.equal(chooseVoice([natural, susan]), susan, "keep the auditioned experimental candidate when present");
  assert.equal(chooseVoice([]), null);
  const sample = configureSpeech({}, google);
  const reply = configureSpeech({}, google);
  assert.deepEqual(sample, reply);
  assert.equal(reply.voice, google);
  assert.equal(reply.lang, "en-GB");
  assert.equal(reply.pitch, 1);
});

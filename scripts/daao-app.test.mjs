import assert from "node:assert/strict";
import { test } from "node:test";
import { skyObjects } from "../daao-sky.js";

const flush = async () => { for (let i = 0; i < 16; i += 1) await Promise.resolve(); };
let appId = 0;

// Boot the real app module, including its real SpeechRecognition -> ask ->
// camera/astronomy dispatch, with only browser hardware and DOM mocked.
async function appFixture(t, { cameraAvailable = true, nativeZoom = false, mobileView = true } = {}) {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval"] });
  class Element {
    constructor(value = "") {
      this.value = value; this.textContent = ""; this.children = []; this.style = {}; this.listeners = new Map();
      const classes = new Set();
      this.classList = { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) };
    }
    addEventListener(name, callback) { this.listeners.set(name, [...(this.listeners.get(name) || []), callback]); }
    async emit(name, event = {}) { for (const callback of this.listeners.get(name) || []) await callback(event); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this[name] = value; }
    get options() { return this.children; }
    focus() {}
    async play() {}
  }
  const elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  element("bearing-input").value = "180";
  element("elevation-input").value = "25";
  element("viewer").clientWidth = 390; element("viewer").clientHeight = 472;
  element("camera").videoWidth = 1080; element("camera").videoHeight = 1920;
  const document = Object.assign(new Element(), { getElementById: element, createElement: () => new Element(), querySelectorAll: () => [], body: new Element(), hidden: false });
  const tracks = [Object.assign(new Element(), { readyState: "live", stop() { this.readyState = "ended"; } })];
  if (nativeZoom) {
    tracks[0].getCapabilities = () => ({ zoom: { min: 1, max: 4 } });
    tracks[0].getSettings = () => ({ zoom: tracks[0].zoom ?? 1 });
    tracks[0].applyConstraints = async ({ advanced }) => { tracks[0].zoom = advanced[0].zoom; };
  }
  const stream = { getTracks: () => tracks, getVideoTracks: () => tracks };
  const captureRequests = [], spoken = [], recognitions = [];
  class Recognition {
    constructor() { recognitions.push(this); }
    start() { this.onstart?.(); }
    abort() { this.onend?.(); }
    result(transcript, confidence = 0.9, isFinal = true) {
      this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript, confidence }], { isFinal })] });
    }
  }
  const synthesis = {
    getVoices: () => [], addEventListener() {},
    speak: utterance => spoken.push(utterance), cancel: () => spoken.at(-1)?.onend?.(),
  };
  const window = Object.assign(new Element(), {
    SpeechRecognition: Recognition, speechSynthesis: synthesis,
    SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
    matchMedia: () => ({ matches: mobileView }), location: { search: "" }, setInterval,
    DeviceOrientationEvent: class {}, screen: { orientation: Object.assign(new Element(), { angle: 0 }) },
  });
  const navigator = { mediaDevices: { getUserMedia: async constraints => {
    captureRequests.push(constraints);
    if (!cameraAvailable) throw Object.assign(new Error("No camera"), { name: "NotFoundError" });
    return stream;
  } } };
  const globals = { window, document, navigator, localStorage: { getItem: () => null } };
  const descriptors = Object.fromEntries(Object.keys(globals).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  t.after(async () => {
    await window.emit("pagehide"); await flush();
    for (const key of Object.keys(globals)) {
      if (descriptors[key]) Object.defineProperty(globalThis, key, descriptors[key]);
      else delete globalThis[key];
    }
  });
  await import(`../daao-app.js?integration=${++appId}`);
  const finishAnswer = async () => { spoken.at(-1).onend(); await flush(); t.mock.timers.tick(650); await flush(); };
  const speak = async (question, confidence = 0.9) => { recognitions.at(-1).result(question, confidence); await flush(); };
  const start = async () => { await element("camera-button").emit("click"); await flush(); await finishAnswer(); };
  const manualLocation = async () => { element("latitude").value = "52.37"; element("longitude").value = "4.90"; await element("set-location").emit("click"); };
  return { element, window, spoken, recognitions, captureRequests, tracks, start, finishAnswer, speak, manualLocation };
}

test("reported voice zoom request reaches live camera after failed identification with no location, motion or target", async t => {
  const app = await appFixture(t);
  await app.start();
  await app.speak("What is this light?");
  assert.match(app.element("answer").textContent, /need your location/);
  await app.finishAnswer();
  await app.speak("Can you please zoom in on this light?");
  assert.equal(app.element("camera").style.transform, "scale(2)");
  assert.match(app.spoken.at(-1).text, /zoomed 2 times/);
  assert.doesNotMatch(app.spoken.at(-1).text, /need your location|identify it/);
  assert.equal(app.element("topic").textContent, "Point, ask, then keep talking.");
  await app.finishAnswer();
  await app.speak("Could you please zoom out of that light?");
  assert.equal(app.element("camera").style.transform, "scale(1)");
  await app.finishAnswer();
  await app.speak("zoom in on that");
  assert.equal(app.element("camera").style.transform, "scale(2)");
  await app.finishAnswer();
  await app.speak("please zoom in");
  assert.equal(app.element("camera").style.transform, "scale(3)");
  await app.finishAnswer();
  await app.speak("Can you reset the camera zoom for me please?");
  assert.equal(app.element("camera").style.transform, "scale(1)");
  assert.equal(app.captureRequests.length, 1);
  assert.equal(app.captureRequests[0].audio, false, "no unrelated filtered microphone stream is opened");
});

test("cloud names stay hidden until a successful explicit request and do not reset the topic", async t => {
  const app = await appFixture(t);
  await app.manualLocation();
  await app.start();
  await app.speak("Tell me about Jupiter");
  assert.match(app.element("topic").textContent, /Conversation: Jupiter/);
  await app.finishAnswer();
  await app.speak("Which stars would be behind these clouds?");
  assert.match(app.element("answer").textContent, /reliable compass direction/);
  assert.equal(app.element("sky-overlay").children.length, 0);
  await app.finishAnswer();
  const target = skyObjects(52.37, 4.9).find(object => object.altitude > 15 && object.altitude < 75 && object.kind !== "sun");
  app.element("bearing-input").value = String(target.azimuth);
  app.element("elevation-input").value = String(target.altitude);
  await app.element("bearing-input").emit("input");
  assert.equal(app.element("sky-overlay").children.length, 0, "moving the camera alone must not reveal names");
  await app.speak("Which stars and planets are in this direction behind the clouds?");
  assert.match(app.element("answer").textContent, /sky map predicts/);
  assert.ok(app.element("answer").textContent.includes(target.name));
  assert.match(app.element("answer").textContent, /not visual detections/);
  assert.ok(app.element("sky-overlay").children.some(label => label.children[0].textContent === target.name));
  assert.match(app.element("topic").textContent, /Conversation: Jupiter/);
  await app.finishAnswer();
  await app.speak("Can you zoom in on that?");
  assert.equal(app.element("camera").style.transform, "scale(2)");
  assert.match(app.element("topic").textContent, /Conversation: Jupiter/);
  await app.finishAnswer();
  await app.speak("Tell me more about it", 0); // Confidence zero is unknown on some browsers, not silence.
  assert.match(app.element("answer").textContent, /still talking about Jupiter/);
});

test("mobile camera opens clear, a named question shows one label, and zoom controls work", async t => {
  const app = await appFixture(t);
  await app.manualLocation();
  await app.start();
  assert.equal(app.element("sky-overlay").children.length, 0);
  assert.equal(app.element("prediction-note").hidden, true);
  assert.equal(app.element("zoom-controls").hidden, false);
  const target = skyObjects(52.37, 4.9).find(object => object.altitude > 15 && object.altitude < 75 && object.kind === "star");
  app.element("bearing-input").value = String(target.azimuth);
  app.element("elevation-input").value = String(target.altitude);
  await app.element("bearing-input").emit("input");
  assert.equal(app.element("sky-overlay").children.length, 0);
  await app.speak(`Where is ${target.name}?`);
  assert.deepEqual(app.element("sky-overlay").children.map(label => label.children[0].textContent), [target.name]);
  await app.element("zoom-in").emit("click");
  assert.equal(app.element("camera").style.transform, "scale(2)");
  assert.equal(app.element("zoom-value").textContent, "2×");
  await app.element("zoom-out").emit("click");
  assert.equal(app.element("camera").style.transform, "scale(1)");
  await app.element("camera-button").emit("click");
  assert.equal(app.element("sky-overlay").children.length, 0);
  assert.equal(app.element("zoom-controls").hidden, true);
});

test("mobile zoom uses the camera track when the browser supports it", async t => {
  const app = await appFixture(t, { nativeZoom: true });
  await app.start();
  await app.element("zoom-in").emit("click");
  await flush();
  assert.equal(app.tracks[0].zoom, 2);
  assert.equal(app.element("camera").style.transform, "scale(1)");
  assert.equal(app.element("zoom-value").textContent, "2×");
});

test("desktop keeps its existing automatic sky labels and hides phone zoom controls", async t => {
  const app = await appFixture(t, { mobileView: false });
  await app.manualLocation();
  await app.start();
  const target = skyObjects(52.37, 4.9).find(object => object.altitude > 15 && object.altitude < 75 && object.kind === "star");
  app.element("bearing-input").value = String(target.azimuth);
  app.element("elevation-input").value = String(target.altitude);
  await app.element("bearing-input").emit("input");
  assert.ok(app.element("sky-overlay").children.length > 0);
  assert.equal(app.element("zoom-controls").hidden, true);
});

test("actual speech path ignores interim, low-confidence, noise and unrelated traffic results but accepts quiet questions", async t => {
  const app = await appFixture(t);
  await app.start();
  const originalAnswer = app.element("answer").textContent;
  const originalSpeechCount = app.spoken.length;
  app.recognitions.at(-1).result("please zoom in", 0.9, false);
  await flush();
  for (const [text, confidence] of [["Can you please zoom in on this light?", 0.12], ["[traffic]", 0.9], ["Turn left at the next street", 0.9]]) {
    await app.speak(text, confidence);
    app.recognitions.at(-1).onend(); t.mock.timers.tick(500); await flush();
  }
  app.recognitions.at(-1).onnomatch();
  app.recognitions.at(-1).onerror({ error: "no-speech" });
  assert.equal(app.element("answer").textContent, originalAnswer);
  assert.equal(app.spoken.length, originalSpeechCount);
  assert.notEqual(app.element("camera").style.transform, "scale(2)");
  await app.speak("please zoom in", 0.75);
  assert.equal(app.element("camera").style.transform, "scale(2)");
  assert.equal(app.captureRequests.length, 1);
});

test("actual voice dispatch reports no camera truthfully instead of requesting identification", async t => {
  const app = await appFixture(t, { cameraAvailable: false });
  await app.start();
  await app.speak("Can you please zoom in on this light?");
  assert.match(app.element("answer").textContent, /camera is not running/);
  assert.notEqual(app.element("camera").style.transform, "scale(2)");
  await app.finishAnswer();
  await app.speak("Which planets would be behind clouds?");
  assert.match(app.element("answer").textContent, /Start the camera/);
  assert.equal(app.element("sky-overlay").children.length, 0);
});

test("live sensor-driven label movement and lowering the phone do not interrupt the spoken answer", async t => {
  const app = await appFixture(t);
  await app.manualLocation(); await app.start();
  await app.speak("Tell me about Jupiter");
  const answer = app.spoken.at(-1);
  const count = app.spoken.length;
  await app.element("motion-button").emit("click");
  await app.window.emit("deviceorientationabsolute", { absolute: true, alpha: 0, beta: 120, gamma: 0 });
  await app.window.emit("deviceorientationabsolute", { absolute: true, alpha: 50, beta: 30, gamma: 10 });
  assert.equal(app.spoken.length, count);
  assert.equal(app.spoken.at(-1), answer);
  assert.equal(app.element("voice-state").textContent, "DAAO is speaking…");
  assert.equal(app.element("sky-overlay").children.length, 0, "phone now points below the horizon");
  assert.match(app.element("topic").textContent, /Conversation: Jupiter/);
  await app.finishAnswer();
  assert.match(app.element("voice-state").textContent, /Listening/);
});

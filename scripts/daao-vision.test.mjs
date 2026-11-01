import assert from "node:assert/strict";
import { test } from "node:test";
import { asksForCameraImage, captureCameraFrame, frameVisibility, LocalCameraVision } from "../daao-vision.js";
import { installDownloadOnlyNetwork } from "../daao-vision-network.js";

test("image downloads are allowed only before inference and uploads are always rejected", async () => {
  const requests = [];
  const scope = { fetch: async (...args) => requests.push(args), WebSocket: class {}, XMLHttpRequest: class {} };
  const lock = installDownloadOnlyNetwork(scope);
  await scope.fetch("model.onnx");
  await assert.rejects(scope.fetch("image", { method: "POST", body: "pixels" }), /uploads-disabled/);
  await assert.rejects(scope.fetch("image", { body: "pixels" }), /uploads-disabled/);
  lock();
  await assert.rejects(scope.fetch("anything"), /network-disabled/);
  assert.equal(requests.length, 1);
  assert.equal(scope.WebSocket, undefined);
  assert.equal(scope.XMLHttpRequest, undefined);
});

test("capture follows the actual phone crop and digital zoom without encoding or saving a photo", () => {
  const calls = [];
  const canvas = { getContext: () => ({ drawImage: (...args) => calls.push(args), getImageData: () => ({ data: new Uint8ClampedArray(4), width: 300, height: 500 }) }) };
  const video = { videoWidth: 1000, videoHeight: 1000, style: { transform: "scale(2)" } };
  const frame = captureCameraFrame(video, { clientWidth: 300, clientHeight: 500 }, () => canvas);
  assert.deepEqual(calls[0].slice(1, 5), [350, 250, 300, 500]);
  assert.equal(frame.width, 300);
  assert.equal(canvas.width, 0);
});

test("empty dark and washed-out images cannot become visual identifications", () => {
  assert.equal(frameVisibility({ data: new Uint8ClampedArray(400) }), "dark");
  assert.equal(frameVisibility({ data: new Uint8ClampedArray(400).fill(255) }), "overexposed");
  assert.equal(asksForCameraImage("Please describe what you see now"), true);
  assert.equal(asksForCameraImage("Is that the Moon?"), true);
  assert.equal(asksForCameraImage("Where can I find Mars?"), false);
});

test("local worker receives transferable pixels, reuses its model, and cancels on camera stop", async () => {
  const workers = [];
  class Worker {
    constructor(url, options) { this.url = url; this.options = options; workers.push(this); }
    postMessage(message, transfer) { this.message = message; this.transfer = transfer; }
    terminate() { this.terminated = true; }
  }
  const vision = new LocalCameraVision({ Worker });
  const frame = { data: new Uint8ClampedArray(4), width: 1, height: 1 };
  const first = vision.analyze(frame);
  assert.equal(workers[0].message.frame, frame);
  assert.equal(workers[0].transfer[0], frame.data.buffer);
  workers[0].onmessage({ data: { type: "result", text: "A cloudy sky." } });
  assert.equal(await first, "A cloudy sky.");
  const pending = vision.analyze(frame);
  assert.equal(workers.length, 1);
  vision.cancel();
  await assert.rejects(pending, /vision-cancelled/);
  assert.equal(workers[0].terminated, true);
});

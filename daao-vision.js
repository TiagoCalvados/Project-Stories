// Frames stay in memory and are transferred only to our local Web Worker.
export function asksForCameraImage(question) {
  return /\b(?:describe|check|analy[sz]e)\b.*\b(?:see|image|camera|view|scene|horizon|clouds?)\b|\bwhat (?:can |do )?you see\b|\bwhat(?: is|'s) (?:this|that)(?:[?.!]*$| (?:in|up|over|out)\b)|\b(?:identify|recognize) (?:this|that|it)\b|\b(?:is|could|can) (?:this|that|it)\b/i.test(question);
}

export function captureCameraFrame(video, viewer, createCanvas = () => document.createElement("canvas")) {
  if (!video.videoWidth || !video.videoHeight || !viewer.clientWidth || !viewer.clientHeight) throw new Error("camera-not-ready");
  const digitalZoom = Number(/scale\(([^)]+)\)/.exec(video.style.transform || "")?.[1]) || 1;
  const fit = Math.max(viewer.clientWidth / video.videoWidth, viewer.clientHeight / video.videoHeight) * digitalZoom;
  const sw = viewer.clientWidth / fit, sh = viewer.clientHeight / fit;
  const ratio = Math.min(1, 512 / Math.max(viewer.clientWidth, viewer.clientHeight));
  const canvas = createCanvas();
  canvas.width = Math.round(viewer.clientWidth * ratio);
  canvas.height = Math.round(viewer.clientHeight * ratio);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("canvas-unavailable");
  context.drawImage(video, (video.videoWidth - sw) / 2, (video.videoHeight - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  canvas.width = canvas.height = 0;
  return { data: frame.data, width: frame.width, height: frame.height };
}

export function frameVisibility({ data }) {
  let sum = 0, squares = 0, count = data.length / 4;
  for (let i = 0; i < data.length; i += 4) {
    const value = (data[i] + data[i + 1] + data[i + 2]) / 3;
    sum += value; squares += value * value;
  }
  const mean = sum / count, deviation = Math.sqrt(Math.max(0, squares / count - mean * mean));
  if (!count || (mean < 5 && deviation < 10)) return "dark";
  if (mean > 248 && deviation < 10) return "overexposed";
  return "usable";
}

export class LocalCameraVision {
  constructor({ Worker, onStatus = () => {}, timeout = 240000 }) {
    Object.assign(this, { Worker, onStatus, timeout });
    this.sequence = 0;
  }
  get available() { return Boolean(this.Worker); }
  analyze(frame) {
    if (this.reject) this.cancel();
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      this.reject = reject;
      const worker = this.worker ||= new this.Worker(new URL("./daao-vision-worker.js", import.meta.url), { type: "module" });
      const finish = (error, result) => {
        if (id !== this.sequence) return;
        clearTimeout(this.timer);
        // Keep the loaded model for another question; do not retain frames.
        this.reject = null;
        if (error) { this.cancel(); reject(error); } else resolve(result);
      };
      worker.onmessage = ({ data }) => {
        if (id !== this.sequence) return;
        if (data.type === "status") this.onStatus(data.message);
        else if (data.type === "result") finish(null, data.text);
        else if (data.type === "error") finish(new Error(data.code));
      };
      worker.onerror = () => finish(new Error("vision-unavailable"));
      this.timer = setTimeout(() => finish(new Error("vision-timeout")), this.timeout);
      worker.postMessage({ type: "analyze", frame }, [frame.data.buffer]);
    });
  }
  cancel() {
    ++this.sequence;
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    const reject = this.reject;
    this.reject = null;
    reject?.(new Error("vision-cancelled"));
  }
}

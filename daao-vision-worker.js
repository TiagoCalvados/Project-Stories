// Download code/weights only. No frame, question, or inference result is sent
// through a network API. Network access is disabled before reading the pixels.
import { installDownloadOnlyNetwork } from "./daao-vision-network.js";
const disableNetwork = installDownloadOnlyNetwork(globalThis);

const status = message => postMessage({ type: "status", message });
const modelId = "HuggingFaceTB/SmolVLM-256M-Instruct";
const revision = "7e3e67edbbed1bf9888184d9df282b700a323964";
let runtime;
async function load() {
  const adapter = await navigator.gpu?.requestAdapter();
  if (!adapter) throw new Error("webgpu-unavailable");
  status("Preparing on-phone vision. First use downloads about 210 MB plus the runtime; images stay on this phone.");
  const { AutoProcessor, AutoModelForVision2Seq, RawImage, env } = await import("https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js");
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm.proxy = false;
  let lastProgress = 0;
  const progress_callback = event => {
    if (event.status !== "progress" || Date.now() - lastProgress < 1200) return;
    lastProgress = Date.now();
    status(`Downloading on-phone vision: ${Math.round(event.progress || 0)}% of ${event.file?.split("/").at(-1) || "model file"}. Images stay here.`);
  };
  const processor = await AutoProcessor.from_pretrained(modelId, { revision });
  const model = await AutoModelForVision2Seq.from_pretrained(modelId, {
    revision, device: "webgpu", dtype: { embed_tokens: adapter.features.has("shader-f16") ? "fp16" : "q8", vision_encoder: "q4", decoder_model_merged: "q4" }, progress_callback,
  });
  runtime = { processor, model, RawImage };
  // All required runtime and model files have loaded. Pixel processing is offline.
  disableNetwork();
}

onmessage = async ({ data }) => {
  if (data.type !== "analyze") return;
  const frame = data.frame;
  try {
    if (!runtime) await load();
    status("Examining the camera image on this phone…");
    const { processor, model, RawImage } = runtime;
    const image = new RawImage(frame.data, frame.width, frame.height, 4);
    const text = processor.apply_chat_template([{ role: "user", content: [
      { type: "image" },
      { type: "text", text: "Describe only what is visibly present in this image in two short sentences. If unclear, say so. Do not guess names of stars or planets, locations, or invisible objects." },
    ] }], { add_generation_prompt: true });
    const inputs = await processor(text, [image], { do_image_splitting: false });
    const tokens = await model.generate({ ...inputs, max_new_tokens: 64, do_sample: false, repetition_penalty: 1.15 });
    const generated = tokens.slice(null, [inputs.input_ids.dims.at(-1), null]);
    const description = processor.batch_decode(generated, { skip_special_tokens: true })[0].trim();
    postMessage({ type: "result", text: description });
  } catch (error) {
    postMessage({ type: "error", code: error.message === "webgpu-unavailable" ? error.message : "vision-unavailable" });
  } finally {
    frame.data.fill(0);
  }
};

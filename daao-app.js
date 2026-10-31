import { compassPoint, separation, skyObjects } from "./daao-sky.js";
import { SkyConversation } from "./daao-conversation.js";
import { VoiceConversation } from "./daao-voice.js";
import { CameraZoomConversation } from "./daao-zoom.js";
import { chooseVoice, configureSpeech, experimentVoiceURI, voiceSample } from "./daao-speech.js";
import { isPredictedSkyQuestion, predictedSkyAnswer, projectSkyObjects, recentDirection, requestedLabelMode, sensorCameraPose } from "./daao-projection.js";
import { isSkyVoiceRequest } from "./daao-listening.js";

const byId = (id) => document.getElementById(id);
const viewer = byId("viewer");
const camera = byId("camera");
const cameraButton = byId("camera-button");
const motionButton = byId("motion-button");
const locationButton = byId("location-button");
const latitudeInput = byId("latitude");
const longitudeInput = byId("longitude");
const bearingInput = byId("bearing-input");
const elevationInput = byId("elevation-input");
const status = byId("status");
const questionInput = byId("question");
const answer = byId("answer");

let cameraStream = null;
let cameraZoomBase = 1;
let cameraZoomRequest = 0;
let location = null;
let sensorPose = null;
let manualDirection = true;
let motionListenerAdded = false;
let motionEnabled = false;
let sky = [];
let labelMode = "none";
let labeledTarget = null;
let manualPoseConfirmed = false;
let cameraStarting = false;
let cameraGeneration = 0;
let cameraTimer;
let locationPending = false;
let motionTimer;
let selectedVoice = null;
let preferredVoiceURI;
let sampleUtterance = null;
let orientationSample = null;
try { preferredVoiceURI = localStorage.getItem("daao-voice-uri"); } catch { /* Storage may be unavailable. */ }
const conversation = new SkyConversation();
const zoom = new CameraZoomConversation({
  hasCamera: () => Boolean(cameraStream?.getVideoTracks().some((track) => track.readyState === "live")),
  applyScale: (scale) => {
    void applyCameraScale(scale);
    updateZoomControls();
  },
});

async function applyCameraScale(scale) {
  const request = ++cameraZoomRequest;
  const track = cameraStream?.getVideoTracks()[0];
  camera.style.transform = `scale(${scale})`;
  if (track) byId("view-label").textContent = `Live camera · ${scale}× digital · no image analysis`;
  refreshPredictions();
  if (!isMobileView()) return;
  if (!track?.getCapabilities || !track.applyConstraints) return;
  let capability;
  try { capability = track.getCapabilities().zoom; } catch { return; }
  if (!Number.isFinite(capability?.min) || !Number.isFinite(capability?.max) || capability.max <= capability.min) return;
  const target = Math.min(capability.max, Math.max(capability.min, cameraZoomBase * scale));
  try {
    await track.applyConstraints({ advanced: [{ zoom: target }] });
    if (request !== cameraZoomRequest || cameraStream?.getVideoTracks()[0] !== track) return;
    const applied = Number(track.getSettings?.().zoom) || target;
    const cameraFactor = applied / cameraZoomBase;
    const digitalFactor = scale / cameraFactor;
    camera.style.transform = `scale(${digitalFactor})`;
    byId("view-label").textContent = `Live camera · ${scale}× ${digitalFactor > 1.01 ? "camera + digital" : "camera"} zoom · no image analysis`;
    refreshPredictions();
  } catch {
    // The visual crop above remains available if camera zoom is unsupported or denied.
  }
}

function isMobileView() { return window.matchMedia("(max-width: 820px)").matches; }

function updateZoomControls() {
  byId("zoom-controls").hidden = !isMobileView() || !hasLiveCamera();
  byId("zoom-value").textContent = `${zoom.scale}×`;
  byId("zoom-out").disabled = zoom.scale <= 1;
  byId("zoom-in").disabled = zoom.scale >= 3;
}

byId("zoom-in").addEventListener("click", () => { if (hasLiveCamera()) zoom.setScale(zoom.scale + 1); });
byId("zoom-out").addEventListener("click", () => { if (hasLiveCamera()) zoom.setScale(zoom.scale - 1); });
const voice = new VoiceConversation({
  Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
  synthesis: window.speechSynthesis,
  Utterance: window.SpeechSynthesisUtterance,
  onQuestion: ask,
  onState: (message) => { byId("voice-state").textContent = message; },
  onRecovery: showRecovery,
  configureUtterance: utterance => configureSpeech(utterance, selectedVoice),
  acceptsQuestion: isSkyVoiceRequest,
});

function loadVoices() {
  const voices = window.speechSynthesis?.getVoices() || [];
  selectedVoice = chooseVoice(voices, preferredVoiceURI);
  const choices = byId("voice-choice");
  choices.replaceChildren();
  for (const available of voices.filter(item => /^en(?:-|_)/i.test(item.lang))) {
    const option = document.createElement("option");
    option.value = available.voiceURI;
    option.textContent = `${available.name} (${available.lang})`;
    choices.append(option);
  }
  if (selectedVoice && ![...choices.options].some(option => option.value === selectedVoice.voiceURI)) {
    const option = document.createElement("option");
    option.value = selectedVoice.voiceURI;
    option.textContent = `${selectedVoice.name} (${selectedVoice.lang})`;
    choices.append(option);
  }
  choices.disabled = !voices.length;
  if (selectedVoice) choices.value = selectedVoice.voiceURI;
  const availableCandidate = voices.some(item => item.voiceURI === experimentVoiceURI || item.name === experimentVoiceURI);
  const candidateNote = !availableCandidate && !preferredVoiceURI ? " Microsoft Susan, the experimental voice, is unavailable here; please audition this device's alternative before using it." : "";
  byId("voice-name").textContent = selectedVoice ? `Voice: ${selectedVoice.name}. This same voice will speak all replies on this device.${candidateNote}` : "No named voices are exposed yet. Playback will use this browser's default voice. Try your regular phone browser for its available voices.";
}

byId("voice-choice").addEventListener("change", () => {
  preferredVoiceURI = byId("voice-choice").value;
  try { localStorage.setItem("daao-voice-uri", preferredVoiceURI); } catch { /* The choice still works this session. */ }
  loadVoices();
});

function stopSample() {
  if (!sampleUtterance) return;
  sampleUtterance = null;
  window.speechSynthesis?.cancel();
  byId("voice-sample").textContent = "Play voice sample";
}

byId("voice-sample").addEventListener("click", () => {
  if (sampleUtterance) { stopSample(); return; }
  if (voice.active) { byId("sample-state").textContent = "Stop the camera or voice session before playing a sample."; return; }
  if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    byId("sample-state").textContent = "This browser cannot play speech. Open the local preview in your regular browser to hear its available voices.";
    return;
  }
  loadVoices();
  const sample = configureSpeech(new SpeechSynthesisUtterance(voiceSample), selectedVoice);
  sampleUtterance = sample;
  byId("voice-sample").textContent = "Stop sample";
  byId("sample-state").textContent = "Playing a sample with the app's actual speech voice. Camera and microphone stay off.";
  const finish = () => {
    if (sampleUtterance !== sample) return;
    sampleUtterance = null;
    byId("voice-sample").textContent = "Play voice sample";
    byId("sample-state").textContent = "Sample finished. You can choose another voice and listen again.";
  };
  sample.onend = finish;
  sample.onerror = () => {
    finish();
    byId("sample-state").textContent = "Speech playback failed. Check your browser's audio settings or try your regular browser.";
  };
  // Play directly from the click: no camera, microphone or recognition session.
  try { window.speechSynthesis.speak(sample); } catch { sample.onerror(); }
});
window.speechSynthesis?.addEventListener("voiceschanged", loadVoices);
loadVoices();
if (new URLSearchParams(window.location.search).has("voice-preview")) byId("voice-preview").open = true;

function showRecovery(message) {
  zoom.clearOffer();
  byId("recovery").hidden = false;
  byId("recovery-message").textContent = message;
}

function explain(message) {
  zoom.clearOffer();
  notice(message);
  if (voice.active) void voice.say(message);
}

function trustedPose() {
  if (manualDirection) return manualPoseConfirmed ? pose() : null;
  return recentDirection(sensorPose);
}

function hasLiveCamera() {
  return Boolean(cameraStream?.getVideoTracks().some(track => track.readyState === "live"));
}

function cameraGeometry() {
  return { width: viewer.clientWidth, height: viewer.clientHeight, videoWidth: camera.videoWidth, videoHeight: camera.videoHeight, zoom: zoom.scale };
}

function refreshPredictions() {
  const overlay = byId("sky-overlay");
  const note = byId("prediction-note");
  overlay.replaceChildren();
  const mobile = isMobileView();
  note.hidden = mobile && labelMode === "none";
  if (note.hidden) return;
  const direction = trustedPose();
  let message;
  if (!hasLiveCamera()) message = "Start camera for predicted sky labels";
  else if (!location) message = "Predicted labels need your location";
  else if (!direction) message = "Predicted labels need reliable motion / compass";
  else if (!camera.videoWidth || !camera.videoHeight) message = "Preparing the camera field…";
  else {
    message = `Predicted · approximate${manualDirection ? " · hold phone upright" : ""}`;
    const geometry = cameraGeometry();
    const placed = [];
    for (const object of projectSkyObjects(sky, direction, geometry)) {
      if (mobile && labelMode === "single" && object.name !== labeledTarget) continue;
      if (mobile && labelMode === "stars" && object.kind !== "star") continue;
      if (placed.length >= (mobile ? (labelMode === "single" ? 1 : 12) : 8)) break;
      if (placed.some(other => Math.abs(other.x - object.x) < 100 && Math.abs(other.y - object.y) < 25)) continue;
      const target = document.createElement("span");
      target.className = `sky-target ${object.kind}${object.x > geometry.width - 110 ? " align-left" : ""}${object.y < 20 ? " label-below" : ""}`;
      target.style.left = `${object.x}px`;
      target.style.top = `${object.y}px`;
      const label = document.createElement("span");
      label.className = "sky-tag";
      label.textContent = object.name;
      target.setAttribute("aria-label", `${object.name}, predicted position`);
      target.append(label);
      overlay.append(target);
      placed.push(object);
    }
    if (mobile && labelMode === "single" && !placed.length) message = `${labeledTarget} is outside this camera view`;
  }
  if (note.textContent !== message) note.textContent = message;
}

function notice(message) { status.textContent = message; }

function pose() {
  return manualDirection || !sensorPose
    ? { bearing: Number(bearingInput.value), elevation: Number(elevationInput.value) }
    : sensorPose;
}

function refreshSky() {
  sky = location ? skyObjects(location.latitude, location.longitude) : [];
  const direction = pose();
  const trusted = trustedPose();
  byId("bearing").textContent = trusted ? `${Math.round(direction.bearing)}°` : "—";
  byId("compass-point").textContent = trusted ? compassPoint(direction.bearing) : "DIRECTION";
  byId("elevation").textContent = trusted ? `${Math.round(direction.elevation)}° elevation · ${manualDirection ? "manual" : "phone motion"}` : "Use motion for direction";
  byId("bearing-output").textContent = `${bearingInput.value}°`;
  byId("elevation-output").textContent = `${elevationInput.value}°`;
  refreshPredictions();

  const list = byId("sky-list");
  list.replaceChildren();
  if (isMobileView() && labelMode !== "stars" && labelMode !== "all") {
    const item = document.createElement("li");
    item.textContent = "Ask to show the names in this camera view.";
    list.append(item);
    return;
  }
  if (!location) {
    const item = document.createElement("li");
    item.textContent = "Waiting for location";
    list.append(item);
    return;
  }
  const visible = (isMobileView()
    ? projectSkyObjects(sky, trustedPose(), cameraGeometry()).filter(object => labelMode === "all" || object.kind === "star")
    : sky.filter((object) => object.altitude >= 0 && object.kind !== "sun"))
    .sort((left, right) => separation(direction.elevation, direction.bearing, left.altitude, left.azimuth) - separation(direction.elevation, direction.bearing, right.altitude, right.azimuth))
    .slice(0, isMobileView() ? 12 : 5);
  if (!visible.length) {
    const item = document.createElement("li");
    item.textContent = "No bright catalog objects above the horizon right now.";
    list.append(item);
  }
  for (const object of visible) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    const position = document.createElement("span");
    name.textContent = object.name;
    position.textContent = `${compassPoint(object.azimuth)} · ${Math.round(object.altitude)}° up`;
    item.append(name, position);
    list.append(item);
  }
}

function setLocation(latitude, longitude, source) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
    notice("Enter a latitude from −90 to 90 and a longitude from −180 to 180.");
    return;
  }
  location = { latitude, longitude };
  latitudeInput.value = latitude.toFixed(5);
  longitudeInput.value = longitude.toFixed(5);
  byId("location-summary").textContent = `${latitude.toFixed(3)}°, ${longitude.toFixed(3)}° · ${source}`;
  explain("Location ready. Point at a light and ask what it is. If motion is not enabled, tap Use motion so I can calculate your direction.");
  refreshSky();
}

function stopCamera() {
  cameraGeneration += 1;
  cameraStarting = false;
  clearTimeout(cameraTimer);
  cameraButton.disabled = false;
  voice.stop();
  labelMode = "none";
  labeledTarget = null;
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  cameraZoomRequest += 1;
  cameraZoomBase = 1;
  zoom.reset();
  camera.srcObject = null;
  camera.hidden = true;
  viewer.classList.remove("has-camera");
  cameraButton.textContent = "Start camera";
  byId("view-label").textContent = "Sky preview";
  updateZoomControls();
  refreshPredictions();
  refreshSky();
}

cameraButton.addEventListener("click", async () => {
  if (cameraStream || cameraStarting || voice.active) {
    stopCamera();
    notice("Camera and voice stopped. Your conversation topic is saved.");
    return;
  }
  byId("recovery").hidden = true;
  labelMode = "none";
  labeledTarget = null;
  refreshPredictions();
  stopSample();
  const greeting = "Welcome to DAAO. What would you like to know about the sky? Allow microphone access to talk. To identify a light, first tap Use my location and Use motion. Point, ask, then lower your phone if you like. Our conversation will stay on the same object.";
  answer.textContent = greeting;
  void voice.start(greeting);
  cameraButton.textContent = "Stop voice";
  if (!navigator.mediaDevices?.getUserMedia) {
    showRecovery("This browser cannot access a camera here. Open this page over HTTPS in your phone browser, or use manual controls. Voice can still work if supported.");
    return;
  }
  cameraStarting = true;
  cameraButton.textContent = "Cancel camera";
  const generation = ++cameraGeneration;
  cameraTimer = setTimeout(() => {
    if (cameraStarting && generation === cameraGeneration) showRecovery("Camera permission is still pending. Respond to your browser's camera prompt, or tap Cancel camera to stop this session. You can also use manual controls.");
  }, 15000);
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
    if (generation !== cameraGeneration) { stream.getTracks().forEach((track) => track.stop()); return; }
    cameraStream = stream;
    cameraZoomBase = Number(stream.getVideoTracks()[0]?.getSettings?.().zoom) || 1;
    camera.srcObject = cameraStream;
    camera.hidden = false;
    await camera.play();
    viewer.classList.add("has-camera");
    cameraButton.textContent = "Stop camera";
    byId("view-label").textContent = "Live camera · no image analysis";
    updateZoomControls();
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (cameraStream === stream) {
        stopCamera();
        showRecovery("Camera access ended. Tap Start camera to reconnect; your conversation topic is saved.");
      }
    });
    notice("Camera ready. Location and compass direction are needed to identify a light. Camera images are not analyzed.");
    refreshPredictions();
  } catch (error) {
    if (generation !== cameraGeneration) return;
    cameraStream?.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    camera.hidden = true;
    viewer.classList.remove("has-camera");
    cameraButton.textContent = "Stop voice";
    showRecovery(error?.name === "NotAllowedError" ? "Camera access was declined. Allow camera access in browser settings, then tap Stop voice and Start camera to retry. Voice and the sky map can still work." : "Camera unavailable. Close other camera apps, then tap Stop voice and Start camera to retry, or use voice and the sky map.");
  } finally {
    if (generation === cameraGeneration) {
      clearTimeout(cameraTimer);
      cameraStarting = false;
    }
  }
});

locationButton.addEventListener("click", () => {
  if (locationPending) return;
  if (!navigator.geolocation) {
    showRecovery("Location is unavailable here. Open this page in your phone browser with location access, or use manual controls to enter coordinates.");
    return;
  }
  locationPending = true;
  notice("Requesting your location…");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => { locationPending = false; setLocation(coords.latitude, coords.longitude, `device location${Number.isFinite(coords.accuracy) ? `, ±${Math.round(coords.accuracy)} m` : ""}`); },
    () => {
      locationPending = false;
      const message = "Location access was declined or unavailable. Allow location in browser settings and tap Use my location again, or enter coordinates in manual controls. I cannot identify a direction without a location.";
      showRecovery(message); explain(message);
    },
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
  );
});

byId("set-location").addEventListener("click", () => {
  if (latitudeInput.value.trim() === "" || longitudeInput.value.trim() === "") {
    notice("Enter both latitude and longitude.");
    return;
  }
  setLocation(Number(latitudeInput.value), Number(longitudeInput.value), "manual coordinates");
});

function screenAngle() { return window.screen?.orientation?.angle ?? (Number.isFinite(window.orientation) ? window.orientation : 0); }

function onOrientation(event) {
  if (!motionEnabled) return;
  const reading = sensorCameraPose(event, screenAngle());
  if (!reading) {
    if (event.absolute || Number.isFinite(event.webkitCompassHeading)) {
      sensorPose = null;
      orientationSample = null;
      refreshPredictions();
    }
    return;
  }
  orientationSample = { alpha: event.alpha, beta: event.beta, gamma: event.gamma, absolute: event.absolute, webkitCompassHeading: event.webkitCompassHeading, webkitCompassAccuracy: event.webkitCompassAccuracy, timestamp: reading.timestamp };
  sensorPose = reading;
  clearTimeout(motionTimer);
  if (manualDirection) {
    manualDirection = false;
    motionButton.textContent = "Phone motion on";
    notice("Phone motion active. Movement changes the view, while your conversation topic stays saved.");
  }
  refreshSky();
}

motionButton.addEventListener("click", async () => {
  motionEnabled = true;
  if (sensorPose && Date.now() - sensorPose.timestamp < 15000) {
    manualDirection = false;
    motionButton.textContent = "Phone motion on";
    notice("Phone motion active.");
    refreshSky();
    return;
  }
  if (!window.DeviceOrientationEvent) {
    const message = "Motion sensors are unavailable in this browser. Use manual controls to set a known bearing and elevation, or ask about a named object. I cannot identify what you are pointing at yet.";
    showRecovery(message); explain(message);
    return;
  }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission(true);
      if (permission !== "granted") {
        const message = "Motion access was declined. Allow motion and orientation in browser settings, then tap Use motion again, or use manual controls.";
        showRecovery(message); explain(message);
        return;
      }
    }
    if (!motionListenerAdded) {
      window.addEventListener("deviceorientationabsolute", onOrientation);
      window.addEventListener("deviceorientation", onOrientation);
      motionListenerAdded = true;
    }
    notice("Waiting for an absolute compass reading. If your browser does not provide one, use manual direction.");
    clearTimeout(motionTimer);
    motionTimer = setTimeout(() => {
      if (!trustedPose()) {
        const message = "No reliable compass reading arrived. Check motion permissions and calibrate your compass, or use manual controls. I cannot identify this direction yet.";
        showRecovery(message); explain(message);
      }
    }, 8000);
  } catch {
    showRecovery("Motion access is unavailable. Tap Use motion again from your phone browser, or use manual controls.");
  }
});

function chooseManual() {
  motionEnabled = false;
  manualDirection = true;
  manualPoseConfirmed = true;
  motionButton.textContent = "Use phone motion";
  notice("Manual direction active. Adjust the bearing and elevation sliders.");
  refreshSky();
}
byId("manual-button").addEventListener("click", chooseManual);
bearingInput.addEventListener("input", chooseManual);
elevationInput.addEventListener("input", chooseManual);

function ask(question) {
  sky = location ? skyObjects(location.latitude, location.longitude) : [];
  byId("heard-question").textContent = `You: ${question}`;
  const zoomReply = zoom.reply(question, conversation.target);
  const requestedLabels = requestedLabelMode(question);
  const predicted = zoomReply === null && (requestedLabels !== null || isPredictedSkyQuestion(question));
  let reply = zoomReply ?? (predicted
    ? predictedSkyAnswer({ hasCamera: hasLiveCamera(), hasLocation: Boolean(location), direction: trustedPose(), geometry: cameraGeometry(), objects: requestedLabels === "stars" ? sky.filter(object => object.kind === "star") : sky })
    : conversation.reply(question, sky, trustedPose()));
  if (zoomReply === null && !predicted && conversation.identifiedThisTurn) reply += zoom.offer(conversation.target);
  if (isMobileView() && zoomReply === null) {
    if (requestedLabels !== null) {
      const geometry = cameraGeometry();
      labelMode = hasLiveCamera() && location && trustedPose() && geometry.videoWidth && geometry.videoHeight ? requestedLabels : "none";
      labeledTarget = null;
    } else if (!predicted && (conversation.identifiedThisTurn || conversation.selectedThisTurn)) {
      labelMode = "single";
      labeledTarget = conversation.target.name;
    } else if (!predicted && conversation.identificationAttemptedThisTurn) {
      labelMode = "none";
      labeledTarget = null;
    }
  }
  answer.textContent = reply;
  byId("topic").textContent = conversation.target ? `Conversation: ${conversation.target.name} · saved as you move` : "Point, ask, then keep talking.";
  refreshSky();
  if (voice.active) void voice.say(reply);
}

byId("ask-form").addEventListener("submit", (event) => {
  event.preventDefault();
  ask(questionInput.value);
});
document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
  questionInput.value = button.dataset.question;
  ask(questionInput.value);
}));

byId("resume-voice").addEventListener("click", () => {
  byId("recovery").hidden = true;
  voice.resume();
});
byId("manual-recovery").addEventListener("click", () => {
  document.body.classList.add("manual-fallback");
  byId("settings-panel").open = true;
  questionInput.focus();
});
document.addEventListener("visibilitychange", () => {
  // Background microphone use is paused; phone movement never triggers this.
  voice.suspended = document.hidden;
  if (document.hidden) void voice.stopListening();
  else if (voice.active && !voice.speaking) {
    voice.recover("Welcome back. Tap Resume voice to continue the same conversation.");
  }
});

window.addEventListener("pagehide", stopCamera);
function refreshScreenOrientation() {
  if (orientationSample) sensorPose = sensorCameraPose(orientationSample, screenAngle(), orientationSample.timestamp);
  updateZoomControls();
  refreshPredictions();
}
window.addEventListener("resize", refreshScreenOrientation);
window.addEventListener("orientationchange", refreshScreenOrientation);
window.screen?.orientation?.addEventListener("change", refreshScreenOrientation);
camera.addEventListener("resize", refreshPredictions);
if (window.matchMedia("(max-width: 820px)").matches) {
  byId("settings-panel").open = false;
  byId("sky-panel").open = false;
}
refreshSky();
window.setInterval(refreshSky, 30000);
window.setInterval(refreshPredictions, 1000);

import { compassPoint, separation, skyObjects } from "./daao-sky.js";
import { SkyConversation } from "./daao-conversation.js";
import { VoiceConversation } from "./daao-voice.js";
import { CameraZoomConversation } from "./daao-zoom.js";
import { chooseVoice, configureSpeech, voiceSample } from "./daao-speech.js";

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
let location = null;
let sensorPose = null;
let manualDirection = true;
let motionListenerAdded = false;
let motionEnabled = false;
let sky = [];
let manualPoseConfirmed = false;
let cameraStarting = false;
let cameraGeneration = 0;
let cameraTimer;
let locationPending = false;
let motionTimer;
let selectedVoice = null;
let preferredVoiceURI;
let sampleUtterance = null;
try { preferredVoiceURI = localStorage.getItem("daao-voice-uri"); } catch { /* Storage may be unavailable. */ }
const conversation = new SkyConversation();
const zoom = new CameraZoomConversation({
  hasCamera: () => Boolean(cameraStream?.getVideoTracks().some((track) => track.readyState === "live")),
  applyScale: (scale) => {
    camera.style.transform = `scale(${scale})`;
    if (cameraStream) byId("view-label").textContent = `Live camera · ${scale}× digital · no image analysis`;
  },
});
const voice = new VoiceConversation({
  Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
  synthesis: window.speechSynthesis,
  Utterance: window.SpeechSynthesisUtterance,
  onQuestion: ask,
  onState: (message) => { byId("voice-state").textContent = message; },
  onRecovery: showRecovery,
  configureUtterance: utterance => configureSpeech(utterance, selectedVoice),
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
  byId("voice-name").textContent = selectedVoice ? `Proposed voice: ${selectedVoice.name}. This same voice will speak all replies on this device.` : "No named voices are exposed yet. Playback will use this browser's default voice. Try your regular phone browser for its available voices.";
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
  return sensorPose && Date.now() - sensorPose.timestamp < 15000 ? { ...sensorPose } : null;
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

  const list = byId("sky-list");
  list.replaceChildren();
  if (!location) {
    const item = document.createElement("li");
    item.textContent = "Waiting for location";
    list.append(item);
    return;
  }
  const visible = sky.filter((object) => object.altitude >= 0 && object.kind !== "sun")
    .sort((left, right) => separation(direction.elevation, direction.bearing, left.altitude, left.azimuth) - separation(direction.elevation, direction.bearing, right.altitude, right.azimuth))
    .slice(0, 5);
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
  zoom.reset();
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  camera.srcObject = null;
  camera.hidden = true;
  viewer.classList.remove("has-camera");
  cameraButton.textContent = "Start camera";
  byId("view-label").textContent = "Sky preview";
}

cameraButton.addEventListener("click", async () => {
  if (cameraStream || cameraStarting || voice.active) {
    stopCamera();
    notice("Camera and voice stopped. Your conversation topic is saved.");
    return;
  }
  byId("recovery").hidden = true;
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
    camera.srcObject = cameraStream;
    camera.hidden = false;
    await camera.play();
    viewer.classList.add("has-camera");
    cameraButton.textContent = "Stop camera";
    byId("view-label").textContent = "Live camera · no image analysis";
    stream.getVideoTracks()[0]?.addEventListener("ended", () => {
      if (cameraStream === stream) {
        stopCamera();
        showRecovery("Camera access ended. Tap Start camera to reconnect; your conversation topic is saved.");
      }
    });
    notice("Camera ready. Location and compass direction are needed to identify a light. Camera images are not analyzed.");
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

// Device Orientation defines zero rotation with x east, y north, and z up.
// The rear camera points along device -z; this matrix is Rz(alpha) Rx(beta) Ry(gamma).
function onOrientation(event) {
  if (!motionEnabled) return;
  if (!event.absolute && !Number.isFinite(event.webkitCompassHeading)) return;
  if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return;
  if (Number.isFinite(event.webkitCompassAccuracy) && (event.webkitCompassAccuracy < 0 || event.webkitCompassAccuracy > 25)) return;
  const alpha = event.alpha * Math.PI / 180;
  const beta = event.beta * Math.PI / 180;
  const gamma = event.gamma * Math.PI / 180;
  const east = -Math.cos(alpha) * Math.sin(gamma) - Math.sin(alpha) * Math.sin(beta) * Math.cos(gamma);
  const north = -Math.sin(alpha) * Math.sin(gamma) + Math.cos(alpha) * Math.sin(beta) * Math.cos(gamma);
  const up = -Math.cos(beta) * Math.cos(gamma);
  const horizontal = Math.hypot(east, north);
  if (horizontal < 0.02) return;
  let bearing = ((Math.atan2(east, north) * 180 / Math.PI) + 360) % 360;
  if (Number.isFinite(event.webkitCompassHeading)) {
    const topEast = -Math.sin(alpha) * Math.cos(beta);
    const topNorth = Math.cos(alpha) * Math.cos(beta);
    if (Math.hypot(topEast, topNorth) > 0.02) {
      const topBearing = ((Math.atan2(topEast, topNorth) * 180 / Math.PI) + 360) % 360;
      bearing = (bearing + event.webkitCompassHeading - topBearing + 360) % 360;
    }
  }
  sensorPose = { bearing, elevation: Math.atan2(up, horizontal) * 180 / Math.PI, timestamp: Date.now() };
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
  refreshSky();
  byId("heard-question").textContent = `You: ${question}`;
  const zoomReply = zoom.reply(question, conversation.target);
  let reply = zoomReply ?? conversation.reply(question, sky, trustedPose());
  if (zoomReply === null && conversation.identifiedThisTurn) reply += zoom.offer(conversation.target);
  answer.textContent = reply;
  byId("topic").textContent = conversation.target ? `Conversation: ${conversation.target.name} · saved as you move` : "Point, ask, then keep talking.";
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
if (window.matchMedia("(max-width: 820px)").matches) {
  byId("settings-panel").open = false;
  byId("sky-panel").open = false;
}
refreshSky();
window.setInterval(refreshSky, 30000);

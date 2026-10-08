import { answerSky, compassPoint, separation, skyObjects } from "./daao-sky.js";

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
let sky = [];

function notice(message) { status.textContent = message; }

function pose() {
  return manualDirection || !sensorPose
    ? { bearing: Number(bearingInput.value), elevation: Number(elevationInput.value) }
    : sensorPose;
}

function refreshSky() {
  sky = location ? skyObjects(location.latitude, location.longitude) : [];
  const direction = pose();
  byId("bearing").textContent = `${Math.round(direction.bearing)}°`;
  byId("compass-point").textContent = compassPoint(direction.bearing);
  byId("elevation").textContent = `${Math.round(direction.elevation)}° elevation · ${manualDirection ? "manual" : "phone motion"}`;
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
  notice("Sky map ready. Ask DAAO a question or move the direction controls.");
  refreshSky();
}

function stopCamera() {
  cameraStream?.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  camera.srcObject = null;
  camera.hidden = true;
  viewer.classList.remove("has-camera");
  cameraButton.textContent = "Start camera";
  byId("view-label").textContent = "Sky preview";
}

cameraButton.addEventListener("click", async () => {
  if (cameraStream) {
    stopCamera();
    notice("Camera stopped. The sky map remains available.");
    return;
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    notice("This browser cannot use the camera here. The sky map and manual controls still work.");
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" } } });
    camera.srcObject = cameraStream;
    camera.hidden = false;
    await camera.play();
    viewer.classList.add("has-camera");
    cameraButton.textContent = "Stop camera";
    byId("view-label").textContent = "Live camera · no image analysis";
    notice("Camera ready. Pointing and object names are calculated from sensors and the sky map.");
  } catch (error) {
    stopCamera();
    notice(error?.name === "NotAllowedError" ? "Camera access was declined. You can still explore the sky map." : "Camera unavailable. You can still explore the sky map.");
  }
});

locationButton.addEventListener("click", () => {
  if (!navigator.geolocation) {
    notice("Location is unavailable here. Enter coordinates below.");
    return;
  }
  notice("Requesting your location…");
  navigator.geolocation.getCurrentPosition(
    ({ coords }) => setLocation(coords.latitude, coords.longitude, `device location${Number.isFinite(coords.accuracy) ? `, ±${Math.round(coords.accuracy)} m` : ""}`),
    () => notice("Location access was declined or unavailable. Enter coordinates below."),
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
  if (!event.absolute && !Number.isFinite(event.webkitCompassHeading)) return;
  if (![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return;
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
  sensorPose = { bearing, elevation: Math.atan2(up, horizontal) * 180 / Math.PI };
  if (manualDirection) {
    manualDirection = false;
    motionButton.textContent = "Phone motion on";
    notice("Phone motion active. Compass direction is approximate; use manual direction if it needs correction.");
  }
  refreshSky();
}

motionButton.addEventListener("click", async () => {
  if (sensorPose && !manualDirection) {
    manualDirection = true;
    motionButton.textContent = "Use phone motion";
    notice("Manual direction active.");
    refreshSky();
    return;
  }
  if (sensorPose) {
    manualDirection = false;
    motionButton.textContent = "Phone motion on";
    notice("Phone motion active.");
    refreshSky();
    return;
  }
  if (!window.DeviceOrientationEvent) {
    notice("Motion sensors are unavailable in this browser. Use manual direction.");
    return;
  }
  try {
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const permission = await DeviceOrientationEvent.requestPermission();
      if (permission !== "granted") {
        notice("Motion access was declined. Use manual direction.");
        return;
      }
    }
    if (!motionListenerAdded) {
      window.addEventListener("deviceorientationabsolute", onOrientation);
      window.addEventListener("deviceorientation", onOrientation);
      motionListenerAdded = true;
    }
    notice("Waiting for an absolute compass reading. If your browser does not provide one, use manual direction.");
  } catch {
    notice("Motion access is unavailable. Use manual direction.");
  }
});

function chooseManual() {
  manualDirection = true;
  motionButton.textContent = "Use phone motion";
  notice("Manual direction active. Adjust the bearing and elevation sliders.");
  refreshSky();
}
byId("manual-button").addEventListener("click", chooseManual);
bearingInput.addEventListener("input", chooseManual);
elevationInput.addEventListener("input", chooseManual);

function ask(question) {
  const reply = answerSky(question, sky, pose());
  answer.textContent = reply;
  if (byId("speak-answer").checked && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(reply));
  }
}

byId("ask-form").addEventListener("submit", (event) => {
  event.preventDefault();
  ask(questionInput.value);
});
document.querySelectorAll("[data-question]").forEach((button) => button.addEventListener("click", () => {
  questionInput.value = button.dataset.question;
  ask(questionInput.value);
}));

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!Recognition) {
  byId("voice-button").disabled = true;
  byId("voice-button").textContent = "Voice unavailable";
} else {
  byId("voice-button").addEventListener("click", () => {
    const recognition = new Recognition();
    recognition.lang = navigator.language || "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      questionInput.value = event.results[0][0].transcript;
      ask(questionInput.value);
      notice("Voice question received.");
    };
    recognition.onerror = () => notice("Voice input did not finish. Type your question instead.");
    try { recognition.start(); notice("Listening for your question…"); }
    catch { notice("Voice input is unavailable. Type your question instead."); }
  });
}

window.addEventListener("pagehide", stopCamera);
refreshSky();
window.setInterval(refreshSky, 30000);

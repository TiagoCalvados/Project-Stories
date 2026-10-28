const RAD = Math.PI / 180;
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const addScaled = (a, b, x, y) => a.map((value, index) => value * x + b[index] * y);
const wrap = angle => ((angle % 360) + 360) % 360;
const vector = (bearing, elevation) => [Math.sin(bearing * RAD) * Math.cos(elevation * RAD), Math.cos(bearing * RAD) * Math.cos(elevation * RAD), Math.sin(elevation * RAD)];

export function directionBasis({ bearing, elevation }) {
  return {
    forward: vector(bearing, elevation),
    right: [Math.cos(bearing * RAD), -Math.sin(bearing * RAD), 0],
    up: [-Math.sin(bearing * RAD) * Math.sin(elevation * RAD), -Math.cos(bearing * RAD) * Math.sin(elevation * RAD), Math.cos(elevation * RAD)],
  };
}

// ENU (east, north, up), rear-camera forward = device -z.
// Use the full Rz(alpha) Rx(beta) Ry(gamma) basis so roll also moves labels.
export function sensorCameraPose(event, screenAngle = 0, timestamp = Date.now()) {
  if ((!event.absolute && !Number.isFinite(event.webkitCompassHeading)) || ![event.alpha, event.beta, event.gamma].every(Number.isFinite)) return null;
  if (Number.isFinite(event.webkitCompassAccuracy) && (event.webkitCompassAccuracy < 0 || event.webkitCompassAccuracy > 25)) return null;
  const a = event.alpha * RAD, b = event.beta * RAD, g = event.gamma * RAD;
  let forward = [-Math.cos(a) * Math.sin(g) - Math.sin(a) * Math.sin(b) * Math.cos(g), -Math.sin(a) * Math.sin(g) + Math.cos(a) * Math.sin(b) * Math.cos(g), -Math.cos(b) * Math.cos(g)];
  let right = [Math.cos(a) * Math.cos(g) - Math.sin(a) * Math.sin(b) * Math.sin(g), Math.sin(a) * Math.cos(g) + Math.cos(a) * Math.sin(b) * Math.sin(g), -Math.cos(b) * Math.sin(g)];
  let up = [-Math.sin(a) * Math.cos(b), Math.cos(a) * Math.cos(b), Math.sin(b)];
  if (Number.isFinite(event.webkitCompassHeading) && Math.hypot(up[0], up[1]) > 0.02) {
    const correction = (event.webkitCompassHeading - Math.atan2(up[0], up[1]) / RAD) * RAD;
    const rotate = ([east, north, height]) => [east * Math.cos(correction) + north * Math.sin(correction), north * Math.cos(correction) - east * Math.sin(correction), height];
    forward = rotate(forward); right = rotate(right); up = rotate(up);
  }
  const angle = screenAngle * RAD;
  const basis = { forward, right: addScaled(right, up, Math.cos(angle), -Math.sin(angle)), up: addScaled(right, up, Math.sin(angle), Math.cos(angle)) };
  return { bearing: wrap(Math.atan2(forward[0], forward[1]) / RAD), elevation: Math.atan2(forward[2], Math.hypot(forward[0], forward[1])) / RAD, timestamp, basis };
}

export function recentDirection(sensorPose, timestamp = Date.now()) {
  return sensorPose && timestamp - sensorPose.timestamp >= 0 && timestamp - sensorPose.timestamp < 15000 ? sensorPose : null;
}

// Browsers do not expose calibrated lens FOV. A stated 70-degree diagonal
// estimate is projected through the intrinsic video size, object-fit:cover crop
// and the exact digital zoom applied to the video. No invented image positions.
export function projectSkyObjects(objects, direction, { width, height, videoWidth, videoHeight, zoom = 1, diagonalFov = 70 } = {}) {
  if (!direction || ![direction.bearing, direction.elevation, width, height, videoWidth, videoHeight, zoom, diagonalFov].every(Number.isFinite)
    || Math.min(width, height, videoWidth, videoHeight) <= 0 || zoom < 1 || diagonalFov <= 0 || diagonalFov >= 180) return [];
  const basis = direction.basis || directionBasis(direction);
  const focal = Math.hypot(videoWidth, videoHeight) / (2 * Math.tan(diagonalFov * RAD / 2));
  const scale = Math.max(width / videoWidth, height / videoHeight) * zoom;
  const projected = [];
  for (const object of objects) {
    if (!Number.isFinite(object.altitude) || !Number.isFinite(object.azimuth) || object.altitude < 0 || object.kind === "sun") continue;
    const skyDirection = vector(object.azimuth, object.altitude);
    const depth = dot(skyDirection, basis.forward);
    if (depth <= 0) continue;
    const x = width / 2 + dot(skyDirection, basis.right) / depth * focal * scale;
    const y = height / 2 - dot(skyDirection, basis.up) / depth * focal * scale;
    if (x < 0 || y < 0 || x > width || y > height) continue;
    projected.push({ ...object, x, y, centerDistance: Math.hypot(x - width / 2, y - height / 2) });
  }
  return projected.sort((a, b) => a.centerDistance - b.centerDistance);
}

export function isPredictedSkyQuestion(question) {
  return /cloud|predicted|would.*(?:sky|see|there|stars?|planets?)|(?:which|what).*(?:stars|planets|objects).*(?:direction|front|here|there)/i.test(question);
}

export function predictedSkyAnswer({ hasCamera, hasLocation, direction, geometry, objects }) {
  if (!hasCamera) return "Start the camera to see predicted sky labels. They come from the sky map, not from seeing through clouds.";
  if (!hasLocation) return "I need your location to predict this sky. Tap Use my location and allow access. I cannot place labels yet.";
  if (!direction) return "I need a recent, reliable compass direction. Tap Use motion and allow access, then calibrate your compass. I cannot place predicted labels yet.";
  if (!geometry.videoWidth || !geometry.videoHeight || !geometry.width || !geometry.height) return "The camera is still preparing its view. Please ask again when the live picture is ready.";
  const inView = projectSkyObjects(objects, direction, geometry);
  return inView.length
    ? `The approximate sky map predicts ${inView.slice(0, 6).map(object => object.name).join(", ")} in this camera field. The labels are calculated positions, not visual detections. Clouds may hide all of them. Lens and compass errors can shift the labels; our conversation topic is unchanged.`
    : "No objects from this small built-in catalog fall inside the predicted camera field above the horizon. Fainter stars may still be there. Clouds do not change these calculations, and I cannot see through them.";
}

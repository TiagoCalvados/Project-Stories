import assert from "node:assert/strict";
import { test } from "node:test";
import { directionBasis, projectSkyObjects, recentDirection, sensorCameraPose } from "../daao-projection.js";

const geometry = { width: 400, height: 600, videoWidth: 1080, videoHeight: 1920 };
const object = (azimuth, altitude = 30, name = "Jupiter") => ({ name, azimuth, altitude, kind: "planet", magnitude: -2.7 });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} should equal ${b}`);
const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);

test("projection centers a known direction and wraps north without discontinuity", () => {
  const [center] = projectSkyObjects([object(359)], { bearing: 359, elevation: 30 }, geometry);
  close(center.x, 200); close(center.y, 300);
  const [nearNorth] = projectSkyObjects([object(1)], { bearing: 359, elevation: 30 }, geometry);
  assert.ok(nearNorth.x > 200 && nearNorth.x < 250);
  assert.equal(projectSkyObjects([object(179), object(359, -5)], { bearing: 359, elevation: 30 }, geometry).length, 0);
});

test("digital magnification and object-fit cover cropping determine the field of view", () => {
  const crop = { width: 300, height: 600, videoWidth: 1600, videoHeight: 900 };
  const direction = { bearing: 0, elevation: 0 };
  const [normal] = projectSkyObjects([object(3, 0)], direction, crop);
  const [zoomed] = projectSkyObjects([object(3, 0)], direction, { ...crop, zoom: 2 });
  close(zoomed.x - 150, 2 * (normal.x - 150));
  assert.equal(projectSkyObjects([object(12, 0)], direction, crop).length, 0);
  assert.equal(projectSkyObjects([object(12, 0)], direction, { ...crop, width: 900 }).length, 1);
  assert.equal(projectSkyObjects([object(6, 0)], direction, { ...crop, zoom: 3 }).length, 0);
});

test("sensor roll and screen rotation use orthonormal camera axes", () => {
  for (const angle of [0, 90, 180, 270]) {
    const pose = sensorCameraPose({ absolute: true, alpha: 37, beta: 110, gamma: 15 }, angle, 1000);
    for (const axis of Object.values(pose.basis)) close(dot(axis, axis), 1);
    close(dot(pose.basis.forward, pose.basis.up), 0);
    close(dot(pose.basis.right, pose.basis.up), 0);
  }
  const upright = sensorCameraPose({ absolute: true, alpha: 0, beta: 90, gamma: 0 }, 0);
  const rotated = sensorCameraPose({ absolute: true, alpha: 0, beta: 90, gamma: 0 }, 90);
  const [a] = projectSkyObjects([object(3, 0)], upright, geometry);
  const [b] = projectSkyObjects([object(3, 0)], rotated, geometry);
  assert.ok(a.x > 200); close(a.y, 300);
  close(b.x, 200); assert.ok(b.y < 300);
  const manual = directionBasis({ bearing: 0, elevation: 0 });
  close(dot(manual.forward, manual.up), 0);
});

test("missing, stale, relative or unreliable sensor data cannot fabricate projected labels", () => {
  assert.deepEqual(projectSkyObjects([object(0)], null, geometry), []);
  assert.deepEqual(projectSkyObjects([object(0)], { bearing: 0, elevation: 30 }, { ...geometry, videoWidth: 0 }), []);
  assert.equal(sensorCameraPose({ absolute: false, alpha: 0, beta: 90, gamma: 0 }), null);
  assert.equal(sensorCameraPose({ alpha: 0, beta: 90, gamma: 0, webkitCompassHeading: 0, webkitCompassAccuracy: 50 }), null);
  const pose = sensorCameraPose({ absolute: true, alpha: 0, beta: 90, gamma: 0 }, 0, 1000);
  assert.equal(recentDirection(pose, 2000), pose);
  assert.equal(recentDirection(pose, 16000), null);
  assert.equal(recentDirection(pose, 500), null);
});

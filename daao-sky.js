// Approximate, offline sky positions adapted from DAAO's built-in catalogs.
// Directions are true-north bearings; camera images are never analyzed.
const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
const wrap = (angle) => ((angle % 360) + 360) % 360;
const signed = (angle) => wrap(angle + 180) - 180;

const stars = [
  ["Sirius", 101.287155, -16.716116, -1.44], ["Canopus", 95.987958, -52.695661, -0.62],
  ["Rigil Kentaurus", 219.902066, -60.833975, -0.01], ["Arcturus", 213.9153, 19.182409, -0.05],
  ["Vega", 279.234735, 38.783689, 0.03], ["Capella", 79.172328, 45.997991, 0.08],
  ["Rigel", 78.634467, -8.201638, 0.18], ["Procyon", 114.825493, 5.224993, 0.4],
  ["Betelgeuse", 88.792939, 7.407064, 0.45], ["Achernar", 24.428523, -57.236753, 0.45],
  ["Hadar", 210.955856, -60.373035, 0.61], ["Altair", 297.695827, 8.868321, 0.76],
  ["Aldebaran", 68.980163, 16.509302, 0.87], ["Spica", 201.298247, -11.161319, 0.98],
  ["Antares", 247.351915, -26.432003, 1.06], ["Pollux", 116.328958, 28.026199, 1.16],
  ["Fomalhaut", 344.412693, -29.622237, 1.17], ["Deneb", 310.35798, 45.280339, 1.25],
  ["Mimosa", 191.930263, -59.688764, 1.25], ["Acrux", 186.649563, -63.099093, 1.33],
  ["Regulus", 152.092962, 11.967209, 1.36], ["Adhara", 104.656453, -28.972086, 1.5],
  ["Gacrux", 187.791498, -57.113213, 1.59], ["Bellatrix", 81.282764, 6.349703, 1.64],
  ["Elnath", 81.572971, 28.607452, 1.65], ["Polaris", 37.954561, 89.264109, 1.97],
  ["Castor", 113.649428, 31.888276, 1.98],
].map(([name, ra, dec, magnitude]) => ({ name, ra, dec, magnitude, kind: "star" }));

// JPL approximate orbital elements: a, e, I, L, perihelion, node and rates per century.
const orbits = {
  Mercury: [[0.38709843, 0.20563661, 7.00559432, 252.25166724, 77.45771895, 48.33961819], [0, 0.00002123, -0.00590158, 149472.67486623, 0.15940013, -0.12214182]],
  Venus: [[0.72332102, 0.00676399, 3.39777545, 181.9797085, 131.76755713, 76.67261496], [-0.00000026, -0.00005107, 0.00043494, 58517.8156026, 0.05679648, -0.27274174]],
  Earth: [[1.00000018, 0.01673163, -0.00054346, 100.46691572, 102.93005885, -5.11260389], [-0.00000003, -0.00003661, -0.01337178, 35999.37306329, 0.3179526, -0.24123856]],
  Mars: [[1.52371243, 0.09336511, 1.85181869, -4.56813164, -23.91744784, 49.71320984], [0.00000097, 0.00009149, -0.00724757, 19140.29934243, 0.45223625, -0.26852431]],
  Jupiter: [[5.20248019, 0.0485359, 1.29861416, 34.33479152, 14.27495244, 100.29282654], [-0.00002864, 0.00018026, -0.00322699, 3034.90371757, 0.18199196, 0.13024619], [-0.00012452, 0.0606406, -0.35635438, 38.35125]],
  Saturn: [[9.54149883, 0.05550825, 2.49424102, 50.07571329, 92.86136063, 113.63998702], [-0.00003065, -0.00032044, 0.00451969, 1222.11494724, 0.54179478, -0.25015002], [0.00025899, -0.13434469, 0.87320147, 38.35125]],
  Uranus: [[19.18797948, 0.0468574, 0.77298127, 314.20276625, 172.43404441, 73.96250215], [-0.00020455, -0.0000155, -0.00180155, 428.49512595, 0.09266985, 0.05739699], [0.00058331, -0.97731848, 0.17689245, 7.67025]],
  Neptune: [[30.06952752, 0.00895439, 1.7700552, 304.22289287, 46.68158724, 131.78635853], [0.00006447, 0.00000818, 0.000224, 218.46515314, 0.01009938, -0.00606302], [-0.00041348, 0.68346318, -0.10162547, 7.67025]],
};

function heliocentric([base, rate, terms = [0, 0, 0, 0]], centuries) {
  const [a, e, inclinationDegrees, longitude, perihelion, nodeDegrees] = base.map((value, index) => value + rate[index] * centuries);
  const [b, c, s, f] = terms;
  const anomaly = wrap(longitude - perihelion + b * centuries ** 2 + c * Math.cos(f * centuries * RAD) + s * Math.sin(f * centuries * RAD)) * RAD;
  let eccentric = anomaly;
  for (let index = 0; index < 12; index += 1) {
    const correction = (eccentric - e * Math.sin(eccentric) - anomaly) / (1 - e * Math.cos(eccentric));
    eccentric -= correction;
    if (Math.abs(correction) < 1e-12) break;
  }
  const x = a * (Math.cos(eccentric) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(eccentric);
  const argument = (perihelion - nodeDegrees) * RAD;
  const node = nodeDegrees * RAD;
  const inclination = inclinationDegrees * RAD;
  const x1 = x * Math.cos(argument) - y * Math.sin(argument);
  const y1 = x * Math.sin(argument) + y * Math.cos(argument);
  return [
    x1 * Math.cos(node) - y1 * Math.cos(inclination) * Math.sin(node),
    x1 * Math.sin(node) + y1 * Math.cos(inclination) * Math.cos(node),
    y1 * Math.sin(inclination),
  ];
}

function eclipticToEquatorial(name, vector, magnitude, kind) {
  const [x, y, z] = vector;
  const tilt = 23.43928 * RAD;
  const equatorialY = Math.cos(tilt) * y - Math.sin(tilt) * z;
  const equatorialZ = Math.sin(tilt) * y + Math.cos(tilt) * z;
  return { name, ra: wrap(Math.atan2(equatorialY, x) * DEG), dec: Math.atan2(equatorialZ, Math.hypot(x, equatorialY)) * DEG, magnitude, kind };
}

function moon(julianDate) {
  const days = julianDate - 2451545;
  const meanLongitude = wrap(218.316 + 13.176396 * days);
  const anomaly = wrap(134.963 + 13.064993 * days);
  const latitudeArgument = wrap(93.272 + 13.22935 * days);
  const solarAnomaly = wrap(357.529 + 0.98560028 * days);
  const elongation = wrap(297.85 + 12.190749 * days);
  const longitude = meanLongitude + 6.289 * Math.sin(anomaly * RAD) + 1.274 * Math.sin((2 * elongation - anomaly) * RAD) + 0.658 * Math.sin(2 * elongation * RAD) + 0.214 * Math.sin(2 * anomaly * RAD) - 0.186 * Math.sin(solarAnomaly * RAD);
  const latitude = 5.128 * Math.sin(latitudeArgument * RAD) + 0.28 * Math.sin((anomaly + latitudeArgument) * RAD) + 0.277 * Math.sin((anomaly - latitudeArgument) * RAD);
  const lon = longitude * RAD;
  const lat = latitude * RAD;
  return eclipticToEquatorial("Moon", [Math.cos(lon) * Math.cos(lat), Math.sin(lon) * Math.cos(lat), Math.sin(lat)], -12, "moon");
}

function equatorialObjects(julianDate) {
  const centuries = (julianDate - 2451545) / 36525;
  const earth = heliocentric(orbits.Earth, centuries);
  const result = [...stars, moon(julianDate), eclipticToEquatorial("Sun", earth.map((value) => -value), -26.74, "sun")];
  const magnitudes = { Mercury: -0.5, Venus: -4.4, Mars: -1.5, Jupiter: -2.7, Saturn: 0.5, Uranus: 5.7, Neptune: 7.8 };
  for (const [name, elements] of Object.entries(orbits)) {
    if (name === "Earth") continue;
    const vector = heliocentric(elements, centuries).map((value, index) => value - earth[index]);
    result.push(eclipticToEquatorial(name, vector, magnitudes[name], "planet"));
  }
  return result;
}

export function separation(aAltitude, aAzimuth, bAltitude, bAzimuth) {
  const cosine = Math.sin(aAltitude * RAD) * Math.sin(bAltitude * RAD) + Math.cos(aAltitude * RAD) * Math.cos(bAltitude * RAD) * Math.cos((aAzimuth - bAzimuth) * RAD);
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * DEG;
}

export function skyObjects(latitude, longitude, timestamp = Date.now()) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return [];
  const jd = 2440587.5 + timestamp / 86400000;
  const days = jd - 2451545;
  const centuries = days / 36525;
  const sidereal = wrap(280.46061837 + 360.98564736629 * days + 0.000387933 * centuries ** 2 - centuries ** 3 / 38710000 + longitude);
  return equatorialObjects(jd).map((object) => {
    const hourAngle = signed(sidereal - object.ra) * RAD;
    const dec = object.dec * RAD;
    const lat = latitude * RAD;
    const altitude = Math.asin(Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(hourAngle)) * DEG;
    const azimuth = wrap(Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) * DEG + 180);
    return { ...object, altitude, azimuth };
  });
}

export function compassPoint(bearing) {
  return ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(wrap(bearing) / 45) % 8];
}

export function answerSky(question, objects, pose) {
  if (!objects?.length) return "Add your location to calculate the sky from where you are.";
  const q = question.toLowerCase().trim();
  const visible = objects.filter((object) => object.altitude >= 0);
  const named = objects.find((object) => new RegExp(`\\b${object.name.toLowerCase()}\\b`).test(q));
  if (named) {
    if (named.altitude < 0) return `${named.name} is below the horizon from your location right now.`;
    const position = `${named.name} is about ${Math.round(named.altitude)}° above the horizon, toward ${compassPoint(named.azimuth)} (${Math.round(named.azimuth)}°).`;
    if (!pose) return position;
    const turn = signed(named.azimuth - pose.bearing);
    const lift = named.altitude - pose.elevation;
    if (separation(pose.elevation, pose.bearing, named.altitude, named.azimuth) < 6) return `${position} It should be near the center of your view.`;
    const horizontal = Math.abs(turn) < 5 ? "keep this direction" : `turn about ${Math.round(Math.abs(turn))}° ${turn > 0 ? "right" : "left"}`;
    const vertical = Math.abs(lift) < 5 ? "keep this height" : `${lift > 0 ? "raise" : "lower"} your view about ${Math.round(Math.abs(lift))}°`;
    return `${position} To find it, ${horizontal} and ${vertical}.`;
  }
  if (/describe|what.*(see|sky)|visible/.test(q)) {
    const nearby = pose ? visible.filter((object) => separation(pose.elevation, pose.bearing, object.altitude, object.azimuth) <= 18).sort((a, b) => separation(pose.elevation, pose.bearing, a.altitude, a.azimuth) - separation(pose.elevation, pose.bearing, b.altitude, b.azimuth)) : visible.filter((object) => object.kind !== "sun").sort((a, b) => a.magnitude - b.magnitude);
    return nearby.length ? `The sky map places ${nearby.slice(0, 3).map((object) => object.name).join(", ")} ${pose ? "near this direction" : "above your horizon"}. Check against the sky; the camera image is not analyzed.` : "I cannot match a bright catalog object in this direction. Fainter stars may still be there.";
  }
  if (/what|star|bright|looking|in front/.test(q)) {
    if (!pose) return "Enable motion sensing or set a direction to ask what is in front of you.";
    const nearest = visible.filter((object) => object.kind !== "sun").sort((a, b) => separation(pose.elevation, pose.bearing, a.altitude, a.azimuth) - separation(pose.elevation, pose.bearing, b.altitude, b.azimuth))[0];
    if (!nearest || separation(pose.elevation, pose.bearing, nearest.altitude, nearest.azimuth) > 18) return "I cannot match a bright catalog object near the center of this view. Try pointing closer.";
    const distance = Math.round(separation(pose.elevation, pose.bearing, nearest.altitude, nearest.azimuth));
    return `The sky map places ${nearest.name} about ${distance}° from center. Check it against what you see.`;
  }
  return "Ask what is in front of you, describe the sky, or ask where to find the Moon, a planet, or a named star.";
}

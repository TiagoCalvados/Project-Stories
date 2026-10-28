import { answerSky, separation } from "./daao-sky.js";

const facts = {
  Moon: "The Moon is Earth's natural satellite. Its changing phases come from how much of its sunlit half we can see.",
  Sun: "The Sun is our nearest star. Never point an optical instrument at it without a purpose-built solar filter.",
  Mercury: "Mercury is the smallest planet and the closest to the Sun.",
  Venus: "Venus is a rocky planet wrapped in thick clouds. It reflects sunlight very strongly and can look exceptionally bright.",
  Mars: "Mars is a rocky planet. Iron-rich minerals on its surface give it its reddish appearance.",
  Jupiter: "Jupiter is the largest planet in our solar system, a gas giant with many moons.",
  Saturn: "Saturn is a gas giant surrounded by rings made mostly of ice particles. You need a telescope to see its rings clearly.",
  Uranus: "Uranus is an ice giant that rotates on its side. It is difficult to see without optical help.",
  Neptune: "Neptune is the outermost planet, an ice giant too faint to see with the unaided eye.",
  Sirius: "Sirius is the brightest star in Earth's night sky. It is a binary system about 8.6 light-years away.",
  Vega: "Vega is a bright star in Lyra, about 25 light-years away. It is one corner of the Summer Triangle.",
  Betelgeuse: "Betelgeuse is a red supergiant in Orion. Its brightness varies over time.",
  Polaris: "Polaris is close to the north celestial pole, which makes it useful for finding north in the Northern Hemisphere.",
};

// A target is a conversation snapshot, never a reference to the live sensor pose.
export class SkyConversation {
  target = null;

  reply(question, objects, direction) {
    this.identifiedThisTurn = false;
    const q = question.toLowerCase().trim();
    const named = objects.find((object) => new RegExp(`\\b${object.name.toLowerCase()}\\b`).test(q));
    const newDirection = /(?:in front|pointing at|looking at|this direction|that direction)/.test(q)
      || /(?:what|which|identify|name).*(?:this|that|another|new|other) (?:bright )?(?:light|star|planet|object|target)/.test(q)
      || /(?:new|another|different|other) (?:one|star|target|object)/.test(q)
      || /^(?:what is|what's) (?:this|that)[?.!]*$/.test(q)
      || (!this.target && /what is it\b|bright light|bright star/.test(q));
    if (named) this.target = { ...named };
    if (!named && newDirection) {
      if (!objects.length) return "I need your location to calculate the sky. Tap Use my location and allow access. I cannot identify that light from the camera image alone.";
      if (!direction) return "I need a recent compass direction. Tap Use motion and allow access, then point at the light and ask again. If motion is unavailable, use the manual controls in recovery. I cannot identify it yet.";
      if (direction.elevation < 0) return "Your camera direction is below the horizon. Point above the horizon and ask again. Our previous topic is still saved.";
      const candidates = objects.filter((object) => object.altitude >= 0 && object.kind !== "sun" && object.magnitude <= 2.5)
        .map((object) => ({ ...object, offset: separation(direction.elevation, direction.bearing, object.altitude, object.azimuth) }))
        .filter((object) => object.offset <= 6).sort((a, b) => a.offset - b.offset);
      if (!candidates.length) return "I cannot reliably match a bright catalog object near the center of this direction. The camera image is not analyzed, and the catalog is limited. Check your compass calibration and point closer, then ask again.";
      if (candidates.length > 1 && candidates[1].offset - candidates[0].offset < 3) return `This direction is ambiguous: ${candidates[0].name} and ${candidates[1].name} are both nearby in the sky map. I cannot tell which light you mean. Point more precisely and ask again.`;
      this.target = { ...candidates[0], selectedPose: { ...direction } };
      this.identifiedThisTurn = true;
      return `The approximate sky map suggests ${this.target.name}, about ${Math.round(this.target.offset)} degrees from center. This is a candidate, not a confirmed identification; compass errors and uncatalogued objects can mislead us. ${this.describe()} You can lower your phone and ask me about this candidate. To identify a new light, point at it and say, what is this light?`;
    }
    if (this.target && !/describe.*sky|what.*(?:see|sky)|visible/.test(q)) {
      const current = objects.find((object) => object.name === this.target.name) || this.target;
      if (/where|find|direction|horizon|position/.test(q)) return answerSky(`Where is ${current.name}?`, [current], direction);
      if (named || /tell|more|about|what is|what's|planet|star|it\b|that\b|this\b/.test(q)) {
        if (/distance|far|old|age|temperature|hot|size|big/.test(q)) return `We are still talking about ${this.target.name}. I do not have a verified answer to that detail in this browser's built-in catalog. ${this.describe()}`;
        return `We are still talking about ${this.target.name}. ${this.describe()}`;
      }
      return `Our topic is still ${this.target.name}. You can ask what it is or where to find it. I only answer from this browser's built-in sky catalog.`;
    }
    if (/describe.*sky|what.*(?:see|sky)|visible/.test(q)) return answerSky(question, objects, direction);
    return "Ask what is this light while pointing at it, describe the sky, or ask about a named star or planet. I use a built-in astronomy catalog, so I cannot answer every question.";
  }

  describe() {
    return facts[this.target.name] || `${this.target.name} is a ${this.target.kind}. Stars produce their own light; planets shine mainly by reflected sunlight. This catalog has no further verified details about this object.`;
  }
}

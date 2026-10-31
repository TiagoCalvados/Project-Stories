// Changes the live camera view only; sky identification still depends on the map and sensors.
export class CameraZoomConversation {
  constructor({ hasCamera, applyScale }) {
    Object.assign(this, { hasCamera, applyScale });
    this.scale = 1;
    this.pendingTarget = null;
  }

  offer(target) {
    if (!this.hasCamera() || this.scale > 1 || !target) return "";
    this.pendingTarget = target.name;
    return " Would you like me to zoom in on the live camera view? Say yes or no. Zoom can help frame the light, but it does not improve compass accuracy. Keep the object centered.";
  }

  clearOffer() { this.pendingTarget = null; }

  setScale(scale) {
    if (!this.hasCamera()) return false;
    const next = Math.max(1, Math.min(3, Math.round(scale)));
    this.clearOffer();
    if (next === this.scale) return false;
    this.scale = next;
    this.applyScale(next);
    return true;
  }

  reset() {
    this.clearOffer();
    this.scale = 1;
    this.applyScale(1);
  }

  reply(question, target) {
    const q = question.toLowerCase().trim().replace(/[.!?,]/g, "").replace(/\s+/g, " ");
    const pending = this.pendingTarget;
    this.clearOffer(); // A different utterance expires the offer, so later yes is unrelated.
    // Explicit camera requests do not depend on identifying a celestial target.
    // Strip polite framing, then match a command rather than any mention of zoom.
    const command = q.replace(/^(?:(?:can|could|would|will) you )?(?:please )?/, "")
      .replace(/(?: again)?(?: for me)?(?: please)?$/, "");
    const view = "(?:(?:this|that|the)(?: (?:bright )?(?:light|star|planet|object|target|view))?|it)";
    const zoomOut = new RegExp(`^(?:zoom (?:all the way )?(?:back )?out(?: (?:of|from|on) ${view})?|reset (?:the )?(?:camera )?zoom|(?:return|go back) to (?:the )?normal view)$`).test(command);
    const zoomIn = new RegExp(`^(?:zoom in(?: (?:on|onto|to) ${view})?|magnify(?: ${view})?)$`).test(command);
    const yes = /^(?:yes|yes please|yes zoom in|sure|go ahead|please do)$/.test(q);
    const no = /^(?:no|no thanks|no thank you|not now)$/.test(q);
    if (pending && target?.name === pending && no) return `Okay, no zoom. We are still talking about ${target.name}.`;
    if (zoomOut) {
      this.reset();
      return this.hasCamera() ? "The camera is back to its normal view. Our conversation topic is unchanged." : "Zoom is reset. The camera is not running; tap Start camera for a live view.";
    }
    if (zoomIn || (pending && target?.name === pending && yes)) {
      if (!this.hasCamera()) return "The camera is not running, so I cannot magnify a live view. Tap Start camera, then ask me to zoom in.";
      if (this.scale >= 3) return "The live view is already at the zoom limit of three times. Say zoom out to restore the view.";
      this.setScale(this.scale + 1);
      return `The live camera view is now zoomed ${this.scale} times. Camera zoom is used when the browser allows it, otherwise the view is enlarged digitally. This does not change compass accuracy. ${target ? `Our topic is still ${target.name}. ` : ""}Say zoom out or reset zoom to return to the normal view.`;
    }
    if (yes || no) return "There is no pending zoom offer. To magnify the live camera, say zoom in. Our conversation topic is unchanged.";
    return null;
  }
}

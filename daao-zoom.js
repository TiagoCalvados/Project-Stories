// Magnifies only the live video. This adds no detail or synthetic sky imagery.
export class CameraZoomConversation {
  constructor({ hasCamera, applyScale }) {
    Object.assign(this, { hasCamera, applyScale });
    this.scale = 1;
    this.pendingTarget = null;
  }

  offer(target) {
    if (!this.hasCamera() || this.scale > 1 || !target) return "";
    this.pendingTarget = target.name;
    return " Would you like me to zoom in on the live camera view? Say yes or no. This is only digital magnification; it does not add telescope detail. Keep the object centered if you choose zoom.";
  }

  clearOffer() { this.pendingTarget = null; }

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
      if (this.scale >= 3) return "The live view is already at the digital magnification limit of three times. This cannot reveal telescope detail. Say zoom out to restore the view.";
      this.scale = Math.min(3, this.scale + 1);
      this.applyScale(this.scale);
      return `The live camera view is now magnified ${this.scale} times digitally. This crops and enlarges the same camera image; it does not add detail or track the object as you move. ${target ? `Our topic is still ${target.name}. ` : ""}Say zoom out or reset zoom to return to the normal view.`;
    }
    if (yes || no) return "There is no pending zoom offer. To magnify the live camera, say zoom in. Our conversation topic is unchanged.";
    return null;
  }
}

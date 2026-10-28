// Half-duplex speech: recognition must end before any app speech starts.
// Each recognition turn has its own identity so delayed results are ignored.
export class VoiceConversation {
  constructor({ Recognition, synthesis, Utterance, onQuestion, onState, onRecovery, configureUtterance = () => {}, language = "en-US" }) {
    Object.assign(this, { Recognition, synthesis, Utterance, onQuestion, onState, onRecovery, configureUtterance, language });
    this.active = false;
    this.speaking = false;
    this.blocked = false;
    this.turn = null;
    this.timer = null;
    this.queue = Promise.resolve();
    this.generation = 0;
    this.silentTurns = 0;
  }

  start(greeting) {
    this.active = true;
    this.blocked = false;
    this.silentTurns = 0;
    return this.say(greeting);
  }

  recover(message) {
    this.blocked = true;
    this.onState("Voice paused");
    this.onRecovery(message);
  }

  async stopListening() {
    clearTimeout(this.timer);
    const turn = this.turn;
    if (!turn) return true;
    turn.accept = false;
    try { turn.recognition.abort(); } catch { /* Wait for the existing turn to end. */ }
    const ended = await Promise.race([turn.ended, new Promise((resolve) => setTimeout(() => resolve(false), 2000))]);
    if (!ended) this.recover("The microphone did not close cleanly. Stop the camera and restart, or reload this page before using voice again.");
    return ended;
  }

  say(message) {
    const generation = this.generation;
    const speak = async () => {
      if (!this.active || generation !== this.generation) return;
      this.speaking = true;
      if (!(await this.stopListening())) { this.speaking = false; return; }
      if (!this.active || generation !== this.generation) { this.speaking = false; return; }
      this.onState("DAAO is speaking…");
      if (!this.synthesis || !this.Utterance) {
        this.speaking = false;
        this.recover("Spoken audio is unavailable in this browser. Read the answer here, or open this page in a browser with speech support.");
        return;
      }
      await new Promise((resolve) => {
        const utterance = new this.Utterance(message);
        this.utterance = utterance; // Keep a reference while mobile speech is playing.
        utterance.lang = this.language;
        this.configureUtterance(utterance);
        let finished = false;
        const finish = (error) => {
          if (finished) return;
          finished = true;
          clearTimeout(watchdog);
          if (error && generation === this.generation) this.recover("Your browser could not play the answer. Check sound and speech permissions, then tap Resume voice to try again. The answer is also shown here.");
          resolve();
        };
        const watchdog = setTimeout(() => {
          // Fail closed: never reopen the microphone over uncertain speech output.
          this.recover("Speech playback did not finish. Tap Resume voice to retry, or use the manual controls.");
          this.synthesis.cancel();
          finish();
        }, Math.max(30000, message.length * 180));
        utterance.onend = () => finish();
        utterance.onerror = () => finish(true);
        try { this.synthesis.speak(utterance); } catch { finish(true); }
      });
      this.speaking = false;
      if (this.active && generation === this.generation && !this.blocked) this.scheduleListen(650);
    };
    this.queue = this.queue.then(speak);
    return this.queue;
  }

  scheduleListen(delay = 500) {
    clearTimeout(this.timer);
    if (this.active && !this.blocked && !this.suspended) this.timer = setTimeout(() => this.listen(), delay);
  }

  listen() {
    if (!this.active || this.blocked || this.suspended || this.speaking || this.turn) return;
    if (!this.Recognition) {
      this.recover("This browser does not support voice questions. Try Safari on iPhone or Chrome on Android with microphone access, or use manual controls here. Support depends on your device and browser settings.");
      return;
    }
    const recognition = new this.Recognition();
    const turn = { recognition, accept: true, received: false };
    turn.ended = new Promise((resolve) => { turn.finish = resolve; });
    this.turn = turn;
    recognition.lang = this.language;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      clearTimeout(turn.startTimer);
      if (this.turn === turn && turn.accept && !this.blocked) this.onState("Listening… Ask about the sky.");
    };
    recognition.onresult = (event) => {
      if (!turn.accept || this.turn !== turn || !this.active || this.speaking || this.blocked) return;
      const result = event.results[event.resultIndex || 0];
      const question = result?.[0]?.transcript?.trim();
      if (!question || result.isFinal === false) return;
      turn.accept = false;
      turn.received = true;
      this.silentTurns = 0;
      this.onQuestion(question);
    };
    recognition.onerror = ({ error }) => {
      clearTimeout(turn.startTimer);
      if (!turn.accept || this.turn !== turn || !this.active) return;
      if (error === "no-speech" || error === "aborted") return;
      turn.accept = false;
      const detail = error === "not-allowed" || error === "service-not-allowed"
        ? "Microphone or speech permission was declined. Allow microphone and speech access in browser settings, then tap Resume voice. Some browsers need this extra tap."
        : error === "audio-capture" ? "No working microphone was found. Check your device microphone, then tap Resume voice."
        : "The browser speech service is unavailable. Check your connection and speech settings, then tap Resume voice, or use manual controls.";
      this.recover(detail);
    };
    recognition.onend = () => {
      clearTimeout(turn.startTimer);
      turn.finish(true);
      if (this.turn !== turn) return;
      this.turn = null;
      if (!turn.received && turn.accept) this.silentTurns += 1;
      if (this.silentTurns >= 8) this.recover("Voice paused after repeated silence. Tap Resume voice when you are ready to ask a question.");
      if (!this.speaking) this.scheduleListen();
    };
    try {
      this.onState("Starting microphone…");
      turn.startTimer = setTimeout(() => {
        if (this.turn !== turn || !turn.accept || !this.active) return;
        turn.accept = false;
        this.recover("The microphone is still waiting for browser permission or the speech service. Check the permission prompt and your connection, then tap Resume voice. If it remains stuck, stop this session and reload, or use manual controls.");
        try { recognition.abort(); } catch { /* Recovery remains available. */ }
      }, 15000);
      recognition.start();
    }
    catch {
      clearTimeout(turn.startTimer);
      this.turn = null;
      turn.finish(true);
      this.recover("Your browser needs another tap to start the microphone. Tap Resume voice, or use manual controls.");
    }
  }

  resume() {
    if (this.speaking) return;
    if (this.turn) {
      this.recover("The previous microphone session has not closed. Stop this session and reload the page, or use manual controls.");
      return;
    }
    this.active = true;
    this.blocked = false;
    this.silentTurns = 0;
    this.listen(); // Called directly from a user gesture for restrictive mobile browsers.
  }

  stop() {
    this.active = false;
    this.generation += 1;
    this.blocked = false;
    clearTimeout(this.timer);
    void this.stopListening();
    this.synthesis?.cancel();
    this.onState("Voice stopped");
  }
}

// Browser voices vary by device. Prefer an explicitly named higher-quality
// English voice when available, while keeping the actual choice visible.
export const experimentVoiceURI = "Microsoft Susan - English (United Kingdom)";

export function chooseVoice(voices, preferredURI) {
  const preferred = voices.find(voice => voice.voiceURI === preferredURI);
  if (preferred) return preferred;
  const approvedCandidate = voices.find(voice => voice.voiceURI === experimentVoiceURI || voice.name === experimentVoiceURI);
  if (approvedCandidate) return approvedCandidate;
  const english = voices.filter(voice => /^en(?:-|_)/i.test(voice.lang));
  const score = voice => {
    const name = voice.name.toLowerCase();
    if (/natural|neural/.test(name)) return 100;
    if (/premium|enhanced/.test(name)) return 90;
    if (/google uk english female/.test(name)) return 85;
    if (/google us english/.test(name)) return 80;
    if (/samantha|daniel|serena|karen/.test(name)) return 70;
    if (/microsoft susan/.test(name)) return 65;
    if (/microsoft hazel/.test(name)) return 60;
    return voice.default ? 20 : 10;
  };
  return english.sort((a, b) => score(b) - score(a))[0] || voices.find(voice => voice.default) || voices[0] || null;
}

export function configureSpeech(utterance, voice) {
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang || "en-US";
  utterance.rate = 0.98;
  utterance.pitch = 1;
  utterance.volume = 1;
  return utterance;
}

export const voiceSample = "Welcome to DAAO. What would you like to know about the sky? Let's explore together. Jupiter is the largest planet in our solar system, a gas giant with many moons. You can lower your phone while I answer. We'll keep talking about the same object.";

// Web Speech's portable microphone path does not expose capture constraints.
// Filter its actual results, rather than opening an unrelated filtered stream.
export function usableSpeechResult(result) {
  if (!result || result.isFinal === false) return null;
  const alternative = result[0];
  const question = alternative?.transcript?.trim();
  if (!question || !/\p{L}/u.test(question) || /^\W*(?:noise|music|silence|inaudible|unintelligible|background noise|traffic|car horn|engine|applause)\W*$/i.test(question)) return null;
  // Some engines always report zero (unknown), so do not reject soft speech
  // merely because confidence is unreported. No loudness threshold is used.
  const confidence = alternative.confidence;
  if (Number.isFinite(confidence) && confidence > 0 && confidence < 0.4) return null;
  return question;
}

export function isSkyVoiceRequest(question) {
  // Ignore unrelated transcriptions from traffic/music before any app action.
  // This is intent filtering, not speaker identification or cloud audio cleanup.
  return /\b(?:what|which|where|why|how|when|tell|explain|describe|show|identify|name|zoom|magnify|reset|normal view|sky|star|planet|moon|sun|cloud|mercury|venus|mars|jupiter|saturn|uranus|neptune|sirius|vega|betelgeuse|polaris|arcturus|capella|rigel|procyon|canopus|altair|aldebaran|spica|antares|pollux|fomalhaut|deneb|regulus|castor|rigil|kentaurus|achernar|hadar|mimosa|acrux|adhara|gacrux|bellatrix|elnath|more|continue)\b/i.test(question)
    || /^(?:yes(?: please| zoom in)?|no(?: thanks| thank you)?|not now|sure|go ahead|please do)[.!?]*$/i.test(question.trim());
}

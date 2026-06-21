const CRISIS_KEYWORDS = [
  "kill myself", "want to die", "i want to die",
  "don't want to be here anymore", "dont want to be here anymore",
  "don't want to be alive", "dont want to be alive",
  "want to hurt myself", "want to end it",
  "there's no point", "theres no point", "what's even the point", "whats even the point",
  "can't do this anymore", "cant do this anymore",
  "i want to disappear",
];

const GBV_KEYWORDS = [
  "hit me", "abused", "abusing me", "hurts me", "scared of him", "scared of her",
  "raped", "assaulted", "forced me",
];

function isCrisis(text) {
  return CRISIS_KEYWORDS.some(p => text.toLowerCase().includes(p));
}
function isGBV(text) {
  return GBV_KEYWORDS.some(p => text.toLowerCase().includes(p));
}

module.exports = { isCrisis, isGBV };
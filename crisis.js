const CRISIS_KEYWORDS_EN = [
  "kill myself", "want to die", "i want to die",
  "don't want to be here anymore", "dont want to be here anymore",
  "don't want to be alive", "dont want to be alive",
  "want to hurt myself", "want to end it",
  "there's no point", "theres no point", "what's even the point", "whats even the point",
  "can't do this anymore", "cant do this anymore",
  "i want to disappear",
];
 
const GBV_KEYWORDS_EN = [
  "hit me", "abused", "abusing me", "hurts me", "scared of him", "scared of her",
  "raped", "assaulted", "forced me",
];

const CRISIS_KEYWORDS_AF = [
  "wil myself doodmaak", "wil dood wees", "ek wil dood wees",
  "wil nie meer hier wees nie", "wil nie meer leef nie",
  "wil myself seermaak", "wil dit beëindig",
  "geen punt nie", "wat is die punt", "daar is geen punt",
  "kan dit nie meer doen nie",
  "ek wil verdwyn",
];
 
const GBV_KEYWORDS_AF = [
  "slaan my", "mishandel", "mishandel my", "maak my seer",
  "bang vir hom", "bang vir haar",
  "verkrag", "aangerand", "gedwing",
];

const CRISIS_KEYWORDS_ZU = [
  "ngifuna ukuzibulaisa", "ngifuna ukufa", "ngifuna ukuphela kwakho",
  "angisafuni ukuba lapha", "angisafuni ukuphila",
  "ngifuna ukuzilimaza",
  "akukho nhloso", "yini inhloso", "akukho ndaba",
  "angikwazi ukwenza lokhu",
  "ngifuna ukushabalala",
];
 
const GBV_KEYWORDS_ZU = [
  "ungishaya", "ungihlukumeza", "uyangihlukumeza", "ungilimaza",
  "ngiyamesaba", "ngiyamesaba yena",
  "udlwengulwe", "uhlasele", "bangiphoqa",
];

const CRISIS_KEYWORDS = [
  ...CRISIS_KEYWORDS_EN,
  ...CRISIS_KEYWORDS_AF,
  ...CRISIS_KEYWORDS_ZU,
];
 
const GBV_KEYWORDS = [
  ...GBV_KEYWORDS_EN,
  ...GBV_KEYWORDS_AF,
  ...GBV_KEYWORDS_ZU,
];

function isCrisis(text) {
  return CRISIS_KEYWORDS.some(p => text.toLowerCase().includes(p));
}
function isGBV(text) {
  return GBV_KEYWORDS.some(p => text.toLowerCase().includes(p));
}

module.exports = { isCrisis, isGBV };
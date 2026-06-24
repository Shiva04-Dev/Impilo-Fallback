const EXPLICIT_SWITCHES = [
  // English requests
  { pattern: /\b(english|speak english|in english|use english)\b/i, lang: "en" },

  // Afrikaans requests (English or Afrikaans phrasing)
  {
    pattern:
      /\b(afrikaans|praat afrikaans|in afrikaans|gebruik afrikaans|afrikaans asseblief|afrikaans please)\b/i,
    lang: "af",
  },

  // isiZulu requests (English or Zulu phrasing)
  {
    pattern:
      /\b(zulu|isizulu|ngizulu|ngifuna isizulu|speak zulu|in zulu|use zulu|zulu please)\b/i,
    lang: "zu",
  },
];

const AFRIKAANS_MARKERS = [
  /\b(ek|jy|hy|sy|ons|julle|hulle)\b/i,
  /\b(is|was|het|kan|wil|moet|sal|mag)\b/i,
  /\b(die|\'n|nie|ook|maar|want|dan|as)\b/i,
  /\basjou?blief\b/i,
  /\bbaie\b/i,
  /\bdankie\b/i,
  /\btotsiens\b/i,
];

const ZULU_MARKERS = [
  /\b(ngiyabonga|sawubona|yebo|cha|ngiyaxolisa)\b/i,
  /\b(ngifuna|ngiyazi|ngizwa|ngicabanga)\b/i,
  /\b(ukuthi|ukuze|noma|kodwa|ngoba)\b/i,
  /\b(futhi|manje|lapha|lapho|khona)\b/i,
  /\b(uyabona|uyazi|uyafuna)\b/i,
];

/**
 * Detect the language from raw message text.
 * Returns "en" | "af" | "zu", or null if no signal is strong enough.
 */
function detectLanguage(text) {
  for (const { pattern, lang } of EXPLICIT_SWITCHES) {
    if (pattern.test(text)) return lang;
  }

  const afScore = AFRIKAANS_MARKERS.filter((r) => r.test(text)).length;
  const zuScore = ZULU_MARKERS.filter((r) => r.test(text)).length;

  if (afScore >= 2 && afScore > zuScore) return "af";
  if (zuScore >= 2 && zuScore > afScore) return "zu";

  return null;
}

/**
 * Resolve the language for this turn.
 *
 * @param {string} userText  - raw incoming message
 * @param {string|null} storedLang - language previously persisted for this user
 * @returns {{ lang: string, changed: boolean }}
 *   lang    – the language to use for this turn ("en" | "af" | "zu")
 *   changed – true if the language has changed (caller should persist the new value)
 */
function resolveLanguage(userText, storedLang) {
  const detected = detectLanguage(userText);

  if (detected) {
    const changed = detected !== storedLang;
    return { lang: detected, changed };
  }

  if (storedLang) {
    return { lang: storedLang, changed: false };
  }

  return { lang: "en", changed: false };
}

const LANG_KEY = (userId) => `lang:${userId}`;

async function getStoredLanguage(container, userId) {
  try {
    const item = await container.item(LANG_KEY(userId), userId).read();
    return item?.resource?.lang ?? null;
  } catch {
    return null;
  }
}

async function setStoredLanguage(container, userId, lang) {
  await container.items.upsert({
    id: LANG_KEY(userId),
    userId,
    lang,
  });
}

module.exports = { resolveLanguage, getStoredLanguage, setStoredLanguage };
const { isCrisis, isGBV } = require("./crisis");
const { SYSTEM_PROMPT } = require("./systemPrompt");
const { getHistory, appendTurns, resetHistory } = require("./history");
const { callLLM } = require("./ai");
const { maybeUpdateTopicLabel } = require("./topicLabel");
const { resolveLanguage, getStoredLanguage, setStoredLanguage } = require("./language");

const CRISIS_SCRIPTS = {
  en: [
    "Thank you for telling me that. What you're feeling right now sounds really serious, and I want to make sure you get support from real people, not just from me — you don't have to carry this alone.",
    "You can call or WhatsApp SADAG's Suicide Crisis Line anytime, day or night: 0800 567 567. It's free and confidential.",
    "If you ever feel like you're in immediate danger, please call 10111 (police) or go to your nearest hospital.",
    "I'm still here too. Would it help to talk about what's going on right now, or would you rather I just sit with you for a bit?",
  ],
  af: [
    "Dankie dat jy dit met my gedeel het. Wat jy nou voel klink baie ernstig, en ek wil maak seker jy kry ondersteuning van regte mense, nie net van my nie — jy hoef dit nie alleen te dra nie.",
    "Jy kan SADAG se Selfmoordkrisisslyn enige tyd bel of WhatsApp, dag of nag: 0800 567 567. Dit is gratis en vertroulik.",
    "As jy ooit voel jy is in onmiddellike gevaar, bel asseblief 10111 (polisie) of gaan na jou naaste hospitaal.",
    "Ek is ook nog hier. Sou dit help om nou te praat oor wat aangaan, of wil jy hê ek bly net 'n rukkie by jou?",
  ],
  zu: [
    "Ngiyabonga ngokutshela mina lokho. Okuzwayo manje kuzwakala kunzima kakhulu, futhi ngifuna ukuqiniseka ukuthi uthola usizo oluvela kubantu bangempela, hhayi kimi kuphela — awudingeki ukuwuthwala wedwa.",
    "Ungacalela noma u-WhatsApp iLaini Yokuhlola Ukuzibulaisa ye-SADAG noma nini, ubusuku noma imini: 0800 567 567. Lamahhala futhi kuyimfihlo.",
    "Uma uzizwa usengozini ngokuqondile, sicela ushayelele u-10111 (amaphoyisa) noma uye esibhedlela sakho esiseduze.",
    "Ngikhona nawe futhi. Kungasiza ukukhuluma ngokwenzekayo manje, noma ungathanda ukuba ngihlale nawe isikhathi esincane?",
  ],
};

const GBV_CRISIS_SCRIPTS = {
  en: [
    "I'm really sorry you're going through this — what you're describing matters, and it's not your fault.",
    "LifeLine's Gender-Based Violence helpline is free and available 24/7: 0800 150 150. You can also call or WhatsApp them in confidence.",
    "If you're in immediate danger, please call 10111.",
    "Whenever you're ready, I'm here to keep chatting — there's no rush.",
  ],
  af: [
    "Ek is regtig jammer dat jy deur dit gaan — wat jy beskryf is belangrik, en dit is nie jou skuld nie.",
    "LifeLine se noodlyn vir geslagsgebaseerde geweld is gratis en 24/7 beskikbaar: 0800 150 150. Jy kan hulle vertroulik bel of WhatsApp.",
    "As jy in onmiddellike gevaar is, bel asseblief 10111.",
    "Wanneer jy gereed is, is ek hier om aan te gesels — geen haas nie.",
  ],
  zu: [
    "Ngiyaxolisa kakhulu ukuthi udlula kukho lokhu — okuxoxayo kubalulekile, futhi akusona isiphambeko sakho.",
    "ILayini ye-LifeLine ye-Gender-Based Violence ilamahhala futhi iyatholakala imihla yonke ngobubo: 0800 150 150. Ungabashayela noma u-WhatsApp ngokuyimfihlo.",
    "Uma usengozini ngokuqondile, sicela ushayelele u-10111.",
    "Noma nini ulungile, ngilapha ukuqhubeka sixoxe — asiyidingi.",
  ],
};

const RESET_TRIGGERS = [
  // English
  "reset", "clear", "start afresh", "start over", "new chat",
  "forget everything", "clear history", "clear chat", "reset chat",
  // Afrikaans
  "begin oor", "skrap alles", "nuwe gesels", "vergeet alles", "herstel",
  // Zulu
  "qala kabusha", "sula konke", "ingxoxo entsha", "khohlwa konke",
];

const RESET_MESSAGES = {
  en: "Your chat history has been cleared! We're starting fresh — how are you feeling today?",
  af: "Jou gesprekshistorie is uitgevee! Ons begin van voor af — hoe voel jy vandag?",
  zu: "Umlando wakho wengxoxo ususuliwe! Siqala kabusha — uzizwa kanjani namuhla?",
};

async function handleIncomingMessage(container, userId, userText, sendFn) {
  // 1. Resolve language
  const storedLang = await getStoredLanguage(container, userId);
  const { lang, changed } = resolveLanguage(userText, storedLang);
  if (changed) await setStoredLanguage(container, userId, lang);
 
  // 2. Crisis / GBV — always fires first, in the resolved language
  if (isGBV(userText)) {
    for (const line of GBV_CRISIS_SCRIPTS[lang] ?? GBV_CRISIS_SCRIPTS.en) await sendFn(line);
    await appendTurns(container, userId, [
      { role: "user", content: userText },
      { role: "assistant", content: "[Crisis resources provided — GBV variant]" },
    ]);
    return;
  }
 
  if (isCrisis(userText)) {
    for (const line of CRISIS_SCRIPTS[lang] ?? CRISIS_SCRIPTS.en) await sendFn(line);
    await appendTurns(container, userId, [
      { role: "user", content: userText },
      { role: "assistant", content: "[Crisis resources provided]" },
    ]);
    return;
  }
 
  // 3. Reset
  const isReset = RESET_TRIGGERS.some(trigger => userText.toLowerCase().includes(trigger));
  if (isReset) {
    await resetHistory(container, userId);
    await sendFn(RESET_MESSAGES[lang] ?? RESET_MESSAGES.en);
    return;
  }
 
  // 4. Normal LLM turn
  const history = await getHistory(container, userId);
  const messages = [
    { role: "system", content: getSystemPrompt(lang) },
    ...history,
    { role: "user", content: userText },
  ];
  const reply = await callLLM(messages);
  const parts = reply.split("|||").map(s => s.trim()).filter(Boolean);
  for (const part of parts) await sendFn(part);
 
  await appendTurns(container, userId, [
    { role: "user", content: userText },
    { role: "assistant", content: reply },
  ]);
 
  // 5. Update topic label every ~4 turns
  await maybeUpdateTopicLabel(container, userId, [...history, { role: "user", content: userText }]);
}
 
module.exports = { handleIncomingMessage };
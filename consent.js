const MAX_CONSENT_ATTEMPTS = 2

const YES_WORDS = ["yes","yeah","yep","ok","okay","sure","alright","fine","ja","goed","reg","oraait","yebo","kulungile","kuhle"]
const NO_WORDS  = ["no","nope","nah","not","don't","dont","nee","moenie","cha","hhayi"]

function normalize(text) {
  return text.trim().replace(/[\u2018\u2019]/g, "'")
}

function containsWord(text, word) {
  return new RegExp(`\\b${word}\\b`, "i").test(text)
}

const NEGATION_NO_PATTERNS = [/\bnot\s+(okay|ok|fine)\b/i]
const IDIOM_YES_PATTERNS = [/\bno\s+(problem|problems|probs|worries)\b/i]

function parseConsentAnswer(rawText) {
  const text = normalize(rawText)
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length > 5) return null

  if (NEGATION_NO_PATTERNS.some((p) => p.test(text))) return false
  if (IDIOM_YES_PATTERNS.some((p) => p.test(text))) return true

  const hasYes = YES_WORDS.some((w) => containsWord(text, w))
  const hasNo = NO_WORDS.some((w) => containsWord(text, w))

  if (hasYes && hasNo) return null
  if (hasYes) return true
  if (hasNo) return false
  return null
}

async function getConsentState(container, userId) {
  const doc = await container.findOne(
    { _id: userId },
    { projection: { pendingConsent: 1, consent: 1, historyCount: { $size: { $ifNull: ["$history", []] } } } }
  )
  
  return {
    isReturningUser: (doc?.historyCount ?? 0) > 0 && doc?.consent == null,
    hasConsentRecord: doc?.consent != null,
    pendingConsent: doc?.pendingConsent === true,
    baselineTracking: doc?.consent?.baselineTracking === true,
  }
}

async function claimConsentQuestion(container, userId, userText) {
  const filter = { _id: userId, pendingConsent: { $ne: true }, consent: { $exists: false } }

  const update = {
    $set: {
      pendingConsent: true,
      pendingFirstMessage: userText,
      consent: { baselineTracking: null, askedAt: new Date(), answeredAt: null },
      consentAttempts: 0,
    },
    $setOnInsert: { userId, createdAt: new Date() },
  }

  try {
    const result = await container.findOneAndUpdate(filter, update, { upsert: true, returnDocument: "after" })
    return !!result
  } catch (err) {
    if (err.code === 11000) return false
    throw err
  }
}

async function claimConsentAnswer(container, userId, answer) {
  return container.findOneAndUpdate(
    { _id: userId, pendingConsent: true },
    {
      $set: { "consent.baselineTracking": answer, "consent.answeredAt": new Date(), pendingConsent: false },
      $unset: { pendingFirstMessage: "" },
    },
    { returnDocument: "before" }
  )
}

async function claimConsentDefault(container, userId) {
  return container.findOneAndUpdate(
    { _id: userId, pendingConsent: true },
    {
      $set: { "consent.baselineTracking": false, "consent.answeredAt": new Date(), pendingConsent: false, consentDefaulted: true },
      $unset: { pendingFirstMessage: "" },
    },
    { returnDocument: "before" }
  )
}

const GREETING = {
  en: "Hi, I'm Impilo — a free chat tool here to support your mental wellbeing. Just to remind you, I can't replace a doctor, but I'm here to listen and connect you to real support if you need it.",
  af: "Hallo, ek is Impilo — 'n gratis praatjie-hulpmiddel hier om jou geestesgesondheid te ondersteun. Net om jou te herinner, ek kan nie 'n dokter vervang nie, maar ek is hier om te luister en jou aan regte ondersteuning te koppel as jy dit nodig het.",
  zu: "Sawubona! Ngi-Impilo — ithuluzi lamahhala elihlela inhlalakahle yakho yengqondo. Ngikukhumbuza nje, angikwazi ukuthatha indawo kadokotela, kodwa ngilapha ukulalela nokukuxhumanisa nesisekelo sangempela uma udinga sona.",
}

const CONSENT_QUESTION = {
  en: "One more thing: Impilo can quietly track patterns in how we chat; like how often you check in, to notice if something changes. It's optional and just between us. Is that okay? (Yes/No)",
  af: "Nog een ding: Impilo kan stilweg patrone volg in hoe ons gesels; soos hoe gereeld jy inskakel, om op te let as iets verander. Dit is opsioneel en net tussen ons. Is dit reg? (Ja/Nee)",
  zu: "Okunye nje: u-Impilo angalandelela ngomusa amaphethini endleleni esikhuluma ngayo; njengokuthi ungena kangakanani, ukuze uqaphele uma kukhona okushintshayo. Kuyazikhethela futhi kuphakathi kwethu kuphela. Kulungile? (Yebo/Cha)",
}

const CONSENT_QUESTION_RETURNING = {
  en: "Quick thing before we carry on: Impilo can quietly track patterns in how we chat; like how often you check in, to notice if something changes. It's optional and just between us. Is that okay? (Yes/No)",
  af: "Vinnige ding voor ons voortgaan: Impilo kan stilweg patrone volg in hoe ons gesels; soos hoe gereeld jy inskakel, om op te let as iets verander. Dit is opsioneel en net tussen ons. Is dit reg? (Ja/Nee)",
  zu: "Into ekhawulezayo ngaphambi kokuqhubeka: u-Impilo angalandelela ngomusa amaphethini endleleni esikhuluma ngayo; njengokuthi ungena kangakanani, ukuze uqaphele uma kukhona okushintshayo. Kuyazikhethela futhi kuphakathi kwethu kuphela. Kulungile? (Yebo/Cha)",
}

const CONSENT_RETRY = {
  en: "Sorry, just a yes or no works, is it okay if Impilo quietly tracks chat patterns like that?",
  af: "Jammer, net 'n ja of nee werk, is dit reg as Impilo stilweg geselspatrone so volg?",
  zu: "Uxolo, impendulo ethi yebo noma cha iyasebenza, kulungile uma u-Impilo elandelela amaphethini engxoxo kanjalo?",
}

const CONSENT_ACK_YES = { en: "Thanks, noted.", af: "Dankie, dit is aangeteken.", zu: "Ngiyabonga, kubhaliwe." }

const CONSENT_ACK_NO = {
  en: "No problem, we won't track your chat patterns. You can still chat with me as normal.",
  af: "Geen probleem nie, ons sal nie jou geselspatrone volg nie. Jy kan steeds normaalweg met my gesels.",
  zu: "Akunankinga, ngeke silandelele amaphethini akho engxoxo. Ungakhuluma nami ngokwejwayelekile.",
}

module.exports = { MAX_CONSENT_ATTEMPTS, parseConsentAnswer, getConsentState, claimConsentQuestion, claimConsentAnswer, claimConsentDefault, GREETING, CONSENT_QUESTION, CONSENT_QUESTION_RETURNING, CONSENT_RETRY, CONSENT_ACK_YES, CONSENT_ACK_NO}
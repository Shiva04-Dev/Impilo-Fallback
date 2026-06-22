const { isCrisis, isGBV } = require("./crisis");
const { SYSTEM_PROMPT } = require("./systemPrompt");
const { getHistory, appendTurns } = require("./history");
const { callLLM } = require("./ai");
const { maybeUpdateTopicLabel } = require("./topicLabel");

const CRISIS_SCRIPT = [
  "Thank you for telling me that. What you're feeling right now sounds really serious, and I want to make sure you get support from real people, not just from me — you don't have to carry this alone.",
  "You can call or WhatsApp SADAG's Suicide Crisis Line anytime, day or night: 0800 567 567. It's free and confidential.",
  "If you ever feel like you're in immediate danger, please call 10111 (police) or go to your nearest hospital.",
  "I'm still here too. Would it help to talk about what's going on right now, or would you rather I just sit with you for a bit?",
];

const GBV_CRISIS_SCRIPT = [
  "I'm really sorry you're going through this — what you're describing matters, and it's not your fault.",
  "LifeLine's Gender-Based Violence helpline is free and available 24/7: 0800 150 150. You can also call or WhatsApp them in confidence.",
  "If you're in immediate danger, please call 10111.",
  "Whenever you're ready, I'm here to keep chatting — there's no rush.",
];

async function handleIncomingMessage(container, userId, userText, sendFn) {
  if (isGBV(userText)) {
    for (const line of GBV_CRISIS_SCRIPT) await sendFn(line);
    await appendTurns(container, userId, [
      { role: "user", content: userText },
      { role: "assistant", content: "[Crisis resources provided — GBV variant]" },
    ]);
    return;
  }
  if (isCrisis(userText)) {
    for (const line of CRISIS_SCRIPT) await sendFn(line);
    await appendTurns(container, userId, [
      { role: "user", content: userText },
      { role: "assistant", content: "[Crisis resources provided]" },
    ]);
    return;
  }

  const history = await getHistory(container, userId);
  const messages = [{ role: "system", content: SYSTEM_PROMPT }, ...history, { role: "user", content: userText }];
  const reply = await callLLM(messages);
  const parts = reply.split("|||").map(s => s.trim()).filter(Boolean);
  for (const part of parts) await sendFn(part);

  await appendTurns(container, userId, [
    { role: "user", content: userText },
    { role: "assistant", content: reply },
  ]);

  // update topic label every ~4 turns for follow-up messages
  await maybeUpdateTopicLabel(container, userId, [...history, { role: "user", content: userText }]);
}

module.exports = { handleIncomingMessage };
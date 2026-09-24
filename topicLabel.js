const { callLLM } = require("./ai");

async function maybeUpdateTopicLabel(container, userId, recentMessages) {
  const userTurns = recentMessages.filter(m => m.role === "user");
  if (userTurns.length % 4 !== 0) return; // only run every ~4 user turns

  let summary;
  try {
    summary = await callLLM(
      [
        { role: "system", content: "Summarize what this person is going through in 3-6 simple, everyday words, like a friend would say it (e.g. 'stressed about exams', 'trouble sleeping lately'). No clinical words. Reply with ONLY the phrase."},
        ...recentMessages.slice(-6),
      ],
      {maxTokens: 200, modelOverride: {groq: process.env.GROQ_LABEL_MODEL}}
    );
  } catch {
    return;
  }

  const { resource } = await container.item(userId, userId).read().catch(() => ({ resource: null }));
  if (resource) {
    resource.lastTopicLabel = summary.trim();
    await container.items.upsert(resource);
  }
}

module.exports = { maybeUpdateTopicLabel };
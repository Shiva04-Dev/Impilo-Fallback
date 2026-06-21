async function getHistory(container, userId) {
  const { resource } = await container.item(userId, userId).read().catch(() => ({ resource: null }));
  return resource?.history || [];
}

async function appendTurns(container, userId, newTurns, extraFields = {}) {
  const existing = await getHistory(container, userId);
  // keep the last ~16 messages (8 exchanges) to control token usage — older context isn't critical for a wellbeing check-in bot
  const history = [...existing, ...newTurns].slice(-16);
  await container.items.upsert({
    id: userId,
    userId,
    lastMessageDate: new Date().toISOString(),
    history,
    ...extraFields,
  });
  return history;
}

module.exports = { getHistory, appendTurns };
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

async function resetHistory(container, userId) {
  // Step 1: Read the FULL existing document so we don't lose any fields
  const { resource } = await container.item(userId, userId).read().catch(() => ({ resource: null }));
  
  // Step 2: If no document exists yet, nothing to reset
  if (!resource) return;

  // Step 3: Upsert the full document back, but with history wiped
  // This preserves lastTopicLabel, lastMessageDate, and any other fields
  await container.items.upsert({
    ...resource,          // keep ALL existing fields (lastTopicLabel, etc.)
    history: [],          // only reset the history
    lastMessageDate: new Date().toISOString(), // update the timestamp
  });
}

module.exports = { getHistory, appendTurns, resetHistory };
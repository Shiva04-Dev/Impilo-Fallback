// One document per user in the `users` collection:
// { _id: userId, userId, lang, history, lastMessageDate, lastTopicLabel, createdAt }

const MAX_HISTORY = 16; // last ~8 exchanges, to control token usage

async function getHistory(users, userId) {
  const doc = await users.findOne({ _id: userId }, { projection: { history: 1 } });
  return doc?.history || [];
}

async function appendTurns(users, userId, newTurns, extraFields = {}) {
  const now = new Date();
  // $push with $slice appends and trims in one atomic step.
  // $set only touches the named fields, so lang and lastTopicLabel are preserved.
  const doc = await users.findOneAndUpdate(
    { _id: userId },
    {
      $push: { history: { $each: newTurns, $slice: -MAX_HISTORY } },
      $set: { lastMessageDate: now, ...extraFields },
      $setOnInsert: { userId, createdAt: now },
    },
    { upsert: true, returnDocument: "after", projection: { history: 1 } }
  );
  return doc?.history || [];
}

async function resetHistory(users, userId) {
  // No upsert: if the user has no document yet, there is nothing to reset.
  // Other fields (lang, lastTopicLabel) are preserved.
  await users.updateOne(
    { _id: userId },
    { $set: { history: [], lastMessageDate: new Date() } }
  );
}

module.exports = { getHistory, appendTurns, resetHistory };

const cron = require("node-cron");
const { sendWhatsAppMessage } = require("./whatsapp");
const { callLLM } = require("./ai");
const { SYSTEM_PROMPT } = require("./systemPrompt");

async function getStaleUsers(container, hoursAgo = 48) {
  const cutoff = new Date(Date.now() - hoursAgo * 60 * 60 * 1000).toISOString();
  const query = `SELECT * FROM Users u WHERE u.lastMessageDate < "${cutoff}"`;
  const { resources } = await container.items.query(query).fetchAll();
  return resources;
}

async function sendFollowUp(userId, lastTopicLabel) {
  const reply = await callLLM([
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `(System note: 48 hours have passed since this user last spoke with you. They previously mentioned: "${lastTopicLabel || "how they were feeling"}". Send a warm, brief check-in asking how things have been since.)` },
  ]);
  await sendWhatsAppMessage(userId, reply);
}

function scheduleFollowUps(container) {
  cron.schedule("0 * * * *", async () => {
    const staleUsers = await getStaleUsers(container);
    for (const user of staleUsers) await sendFollowUp(user.userId, user.lastTopicLabel);
  });
}

module.exports = { getStaleUsers, sendFollowUp, scheduleFollowUps };
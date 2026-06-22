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
  const url = `https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  await axios.post(
    url,
    {
      messaging_product: "whatsapp",
      to: userId,
      type: "template",
      template: { name: "hello_world", language: { code: "en_US" } }
    },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN.trim()}` } }
  );
}

function scheduleFollowUps(container) {
  cron.schedule("0 * * * *", async () => {
    const staleUsers = await getStaleUsers(container);
    for (const user of staleUsers) await sendFollowUp(user.userId, user.lastTopicLabel);
  });
}

module.exports = { getStaleUsers, sendFollowUp, scheduleFollowUps };
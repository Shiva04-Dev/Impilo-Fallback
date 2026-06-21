require("dotenv").config();
const express = require("express");
const { CosmosClient } = require("@azure/cosmos");
const { handleIncomingMessage } = require("./conversation");
const { sendWhatsAppMessage } = require("./whatsapp");
const { scheduleFollowUps, getStaleUsers, sendFollowUp } = require("./followup");

const app = express();
app.use(express.json());
app.use(express.static("public")); // serves chat-demo.html at /chat-demo.html

const cosmos = new CosmosClient({ endpoint: process.env.COSMOS_ENDPOINT, key: process.env.COSMOS_KEY });
const container = cosmos.database("Impilo").container("Users");

// Real WhatsApp webhook (dormant until business verification clears)
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
});

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);
  try {
    const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!message) return;
    const userId = message.from;
    const userText = message.text?.body || "";
    await handleIncomingMessage(container, userId, userText, (text) => sendWhatsAppMessage(userId, text));
  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);
  }
});

// Custom chat front-end endpoint (the one actually in use right now)
app.post("/demo/chat", async (req, res) => {
  const { userId, message } = req.body;
  const outgoing = [];
  await handleIncomingMessage(container, userId, message, async (text) => { outgoing.push(text); });
  res.json({ messages: outgoing });
});

// Manual follow-up trigger, for demo/recording purposes
app.post("/admin/trigger-followup", async (req, res) => {
  const staleUsers = await getStaleUsers(container);
  for (const user of staleUsers) await sendFollowUp(user.userId, user.lastTopicLabel);
  res.json({ messaged: staleUsers.length });
});

scheduleFollowUps(container); // real hourly cron check, runs alongside the manual trigger above

app.listen(process.env.PORT || 3000, () => console.log(`Impilo running on port ${process.env.PORT || 3000}`));
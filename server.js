require("dotenv").config({ quiet: true });
const express = require("express");
const { connectDB } = require("./db");
const { handleIncomingMessage } = require("./conversation");
const { sendWhatsAppMessage } = require("./whatsapp");
const { scheduleFollowUps, getStaleUsers, sendFollowUp } = require("./followup");

const app = express();
app.use(express.json());
app.use(express.static("public")); // serves chat-demo.html at /chat-demo.html

let users, webSessions; // MongoDB collections, set in start() below

function requireAdminKey(req, res, next) {
  if (!process.env.ADMIN_KEY || req.headers["x-admin-key"] !== process.env.ADMIN_KEY) return res.sendStatus(401);
  next();
}

const demoChatHits = new Map(); // ip -> { start, count }
function demoChatLimiter(req, res, next) {
  const windowMs = 60_000;
  const max = 10;
  const now = Date.now();
  const entry = demoChatHits.get(req.ip);
  if (!entry || now - entry.start > windowMs) {
    demoChatHits.set(req.ip, { start: now, count: 1 });
    return next();
  }
  if (entry.count >= max) return res.status(429).json({ error: "Too many requests, please slow down." });
  entry.count++;
  next();
}

// Remove expired rate-limit entries every minute so the map doesn't grow forever
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of demoChatHits) {
    if (now - entry.start > 60_000) demoChatHits.delete(ip);
  }
}, 60_000).unref();

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
    await handleIncomingMessage(users, userId, userText, (text) => sendWhatsAppMessage(userId, text));
  } catch (err) {
    console.error("Webhook error:", err.response?.data || err.message);
  }
});

// Custom chat front-end endpoint (the one actually in use right now)
app.post("/demo/chat", demoChatLimiter, async (req, res) => {
  const { userId, message } = req.body ?? {};
  // Web chats may only use web- IDs, and live in their own collection,
  // so the website can never read or change a WhatsApp user's data.
  if (typeof userId !== "string" || !userId.startsWith("web-") || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Invalid request" });
  }
  try {
    const outgoing = [];
    await handleIncomingMessage(webSessions, userId, message, async (text) => { outgoing.push(text); });
    res.json({ messages: outgoing });
  } catch (err) {
    console.error("Demo chat error:", err.message);
    if (!res.headersSent) res.status(500).json({ error: "Something went wrong. Please try again." });
  }
});

// Manual follow-up trigger, for demo/recording purposes
app.post("/admin/trigger-followup", requireAdminKey, async (req, res) => {
  const staleUsers = await getStaleUsers(users);
  for (const user of staleUsers) await sendFollowUp(user.userId, user.lastTopicLabel);
  res.json({ messaged: staleUsers.length });
});

// scheduleFollowUps(users); // real hourly cron check, runs alongside the manual trigger above

async function start() {
  ({ users, webSessions } = await connectDB());
  app.listen(process.env.PORT || 3000, () => console.log(`Impilo running on port ${process.env.PORT || 3000}`));
}

start().catch((err) => {
  console.error("Failed to start Impilo:", err.message);
  process.exit(1);
});
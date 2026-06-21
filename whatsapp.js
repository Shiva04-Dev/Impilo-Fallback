require("dotenv").config();
const axios = require("axios");

async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  console.log("FINAL HEADER:", `Bearer ${process.env.WHATSAPP_TOKEN.trim()}`.slice(0, 15));
  await axios.post(
    url,
    { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN.trim()}` } }
  );
}

module.exports = { sendWhatsAppMessage };
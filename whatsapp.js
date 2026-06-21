require("dotenv").config();
const axios = require("axios");

async function sendWhatsAppMessage(to, text) {
  const url = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  console.log("Token length:", process.env.WHATSAPP_TOKEN?.length);
  console.log("Token starts/ends:", process.env.WHATSAPP_TOKEN?.slice(0,5), "...", process.env.WHATSAPP_TOKEN?.slice(-5));
  await axios.post(
    url,
    { messaging_product: "whatsapp", to, type: "text", text: { body: text } },
    { headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` } }
  );
}

module.exports = { sendWhatsAppMessage };
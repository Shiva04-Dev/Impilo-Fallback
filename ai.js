require("dotenv").config();
const axios = require("axios");

async function callLLM(messages) {
  if (process.env.AOAI_ENDPOINT) {
    const url = `${process.env.AOAI_ENDPOINT}/openai/deployments/${process.env.AOAI_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`;
    const res = await axios.post(
      url,
      { messages, max_tokens: 300 },
      { headers: { "api-key": process.env.AOAI_KEY, "Content-Type": "application/json" } }
    );
    return res.data.choices[0].message.content;
  }

}

module.exports = { callLLM };
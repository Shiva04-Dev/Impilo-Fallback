require("dotenv").config({ quiet: true });
const axios = require("axios");

const PROVIDERS = {
  groq: (opts) => process.env.GROQ_API_KEY && {
    url: "https://api.groq.com/openai/v1/chat/completions",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    model: opts.modelOverride?.groq || process.env.GROQ_MODEL,
    extra: process.env.GROQ_REASONING_EFFORT
      ? { reasoning_effort: process.env.GROQ_REASONING_EFFORT }
      : {},
  },
  groq_backup: (opts) => process.env.GROQ_API_KEY && process.env.GROQ_BACKUP_MODEL && {
    url: "https://api.groq.com/openai/v1/chat/completions",
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    model: opts.modelOverride?.groq_backup || process.env.GROQ_BACKUP_MODEL,
    extra: {},
  },
  azure: () => process.env.AOAI_ENDPOINT && {
    url: `${process.env.AOAI_ENDPOINT}/openai/deployments/${process.env.AOAI_DEPLOYMENT}/chat/completions?api-version=2024-08-01-preview`,
    headers: { "api-key": process.env.AOAI_KEY },
    model: undefined,
    extra: {},
  },
};

const ORDER = (process.env.LLM_PROVIDERS || "groq,cerebras,azure")
  .split(",").map((s) => s.trim());

const MAX_BUDGET = 2000;  // hard ceiling so retries can't burn your free quota
const MAX_ATTEMPTS = 2;   // first try + one silent re-run per provider

async function requestOnce(cfg, messages, maxTokens) {
  const body = { messages, max_tokens: maxTokens, ...cfg.extra };
  if (cfg.model) body.model = cfg.model;

  const res = await axios.post(cfg.url, body, {
    headers: { ...cfg.headers, "Content-Type": "application/json" },
    timeout: 30000,
  });

  const choice = res.data?.choices?.[0];
  let text = choice?.message?.content ?? "";

  // Some models (e.g. Qwen) put their reasoning inside <think> tags in the content.
  // Strip closed blocks, and any unclosed block left by a cutoff.
  text = text
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<think>[\s\S]*$/, "")
    .trim();

  return { text, finish: choice?.finish_reason };
}

function isComplete({ text, finish }) {
  return text.length > 0 && finish !== "length";
}

// Last resort: keep everything up to the final complete sentence,
// but only if that keeps most of the reply (avoids sending a stub).
function trimToLastSentence(text) {
  const lastEnd = Math.max(
    text.lastIndexOf("."), text.lastIndexOf("!"),
    text.lastIndexOf("?"), text.lastIndexOf("…")
  );
  if (lastEnd < text.length * 0.6) return null;
  return text.slice(0, lastEnd + 1).replace(/\|\|\|\s*$/, "").trim();
}

async function callLLM(messages, opts = {}) {
  const errors = [];

  for (const name of ORDER) {
    const cfg = PROVIDERS[name]?.(opts);
    if (!cfg) continue;

    try {
      let budget = opts.maxTokens ?? 300;
      let result;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        result = await requestOnce(cfg, messages, budget);
        if (isComplete(result)) return result.text;

        console.warn(
          `[LLM] ${name} incomplete (finish=${result.finish}, chars=${result.text.length}, ` +
          `budget=${budget}) — attempt ${attempt}/${MAX_ATTEMPTS}`
        );
        budget = Math.min(budget * 2, MAX_BUDGET);
      }

      const salvaged = trimToLastSentence(result.text);
      if (salvaged) {
        console.warn(`[LLM] ${name} returned trimmed reply after retries`);
        return salvaged;
      }
      errors.push(`${name}: incomplete after ${MAX_ATTEMPTS} attempts`);
    } catch (err) {
      const detail = err.response?.data?.error?.message || err.response?.data?.message || "";
      errors.push(`${name}: ${err.response?.status || err.code || err.message} ${detail}`);
    }
  }

  throw new Error(`All LLM providers failed → ${errors.join(" | ")}`);
}

module.exports = { callLLM };
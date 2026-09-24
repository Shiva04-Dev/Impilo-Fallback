// test-llm.js — run with: node test-llm.js
// Uses real API calls (~10 requests). Don't run it in a loop: it uses your free quota.
require("dotenv").config({ quiet: true });
const { callLLM } = require("./ai");
const { getSystemPrompt } = require("./systemPrompt");

// ---------- tiny test harness ----------
const results = [];
const capturedWarnings = [];
const originalWarn = console.warn;
console.warn = (...args) => {
  capturedWarnings.push(args.join(" "));
  originalWarn(...args);
};

async function test(name, fn) {
  const start = Date.now();
  process.stdout.write(`\n▶ ${name}\n`);
  try {
    await fn();
    const ms = Date.now() - start;
    results.push({ name, ok: true, ms });
    console.log(`  ✅ PASS (${ms} ms)`);
  } catch (err) {
    const ms = Date.now() - start;
    results.push({ name, ok: false, ms, error: err.message });
    console.log(`  ❌ FAIL (${ms} ms): ${err.message}`);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function preview(text, max = 300) {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? oneLine.slice(0, max) + "…" : oneLine;
}

// ---------- config check ----------
function printConfig() {
  console.log("=== LLM config ===");
  console.log("LLM_PROVIDERS        :", process.env.LLM_PROVIDERS || "(default: groq,cerebras,azure)");
  console.log("GROQ_API_KEY         :", process.env.GROQ_API_KEY ? "set" : "MISSING");
  console.log("GROQ_MODEL           :", process.env.GROQ_MODEL || "MISSING");
  console.log("GROQ_LABEL_MODEL     :", process.env.GROQ_LABEL_MODEL || "MISSING");
  console.log("GROQ_REASONING_EFFORT:", process.env.GROQ_REASONING_EFFORT || "(not set)");
  console.log("CEREBRAS_API_KEY     :", process.env.CEREBRAS_API_KEY ? "set" : "not set");
  console.log("CEREBRAS_MODEL       :", process.env.CEREBRAS_MODEL || "not set");
}

// ---------- tests ----------
async function run() {
  printConfig( console.log("GROQ_BACKUP_MODEL    :", process.env.GROQ_BACKUP_MODEL || "not set"));

  // 1. Basic reply
  await test("1. Basic reply", async () => {
    const reply = await callLLM(
      [{ role: "user", content: "Reply with one short friendly sentence." }],
      { maxTokens: 800 }
    );
    assert(typeof reply === "string", "reply is not a string");
    assert(reply.trim().length > 0, "reply is empty");
    console.log("  Reply:", preview(reply));
  });

  // 2 + 3. Impilo system prompt in each language, plus ||| split check
  const langCases = [
    { lang: "en", text: "Hi. I've been feeling really tired and stressed about exams lately." },
    { lang: "af", text: "Hallo. Ek voel baie moeg en gestres oor my eksamens die laaste tyd." },
    { lang: "zu", text: "Sawubona. Ngizizwa ngikhathele kakhulu futhi ngikhathazekile ngezivivinyo zami muva nje." },
  ];

  for (const { lang, text } of langCases) {
    await test(`2. Impilo prompt — ${lang.toUpperCase()}`, async () => {
      const reply = await callLLM(
        [
          { role: "system", content: getSystemPrompt(lang) },
          { role: "user", content: text },
        ],
        { maxTokens: 800 }
      );
      assert(reply.trim().length > 0, "reply is empty");
      assert(!/<think>/i.test(reply), "reply still contains <think> reasoning text");

      // 3. ||| splitting — same logic as conversation.js
      const parts = reply.split("|||").map((s) => s.trim()).filter(Boolean);
      assert(parts.length > 0, "no message parts after splitting on |||");
      parts.forEach((p, i) => console.log(`  [${lang} part ${i + 1}] ${preview(p, 200)}`));

      const longParts = parts.filter((p) => p.length > 400);
      if (longParts.length) {
        console.log(`  ⚠️ ${longParts.length} part(s) over 400 chars — prompt's "1-3 sentences" rule may be ignored`);
      }
    });
  }

  // 4. Topic label with the small model
  await test("4. Topic label (small model)", async () => {
    const label = await callLLM(
      [
        { role: "system", content: "Summarize what this person is going through in 3-6 words, plain language. Reply with ONLY the phrase." },
        { role: "user", content: "I can't sleep because I keep worrying about failing my final exams." },
      ],
      { maxTokens: 200, modelOverride: { groq: process.env.GROQ_LABEL_MODEL } }
    );
    const words = label.trim().split(/\s+/).length;
    console.log(`  Label: "${label.trim()}" (${words} words)`);
    assert(label.trim().length > 0, "label is empty");
    if (words > 10) console.log("  ⚠️ label is longer than expected — model may be ignoring the 3-6 word rule");
  });

  // 5. Truncation retry — force a tiny budget so the retry logic must run
  await test("5. Truncation retry (forced tiny budget)", async () => {
    const warningsBefore = capturedWarnings.length;
    let outcome;
    try {
      const reply = await callLLM(
        [{ role: "user", content: "Explain in three sentences why sleep matters for students." }],
        { maxTokens: 30 }
      );
      outcome = `returned reply: "${preview(reply, 150)}"`;
    } catch (err) {
      // Acceptable: every provider still incomplete after retries → clean error
      outcome = `threw cleanly: ${err.message}`;
    }
    const newWarnings = capturedWarnings.slice(warningsBefore);
    console.log(`  Outcome: ${outcome}`);
    assert(
      newWarnings.some((w) => w.includes("[LLM]") && w.includes("incomplete")),
      "no '[LLM] ... incomplete' warning logged — retry logic did not run (or the model fit in 30 tokens)"
    );
    console.log(`  Retry warnings logged: ${newWarnings.length}`);
  });

  // 6. Total failure — bad model IDs everywhere
  await test("6. All providers fail → clean error", async () => {
    let threw = false;
    try {
      await callLLM(
        [{ role: "user", content: "Hello" }],
        { modelOverride: { groq: "does-not-exist", groq_backup: "does-not-exist", cerebras: "does-not-exist" } }
      );
    } catch (err) {
      threw = true;
      console.log(`  Error message: ${err.message}`);
      assert(err.message.startsWith("All LLM providers failed"), "error message has unexpected format");
    }
    assert(threw, "callLLM did not throw when every provider had a bad model");
  });

  // ---------- summary ----------
  console.warn = originalWarn;
  const passed = results.filter((r) => r.ok).length;
  console.log("\n=== Summary ===");
  results.forEach((r) =>
    console.log(`${r.ok ? "✅" : "❌"} ${r.name} (${r.ms} ms)${r.ok ? "" : " — " + r.error}`)
  );
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
}

run();
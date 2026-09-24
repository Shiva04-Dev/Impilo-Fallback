// test-db.js — run with: node test-db.js
// Uses a separate test database and one test user, and deletes them afterwards.
require("dotenv").config({ quiet: true });
process.env.MONGODB_DB = "impilo_test"; // never touch the real database

const { connectDB, closeDB } = require("./db");
const { getHistory, appendTurns, resetHistory } = require("./history");
const { getStoredLanguage, setStoredLanguage } = require("./language");
const { getStaleUsers } = require("./followup");

const TEST_USER = "test-user-db-check";
const WEB_USER = "web-test-user-db-check";
const results = [];

async function test(name, fn) {
  try {
    await fn();
    results.push(true);
    console.log(`✅ ${name}`);
  } catch (err) {
    results.push(false);
    console.log(`❌ ${name}: ${err.message}`);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg); }

(async () => {
  const users = await connectDB();
  await users.deleteMany({ _id: { $in: [TEST_USER, WEB_USER] } });

  await test("New user has empty history and no language", async () => {
    assert((await getHistory(users, TEST_USER)).length === 0, "history not empty");
    assert((await getStoredLanguage(users, TEST_USER)) === null, "language not null");
  });

  await test("Language is saved and read back", async () => {
    await setStoredLanguage(users, TEST_USER, "zu");
    assert((await getStoredLanguage(users, TEST_USER)) === "zu", "expected zu");
  });

  await test("appendTurns adds messages", async () => {
    const h = await appendTurns(users, TEST_USER, [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
    assert(h.length === 2, `expected 2 messages, got ${h.length}`);
  });

  await test("History is trimmed to the last 16 messages", async () => {
    for (let i = 0; i < 10; i++) {
      await appendTurns(users, TEST_USER, [
        { role: "user", content: `u${i}` },
        { role: "assistant", content: `a${i}` },
      ]);
    }
    const h = await getHistory(users, TEST_USER);
    assert(h.length === 16, `expected 16, got ${h.length}`);
    assert(h[h.length - 1].content === "a9", "newest message is not last");
  });

  await test("appendTurns keeps lastTopicLabel and lang (old Cosmos bug)", async () => {
    await users.updateOne({ _id: TEST_USER }, { $set: { lastTopicLabel: "stressed about exams" } });
    await appendTurns(users, TEST_USER, [{ role: "user", content: "x" }]);
    const doc = await users.findOne({ _id: TEST_USER });
    assert(doc.lastTopicLabel === "stressed about exams", "lastTopicLabel was wiped");
    assert(doc.lang === "zu", "lang was wiped");
  });

  await test("resetHistory clears history but keeps lang and label", async () => {
    await resetHistory(users, TEST_USER);
    const doc = await users.findOne({ _id: TEST_USER });
    assert(doc.history.length === 0, "history not cleared");
    assert(doc.lang === "zu", "lang lost on reset");
    assert(doc.lastTopicLabel === "stressed about exams", "label lost on reset");
  });

  await test("Stale-user query finds old WhatsApp users but skips web- users", async () => {
    await appendTurns(users, WEB_USER, [{ role: "user", content: "hi" }]);
    const old = new Date(Date.now() - 72 * 60 * 60 * 1000);
    await users.updateMany({ _id: { $in: [TEST_USER, WEB_USER] } }, { $set: { lastMessageDate: old } });
    const stale = (await getStaleUsers(users)).map(u => u.userId);
    assert(stale.includes(TEST_USER), "old WhatsApp user not found");
    assert(!stale.includes(WEB_USER), "web- user should be excluded");
  });

  await users.deleteMany({ _id: { $in: [TEST_USER, WEB_USER] } });
  await closeDB();

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} passed`);
  process.exit(passed === results.length ? 0 : 1);
})().catch(async (err) => {
  console.error("Test run failed:", err.message);
  await closeDB();
  process.exit(1);
});

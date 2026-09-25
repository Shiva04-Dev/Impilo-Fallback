const { MongoClient } = require("mongodb");

let client;

// Connects once at startup and returns two collections:
// - users:       WhatsApp users (identified by phone number)
// - webSessions: website test chats (identified by a random web-<uuid> per browser)
async function connectDB() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set in .env");

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const db = client.db(process.env.MONGODB_DB || "impilo");
  const users = db.collection("users");
  const webSessions = db.collection("web_sessions");

  // Speeds up the follow-up query (users inactive for 48h+)
  await users.createIndex({ lastMessageDate: 1 });

  console.log(`Connected to MongoDB (database: ${db.databaseName})`);
  return { users, webSessions };
}

async function closeDB() {
  await client?.close();
}

module.exports = { connectDB, closeDB };

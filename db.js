const { MongoClient } = require("mongodb");

let client;

// Connects once at startup and returns the `users` collection.
// Every other module receives this collection where it used to receive the Cosmos container.
async function connectDB() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set in .env");

  client = new MongoClient(process.env.MONGODB_URI);
  await client.connect();

  const db = client.db(process.env.MONGODB_DB || "impilo");
  const users = db.collection("users");

  // Speeds up the follow-up query (users inactive for 48h+)
  await users.createIndex({ lastMessageDate: 1 });

  console.log(`Connected to MongoDB (database: ${db.databaseName})`);
  return users;
}

async function closeDB() {
  await client?.close();
}

module.exports = { connectDB, closeDB };

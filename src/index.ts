// Load environment variables first
import dotenv from "dotenv";
dotenv.config();
import { dirname } from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

import fs from "fs";
function logToFile(message: string) {
  fs.appendFile("debug.log", message + "\n", (err) => {
    if (err) console.error("Error writing log:", err);
  });
}

import { Bot } from "grammy";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import { join } from "path";
import OpenAI from "openai";

const openai = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// Initialize Bot
const bot = new Bot(process.env.BOT_TOKEN!);

async function queryDeepSeek(prompt: string): Promise<string> {
  try {
    const completion = await openai.chat.completions.create({
      messages: [{ role: "system", content: prompt }],
      model: "deepseek-chat",
    });

    return completion.choices[0].message.content as string;
  } catch (error: any) {
    console.error("DeepSeek API Error:", error);
    if (error.response) {
      // Attempt to log the raw response text
      const rawText = await error.response
        .text()
        .catch(() => "No response body");
      console.error("Raw response body:", rawText);
      logToFile(`DeepSeek API Error: ${error}\nRaw response: ${rawText}`);
    }
    return "Sorry, I couldn't process your request.";
  }
}

bot.on("message:text", async (ctx) => {
  const userId = ctx.from?.id;
  console.log("User ID:", userId);

  if (!userId) return;

  // Fetch user data
  let user = db.data!.users.find((u) => u.id === userId);
  if (!user) {
    user = { id: userId, requests: 0 };
    db.data!.users.push(user);
  }

  // Check usage threshold
  const maxRequests = parseInt(process.env.MAX_REQUESTS_PER_USER!);
  if (user.requests >= maxRequests) {
    await ctx.reply("You've reached your usage limit. Please try again later.");
    return;
  }

  // Increment request count
  user.requests += 1;
  await db.write();

  // Query DeepSeek
  const userMessage = ctx.message.text;
  const botResponse = await queryDeepSeek(userMessage);
  //   const botResponse =
  //     "Hello, I am a bot. I am here to help you with your queries. Please ask me anything.";

  // Respond to user
  await ctx.reply(botResponse);
});

// Set up LowDB
interface User {
  id: number;
  requests: number;
  note?: string;
}

interface Data {
  users: User[];
}

const file = join(__dirname, "..", "data.json");
const adapter = new JSONFile<Data>(file);
const db = new Low<Data>(adapter, { users: [] });

bot.command("start", async (ctx) => {
  console.log("Received /start command");
  await ctx.reply(
    "Hello! I'm your DeepSeek-powered chat bot. Ask me anything."
  );
});

bot.catch((err) => {
  console.error("Bot encountered an error:", err);
});

(async () => {
  await db.read();
  if (!db.data) {
    db.data = { users: [] };
  } else if (!Array.isArray(db.data.users)) {
    // If users is not an array, reinitialize it as an empty array.
    db.data.users = [];
  }
  await db.write();
  // Start the bot only after db is ready.
  bot.start();
  console.log("Bot has started and is ready to receive updates.");
})();

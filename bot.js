const { Client, GatewayIntentBits } = require("discord.js");
const fetch = require("node-fetch");
const express = require("express");
const jwt = require("jsonwebtoken");

// Load env vars
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const WEBHOOK_URL = process.env.N8N_WEBHOOK;
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const JWT_SECRET = process.env.JWT_SECRET;

// Initialize Discord bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

client.on("ready", () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Only forward messages from the target channel
  if (message.channel.id !== TARGET_CHANNEL_ID) return;

  // Start typing indicator
  await message.channel.sendTyping();

  // Keep typing indicator alive during processing
  const typingInterval = setInterval(() => {
    message.channel.sendTyping().catch(() => {
      // Ignore errors if channel becomes unavailable
      clearInterval(typingInterval);
    });
  }, 5000); // Discord typing indicator lasts ~10 seconds, refresh every 5

  const payload = {
    content: message.content,
    author: message.author.username,
    channel: message.channel.name,
    time: message.createdAt,
  };

  // Generate JWT token
  const token = jwt.sign(
    {
      bot: "discord-forwarder",
      timestamp: Date.now(),
      payload: payload,
    },
    JWT_SECRET,
    { expiresIn: "5m" } // Token expires in 5 minutes
  );

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    console.log("✅ Sent to n8n:", message.content);
  } catch (err) {
    console.error("❌ Error sending to n8n:", err.message);
  } finally {
    // Stop typing indicator
    clearInterval(typingInterval);
  }
});

// Start the bot
client.login(DISCORD_TOKEN);

// ✅ Fake Express server to keep Render free
const app = express();
app.get("/", (_, res) => res.send("Bot is running!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Fake server running on port ${PORT}`);
});

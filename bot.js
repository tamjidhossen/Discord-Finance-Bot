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

  // Minimal typing indicator (reduce CPU usage)
  message.channel.sendTyping();

  try {
    // Detect message type and create enhanced payload
    const messageType = detectMessageType(message);
    const payload = createEnhancedPayload(message, messageType);

    // Generate JWT token
    const token = jwt.sign(
      {
        bot: "discord-forwarder",
        timestamp: Date.now(),
        messageType: messageType,
        payload: payload,
      },
      JWT_SECRET,
      { expiresIn: "5m" }
    );

    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Message-Type": messageType, // For n8n routing
      },
      body: JSON.stringify(payload),
    });

    console.log(`✅ ${messageType}:`, message.content?.slice(0, 50) || `[${messageType}]`);
  } catch (err) {
    console.error(`❌ ${detectMessageType(message)}:`, err.message);
  }
});

// Message type detection function
function detectMessageType(message) {
  if (message.attachments.size > 0) {
    // Check for images first
    const hasImages = message.attachments.some(
      (att) => att.contentType && att.contentType.startsWith("image/")
    );
    if (hasImages) {
      return "image";
    }

    // Check for voice/audio files
    const hasVoice = message.attachments.some(
      (att) =>
        att.contentType?.startsWith("audio/") ||
        /\.(ogg|mp3|wav|webm)$/i.test(att.name)
    );
    if (hasVoice) {
      return "voice";
    }
  }

  // Default to text for pure text or other file types
  return "text";
}

// Create enhanced payload with URLs for media
function createEnhancedPayload(message, messageType) {
  const basePayload = {
    content: message.content || "",
    author: message.author.username,
    channel: message.channel.name,
    time: message.createdAt,
    messageType: messageType,
    messageId: message.id,
    channelId: message.channel.id,
    guildId: message.guild?.id || null,
    attachmentCount: message.attachments.size,
  };

  if (messageType === "image") {
    // Handle multiple images
    const images = message.attachments
      .filter((att) => att.contentType && att.contentType.startsWith("image/"))
      .map((att) => ({
        url: att.url,
        proxyUrl: att.proxyURL,
        filename: att.name,
        size: att.size,
        width: att.width,
        height: att.height,
        contentType: att.contentType,
      }));

    return {
      ...basePayload,
      images: images,
      imageCount: images.length,
    };
  }

  if (messageType === "voice") {
    // grab only the audio attachments
    const voiceAttachments = message.attachments.filter((att) =>
      att.contentType?.startsWith("audio/") ||
      /\.(ogg|mp3|wav|webm)$/i.test(att.name)
    );

    // nothing to do?
    if (!voiceAttachments.size) return basePayload;

    const voice = voiceAttachments.first(); 

    return {
      ...basePayload,
      voice: {
        url: voice.url,
        proxyUrl: voice.proxyURL,
        filename: voice.name,
        size: voice.size,
        contentType: voice.contentType,
        duration: voice.duration,
        waveform: voice.waveform,
      },
    };
  }

  // For text messages, include any non-media attachments
  if (message.attachments.size > 0) {
    basePayload.attachments = message.attachments.map((att) => ({
      url: att.url,
      filename: att.name,
      size: att.size,
      contentType: att.contentType,
    }));
  }

  return basePayload;
}

// Start the bot
client.login(DISCORD_TOKEN);

// ✅ Fake Express server to keep Render free
const app = express();
app.get("/", (_, res) => res.send("Bot is running!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Fake server running on port ${PORT}`);
});

// Export functions for testing
module.exports = {
  detectMessageType,
  createEnhancedPayload,
};

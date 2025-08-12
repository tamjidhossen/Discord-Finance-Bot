const { Client, GatewayIntentBits } = require("discord.js");
const fetch = require("node-fetch");
const express = require("express");
const jwt = require("jsonwebtoken");

// Load env vars
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const FINANCE_WEBHOOK = process.env.N8N_WEBHOOK;
const FINANCE_CHANNEL_ID = process.env.TARGET_CHANNEL_ID;
const YOUTUBE_WEBHOOK = process.env.YOUTUBE_WEBHOOK;
const YOUTUBE_CHANNEL_ID = process.env.YOUTUBE_CHANNEL_ID;
const JWT_SECRET = process.env.JWT_SECRET;

// Channel configuration
const CHANNEL_CONFIGS = {
  [FINANCE_CHANNEL_ID]: {
    webhook: FINANCE_WEBHOOK,
    type: 'finance',
    name: 'Finance Tracker'
  },
  [YOUTUBE_CHANNEL_ID]: {
    webhook: YOUTUBE_WEBHOOK,
    type: 'youtube',
    name: 'YouTube Fetcher'
  }
};

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
  console.log(`📊 Monitoring ${Object.keys(CHANNEL_CONFIGS).length} channels:`);
  Object.entries(CHANNEL_CONFIGS).forEach(([channelId, config]) => {
    console.log(`  - ${config.name}`);
  });
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Check if message is from any monitored channel
  const channelConfig = CHANNEL_CONFIGS[message.channel.id];
  if (!channelConfig) return;

  // Minimal typing indicator
  message.channel.sendTyping();

  try {
    // Create payload based on channel type
    let payload;
    let messageType;

    if (channelConfig.type === 'finance') {
      messageType = detectMessageType(message);
      payload = createFinancePayload(message, messageType);
    } else if (channelConfig.type === 'youtube') {
      messageType = 'youtube_request';
      payload = createYouTubePayload(message);
    }

    // Generate JWT token
    const token = jwt.sign(
      {
        bot: "discord-forwarder",
        timestamp: Date.now(),
        channelType: channelConfig.type,
        messageType: messageType,
        payload: payload,
      },
      JWT_SECRET,
      { expiresIn: "5m" }
    );

    await fetch(channelConfig.webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Message-Type": messageType,
        "X-Channel-Type": channelConfig.type,
      },
      body: JSON.stringify(payload),
    });

    console.log(`✅ [${channelConfig.name}] ${messageType}:`, message.content?.slice(0, 50) || `[${messageType}]`);
  } catch (err) {
    console.error(`❌ [${channelConfig.name}] ${messageType}:`, err.message);
  }
});

// Message type detection function (for finance channel)
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

// Create finance payload (existing function)
function createFinancePayload(message, messageType) {
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
    const voiceAttachments = message.attachments.filter((att) =>
      att.contentType?.startsWith("audio/") ||
      /\.(ogg|mp3|wav|webm)$/i.test(att.name)
    );

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

// Create YouTube payload (new function)
function createYouTubePayload(message) {
  return {
    content: message.content || "",
    author: message.author.username,
    channel: message.channel.name,
    time: message.createdAt,
    messageType: 'youtube_request',
    messageId: message.id,
    channelId: message.channel.id,
    guildId: message.guild?.id || null,
    youtubeChannelName: message.content.trim(), // The channel name user typed
  };
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
  createFinancePayload,
  createYouTubePayload,
};

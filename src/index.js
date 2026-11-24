"use strict";
const TelegramBot = require("node-telegram-bot-api");
const mongoose = require("mongoose");
const config = require("./config");
const db = require("./db");
const { createApp } = require("./app");

if (!config.BOT_TOKEN) { console.error("❌ BOT_TOKEN .env da yo'q!"); process.exit(1); }
if (!config.ADMIN_IDS.length) console.warn("⚠️ ADMIN_IDS bo'sh — arizalarni ko'radigan admin yo'q!");
if (!config.CHANNEL_ID) console.warn("⚠️ CHANNEL_ID bo'sh — tasdiqlangan e'lonlar kanalga chiqmaydi!");

mongoose.connect(config.MONGO_URI)
  .then(() => console.log("✅ MongoDB ga ulandi!"))
  .catch((e) => { console.error("❌ MongoDB xatosi:", e.message); process.exit(1); });

const bot = new TelegramBot(config.BOT_TOKEN, { polling: true });
const app = createApp({ bot, db, config });

const run = (name, fn) => (...args) => Promise.resolve(fn(...args)).catch((e) => console.error(`${name} xatosi:`, e));
const command = (name, fn) => bot.onText(new RegExp(`^\\/${name}(?:@\\w+)?(?:\\s.*)?$`, "i"), run(name, (msg) => msg.chat.type === "private" && fn(msg)));

command("start", app.onStart);
command("help", app.onHelp);
command("id", app.onId);
command("cancel", app.onCancel);
command("admin", app.onAdmin);
bot.on("message", run("message", app.onMessage));
bot.on("callback_query", run("callback", app.onCallback));
bot.on("polling_error", (e) => console.error("Polling xato:", e.message));
process.on("unhandledRejection", (r) => console.error("Unhandled:", r));

bot.getMe().then((m) => console.log(`✅ Bot ishga tushdi: @${m.username}`));

"use strict";
require("dotenv").config();

const ids = (process.env.ADMIN_IDS || "")
  .split(",")
  .map((s) => Number(s.trim()))
  .filter((n) => Number.isFinite(n) && n !== 0);

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  MONGO_URI: process.env.MONGO_URI || "mongodb://localhost:27017/ustoz_shogird",
  ADMIN_IDS: ids,
  CHANNEL_ID: process.env.CHANNEL_ID || "",
  CHANNEL_TITLE: process.env.CHANNEL_TITLE || "Ustoz-Shogird",
};

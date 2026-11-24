"use strict";

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const ALIAS = { "c++": "cpp", "c#": "csharp", ".net": "dotnet", "node.js": "nodejs", "react.js": "react", "vue.js": "vue", "next.js": "nextjs" };

function techTags(value) {
  return String(value || "")
    .split(/[,;/\n]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .map((s) => ALIAS[s] || s.replace(/[^a-z0-9_]/g, ""))
    .filter((t) => t.length >= 2)
    .slice(0, 5)
    .map((t) => "#" + t);
}

function regionTag(value) {
  const t = String(value || "")
    .replace(/['‘’ʻʼ`]/g, "")
    .replace(/[^\p{L}\p{N}_]+/gu, "_")
    .replace(/^_+|_+$/g, "");
  return t ? ["#" + t] : [];
}

function hashtags(cat, answers) {
  return [...new Set(["#" + cat.tag, ...techTags(answers.texnologiya), ...regionTag(answers.hudud)])].join(" ");
}

// Kanalga chiqadigan e'lon matni (skrinshotdagi ko'rinish)
function renderPost(cat, answers) {
  const lines = cat.fields.map((fl) => {
    const v = esc(answers[fl.key] ?? "—");
    return `${fl.emoji} ${fl.label}: ${fl.bold ? `<b>${v}</b>` : v}`;
  });
  return `<b>${cat.title}</b>\n\n${lines.join("\n")}\n\n${hashtags(cat, answers)}`;
}

const fullName = (a) => [a.firstName, a.lastName].filter(Boolean).join(" ") || a.username || String(a.userId);

// Adminga boradigan xabar
function adminText(app, cat, statusLine) {
  const who = `<a href="tg://user?id=${app.userId}">${esc(fullName(app))}</a>${app.username ? ` (@${esc(app.username)})` : ""}`;
  return (
    `📥 <b>Yangi e'lon #${app.number}</b>\n\n${renderPost(cat, app.answers)}\n\n` +
    `👤 Yuboruvchi: ${who}\n🆔 <code>${app.userId}</code>` +
    (statusLine ? `\n\n${statusLine}` : "")
  );
}

function channelLink(channelId, messageId) {
  const id = String(channelId || "");
  if (id.startsWith("@")) return `https://t.me/${id.slice(1)}/${messageId}`;
  const m = id.match(/^-100(\d+)$/);
  return m ? `https://t.me/c/${m[1]}/${messageId}` : null;
}

module.exports = { esc, hashtags, renderPost, adminText, channelLink, fullName };

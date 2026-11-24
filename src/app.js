"use strict";
const { CATEGORIES, BY_KEY, BY_LABEL } = require("./categories");
const fmt = require("./format");

const BTN = { CANCEL: "❌ Bekor qilish", YES: "Ha", NO: "Yo'q" };

const mainKeyboard = () => ({
  keyboard: [
    [CATEGORIES[0].label, CATEGORIES[1].label],
    [CATEGORIES[2].label, CATEGORIES[3].label],
    [CATEGORIES[4].label],
  ],
  resize_keyboard: true,
});
const confirmKeyboard = () => ({ keyboard: [[BTN.YES, BTN.NO]], resize_keyboard: true });
const questionKeyboard = (field) => {
  const rows = [];
  if (field.options) for (let i = 0; i < field.options.length; i += 2) rows.push(field.options.slice(i, i + 2));
  rows.push([BTN.CANCEL]);
  return { keyboard: rows, resize_keyboard: true };
};
const decisionKeyboard = (id) => ({
  inline_keyboard: [[
    { text: "✅ Ruxsat berish", callback_data: `ap:${id}` },
    { text: "❌ Rad etish", callback_data: `rj:${id}` },
  ]],
});

function createApp({ bot, db, config }) {
  const isAdmin = (id) => config.ADMIN_IDS.includes(id);

  // Xabar yuboradi; muvaffaqiyatsiz bo'lsa null qaytaradi (masalan admin botni /start qilmagan)
  async function send(chatId, text, extra = {}) {
    try {
      return await bot.sendMessage(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true, ...extra });
    } catch (e) {
      console.warn(`Xabar yuborilmadi (${chatId}):`, e.message);
      return null;
    }
  }
  const edit = (chatId, messageId, text) =>
    bot.editMessageText(text, { chat_id: chatId, message_id: messageId, parse_mode: "HTML", disable_web_page_preview: true }).catch(() => {});

  const ask = (chatId, cat, step, prefix = "") => {
    const field = cat.fields[step];
    return send(chatId, `${prefix}<i>(${step + 1}/${cat.fields.length})</i>\n\n${field.question}`, { reply_markup: questionKeyboard(field) });
  };
  const showMenu = (chatId, text) => send(chatId, text, { reply_markup: mainKeyboard() });

  // ---------- foydalanuvchi buyruqlari ----------
  async function onStart(msg) {
    await db.upsertUser(msg.from);
    await db.deleteDraft(msg.from.id);
    const name = [msg.from.first_name, msg.from.last_name].filter(Boolean).join(" ");
    let text =
      `Assalom alaykum <b>${fmt.esc(name)}</b>\n<b>${fmt.esc(config.CHANNEL_TITLE)} kanalining rasmiy botiga xush kelibsiz!</b>\n\n` +
      `/help yordam buyrug'i orqali nimalarga qodir ekanligimni bilib oling!`;
    if (isAdmin(msg.from.id)) text += `\n\n🛠 Admin panel: /admin`;
    return showMenu(msg.chat.id, text);
  }

  const onHelp = (msg) =>
    showMenu(
      msg.chat.id,
      `ℹ️ <b>Yordam</b>\n\nPastdagi tugmalardan birini tanlang, bot sizga bir nechta savol beradi. ` +
        `Oxirida ma'lumotlar to'g'ri bo'lsa <b>Ha</b> tugmasini bosing — ariza adminga yuboriladi.\n` +
        `Admin tasdiqlasa, e'lon kanalda chiqadi (odatda 24-48 soat ichida).\n\n` +
        `/cancel — jarayonni bekor qilish\n/id — Telegram ID ingiz`
    );

  const onId = (msg) => send(msg.chat.id, `🆔 Sizning ID: <code>${msg.from.id}</code>`);

  async function onCancel(msg) {
    await db.deleteDraft(msg.from.id);
    return showMenu(msg.chat.id, "❌ Bekor qilindi. Kerakli bo'limni tanlang.");
  }

  async function startForm(msg, cat) {
    await db.upsertUser(msg.from);
    await db.createDraft(msg.from, cat.key);
    await send(
      msg.chat.id,
      `<b>${cat.intro}</b>\n\nHozir sizga bir necha savol beriladi. Har biriga javob bering. ` +
        `Oxirida hammasi to'g'ri bo'lsa, <b>Ha</b> tugmasini bosing va arizangiz adminga yuboriladi.`,
      { reply_markup: questionKeyboard(cat.fields[0]) }
    );
    return ask(msg.chat.id, cat, 0);
  }

  async function onMessage(msg) {
    if (!msg.chat || msg.chat.type !== "private" || !msg.from) return;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const draft = await db.getDraft(userId);

    if (typeof msg.text !== "string") {
      if (draft) return send(chatId, "⚠️ Iltimos, javobni matn ko'rinishida yuboring.");
      return;
    }
    const t = msg.text.trim();
    if (t.startsWith("/")) return; // buyruqlar alohida ishlanadi

    // Menyudagi tugma bosildi — yangi forma (eskisi bekor bo'ladi)
    if (BY_LABEL[t]) return startForm(msg, BY_LABEL[t]);
    if (t === BTN.CANCEL) return onCancel(msg);
    if (!draft) return showMenu(chatId, "Kerakli bo'limni pastdagi tugmalardan tanlang 👇");

    const cat = BY_KEY[draft.category];

    // Tasdiqlash bosqichi
    if (draft.step >= cat.fields.length) {
      if (/^(ha|yes|✅\s*ha)$/i.test(t)) return submitDraft(msg, draft);
      if (/^(yo'q|yo`q|yoq|no)$/i.test(t)) {
        await db.deleteDraft(userId);
        return showMenu(chatId, "❌ Bekor qilindi. Qaytadan boshlash uchun bo'limni tanlang.");
      }
      return send(chatId, "Iltimos, <b>Ha</b> yoki <b>Yo'q</b> tugmasini bosing.", { reply_markup: confirmKeyboard() });
    }

    // Savolga javob
    const field = cat.fields[draft.step];
    const res = field.validate(t);
    if (res.error) return ask(chatId, cat, draft.step, `❌ ${res.error}\n\n`);

    const updated = await db.saveAnswer(draft._id, field.key, res.value);
    if (!updated) return showMenu(chatId, "⚠️ Ariza topilmadi. Qaytadan boshlang.");
    if (updated.step < cat.fields.length) return ask(chatId, cat, updated.step);

    return send(chatId, `${fmt.renderPost(cat, updated.answers)}\n\n<b>Barcha ma'lumotlar to'g'rimi?</b>`, { reply_markup: confirmKeyboard() });
  }

  async function submitDraft(msg, draft) {
    const app = await db.submit(draft._id);
    if (!app) return showMenu(msg.chat.id, "⚠️ Ariza allaqachon yuborilgan.");
    await showMenu(msg.chat.id, `📨 <b>So'rovingiz tekshirish uchun adminga jo'natildi!</b>\n\nE'lon 24-48 soat ichida kanalda chiqariladi.`);
    return notifyAdmins(app);
  }

  // ---------- admin paneli ----------
  async function notifyAdmins(app) {
    const cat = BY_KEY[app.category];
    let delivered = 0;
    for (const adminId of config.ADMIN_IDS) {
      const m = await send(adminId, fmt.adminText(app, cat), { reply_markup: decisionKeyboard(app._id) });
      if (m) {
        delivered++;
        await db.addAdminMessage(app._id, adminId, m.message_id);
      }
    }
    if (!delivered) console.warn(`⚠️ Ariza #${app.number} birorta adminga yetib bormadi. Adminlar botda /start bosganmi?`);
  }

  async function panelText() {
    const c = await db.counts();
    return (
      `🛠 <b>Admin panel</b>\n\n⏳ Kutilayotgan: <b>${c.pending}</b>\n✅ Tasdiqlangan: <b>${c.approved}</b>\n` +
      `❌ Rad etilgan: <b>${c.rejected}</b>\n👥 Foydalanuvchilar: <b>${c.users}</b>`
    );
  }
  const panelKeyboard = () => ({
    inline_keyboard: [[{ text: "📋 Kutilayotganlar", callback_data: "adm:pending" }, { text: "🔄 Yangilash", callback_data: "adm:refresh" }]],
  });

  async function onAdmin(msg) {
    if (!isAdmin(msg.from.id)) return send(msg.chat.id, "❌ Bu buyruq faqat adminlar uchun.");
    return send(msg.chat.id, await panelText(), { reply_markup: panelKeyboard() });
  }

  async function decide(q, status, id, answer) {
    if (status === "approved" && !config.CHANNEL_ID) return answer("❌ CHANNEL_ID .env da sozlanmagan.", true);
    const app = await db.claim(id, status, q.from.id);
    if (!app) return answer("ℹ️ Bu ariza allaqachon ko'rib chiqilgan.", true);
    const cat = BY_KEY[app.category];

    let link = null;
    if (status === "approved") {
      try {
        const m = await bot.sendMessage(config.CHANNEL_ID, fmt.renderPost(cat, app.answers), { parse_mode: "HTML", disable_web_page_preview: true });
        await db.setChannelMessage(id, m.message_id);
        link = fmt.channelLink(config.CHANNEL_ID, m.message_id);
      } catch (e) {
        await db.revertToPending(id); // kanalga chiqmadi — ariza kutilayotgan holatda qoladi
        return answer(`❌ Kanalga joylab bo'lmadi: ${String(e.message).slice(0, 120)}\nBot kanalda admin ekanini tekshiring.`, true);
      }
    }

    const who = fmt.esc(q.from.first_name || "admin");
    const line = status === "approved" ? `✅ <b>Ruxsat berildi</b> — ${who}` : `❌ <b>Rad etildi</b> — ${who}`;
    const text = fmt.adminText(app, cat, line);
    const seen = new Set();
    for (const m of [...(app.adminMessages || []), { adminId: q.message.chat.id, messageId: q.message.message_id }]) {
      const k = `${m.adminId}_${m.messageId}`;
      if (seen.has(k)) continue;
      seen.add(k);
      await edit(m.adminId, m.messageId, text); // tugmalar ham yo'qoladi
    }

    if (status === "approved") {
      await send(app.userId, `✅ <b>E'loningiz tasdiqlandi va kanalda e'lon qilindi!</b>${link ? `\n\n${link}` : ""}`);
    } else {
      await send(app.userId, `❌ <b>Afsuski, e'loningiz tasdiqlanmadi.</b>\n\nMa'lumotlarni tekshirib, qaytadan yuborishingiz mumkin.`);
    }
    return answer(status === "approved" ? "✅ Ruxsat berildi" : "❌ Rad etildi");
  }

  async function sendPending(q, answer) {
    const list = await db.listPending(10);
    if (!list.length) return answer("✅ Kutilayotgan ariza yo'q.", true);
    await answer(`📋 ${list.length} ta ariza yuborilmoqda...`);
    for (const app of list) {
      const m = await send(q.from.id, fmt.adminText(app, BY_KEY[app.category]), { reply_markup: decisionKeyboard(app._id) });
      if (m) await db.addAdminMessage(app._id, q.from.id, m.message_id);
    }
  }

  async function onCallback(q) {
    const answer = (text, alert = false) => bot.answerCallbackQuery(q.id, { text, show_alert: alert }).catch(() => {});
    try {
      const data = q.data || "";
      if (!isAdmin(q.from.id)) return answer("❌ Bu tugma faqat adminlar uchun.", true);
      if (data.startsWith("ap:")) return await decide(q, "approved", data.slice(3), answer);
      if (data.startsWith("rj:")) return await decide(q, "rejected", data.slice(3), answer);
      if (data === "adm:pending") return await sendPending(q, answer);
      if (data === "adm:refresh") {
        await edit(q.message.chat.id, q.message.message_id, await panelText());
        await bot.editMessageReplyMarkup(panelKeyboard(), { chat_id: q.message.chat.id, message_id: q.message.message_id }).catch(() => {});
        return answer("🔄 Yangilandi");
      }
    } catch (e) {
      console.error("callback xatosi:", e);
      return answer("Xatolik yuz berdi.");
    }
  }

  return { onStart, onHelp, onId, onCancel, onMessage, onAdmin, onCallback };
}

module.exports = { createApp, BTN };

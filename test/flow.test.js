"use strict";
// Telegramsiz va MongoDBsiz test: soxta bot + xotiradagi baza (db.js bilan bir xil interfeys)
const assert = require("assert");
const { createApp } = require("../src/app");
const { validators } = require("../src/categories");
const fmt = require("../src/format");
const { CATEGORIES } = require("../src/categories");

// ---------- tekshirgichlar ----------
assert.strictEqual(validators.phone("50 221 87 74").value, "+998 50 221 87 74");
assert.strictEqual(validators.phone("+998901234567").value, "+998 90 123 45 67");
assert(validators.phone("12345").error);
assert.strictEqual(validators.telegram("https://t.me/azizbekRavshanovich").value, "@azizbekRavshanovich");
assert(validators.telegram("ab").error);
assert.strictEqual(validators.timeRange("9.00 - 18:00").value, "9:00-18:00");
assert(validators.timeRange("9-18").error && validators.timeRange("25:00-18:00").error);
assert(validators.age("5").error && validators.age("abc").error && validators.age("22").value === "22");
assert.strictEqual(validators.region("xorazm").value, "Xorazm");

// ---------- soxta bot ----------
function makeBot() {
  let mid = 1000;
  const bot = {
    sent: [], edits: [], answers: [], failChannel: false, failFor: new Set(),
    async sendMessage(chat, text, opts = {}) {
      if (bot.failFor.has(chat)) throw new Error("Forbidden: bot can't initiate conversation");
      if (String(chat).startsWith("@") && bot.failChannel) throw new Error("Bad Request: chat not found");
      bot.sent.push({ chat, text, opts, id: ++mid });
      return { message_id: mid };
    },
    async editMessageText(text, o) { bot.edits.push({ text, ...o }); return true; },
    async editMessageReplyMarkup() { return true; },
    async answerCallbackQuery(id, o) { bot.answers.push({ id, ...o }); return true; },
    to(chat) { return bot.sent.filter((m) => m.chat === chat); },
    lastTo(chat) { const a = bot.to(chat); return a[a.length - 1]; },
  };
  return bot;
}

// ---------- xotiradagi baza ----------
function memoryDb() {
  const apps = new Map();
  let idc = 0, seq = 0;
  const users = new Map();
  const cl = (x) => (x ? structuredClone(x) : null);
  const drafts = (uid) => [...apps.values()].filter((a) => a.userId === uid && a.status === "draft");
  return {
    apps,
    async upsertUser(f) { users.set(f.id, f); },
    async getDraft(uid) { return cl(drafts(uid)[0]); },
    async createDraft(from, category) {
      drafts(from.id).forEach((d) => apps.delete(d._id));
      const a = { _id: String(++idc), userId: from.id, firstName: from.first_name, lastName: from.last_name, username: from.username, category, answers: {}, step: 0, status: "draft", adminMessages: [] };
      apps.set(a._id, a);
      return cl(a);
    },
    async deleteDraft(uid) { drafts(uid).forEach((d) => apps.delete(d._id)); },
    async saveAnswer(id, key, value) {
      const a = apps.get(id);
      if (!a || a.status !== "draft") return null;
      a.answers[key] = value; a.step++;
      return cl(a);
    },
    async submit(id) {
      const a = apps.get(id);
      if (!a || a.status !== "draft") return null;
      a.status = "pending"; a.number = ++seq;
      return cl(a);
    },
    async getApp(id) { return cl(apps.get(id)); },
    async claim(id, status, by) {
      const a = apps.get(id);
      if (!a || a.status !== "pending") return null;
      a.status = status; a.reviewedBy = by;
      return cl(a);
    },
    async revertToPending(id) { apps.get(id).status = "pending"; },
    async addAdminMessage(id, adminId, messageId) { apps.get(id).adminMessages.push({ adminId, messageId }); },
    async setChannelMessage(id, mid) { apps.get(id).channelMessageId = mid; },
    async listPending(n) { return [...apps.values()].filter((a) => a.status === "pending").slice(0, n).map(cl); },
    async counts() {
      const c = (s) => [...apps.values()].filter((a) => a.status === s).length;
      return { pending: c("pending"), approved: c("approved"), rejected: c("rejected"), users: users.size };
    },
  };
}

const ADMINS = [1, 2];
const config = { ADMIN_IDS: ADMINS, CHANNEL_ID: "@my_channel", CHANNEL_TITLE: "Ustoz-Shogird" };
const user = (id, extra = {}) => ({ id, first_name: "Azizbek", last_name: "R", ...extra });
const msg = (from, text) => ({ chat: { id: from.id, type: "private" }, from, text, message_id: 1 });
const cb = (from, data, message) => ({ id: "q" + Math.random(), from, data, message: message || { chat: { id: from.id }, message_id: 5 } });

async function say(app, from, text) { await app.onMessage(msg(from, text)); }

// Hodim kerak (skrinshotdagi) anketasini to'ldiradi
async function fillHodim(app, bot, u) {
  await say(app, u, "Hodim kerak");
  const answers = ["Anora Academy", "Python, Js", "@azizbekRavshanovich", "50 221 87 74", "Xorazm", "Anora Nasullayeva", "9:00-18:00", "9:00-18:00", "400$", "Ingliz tilini bilishi ustunlik beriladi. Qolgan malumotlar telefonda gaplashiladi."];
  for (const a of answers) await say(app, u, a);
}

(async () => {
  // ---- 1. /start va menyu ----
  {
    const bot = makeBot(), db = memoryDb(), app = createApp({ bot, db, config });
    const u = user(100);
    await app.onStart(msg(u, "/start"));
    const m = bot.lastTo(100);
    assert(m.text.includes("Assalom alaykum") && m.text.includes("Ustoz-Shogird kanalining rasmiy botiga xush kelibsiz") && m.text.includes("/help"));
    assert.deepStrictEqual(m.opts.reply_markup.keyboard, [["Sherik kerak", "Ish joyi kerak"], ["Hodim kerak", "Ustoz kerak"], ["Shogird kerak"]]);
    assert(!m.text.includes("/admin"), "oddiy foydalanuvchiga admin havolasi ko'rsatilmaydi");
    await app.onStart(msg(user(1), "/start"));
    assert(bot.lastTo(1).text.includes("/admin"));
  }

  // ---- 2. To'liq anketa -> adminga yuborish -> Ruxsat berish ----
  {
    const bot = makeBot(), db = memoryDb(), app = createApp({ bot, db, config });
    const u = user(100, { username: "aziz" });

    await say(app, u, "Hodim kerak");
    assert(bot.lastTo(100).text.includes("(1/10)") && bot.lastTo(100).text.includes("Idora"));
    await say(app, u, "Anora Academy");
    await say(app, u, "Python, Js");
    await say(app, u, "ab"); // noto'g'ri telegram
    assert(bot.lastTo(100).text.startsWith("❌") && bot.lastTo(100).text.includes("(3/10)"), "xato javobda shu savol qayta so'raladi");
    await say(app, u, "@azizbekRavshanovich");
    await say(app, u, "123"); // noto'g'ri telefon
    assert(bot.lastTo(100).text.startsWith("❌"));
    await say(app, u, "50 221 87 74");
    assert(bot.lastTo(100).opts.reply_markup.keyboard.flat().includes("Xorazm"), "hudud uchun tugmalar chiqadi");
    await say(app, u, "Xorazm");
    await say(app, u, "Anora Nasullayeva");
    await say(app, u, "9-18"); // noto'g'ri vaqt
    assert(bot.lastTo(100).text.startsWith("❌"));
    await say(app, u, "9:00-18:00");
    await say(app, u, "9:00-18:00");
    await say(app, u, "400$");
    await say(app, u, "Ingliz tilini bilishi ustunlik beriladi. Qolgan malumotlar telefonda gaplashiladi.");

    const preview = bot.lastTo(100);
    for (const part of ["Xodim kerak:", "🏢 Idora: Anora Academy", "📚 Texnologiya: <b>Python, Js</b>", "🇺🇿 Telegram: @azizbekRavshanovich", "📞 Aloqa: +998 50 221 87 74", "🌐 Hudud: <b>Xorazm</b>", "✍️ Mas'ul: <b>Anora Nasullayeva</b>", "💰 Maosh: 400$", "#ishJoyi #python #js #Xorazm", "Barcha ma'lumotlar to'g'rimi?"]) {
      assert(preview.text.includes(part), `ko'rinishda yo'q: ${part}\n${preview.text}`);
    }
    assert.deepStrictEqual(preview.opts.reply_markup.keyboard, [["Ha", "Yo'q"]]);

    await say(app, u, "Ha");
    assert(bot.to(100).some((m) => m.text.includes("So'rovingiz tekshirish uchun adminga jo'natildi") && m.text.includes("24-48 soat")));

    // ikkala adminga tugmalar bilan boradi
    for (const adminId of ADMINS) {
      const am = bot.lastTo(adminId);
      assert(am.text.includes("Yangi e'lon #1") && am.text.includes("Anora Academy") && am.text.includes("@aziz"));
      const btns = am.opts.reply_markup.inline_keyboard[0];
      assert.deepStrictEqual(btns.map((b) => b.text), ["✅ Ruxsat berish", "❌ Rad etish"]);
    }
    const appId = [...db.apps.keys()][0];
    assert.strictEqual(db.apps.get(appId).status, "pending");

    // Admin bo'lmagan odam tugmani bosolmaydi
    await app.onCallback(cb(user(555), `ap:${appId}`));
    assert.strictEqual(db.apps.get(appId).status, "pending");
    assert(bot.answers.at(-1).text.includes("faqat adminlar"));

    // Kanalga chiqmasa — ariza kutilayotgan holatda qoladi
    bot.failChannel = true;
    await app.onCallback(cb(user(1), `ap:${appId}`, { chat: { id: 1 }, message_id: bot.lastTo(1).id }));
    assert.strictEqual(db.apps.get(appId).status, "pending", "kanalga chiqmasa pending qolishi kerak");
    assert(bot.answers.at(-1).text.includes("Kanalga joylab bo'lmadi"));
    bot.failChannel = false;

    // Admin 1 ruxsat beradi
    await app.onCallback(cb(user(1), `ap:${appId}`, { chat: { id: 1 }, message_id: bot.lastTo(1).id }));
    assert.strictEqual(db.apps.get(appId).status, "approved");
    const ch = bot.to("@my_channel");
    assert.strictEqual(ch.length, 1, "kanalga aynan bitta e'lon chiqadi");
    assert(ch[0].text.includes("Xodim kerak:") && ch[0].text.includes("#ishJoyi #python #js #Xorazm"));
    assert(!ch[0].text.includes("Yuboruvchi"), "kanalda yuboruvchi ma'lumoti bo'lmaydi");
    assert(bot.lastTo(100).text.includes("tasdiqlandi") && bot.lastTo(100).text.includes("https://t.me/my_channel/"));
    // ikkala adminning xabari yangilanadi (tugmalar yo'qoladi)
    assert(bot.edits.filter((e) => e.text.includes("Ruxsat berildi")).map((e) => e.chat_id).sort().join() === "1,2");

    // Ikkinchi admin keyin bossa — ikkinchi marta joylanmaydi
    await app.onCallback(cb(user(2), `rj:${appId}`, { chat: { id: 2 }, message_id: bot.lastTo(2).id }));
    assert(bot.answers.at(-1).text.includes("allaqachon"));
    assert.strictEqual(db.apps.get(appId).status, "approved");
    assert.strictEqual(bot.to("@my_channel").length, 1);
  }

  // ---- 3. Rad etish ----
  {
    const bot = makeBot(), db = memoryDb(), app = createApp({ bot, db, config });
    const u = user(101);
    await fillHodim(app, bot, u);
    await say(app, u, "Ha");
    const id = [...db.apps.keys()][0];
    await app.onCallback(cb(user(2), `rj:${id}`, { chat: { id: 2 }, message_id: 9 }));
    assert.strictEqual(db.apps.get(id).status, "rejected");
    assert.strictEqual(bot.to("@my_channel").length, 0, "rad etilsa kanalga chiqmaydi");
    assert(bot.lastTo(101).text.includes("tasdiqlanmadi"));
  }

  // ---- 4. Bekor qilish, "Yo'q", bo'limni almashtirish, matn emas, guruh ----
  {
    const bot = makeBot(), db = memoryDb(), app = createApp({ bot, db, config });
    const u = user(102);
    await say(app, u, "Sherik kerak");
    await say(app, u, "Azizbek");
    await say(app, u, "❌ Bekor qilish");
    assert.strictEqual([...db.apps.values()].length, 0, "bekor qilinsa qoralama o'chadi");
    assert(bot.lastTo(102).text.includes("Bekor qilindi"));

    await say(app, u, "Sherik kerak");
    await say(app, u, "Ustoz kerak"); // jarayon o'rtasida boshqa bo'limni tanladi
    const drafts = [...db.apps.values()];
    assert.strictEqual(drafts.length, 1);
    assert.strictEqual(drafts[0].category, "ustoz");
    assert(bot.lastTo(102).text.includes("(1/9)"));

    await app.onMessage({ chat: { id: 102, type: "private" }, from: u, photo: [{}], message_id: 2 });
    assert(bot.lastTo(102).text.includes("matn"), "rasm yuborsa matn so'raladi");

    // Barcha savollarga javob berib, "Yo'q" deydi
    for (const a of ["Azizbek", "22", "Python", "@azizbek", "901234567", "Toshkent", "200$", "10:00-12:00", "O'rganmoqchiman"]) await say(app, u, a);
    assert(bot.lastTo(102).text.includes("Barcha ma'lumotlar to'g'rimi?"));
    await say(app, u, "Yo'q");
    assert.strictEqual([...db.apps.values()].length, 0);

    // Guruhdagi xabarlar e'tiborga olinmaydi
    const n = bot.sent.length;
    await app.onMessage({ chat: { id: -5, type: "supergroup" }, from: u, text: "Hodim kerak", message_id: 3 });
    assert.strictEqual(bot.sent.length, n);

    // Qoralamasiz tasodifiy matn -> menyu
    await say(app, u, "salom");
    assert(bot.lastTo(102).text.includes("tugmalardan tanlang"));
  }

  // ---- 5. Admin panel ----
  {
    const bot = makeBot(), db = memoryDb(), app = createApp({ bot, db, config });
    const u = user(103);
    await fillHodim(app, bot, u);
    await say(app, u, "Ha");

    await app.onAdmin(msg(user(555), "/admin"));
    assert(bot.lastTo(555).text.includes("faqat adminlar"));

    await app.onAdmin(msg(user(1), "/admin"));
    const p = bot.lastTo(1);
    assert(p.text.includes("Kutilayotgan: <b>1</b>") && p.text.includes("Foydalanuvchilar: <b>1</b>"));
    assert.deepStrictEqual(p.opts.reply_markup.inline_keyboard[0].map((b) => b.callback_data), ["adm:pending", "adm:refresh"]);

    const before = bot.to(1).length;
    await app.onCallback(cb(user(1), "adm:pending"));
    assert.strictEqual(bot.to(1).length, before + 1, "kutilayotgan ariza yana yuboriladi");
    assert(bot.lastTo(1).opts.reply_markup.inline_keyboard[0].length === 2, "Ruxsat/Rad tugmalari bilan");
  }

  // ---- 6. Admin botni /start qilmagan bo'lsa ham bot qulamaydi ----
  {
    const bot = makeBot(), db = memoryDb(), app = createApp({ bot, db, config });
    bot.failFor.add(1);
    const u = user(104);
    await fillHodim(app, bot, u);
    await say(app, u, "Ha");
    assert(bot.to(2).length >= 1, "ikkinchi adminga baribir boradi");
    assert(bot.to(104).some((m) => m.text.includes("jo'natildi")));
  }

  // ---- 7. Hashtag va havola ----
  assert.strictEqual(fmt.hashtags(CATEGORIES[0], { texnologiya: "C++, Node.js, x", hudud: "Farg'ona" }), "#sherik #cpp #nodejs #Fargona");
  assert.strictEqual(fmt.channelLink("-1001234567890", 7), "https://t.me/c/1234567890/7");

  console.log("✅ Barcha tekshiruvlar o'tdi");
})().catch((e) => {
  console.error("❌ TEST XATOSI:", e);
  process.exit(1);
});

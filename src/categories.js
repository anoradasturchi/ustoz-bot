"use strict";
// Barcha bo'limlar va ularning savollari SHU YERDA. Savol qo'shish/olib tashlash/tartibini o'zgartirish mumkin.

const clean = (s) => String(s).replace(/\s+/g, " ").trim();

const text = (min, max, { multiline = false } = {}) => (raw) => {
  const v = multiline ? String(raw).replace(/[ \t]+/g, " ").trim() : clean(raw);
  if (v.length < min) return { error: `Kamida ${min} ta belgi kiriting.` };
  if (v.length > max) return { error: `Juda uzun: ${max} ta belgigacha yozing (hozir ${v.length} ta).` };
  return { value: v };
};

function telegram(raw) {
  const v = clean(raw).replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").replace(/^@/, "");
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v)) return { error: "Telegram username noto'g'ri. Masalan: @username" };
  return { value: "@" + v };
}

function phone(raw) {
  const d = String(raw).replace(/\D/g, "");
  const n = d.length === 9 ? "998" + d : d;
  if (!/^998\d{9}$/.test(n)) return { error: "Telefon raqam noto'g'ri. Masalan: +998 90 123 45 67" };
  return { value: `+998 ${n.slice(3, 5)} ${n.slice(5, 8)} ${n.slice(8, 10)} ${n.slice(10, 12)}` };
}

function age(raw) {
  const n = Number(clean(raw));
  if (!Number.isInteger(n) || n < 10 || n > 80) return { error: "Yoshni raqam bilan kiriting (10 dan 80 gacha). Masalan: 22" };
  return { value: String(n) };
}

function timeRange(raw) {
  const m = clean(raw).match(/^(\d{1,2})[:.](\d{2})\s*[-–—]\s*(\d{1,2})[:.](\d{2})$/);
  if (!m) return { error: "Vaqtni shu formatda kiriting: 9:00-18:00" };
  const [h1, m1, h2, m2] = m.slice(1).map(Number);
  if (h1 > 23 || h2 > 23 || m1 > 59 || m2 > 59) return { error: "Vaqt noto'g'ri. Masalan: 9:00-18:00" };
  const p = (n) => String(n).padStart(2, "0");
  return { value: `${h1}:${p(m1)}-${h2}:${p(m2)}` };
}

const REGIONS = [
  "Toshkent", "Toshkent viloyati", "Samarqand", "Buxoro", "Xorazm", "Andijon", "Namangan",
  "Farg'ona", "Qashqadaryo", "Surxondaryo", "Navoiy", "Jizzax", "Sirdaryo", "Qoraqalpog'iston",
];
function region(raw) {
  const r = text(2, 50)(raw);
  if (r.error) return r;
  const hit = REGIONS.find((x) => x.toLowerCase() === r.value.toLowerCase());
  return { value: hit || r.value };
}

// f(kalit, emoji, nomi, savol, tekshiruv, qo'shimcha)
const f = (key, emoji, label, question, validate, extra = {}) => ({ key, emoji, label, question, validate, ...extra });

const TEXNOLOGIYA = f("texnologiya", "📚", "Texnologiya",
  "📚 <b>Texnologiya</b> nomlarini kiriting?\n\nVergul bilan ajrating.\n<i>Masalan: Python, Js</i>", text(2, 100), { bold: true });
const TELEGRAM = f("telegram", "🇺🇿", "Telegram",
  "🇺🇿 <b>Telegram</b> username'ingizni kiriting?\n\n<i>Masalan: @username</i>", telegram);
const ALOQA = f("aloqa", "📞", "Aloqa",
  "📞 <b>Aloqa</b> uchun telefon raqamingizni kiriting?\n\n<i>Masalan: +998 90 123 45 67</i>", phone);
const HUDUD = f("hudud", "🌐", "Hudud",
  "🌐 <b>Hudud</b>ni tanlang yoki yozing.", region, { bold: true, options: REGIONS });
const MUROJAAT = f("murojaat", "🕰", "Murojaat vaqti",
  "🕰 Qaysi vaqtda <b>murojaat</b> qilish mumkin?\n\n<i>Masalan: 9:00-18:00</i>", timeRange);
const MAQSAD = f("maqsad", "🎯", "Maqsad",
  "🎯 <b>Maqsadingizni</b> qisqacha yozing.", text(3, 500, { multiline: true }));
const YOSH = f("yosh", "🕑", "Yosh", "🕑 <b>Yoshingizni</b> kiriting?\n\n<i>Masalan: 22</i>", age);
const NARX = f("narx", "💰", "Narx", "💰 <b>Narx</b>ni kiriting?\n\n<i>Masalan: 100$ yoki Bepul</i>", text(1, 60));
const ISM = (emoji, label) =>
  f("ism", emoji, label, `${emoji} <b>Ismingizni</b> kiriting?\n\n<i>Masalan: Azizbek Ravshanov</i>`, text(2, 80), { bold: true });

const CATEGORIES = [
  {
    key: "sherik", label: "Sherik kerak", title: "Sherik kerak:", tag: "sherik",
    intro: "Sherik topish uchun ariza berish",
    fields: [ISM("🏅", "Sherik"), TEXNOLOGIYA, TELEGRAM, ALOQA, HUDUD, NARX, MUROJAAT, MAQSAD],
  },
  {
    key: "ish", label: "Ish joyi kerak", title: "Ish joyi kerak:", tag: "ishKerak",
    intro: "Ish joyi topish uchun ariza berish",
    fields: [
      ISM("👨‍💼", "Xodim"), YOSH, TEXNOLOGIYA, TELEGRAM, ALOQA, HUDUD, NARX,
      f("kasb", "👨🏻‍💻", "Kasbi", "👨🏻‍💻 <b>Kasbingiz</b>ni kiriting?\n\n<i>Masalan: Backend dasturchi</i>", text(2, 80)),
      MUROJAAT, MAQSAD,
    ],
  },
  {
    // Skrinshotdagi maydonlar aynan shu tartibda
    key: "hodim", label: "Hodim kerak", title: "Xodim kerak:", tag: "ishJoyi",
    intro: "Xodim topish uchun ariza berish",
    fields: [
      f("idora", "🏢", "Idora", "🏢 <b>Idora</b> nomini kiriting?\n\n<i>Masalan: Anora Academy</i>", text(2, 100)),
      TEXNOLOGIYA, TELEGRAM, ALOQA, HUDUD,
      f("masul", "✍️", "Mas'ul", "✍️ <b>Mas'ul</b> shaxs ism-familiyasini kiriting?\n\n<i>Masalan: Anora Nasullayeva</i>", text(2, 80), { bold: true }),
      MUROJAAT,
      f("ish_vaqti", "🕰", "Ish vaqti", "🕰 <b>Ish vaqti</b>ni kiriting?\n\n<i>Masalan: 9:00-18:00</i>", timeRange),
      f("maosh", "💰", "Maosh", "💰 <b>Maosh</b>ni kiriting?\n\n<i>Masalan: 400$</i>", text(1, 60)),
      f("qoshimcha", "‼️", "Qo`shimcha", "‼️ <b>Qo'shimcha</b> ma'lumotlarni yozing.", text(2, 500, { multiline: true })),
    ],
  },
  {
    key: "ustoz", label: "Ustoz kerak", title: "Ustoz kerak:", tag: "ustoz",
    intro: "Ustoz topish uchun ariza berish",
    fields: [ISM("🎓", "Shogird"), YOSH, TEXNOLOGIYA, TELEGRAM, ALOQA, HUDUD, NARX, MUROJAAT, MAQSAD],
  },
  {
    key: "shogird", label: "Shogird kerak", title: "Shogird kerak:", tag: "shogird",
    intro: "Shogird topish uchun ariza berish",
    fields: [ISM("🎓", "Ustoz"), YOSH, TEXNOLOGIYA, TELEGRAM, ALOQA, HUDUD, NARX, MUROJAAT, MAQSAD],
  },
];

const BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
const BY_LABEL = Object.fromEntries(CATEGORIES.map((c) => [c.label, c]));

module.exports = { CATEGORIES, BY_KEY, BY_LABEL, validators: { telegram, phone, age, timeRange, region } };

# 📋 Ustoz-Shogird ariza boti

Foydalanuvchi tugma bosadi → bot savollar beradi → ariza adminga boradi → admin **Ruxsat berish / Rad etish** bosadi → tasdiqlansa e'lon kanalga chiqadi. Hammasi MongoDB da saqlanadi.

## Ishga tushirish (Windows)
1. @BotFather → `/newbot` → **yangi** token oling (boshqa botning tokenini ishlatmang).
2. ```cmd
   copy .env.example .env
   ```
   `.env` ni to'ldiring:
   - `BOT_TOKEN` — bot tokeni
   - `ADMIN_IDS` — adminlar ID si (botga `/id` yozsangiz, ID ni ko'rsatadi)
   - `CHANNEL_ID` — `@kanal_username` yoki `-100xxxxxxxxxx`
3. Botni **kanalga admin** qiling (xabar yuborish huquqi bilan).
4. **Har bir admin botga bir marta `/start` bossin** — aks holda bot unga ariza yubora olmaydi.
5. ```cmd
   npm install
   npm start
   ```

## Admin
- `/admin` — panel: statistika va "Kutilayotganlar" tugmasi
- Har bir ariza ostida: ✅ Ruxsat berish / ❌ Rad etish

## Savollarni o'zgartirish
`src/categories.js` — bo'limlar, savollar tartibi va tekshiruvlar shu yerda.

## Test
```cmd
npm test
```

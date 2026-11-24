"use strict";
// MongoDB: barcha foydalanuvchilar va arizalar shu yerda saqlanadi
const mongoose = require("mongoose");

const User = mongoose.model(
    "User",
    new mongoose.Schema({
        telegramId: { type: Number, unique: true, required: true },
        firstName: String,
        lastName: String,
        username: String,
        createdAt: { type: Date, default: Date.now },
        lastSeen: Date,
    })
);

const Application = mongoose.model(
    "Application",
    new mongoose.Schema(
        {
            number: { type: Number, index: true }, // yuborilganda beriladi (#1, #2 ...)
            userId: { type: Number, index: true },
            firstName: String,
            lastName: String,
            username: String,
            category: String,
            answers: { type: mongoose.Schema.Types.Mixed, default: {} },
            step: { type: Number, default: 0 },
            status: { type: String, enum: ["draft", "pending", "approved", "rejected"], default: "draft", index: true },
            adminMessages: [{ _id: false, adminId: Number, messageId: Number }],
            channelMessageId: Number,
            reviewedBy: Number,
            reviewedAt: Date,
            submittedAt: Date,
            createdAt: { type: Date, default: Date.now },
        },
        { minimize: false }
    )
);

const Counter = mongoose.model("Counter", new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }));

async function retryDup(fn) {
    try {
        return await fn();
    } catch (e) {
        if (e && e.code === 11000) return fn();
        throw e;
    }
}

const nextNumber = async () =>
    (await retryDup(() => Counter.findOneAndUpdate({ _id: "application" }, { $inc: { seq: 1 } }, { upsert: true, returnDocument: "after" }))).seq;

const after = { returnDocument: "after" };
const validId = (id) => mongoose.isValidObjectId(id);

module.exports = {
    async upsertUser(from) {
        await retryDup(() =>
            User.findOneAndUpdate(
                { telegramId: from.id },
                { $set: { firstName: from.first_name, lastName: from.last_name, username: from.username, lastSeen: new Date() }, $setOnInsert: { createdAt: new Date() } },
                { upsert: true }
            )
        );
    },

    getDraft: (userId) => Application.findOne({ userId, status: "draft" }).lean(),

    async createDraft(from, category) {
        await Application.deleteMany({ userId: from.id, status: "draft" });
        const a = await Application.create({ userId: from.id, firstName: from.first_name, lastName: from.last_name, username: from.username, category });
        return a.toObject();
    },

    deleteDraft: (userId) => Application.deleteMany({ userId, status: "draft" }),

    saveAnswer: (id, key, value) =>
        Application.findOneAndUpdate({ _id: id, status: "draft" }, { $set: { [`answers.${key}`]: value }, $inc: { step: 1 } }, after).lean(),

    async submit(id) {
        const number = await nextNumber();
        return Application.findOneAndUpdate({ _id: id, status: "draft" }, { $set: { status: "pending", number, submittedAt: new Date() } }, after).lean();
    },

    getApp: (id) => (validId(id) ? Application.findById(id).lean() : null),

    // Faqat "pending" bo'lsa o'zgartiradi — ikki admin bir vaqtda bossa, faqat bittasi o'tadi
    claim: (id, status, reviewerId) =>
        validId(id)
            ? Application.findOneAndUpdate({ _id: id, status: "pending" }, { $set: { status, reviewedBy: reviewerId, reviewedAt: new Date() } }, after).lean()
            : null,

    revertToPending: (id) =>
        Application.updateOne({ _id: id }, { $set: { status: "pending" }, $unset: { reviewedBy: 1, reviewedAt: 1 } }),

    addAdminMessage: (id, adminId, messageId) => Application.updateOne({ _id: id }, { $push: { adminMessages: { adminId, messageId } } }),

    setChannelMessage: (id, messageId) => Application.updateOne({ _id: id }, { $set: { channelMessageId: messageId } }),

    listPending: (limit = 10) => Application.find({ status: "pending" }).sort({ number: 1 }).limit(limit).lean(),

    async counts() {
        const [pending, approved, rejected, users] = await Promise.all([
            Application.countDocuments({ status: "pending" }),
            Application.countDocuments({ status: "approved" }),
            Application.countDocuments({ status: "rejected" }),
            User.countDocuments({}),
        ]);
        return { pending, approved, rejected, users };
    },
};
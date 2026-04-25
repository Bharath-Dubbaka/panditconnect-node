// src/models/Review.js
// Reviews are only created after a booking is "completed".
// One review per booking. User reviews the pandit.

const mongoose = require("mongoose");

const ReviewSchema = new mongoose.Schema(
  {
    bookingId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Booking",
      required: true,
      unique: true, // one review per booking
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    panditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pandit",
      required: true,
    },
    poojaTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoojaType",
    },

    // ── Ratings ───────────────────────────────────
    // Overall rating 1-5
    rating: { type: Number, required: true, min: 1, max: 5 },
    // Sub-ratings (optional but useful for trust)
    punctualityRating: { type: Number, min: 1, max: 5 },
    knowledgeRating: { type: Number, min: 1, max: 5 },
    behaviorRating: { type: Number, min: 1, max: 5 },

    // ── Content ───────────────────────────────────
    comment: { type: String, maxlength: 1000 },
    isVerified: { type: Boolean, default: true }, // all reviews are from real bookings

    // ── Moderation ────────────────────────────────
    isVisible: { type: Boolean, default: true }, // admin can hide
    reportedCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ReviewSchema.index({ panditId: 1, createdAt: -1 });
ReviewSchema.index({ userId: 1 });
ReviewSchema.index({ rating: 1 });

module.exports = mongoose.model("Review", ReviewSchema);

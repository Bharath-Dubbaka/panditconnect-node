// src/models/Payout.js
// Tracks each payout made to a pandit.
// Platform accumulates pandit earnings after bookings complete,
// then pays out weekly/on-demand via Razorpay Payout API or manual UPI.

const mongoose = require("mongoose");

const PayoutSchema = new mongoose.Schema(
  {
    panditId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Pandit",
      required: true,
    },
    // Which bookings are included in this payout
    bookingIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Booking",
      },
    ],

    // ── Amounts ───────────────────────────────────
    grossAmount: { type: Number, required: true },   // sum of panditFees
    platformCommission: { type: Number, required: true }, // platform's cut
    netAmount: { type: Number, required: true },     // what pandit receives
    tdsDeducted: { type: Number, default: 0 },       // TDS if applicable

    // ── Status ────────────────────────────────────
    status: {
      type: String,
      enum: ["pending", "processing", "paid", "failed"],
      default: "pending",
    },

    // ── Payment Details ───────────────────────────
    paymentMethod: { type: String, enum: ["upi", "bank_transfer", "cash"], default: "upi" },
    upiId: { type: String },
    transactionId: { type: String }, // Razorpay/bank transaction ref
    paidAt: { type: Date },
    failureReason: { type: String },

    // ── Admin ─────────────────────────────────────
    adminNote: { type: String },
    processedBy: { type: String }, // admin userId
  },
  { timestamps: true }
);

PayoutSchema.index({ panditId: 1, status: 1, createdAt: -1 });
PayoutSchema.index({ status: 1 });

module.exports = mongoose.model("Payout", PayoutSchema);

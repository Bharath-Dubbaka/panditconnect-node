// src/models/Booking.js
// Central transaction record tying user, pandit, pooja, and samagri together.
// Status machine:
//   pending_pandit  → pandit hasn't responded yet
//   accepted        → pandit confirmed, awaiting date
//   in_progress     → pooja is happening right now
//   completed       → pandit marked done, payment released
//   cancelled_user  → user cancelled
//   cancelled_pandit → pandit declined/cancelled
//   expired         → pandit didn't respond in time

const mongoose = require("mongoose");

// Samagri order line items within a booking
const SamagriOrderItemSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SamagriItem",
      required: true,
    },
    name: { type: String }, // snapshot at time of order
    quantity: { type: Number, required: true },
    unit: { type: String },
    pricePerUnit: { type: Number, required: true }, // snapshot
    totalPrice: { type: Number, required: true },
  },
  { _id: false }
);

// Address at time of booking (snapshot — user may change address later)
const AddressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true },
    line2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    landmark: { type: String },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { _id: false }
);

const BookingSchema = new mongoose.Schema(
  {
    // ── Participants ──────────────────────────────
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

    // ── Pooja Details ─────────────────────────────
    poojaTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoojaType",
      required: true,
    },
    poojaName: { type: String }, // snapshot

    // ── Scheduling ────────────────────────────────
    scheduledDate: { type: String, required: true },  // "YYYY-MM-DD"
    scheduledTime: { type: String, required: true },  // "HH:MM"
    durationMinutes: { type: Number },                // expected duration

    // ── Location ──────────────────────────────────
    address: { type: AddressSchema, required: true },

    // ── Status Machine ────────────────────────────
    status: {
      type: String,
      enum: [
        "pending_pandit",   // waiting for pandit to accept
        "accepted",         // pandit confirmed
        "in_progress",      // pandit started the pooja
        "completed",        // pooja done
        "cancelled_user",   // user cancelled
        "cancelled_pandit", // pandit declined/cancelled
        "expired",          // no response from pandit
      ],
      default: "pending_pandit",
    },
    // Why the pandit declined (shown to user)
    cancellationReason: { type: String },

    // ── Timestamps for status changes ─────────────
    acceptedAt: { type: Date },
    startedAt: { type: Date },
    completedAt: { type: Date },
    cancelledAt: { type: Date },
    // Pandit must accept within this time or booking expires
    acceptDeadline: { type: Date },

    // ── Pricing Snapshot ──────────────────────────
    panditFee: { type: Number, required: true },     // pandit's charge
    platformFee: { type: Number, default: 0 },       // platform's cut (e.g. 10%)
    samagriTotal: { type: Number, default: 0 },      // samagri kit price
    deliveryFee: { type: Number, default: 0 },       // samagri delivery charge
    totalAmount: { type: Number, required: true },   // grand total paid by user

    // ── Samagri Order ─────────────────────────────
    samagriOption: {
      type: String,
      enum: ["self", "platform"],  // self = user arranges, platform = we deliver
      default: "self",
    },
    samagriItems: [SamagriOrderItemSchema],
    samagriDeliveryStatus: {
      type: String,
      enum: ["not_applicable", "pending", "dispatched", "delivered"],
      default: "not_applicable",
    },
    samagriDeliveryNote: { type: String },

    // ── Payment ───────────────────────────────────
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "refunded", "failed"],
      default: "pending",
    },
    paymentMethod: { type: String }, // "razorpay", "upi", "cash"
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    // Pandit payout
    payoutStatus: {
      type: String,
      enum: ["pending", "processing", "paid"],
      default: "pending",
    },
    payoutAmount: { type: Number }, // panditFee minus platform commission
    payoutDate: { type: Date },

    // ── Special Instructions ──────────────────────
    userNote: { type: String, maxlength: 500 }, // any special request from user
    panditNote: { type: String },               // pandit's note back to user

    // ── Review ────────────────────────────────────
    reviewId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Review",
    },
    isReviewed: { type: Boolean, default: false },
  },
  { timestamps: true }
);

BookingSchema.index({ userId: 1, status: 1, createdAt: -1 });
BookingSchema.index({ panditId: 1, status: 1, scheduledDate: 1 });
BookingSchema.index({ status: 1, scheduledDate: 1 });
BookingSchema.index({ acceptDeadline: 1, status: 1 }); // for expiry cron

// Instance helper: pandit earnings after platform commission
BookingSchema.methods.computePayoutAmount = function (commissionPct = 10) {
  return Math.round(this.panditFee * (1 - commissionPct / 100));
};

module.exports = mongoose.model("Booking", BookingSchema);

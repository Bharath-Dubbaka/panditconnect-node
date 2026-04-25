// src/models/Pandit.js
// A Pandit is a separate identity from User.
// They have their own auth token, onboarding, and dashboard.

const mongoose = require("mongoose");

// ── Sub-schemas ───────────────────────────────────────────────────────────────

// Availability: which days + time slots the pandit works
const AvailabilitySlotSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
      required: true,
    },
    startTime: { type: String, required: true }, // "06:00"
    endTime: { type: String, required: true },   // "20:00"
  },
  { _id: false }
);

// Travel radius: how far the pandit will travel (in km)
// They can set different pricing per km band
const PricingSchema = new mongoose.Schema(
  {
    poojaTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PoojaType",
      required: true,
    },
    basePrice: { type: Number, required: true }, // ₹ their charge for this pooja
    durationMinutes: { type: Number, required: true }, // expected time to perform
    note: { type: String }, // e.g. "Price may vary for large venues"
  },
  { _id: false }
);

// ── Main Schema ───────────────────────────────────────────────────────────────

const PanditSchema = new mongoose.Schema(
  {
    // ── Auth ──────────────────────────────────────
    email: { type: String, unique: true, required: true, lowercase: true },
    phone: { type: String, required: true },
    passwordHash: { type: String, select: false },
    name: { type: String, required: true },
    photos: [{ type: String }], // profile photos

    // ── Credentials & Authenticity ────────────────
    // This is what makes the app "authentic"
    sampradaya: {
      // Hindu tradition/lineage
      type: String,
      enum: ["Shaiva", "Vaishnava", "Shakta", "Smartha", "Other"],
      required: true,
    },
    gotram: { type: String }, // family lineage
    veda: {
      // Which Veda they're trained in
      type: String,
      enum: ["Rigveda", "Yajurveda", "Samaveda", "Atharvaveda", "Multiple", "N/A"],
    },
    gurukul: { type: String }, // where they trained / institution name
    yearsExperience: { type: Number, default: 0 },

    // ── Languages ─────────────────────────────────
    languages: [
      {
        type: String,
        enum: ["Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Sanskrit", "Marathi", "Bengali", "Gujarati", "Other"],
      },
    ],

    // ── Pooja Specializations ─────────────────────
    // Which pooja types this pandit performs + their pricing per pooja
    pricingList: [PricingSchema],

    // ── Location & Service Area ───────────────────
    city: { type: String, required: true },
    state: { type: String, required: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    travelRadiusKm: { type: Number, default: 20 }, // how far they travel

    // ── Availability ──────────────────────────────
    availability: [AvailabilitySlotSchema],
    // Specific dates they're unavailable (blocked out)
    blockedDates: [{ type: String }], // ["2025-03-15", "2025-03-16"]

    // ── Verification Status ───────────────────────
    // Platform verifies credential docs before pandit goes live
    verificationStatus: {
      type: String,
      enum: ["pending", "under_review", "verified", "rejected"],
      default: "pending",
    },
    verificationNote: { type: String }, // admin note on rejection reason
    // Uploaded credential documents (Cloudinary URLs)
    credentialDocs: [{ type: String }],
    govtIdUrl: { type: String }, // Aadhaar/PAN (stored securely)

    // ── Stats ─────────────────────────────────────
    totalBookings: { type: Number, default: 0 },
    completedBookings: { type: Number, default: 0 },
    cancelledBookings: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalReviews: { type: Number, default: 0 },

    // ── Bio ───────────────────────────────────────
    bio: { type: String, maxlength: 600 },

    // ── Earnings ──────────────────────────────────
    totalEarnings: { type: Number, default: 0 },
    pendingPayout: { type: Number, default: 0 },

    // ── Bank Details (for payouts) ────────────────
    bankDetails: {
      accountHolderName: { type: String },
      accountNumber: { type: String, select: false }, // hidden by default
      ifscCode: { type: String },
      bankName: { type: String },
      upiId: { type: String },
    },

    // ── App State ─────────────────────────────────
    onboardingComplete: { type: Boolean, default: false },
    isActive: { type: Boolean, default: false }, // false until verified
    isAvailableNow: { type: Boolean, default: true }, // pandit can toggle
    lastSeen: { type: Date, default: Date.now },
    pushToken: { type: String },
  },
  { timestamps: true }
);

// Geospatial index for proximity search
PanditSchema.index({ location: "2dsphere" });
PanditSchema.index({ city: 1, verificationStatus: 1, isActive: 1 });
PanditSchema.index({ sampradaya: 1 });
PanditSchema.index({ languages: 1 });
PanditSchema.index({ averageRating: -1 });

module.exports = mongoose.model("Pandit", PanditSchema);

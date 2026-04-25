// src/models/User.js

const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    // ── Auth ──────────────────────────────────────
    googleId: { type: String, unique: true, sparse: true },
    email: { type: String, unique: true, required: true, lowercase: true },
    name: { type: String, required: true },
    phone: { type: String },
    passwordHash: { type: String, select: false },
    avatar: { type: String },

    // ── Role ──────────────────────────────────────
    // "user" = devotee booking pandits
    // "admin" = platform admin
    role: { type: String, enum: ["user", "admin"], default: "user" },

    // ── Location (for finding nearby pandits) ─────
    city: { type: String },
    state: { type: String },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },

    // ── Preferences ───────────────────────────────
    preferredLanguage: {
      type: String,
      enum: ["Hindi", "Telugu", "Tamil", "Kannada", "Malayalam", "Sanskrit", "Marathi", "Bengali", "Gujarati", "Other"],
      default: "Hindi",
    },
    preferredTradition: {
      type: String,
      enum: ["Shaiva", "Vaishnava", "Shakta", "Smartha", "Any"],
      default: "Any",
    },

    // ── App State ─────────────────────────────────
    onboardingComplete: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastSeen: { type: Date, default: Date.now },
    pushToken: { type: String },
  },
  { timestamps: true }
);

// Geospatial index for "pandits near me" queries
UserSchema.index({ location: "2dsphere" });
UserSchema.index({ city: 1 });

module.exports = mongoose.model("User", UserSchema);

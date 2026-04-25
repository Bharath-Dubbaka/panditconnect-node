// src/models/PoojaType.js
// Master catalog of poojas the platform supports.
// Created/managed by admin. Pandits select from this list.
// Each PoojaType has a curated samagri list for the optional delivery feature.

const mongoose = require("mongoose");

// Each item in the samagri list
const SamagriItemRefSchema = new mongoose.Schema(
  {
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SamagriItem",
      required: true,
    },
    quantity: { type: Number, required: true, default: 1 },
    unit: { type: String, default: "piece" }, // piece, gram, litre, etc.
    isOptional: { type: Boolean, default: false },
    note: { type: String }, // e.g. "Use 2 if doing for joint family"
  },
  { _id: false }
);

const PoojaTypeSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────
    name: { type: String, required: true, unique: true },     // "Satyanarayan Pooja"
    nameHindi: { type: String },                              // "सत्यनारायण पूजा"
    nameTelugu: { type: String },                             // "సత్యనారాయణ పూజ"
    slug: { type: String, required: true, unique: true },     // "satyanarayan-pooja"
    category: {
      type: String,
      enum: [
        "Griha",      // home/property rituals (griha pravesh, vastu)
        "Life Event", // birth, naming, upanayanam, wedding, death rites
        "Festival",   // Ganesh, Navratri, Diwali, etc.
        "Navagraha",  // planetary remedies
        "Weekly",     // Monday Shiv pooja, Saturday Shani, etc.
        "Custom",     // specific deity worship
      ],
      required: true,
    },

    // ── Description ───────────────────────────────
    description: { type: String },
    shortDescription: { type: String, maxlength: 160 }, // for cards
    significance: { type: String }, // why this pooja is performed
    bestTime: { type: String }, // e.g. "Morning, Ekadashi, Full Moon"
    deity: { type: String }, // Primary deity — "Lord Vishnu"

    // ── Duration & Logistics ──────────────────────
    minDurationMinutes: { type: Number, default: 60 },
    maxDurationMinutes: { type: Number, default: 120 },

    // ── Samagri ───────────────────────────────────
    // Curated samagri list for this pooja
    samagriList: [SamagriItemRefSchema],
    // Estimated total samagri kit price (computed, stored for display)
    estimatedSamagriPrice: { type: Number, default: 0 },

    // ── Media ─────────────────────────────────────
    imageUrl: { type: String },
    iconEmoji: { type: String, default: "🪔" },

    // ── Platform ──────────────────────────────────
    isActive: { type: Boolean, default: true },
    isFeatured: { type: Boolean, default: false }, // shown on home screen
    sortOrder: { type: Number, default: 0 }, // display order
  },
  { timestamps: true }
);

PoojaTypeSchema.index({ category: 1, isActive: 1 });
PoojaTypeSchema.index({ isFeatured: 1 });
PoojaTypeSchema.index({ slug: 1 });

module.exports = mongoose.model("PoojaType", PoojaTypeSchema);

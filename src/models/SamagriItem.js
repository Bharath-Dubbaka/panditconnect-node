// src/models/SamagriItem.js
// Individual ritual items (flowers, incense, ghee, etc.)
// These are referenced by PoojaType.samagriList.
// Can be ordered as a kit or individually.

const mongoose = require("mongoose");

const SamagriItemSchema = new mongoose.Schema(
  {
    // ── Identity ──────────────────────────────────
    name: { type: String, required: true },         // "Cow Ghee"
    nameHindi: { type: String },                    // "गाय का घी"
    nameTelugu: { type: String },                   // "ఆవు నెయ్యి"
    slug: { type: String, required: true, unique: true },

    // ── Classification ────────────────────────────
    category: {
      type: String,
      enum: [
        "Flowers",      // fresh flowers, garlands
        "Incense",      // agarbatti, dhoop
        "Lamps",        // diyas, candles, camphor
        "Grains",       // rice, wheat, sesame
        "Fruits",       // coconut, banana, mango
        "Dairy",        // ghee, milk, curd, honey
        "Cloth",        // vastram, sacred thread
        "Metals",       // copper/brass items
        "Herbs",        // tulsi, bilva leaves
        "Sweets",       // prasad items
        "Misc",
      ],
      required: true,
    },

    // ── Pricing ───────────────────────────────────
    pricePerUnit: { type: Number, required: true }, // ₹ per base unit
    unit: { type: String, default: "piece" },       // piece, gram, ml, bunch

    // ── Inventory ─────────────────────────────────
    inStock: { type: Boolean, default: true },
    stockQuantity: { type: Number, default: 999 },  // platform's stock

    // ── Display ───────────────────────────────────
    description: { type: String },
    imageUrl: { type: String },
    iconEmoji: { type: String, default: "🪔" },

    // ── Platform ──────────────────────────────────
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

SamagriItemSchema.index({ category: 1, isActive: 1 });
SamagriItemSchema.index({ inStock: 1 });

module.exports = mongoose.model("SamagriItem", SamagriItemSchema);

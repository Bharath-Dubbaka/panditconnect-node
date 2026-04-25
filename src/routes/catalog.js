// src/routes/catalog.js
// Public catalog routes — no auth needed for browsing.
// GET /api/catalog/poojas           ← all pooja types
// GET /api/catalog/poojas/:id       ← single pooja with samagri list
// GET /api/catalog/poojas/category/:category
// GET /api/catalog/samagri          ← all samagri items
// GET /api/catalog/samagri/kit/:poojaTypeId  ← kit for a specific pooja

const express = require("express");
const PoojaType = require("../models/PoojaType");
const SamagriItem = require("../models/SamagriItem");

const router = express.Router();

// ─────────────────────────────────────────────────────────
// GET /api/catalog/poojas
// All active pooja types — used for home screen grid
// Query: category, featured
// ─────────────────────────────────────────────────────────
router.get("/poojas", async (req, res) => {
  try {
    const { category, featured } = req.query;
    const query = { isActive: true };
    if (category) query.category = category;
    if (featured === "true") query.isFeatured = true;

    const poojas = await PoojaType.find(query)
      .select("name nameHindi slug category iconEmoji imageUrl shortDescription deity minDurationMinutes estimatedSamagriPrice isFeatured sortOrder")
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    return res.json({ success: true, count: poojas.length, poojas });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/catalog/poojas/category/:category
// ─────────────────────────────────────────────────────────
router.get("/poojas/category/:category", async (req, res) => {
  try {
    const poojas = await PoojaType.find({
      isActive: true,
      category: req.params.category,
    })
      .sort({ sortOrder: 1, name: 1 })
      .lean();

    return res.json({ success: true, count: poojas.length, poojas });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/catalog/poojas/:id  or  /poojas/slug/:slug
// Full pooja details with populated samagri list
// ─────────────────────────────────────────────────────────
router.get("/poojas/:id", async (req, res) => {
  try {
    // Support both MongoDB id and slug
    const isSlug = !req.params.id.match(/^[0-9a-fA-F]{24}$/);
    const query = isSlug
      ? { slug: req.params.id, isActive: true }
      : { _id: req.params.id, isActive: true };

    const pooja = await PoojaType.findOne(query)
      .populate("samagriList.itemId", "name nameHindi category pricePerUnit unit imageUrl iconEmoji")
      .lean();

    if (!pooja)
      return res.status(404).json({ success: false, message: "Pooja type not found" });

    return res.json({ success: true, pooja });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/catalog/samagri
// All available samagri items
// Query: category, inStockOnly
// ─────────────────────────────────────────────────────────
router.get("/samagri", async (req, res) => {
  try {
    const { category, inStockOnly = "true" } = req.query;
    const query = { isActive: true };
    if (category) query.category = category;
    if (inStockOnly === "true") query.inStock = true;

    const items = await SamagriItem.find(query)
      .sort({ category: 1, name: 1 })
      .lean();

    return res.json({ success: true, count: items.length, items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/catalog/samagri/kit/:poojaTypeId
// Returns the curated samagri kit for a specific pooja
// with quantities and estimated total price
// ─────────────────────────────────────────────────────────
router.get("/samagri/kit/:poojaTypeId", async (req, res) => {
  try {
    const pooja = await PoojaType.findById(req.params.poojaTypeId)
      .populate("samagriList.itemId", "name nameHindi category pricePerUnit unit imageUrl iconEmoji inStock")
      .lean();

    if (!pooja)
      return res.status(404).json({ success: false, message: "Pooja type not found" });

    // Build kit with computed totals
    const kit = pooja.samagriList.map((entry) => ({
      item: entry.itemId,
      quantity: entry.quantity,
      unit: entry.unit,
      isOptional: entry.isOptional,
      note: entry.note,
      lineTotal: entry.itemId ? Math.round(entry.itemId.pricePerUnit * entry.quantity) : 0,
    }));

    const mandatoryTotal = kit
      .filter((k) => !k.isOptional)
      .reduce((sum, k) => sum + k.lineTotal, 0);
    const optionalTotal = kit
      .filter((k) => k.isOptional)
      .reduce((sum, k) => sum + k.lineTotal, 0);

    return res.json({
      success: true,
      poojaName: pooja.name,
      kit,
      mandatoryTotal,
      optionalTotal,
      fullKitTotal: mandatoryTotal + optionalTotal,
      deliveryFee: 49, // flat ₹49
      grandTotal: mandatoryTotal + optionalTotal + 49,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

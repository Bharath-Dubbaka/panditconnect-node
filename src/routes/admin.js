// src/routes/admin.js
// Admin-only routes for platform management.
// All routes require protect + requireAdmin middleware.
//
// GET  /api/admin/pandits/pending     ← pandits awaiting verification
// PATCH /api/admin/pandits/:id/verify ← approve/reject a pandit
// GET  /api/admin/bookings            ← all platform bookings
// GET  /api/admin/stats               ← platform-wide stats
// POST /api/admin/poojas              ← create new pooja type
// PATCH /api/admin/poojas/:id         ← update pooja type
// POST /api/admin/samagri             ← add samagri item
// GET  /api/admin/payouts/pending     ← pending pandit payouts
// PATCH /api/admin/payouts/:id/pay    ← mark payout as paid

const express = require("express");
const Pandit = require("../models/Pandit");
const User = require("../models/User");
const Booking = require("../models/Booking");
const PoojaType = require("../models/PoojaType");
const SamagriItem = require("../models/SamagriItem");
const Payout = require("../models/Payout");
const { protect, requireAdmin } = require("../middleware/auth");

const router = express.Router();
router.use(protect, requireAdmin);

// ── Helper: send Expo push ────────────────────────────────────────────────────
const sendPush = async (pushToken, title, body) => {
  if (!pushToken?.startsWith("ExponentPushToken")) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, sound: "default" }),
    });
  } catch {}
};

// ─────────────────────────────────────────────────────────
// GET /api/admin/stats
// Platform overview dashboard numbers
// ─────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
  try {
    const [
      totalUsers,
      totalPandits,
      verifiedPandits,
      pendingVerification,
      totalBookings,
      completedBookings,
      totalRevenue,
    ] = await Promise.all([
      User.countDocuments({ role: "user" }),
      Pandit.countDocuments(),
      Pandit.countDocuments({ verificationStatus: "verified" }),
      Pandit.countDocuments({ verificationStatus: "under_review" }),
      Booking.countDocuments(),
      Booking.countDocuments({ status: "completed" }),
      Booking.aggregate([
        { $match: { status: "completed", paymentStatus: "paid" } },
        { $group: { _id: null, total: { $sum: "$platformFee" } } },
      ]),
    ]);

    return res.json({
      success: true,
      stats: {
        users: { total: totalUsers },
        pandits: { total: totalPandits, verified: verifiedPandits, pendingVerification },
        bookings: { total: totalBookings, completed: completedBookings },
        revenue: { platformFees: totalRevenue[0]?.total || 0 },
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/admin/pandits/pending
// Pandits submitted for review
// ─────────────────────────────────────────────────────────
router.get("/pandits/pending", async (req, res) => {
  try {
    const pandits = await Pandit.find({ verificationStatus: "under_review" })
      .select("-passwordHash -bankDetails")
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ success: true, count: pandits.length, pandits });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/admin/pandits/:id/verify
// Approve or reject a pandit's verification
// Body: { action: "approve" | "reject", note }
// ─────────────────────────────────────────────────────────
router.patch("/pandits/:id/verify", async (req, res) => {
  try {
    const { action, note } = req.body;
    if (!["approve", "reject"].includes(action))
      return res.status(400).json({ success: false, message: "action must be 'approve' or 'reject'" });

    const update =
      action === "approve"
        ? { verificationStatus: "verified", isActive: true, verificationNote: note || "" }
        : { verificationStatus: "rejected", isActive: false, verificationNote: note || "Application rejected" };

    const pandit = await Pandit.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!pandit)
      return res.status(404).json({ success: false, message: "Pandit not found" });

    // Notify pandit
    if (action === "approve") {
      await sendPush(pandit.pushToken, "🎉 You're Verified!", "Your profile has been verified. You can now receive booking requests on PanditConnect!");
    } else {
      await sendPush(pandit.pushToken, "Profile Update Required", `Your verification was not approved. Reason: ${note || "Please contact support"}`);
    }

    return res.json({ success: true, message: `Pandit ${action}d`, pandit });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/admin/bookings
// All platform bookings with filters
// Query: status, date, panditId, userId, page, limit
// ─────────────────────────────────────────────────────────
router.get("/bookings", async (req, res) => {
  try {
    const { status, date, panditId, userId, page = 1, limit = 30 } = req.query;
    const query = {};
    if (status) query.status = status;
    if (date) query.scheduledDate = date;
    if (panditId) query.panditId = panditId;
    if (userId) query.userId = userId;

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .sort({ createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit))
        .populate("panditId", "name phone")
        .populate("userId", "name phone")
        .populate("poojaTypeId", "name")
        .lean(),
      Booking.countDocuments(query),
    ]);

    return res.json({ success: true, count: bookings.length, total, bookings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/admin/poojas
// Create a new pooja type in the catalog
// ─────────────────────────────────────────────────────────
router.post("/poojas", async (req, res) => {
  try {
    const {
      name, nameHindi, nameTelugu, slug, category, description, shortDescription,
      significance, bestTime, deity, minDurationMinutes, maxDurationMinutes,
      imageUrl, iconEmoji, isFeatured, sortOrder,
    } = req.body;

    if (!name || !slug || !category)
      return res.status(400).json({ success: false, message: "name, slug, category required" });

    const pooja = await PoojaType.create({
      name, nameHindi, nameTelugu, slug, category, description, shortDescription,
      significance, bestTime, deity, minDurationMinutes, maxDurationMinutes,
      imageUrl, iconEmoji, isFeatured, sortOrder,
    });

    return res.status(201).json({ success: true, pooja });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Pooja with this name/slug already exists" });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/admin/poojas/:id
// Update pooja type (including samagri list)
// ─────────────────────────────────────────────────────────
router.patch("/poojas/:id", async (req, res) => {
  try {
    const allowed = [
      "name", "nameHindi", "nameTelugu", "description", "shortDescription",
      "significance", "bestTime", "deity", "minDurationMinutes", "maxDurationMinutes",
      "imageUrl", "iconEmoji", "isFeatured", "isActive", "sortOrder",
      "samagriList", "estimatedSamagriPrice",
    ];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const pooja = await PoojaType.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!pooja)
      return res.status(404).json({ success: false, message: "Pooja not found" });

    return res.json({ success: true, pooja });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/admin/samagri
// Add a new samagri item to the catalog
// ─────────────────────────────────────────────────────────
router.post("/samagri", async (req, res) => {
  try {
    const { name, nameHindi, nameTelugu, slug, category, pricePerUnit, unit, description, imageUrl, iconEmoji } = req.body;
    if (!name || !slug || !category || !pricePerUnit)
      return res.status(400).json({ success: false, message: "name, slug, category, pricePerUnit required" });

    const item = await SamagriItem.create({ name, nameHindi, nameTelugu, slug, category, pricePerUnit, unit, description, imageUrl, iconEmoji });
    return res.status(201).json({ success: true, item });
  } catch (err) {
    if (err.code === 11000)
      return res.status(409).json({ success: false, message: "Item with this slug already exists" });
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/admin/samagri/:id
// Update a samagri item (price, stock, etc.)
// ─────────────────────────────────────────────────────────
router.patch("/samagri/:id", async (req, res) => {
  try {
    const allowed = ["name", "nameHindi", "nameTelugu", "category", "pricePerUnit", "unit", "description", "imageUrl", "iconEmoji", "inStock", "stockQuantity", "isActive"];
    const updates = {};
    allowed.forEach((f) => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });

    const item = await SamagriItem.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!item)
      return res.status(404).json({ success: false, message: "Item not found" });

    return res.json({ success: true, item });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/admin/payouts/pending
// Pandits with pending earnings to be paid out
// ─────────────────────────────────────────────────────────
router.get("/payouts/pending", async (req, res) => {
  try {
    // Find pandits with pending payout balance > 0
    const pandits = await Pandit.find({ pendingPayout: { $gt: 0 } })
      .select("name phone email pendingPayout bankDetails")
      .lean();

    return res.json({ success: true, count: pandits.length, pandits });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/admin/payouts
// Create a payout record + mark associated bookings as paid out
// Body: { panditId, bookingIds, paymentMethod, transactionId }
// ─────────────────────────────────────────────────────────
router.post("/payouts", async (req, res) => {
  try {
    const { panditId, bookingIds, paymentMethod = "upi", transactionId, upiId } = req.body;

    // Sum up the payout amounts from these bookings
    const bookings = await Booking.find({
      _id: { $in: bookingIds },
      panditId,
      payoutStatus: "pending",
    });

    const grossAmount = bookings.reduce((sum, b) => sum + (b.panditFee || 0), 0);
    const platformCommission = bookings.reduce((sum, b) => sum + (b.platformFee || 0), 0);
    const netAmount = bookings.reduce((sum, b) => sum + (b.payoutAmount || 0), 0);

    const payout = await Payout.create({
      panditId,
      bookingIds,
      grossAmount,
      platformCommission,
      netAmount,
      paymentMethod,
      transactionId,
      upiId,
      status: "paid",
      paidAt: new Date(),
      processedBy: req.user._id.toString(),
    });

    // Mark bookings as paid out
    await Booking.updateMany(
      { _id: { $in: bookingIds } },
      { payoutStatus: "paid", payoutDate: new Date() }
    );

    // Reduce pandit's pendingPayout
    await Pandit.findByIdAndUpdate(panditId, {
      $inc: { pendingPayout: -netAmount },
    });

    // Notify pandit
    const pandit = await Pandit.findById(panditId).select("pushToken name");
    await sendPush(pandit?.pushToken, "💰 Payment Received!", `₹${netAmount} has been transferred to your account.`);

    return res.status(201).json({ success: true, payout });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

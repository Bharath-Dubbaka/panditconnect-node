// src/routes/panditDashboard.js
// Routes for the pandit's own dashboard.
// GET  /api/pandit/dashboard    ← stats overview
// GET  /api/pandit/earnings     ← earnings history
// PATCH /api/pandit/availability ← update availability
// PATCH /api/pandit/availability/block  ← block specific dates
// PATCH /api/pandit/toggle-availability ← go online/offline

const express = require("express");
const Pandit = require("../models/Pandit");
const Booking = require("../models/Booking");
const Payout = require("../models/Payout");
const { protect, requirePandit } = require("../middleware/auth");

const router = express.Router();
router.use(protect, requirePandit);

// ─────────────────────────────────────────────────────────
// GET /api/pandit/dashboard
// Overview stats for pandit's home screen
// ─────────────────────────────────────────────────────────
router.get("/dashboard", async (req, res) => {
  try {
    const panditId = req.user._id;

    // Bookings today
    const today = new Date().toISOString().split("T")[0];
    const [todayBookings, pendingCount, upcomingBookings] = await Promise.all([
      Booking.find({ panditId, scheduledDate: today, status: { $in: ["accepted", "in_progress"] } })
        .populate("userId", "name phone")
        .populate("poojaTypeId", "name iconEmoji")
        .lean(),
      Booking.countDocuments({ panditId, status: "pending_pandit" }),
      Booking.find({
        panditId,
        status: "accepted",
        scheduledDate: { $gte: today },
      })
        .sort({ scheduledDate: 1, scheduledTime: 1 })
        .limit(5)
        .populate("userId", "name phone")
        .populate("poojaTypeId", "name iconEmoji")
        .lean(),
    ]);

    const pandit = await Pandit.findById(panditId)
      .select("totalBookings completedBookings averageRating totalReviews totalEarnings pendingPayout isAvailableNow verificationStatus")
      .lean();

    return res.json({
      success: true,
      dashboard: {
        ...pandit,
        todayBookings,
        pendingRequestsCount: pendingCount,
        upcomingBookings,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/pandit/earnings
// Earnings breakdown with payout history
// ─────────────────────────────────────────────────────────
router.get("/earnings", async (req, res) => {
  try {
    const panditId = req.user._id;
    const { month } = req.query; // optional "YYYY-MM" filter

    // Completed bookings with payment
    const bookingQuery = {
      panditId,
      status: "completed",
      paymentStatus: "paid",
    };
    if (month) {
      bookingQuery.scheduledDate = { $regex: `^${month}` };
    }

    const [completedBookings, payouts, pandit] = await Promise.all([
      Booking.find(bookingQuery)
        .select("poojaName scheduledDate panditFee payoutAmount payoutStatus samagriOption")
        .sort({ completedAt: -1 })
        .limit(50)
        .lean(),
      Payout.find({ panditId })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
      Pandit.findById(panditId).select("totalEarnings pendingPayout").lean(),
    ]);

    return res.json({
      success: true,
      earnings: {
        totalEarnings: pandit.totalEarnings,
        pendingPayout: pandit.pendingPayout,
        completedBookings,
        payoutHistory: payouts,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/pandit/availability
// Update weekly schedule
// Body: { availability: [{ day, startTime, endTime }] }
// ─────────────────────────────────────────────────────────
router.patch("/availability", async (req, res) => {
  try {
    const { availability } = req.body;
    if (!availability?.length)
      return res.status(400).json({ success: false, message: "availability array required" });

    await Pandit.findByIdAndUpdate(req.user._id, { availability });
    return res.json({ success: true, message: "Availability updated" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/pandit/availability/block
// Add or remove blocked dates
// Body: { date: "YYYY-MM-DD", action: "block" | "unblock" }
// ─────────────────────────────────────────────────────────
router.patch("/availability/block", async (req, res) => {
  try {
    const { date, action } = req.body;
    if (!date || !action)
      return res.status(400).json({ success: false, message: "date and action required" });

    const update =
      action === "block"
        ? { $addToSet: { blockedDates: date } }
        : { $pull: { blockedDates: date } };

    await Pandit.findByIdAndUpdate(req.user._id, update);
    return res.json({ success: true, message: `Date ${action}ed: ${date}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/pandit/toggle-availability
// Quick toggle — pandit goes online/offline immediately
// Body: { isAvailableNow: true | false }
// ─────────────────────────────────────────────────────────
router.patch("/toggle-availability", async (req, res) => {
  try {
    const { isAvailableNow } = req.body;
    await Pandit.findByIdAndUpdate(req.user._id, { isAvailableNow });
    return res.json({
      success: true,
      isAvailableNow,
      message: isAvailableNow ? "You are now online ✅" : "You are now offline 🔴",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/pandit/bank-details
// Update bank/UPI details for payouts
// Body: { accountHolderName, accountNumber, ifscCode, bankName, upiId }
// ─────────────────────────────────────────────────────────
router.patch("/bank-details", async (req, res) => {
  try {
    const { accountHolderName, accountNumber, ifscCode, bankName, upiId } = req.body;
    await Pandit.findByIdAndUpdate(req.user._id, {
      bankDetails: { accountHolderName, accountNumber, ifscCode, bankName, upiId },
    });
    return res.json({ success: true, message: "Bank details saved" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

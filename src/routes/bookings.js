// src/routes/bookings.js
// Core booking lifecycle routes.
//
// USER routes:
//   POST   /api/bookings                  ← create booking
//   GET    /api/bookings                  ← user's booking history
//   GET    /api/bookings/:id              ← single booking details
//   PATCH  /api/bookings/:id/cancel       ← user cancels
//   POST   /api/bookings/:id/review       ← submit review after completion
//
// PANDIT routes:
//   GET    /api/bookings/pandit/incoming  ← new requests
//   GET    /api/bookings/pandit/all       ← all bookings
//   PATCH  /api/bookings/:id/accept       ← pandit accepts
//   PATCH  /api/bookings/:id/decline      ← pandit declines
//   PATCH  /api/bookings/:id/start        ← pandit marks in-progress
//   PATCH  /api/bookings/:id/complete     ← pandit marks done

const express = require("express");
const Booking = require("../models/Booking");
const Pandit = require("../models/Pandit");
const PoojaType = require("../models/PoojaType");
const SamagriItem = require("../models/SamagriItem");
const Review = require("../models/Review");
const User = require("../models/User");
const { protect, requireUser, requirePandit } = require("../middleware/auth");

const router = express.Router();
router.use(protect);

// ── Helper: send Expo push notification (same pattern as VedicFind) ───────────
const sendPush = async (pushToken, title, body, data = {}) => {
  if (!pushToken?.startsWith("ExponentPushToken")) return;
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, data, sound: "default" }),
    });
  } catch {}
};

// ── Helper: get io instance from app (set in app.js) ─────────────────────────
const getIO = (req) => req.app.get("io");

// ── PLATFORM COMMISSION ───────────────────────────────────────────────────────
const PLATFORM_COMMISSION_PCT = 10; // 10% of pandit fee

// ─────────────────────────────────────────────────────────
// POST /api/bookings  (user only)
// Creates a new booking. Payment happens after pandit accepts.
// Body: { panditId, poojaTypeId, scheduledDate, scheduledTime,
//         address, samagriOption, samagriItems, userNote }
// ─────────────────────────────────────────────────────────
router.post("/", requireUser, async (req, res) => {
  try {
    const {
      panditId,
      poojaTypeId,
      scheduledDate,
      scheduledTime,
      address,
      samagriOption = "self",
      samagriItems = [],
      userNote,
    } = req.body;

    // Validate required fields
    if (!panditId || !poojaTypeId || !scheduledDate || !scheduledTime || !address)
      return res.status(400).json({ success: false, message: "panditId, poojaTypeId, scheduledDate, scheduledTime, address required" });

    // Load pandit + pooja type
    const [pandit, poojaType] = await Promise.all([
      Pandit.findOne({ _id: panditId, verificationStatus: "verified", isActive: true }),
      PoojaType.findOne({ _id: poojaTypeId, isActive: true }),
    ]);

    if (!pandit) return res.status(404).json({ success: false, message: "Pandit not found or unavailable" });
    if (!poojaType) return res.status(404).json({ success: false, message: "Pooja type not found" });

    // Find pandit's pricing for this pooja type
    const panditPricing = pandit.pricingList?.find(
      (p) => p.poojaTypeId?.toString() === poojaTypeId
    );
    if (!panditPricing)
      return res.status(400).json({ success: false, message: "This pandit does not offer this pooja" });

    // Check pandit isn't already booked for this slot
    const conflict = await Booking.findOne({
      panditId,
      scheduledDate,
      scheduledTime,
      status: { $in: ["pending_pandit", "accepted", "in_progress"] },
    });
    if (conflict)
      return res.status(409).json({ success: false, message: "Pandit already has a booking at this time" });

    // Calculate samagri total if platform delivery chosen
    let samagriTotal = 0;
    let samagriOrderItems = [];
    if (samagriOption === "platform" && samagriItems.length) {
      for (const item of samagriItems) {
        const samagriDoc = await SamagriItem.findOne({ _id: item.itemId, isActive: true, inStock: true });
        if (!samagriDoc) continue;
        const total = samagriDoc.pricePerUnit * item.quantity;
        samagriTotal += total;
        samagriOrderItems.push({
          itemId: samagriDoc._id,
          name: samagriDoc.name,
          quantity: item.quantity,
          unit: samagriDoc.unit,
          pricePerUnit: samagriDoc.pricePerUnit,
          totalPrice: total,
        });
      }
    }

    const panditFee = panditPricing.basePrice;
    const platformFee = Math.round(panditFee * PLATFORM_COMMISSION_PCT / 100);
    const deliveryFee = samagriOption === "platform" && samagriTotal > 0 ? 49 : 0; // flat ₹49 delivery
    const totalAmount = panditFee + samagriTotal + deliveryFee;
    // Accept deadline: pandit must respond within 2 hours
    const acceptDeadline = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const booking = await Booking.create({
      userId: req.user._id,
      panditId,
      poojaTypeId,
      poojaName: poojaType.name,
      scheduledDate,
      scheduledTime,
      durationMinutes: panditPricing.durationMinutes,
      address,
      samagriOption,
      samagriItems: samagriOrderItems,
      samagriDeliveryStatus: samagriOption === "platform" ? "pending" : "not_applicable",
      panditFee,
      platformFee,
      samagriTotal,
      deliveryFee,
      totalAmount,
      payoutAmount: panditFee - platformFee,
      userNote,
      status: "pending_pandit",
      acceptDeadline,
    });

    // Notify pandit via push + socket
    const io = getIO(req);
    if (io) io.to(`user:${panditId}`).emit("booking:new", { bookingId: booking._id, poojaName: poojaType.name });
    await sendPush(pandit.pushToken, "New Booking Request 🙏", `${req.user.name} has booked you for ${poojaType.name} on ${scheduledDate}`, { type: "booking_new", bookingId: booking._id.toString() });

    return res.status(201).json({
      success: true,
      booking,
      message: "Booking created! Waiting for pandit confirmation.",
    });
  } catch (err) {
    console.error("[BOOKINGS/CREATE]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/bookings  (user — their bookings)
// Query: status, page, limit
// ─────────────────────────────────────────────────────────
router.get("/", requireUser, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const query = { userId: req.user._id };
    if (status) query.status = status;

    const bookings = await Booking.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .populate("panditId", "name photos averageRating sampradaya")
      .populate("poojaTypeId", "name iconEmoji")
      .lean();

    return res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/bookings/pandit/incoming  (pandit only)
// Pending requests awaiting response
// ─────────────────────────────────────────────────────────
router.get("/pandit/incoming", requirePandit, async (req, res) => {
  try {
    const bookings = await Booking.find({
      panditId: req.user._id,
      status: "pending_pandit",
    })
      .sort({ createdAt: -1 })
      .populate("userId", "name phone avatar city")
      .populate("poojaTypeId", "name iconEmoji category")
      .lean();

    return res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/bookings/pandit/all  (pandit only)
// All bookings for the pandit (with filter)
// ─────────────────────────────────────────────────────────
router.get("/pandit/all", requirePandit, async (req, res) => {
  try {
    const { status, date } = req.query;
    const query = { panditId: req.user._id };
    if (status) query.status = status;
    if (date) query.scheduledDate = date;

    const bookings = await Booking.find(query)
      .sort({ scheduledDate: 1, scheduledTime: 1 })
      .populate("userId", "name phone avatar")
      .populate("poojaTypeId", "name iconEmoji")
      .lean();

    return res.json({ success: true, count: bookings.length, bookings });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/bookings/:id (user or pandit who owns it)
// ─────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate("panditId", "name photos sampradaya languages averageRating phone")
      .populate("poojaTypeId", "name iconEmoji description category")
      .populate("userId", "name phone avatar")
      .populate("samagriItems.itemId", "name imageUrl")
      .lean();

    if (!booking)
      return res.status(404).json({ success: false, message: "Booking not found" });

    // Access control: only the user or pandit involved can view
    const isOwner =
      booking.userId?._id?.toString() === req.user._id.toString() ||
      booking.panditId?._id?.toString() === req.user._id.toString();

    if (!isOwner)
      return res.status(403).json({ success: false, message: "Access denied" });

    return res.json({ success: true, booking });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/bookings/:id/accept  (pandit only)
// ─────────────────────────────────────────────────────────
router.patch("/:id/accept", requirePandit, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      panditId: req.user._id,
      status: "pending_pandit",
    });
    if (!booking)
      return res.status(404).json({ success: false, message: "Booking not found or already actioned" });

    booking.status = "accepted";
    booking.acceptedAt = new Date();
    await booking.save();

    // Notify user
    const user = await User.findById(booking.userId).select("pushToken name");
    const io = getIO(req);
    if (io) io.to(`user:${booking.userId}`).emit("booking:accepted", { bookingId: booking._id });
    await sendPush(user?.pushToken, "Booking Confirmed! 🙏", `${req.user.name} has accepted your booking for ${booking.poojaName}`, { type: "booking_accepted", bookingId: booking._id.toString() });

    return res.json({ success: true, message: "Booking accepted", booking });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/bookings/:id/decline  (pandit only)
// Body: { reason }
// ─────────────────────────────────────────────────────────
router.patch("/:id/decline", requirePandit, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      panditId: req.user._id,
      status: "pending_pandit",
    });
    if (!booking)
      return res.status(404).json({ success: false, message: "Booking not found" });

    booking.status = "cancelled_pandit";
    booking.cancellationReason = req.body.reason || "Pandit unavailable";
    booking.cancelledAt = new Date();
    await booking.save();

    await Pandit.findByIdAndUpdate(req.user._id, { $inc: { cancelledBookings: 1 } });

    // Notify user
    const user = await User.findById(booking.userId).select("pushToken");
    await sendPush(user?.pushToken, "Booking Update", `Your booking for ${booking.poojaName} was declined. Please choose another pandit.`, { type: "booking_declined", bookingId: booking._id.toString() });

    return res.json({ success: true, message: "Booking declined" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/bookings/:id/start  (pandit only)
// Pandit marks pooja as started
// ─────────────────────────────────────────────────────────
router.patch("/:id/start", requirePandit, async (req, res) => {
  try {
    const booking = await Booking.findOneAndUpdate(
      { _id: req.params.id, panditId: req.user._id, status: "accepted" },
      { status: "in_progress", startedAt: new Date() },
      { new: true }
    );
    if (!booking)
      return res.status(404).json({ success: false, message: "Booking not found or not in accepted state" });

    const io = getIO(req);
    if (io) io.to(`user:${booking.userId}`).emit("booking:started", { bookingId: booking._id });

    return res.json({ success: true, message: "Pooja started 🙏", booking });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/bookings/:id/complete  (pandit only)
// Pandit marks pooja as completed → triggers review prompt
// ─────────────────────────────────────────────────────────
router.patch("/:id/complete", requirePandit, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      panditId: req.user._id,
      status: "in_progress",
    });
    if (!booking)
      return res.status(404).json({ success: false, message: "Booking not found or not in progress" });

    booking.status = "completed";
    booking.completedAt = new Date();
    booking.payoutStatus = "pending"; // admin processes payouts
    await booking.save();

    // Update pandit stats
    await Pandit.findByIdAndUpdate(req.user._id, {
      $inc: {
        completedBookings: 1,
        totalBookings: 1,
        totalEarnings: booking.payoutAmount || 0,
        pendingPayout: booking.payoutAmount || 0,
      },
    });

    // Notify user to leave a review
    const user = await User.findById(booking.userId).select("pushToken");
    const io = getIO(req);
    if (io) io.to(`user:${booking.userId}`).emit("booking:completed", { bookingId: booking._id });
    await sendPush(user?.pushToken, "Pooja Completed 🪔", `How was your experience with ${req.user.name}? Please leave a review!`, { type: "booking_completed", bookingId: booking._id.toString() });

    return res.json({ success: true, message: "Booking marked as completed", booking });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/bookings/:id/cancel  (user only)
// ─────────────────────────────────────────────────────────
router.patch("/:id/cancel", requireUser, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user._id,
      status: { $in: ["pending_pandit", "accepted"] },
    });
    if (!booking)
      return res.status(404).json({ success: false, message: "Cannot cancel this booking" });

    booking.status = "cancelled_user";
    booking.cancellationReason = req.body.reason || "Cancelled by user";
    booking.cancelledAt = new Date();
    await booking.save();

    // Notify pandit
    const pandit = await Pandit.findById(booking.panditId).select("pushToken");
    await sendPush(pandit?.pushToken, "Booking Cancelled", `${req.user.name} cancelled the booking for ${booking.poojaName} on ${booking.scheduledDate}`, { type: "booking_cancelled", bookingId: booking._id.toString() });

    return res.json({ success: true, message: "Booking cancelled" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/bookings/:id/review  (user only)
// Submit review after booking is completed
// ─────────────────────────────────────────────────────────
router.post("/:id/review", requireUser, async (req, res) => {
  try {
    const booking = await Booking.findOne({
      _id: req.params.id,
      userId: req.user._id,
      status: "completed",
      isReviewed: false,
    });
    if (!booking)
      return res.status(404).json({ success: false, message: "Booking not found, not completed, or already reviewed" });

    const { rating, comment, punctualityRating, knowledgeRating, behaviorRating } = req.body;
    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ success: false, message: "Rating must be 1-5" });

    const review = await Review.create({
      bookingId: booking._id,
      userId: req.user._id,
      panditId: booking.panditId,
      poojaTypeId: booking.poojaTypeId,
      rating,
      comment,
      punctualityRating,
      knowledgeRating,
      behaviorRating,
    });

    // Mark booking as reviewed
    booking.isReviewed = true;
    booking.reviewId = review._id;
    await booking.save();

    // Recalculate pandit average rating
    const allReviews = await Review.find({ panditId: booking.panditId, isVisible: true }).select("rating");
    const avgRating = allReviews.reduce((sum, r) => sum + r.rating, 0) / allReviews.length;
    await Pandit.findByIdAndUpdate(booking.panditId, {
      averageRating: Math.round(avgRating * 10) / 10,
      totalReviews: allReviews.length,
    });

    return res.status(201).json({ success: true, review, message: "Review submitted. Thank you! 🙏" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

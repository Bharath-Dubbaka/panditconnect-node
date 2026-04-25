// src/routes/pandits.js
// Public + authenticated routes for browsing and searching pandits.
// GET /api/pandits              ← list with filters
// GET /api/pandits/nearby       ← by geo location
// GET /api/pandits/:id          ← full profile
// GET /api/pandits/:id/slots    ← available time slots for a date

const express = require("express");
const Pandit = require("../models/Pandit");
const Booking = require("../models/Booking");
const Review = require("../models/Review");
const { protect, requireUser } = require("../middleware/auth");

const router = express.Router();

// ─────────────────────────────────────────────────────────
// GET /api/pandits
// Query params: city, poojaTypeId, language, sampradaya, minRating, page, limit
// ─────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  try {
    const {
      city,
      poojaTypeId,
      language,
      sampradaya,
      minRating = 0,
      page = 1,
      limit = 20,
    } = req.query;

    const query = {
      verificationStatus: "verified",
      isActive: true,
      onboardingComplete: true,
    };

    if (city) query.city = new RegExp(city, "i");
    if (language) query.languages = language;
    if (sampradaya) query.sampradaya = sampradaya;
    if (parseFloat(minRating) > 0) query.averageRating = { $gte: parseFloat(minRating) };
    // Filter by pooja type — pandit must have it in their pricing list
    if (poojaTypeId) query["pricingList.poojaTypeId"] = poojaTypeId;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [pandits, total] = await Promise.all([
      Pandit.find(query)
        .select("name photos sampradaya languages city averageRating totalReviews yearsExperience bio pricingList isAvailableNow travelRadiusKm")
        .sort({ averageRating: -1, completedBookings: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Pandit.countDocuments(query),
    ]);

    return res.json({
      success: true,
      count: pandits.length,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit)),
      pandits,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/pandits/nearby
// Find pandits within X km of a lat/lng
// Query: lat, lng, radiusKm (default 25), poojaTypeId
// ─────────────────────────────────────────────────────────
router.get("/nearby", async (req, res) => {
  try {
    const { lat, lng, radiusKm = 25, poojaTypeId } = req.query;

    if (!lat || !lng)
      return res.status(400).json({ success: false, message: "lat and lng required" });

    const query = {
      verificationStatus: "verified",
      isActive: true,
      location: {
        $nearSphere: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: parseFloat(radiusKm) * 1000, // metres
        },
      },
    };

    if (poojaTypeId) query["pricingList.poojaTypeId"] = poojaTypeId;

    const pandits = await Pandit.find(query)
      .select("name photos sampradaya languages city averageRating totalReviews yearsExperience bio pricingList isAvailableNow location travelRadiusKm")
      .limit(30)
      .lean();

    return res.json({ success: true, count: pandits.length, pandits });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/pandits/:id
// Full profile of a single pandit (public)
// ─────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  try {
    const pandit = await Pandit.findOne({
      _id: req.params.id,
      verificationStatus: "verified",
      isActive: true,
    })
      .select("-passwordHash -bankDetails -govtIdUrl -credentialDocs")
      .populate("pricingList.poojaTypeId", "name slug iconEmoji category minDurationMinutes")
      .lean();

    if (!pandit)
      return res.status(404).json({ success: false, message: "Pandit not found" });

    // Fetch latest 10 reviews
    const reviews = await Review.find({ panditId: req.params.id, isVisible: true })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("userId", "name avatar")
      .lean();

    return res.json({ success: true, pandit: { ...pandit, reviews } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/pandits/:id/slots
// Available time slots for a pandit on a specific date
// Query: date (YYYY-MM-DD), poojaTypeId
// ─────────────────────────────────────────────────────────
router.get("/:id/slots", async (req, res) => {
  try {
    const { date, poojaTypeId } = req.query;
    if (!date)
      return res.status(400).json({ success: false, message: "date required (YYYY-MM-DD)" });

    const pandit = await Pandit.findById(req.params.id)
      .select("availability blockedDates pricingList")
      .lean();

    if (!pandit)
      return res.status(404).json({ success: false, message: "Pandit not found" });

    // Check if date is blocked
    if (pandit.blockedDates?.includes(date))
      return res.json({ success: true, slots: [], reason: "Pandit unavailable on this date" });

    // Get day of week for the requested date
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const dayOfWeek = dayNames[new Date(date).getDay()];

    const daySlot = pandit.availability?.find((a) => a.day === dayOfWeek);
    if (!daySlot)
      return res.json({ success: true, slots: [], reason: "Pandit does not work on this day" });

    // Get duration for this pooja type
    let durationMinutes = 120; // default 2 hours
    if (poojaTypeId) {
      const pricing = pandit.pricingList?.find(
        (p) => p.poojaTypeId?.toString() === poojaTypeId
      );
      if (pricing) durationMinutes = pricing.durationMinutes;
    }

    // Get already-booked slots for this pandit on this date
    const existingBookings = await Booking.find({
      panditId: req.params.id,
      scheduledDate: date,
      status: { $in: ["pending_pandit", "accepted", "in_progress"] },
    }).select("scheduledTime durationMinutes");

    // Generate available slots
    const [startH, startM] = daySlot.startTime.split(":").map(Number);
    const [endH, endM] = daySlot.endTime.split(":").map(Number);
    const workStart = startH * 60 + startM;
    const workEnd = endH * 60 + endM;

    // Blocked minutes from existing bookings
    const blockedRanges = existingBookings.map((b) => {
      const [bH, bM] = b.scheduledTime.split(":").map(Number);
      const bStart = bH * 60 + bM;
      return { start: bStart, end: bStart + (b.durationMinutes || 120) + 30 }; // +30 min buffer
    });

    const slots = [];
    for (let t = workStart; t + durationMinutes <= workEnd; t += 60) {
      const slotEnd = t + durationMinutes + 30; // +30 buffer
      const isBlocked = blockedRanges.some(
        (r) => !(t >= r.end || slotEnd <= r.start)
      );
      if (!isBlocked) {
        const hh = String(Math.floor(t / 60)).padStart(2, "0");
        const mm = String(t % 60).padStart(2, "0");
        slots.push(`${hh}:${mm}`);
      }
    }

    return res.json({ success: true, slots, durationMinutes, date });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

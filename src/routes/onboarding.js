// src/routes/onboarding.js
// Pandit onboarding — multi-step profile completion after registration.
// Step 1: credentials (sampradaya, veda, gotram, experience)
// Step 2: service details (languages, pooja types + pricing, travel radius)
// Step 3: availability (weekly schedule)
// Step 4: document upload (credential docs, govt ID)
// Step 5: complete → triggers admin review

const express = require("express");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const Pandit = require("../models/Pandit");
const PoojaType = require("../models/PoojaType");
const { protect, requirePandit } = require("../middleware/auth");

const router = express.Router();
router.use(protect, requirePandit);

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─────────────────────────────────────────────────────────
// POST /api/onboarding/credentials
// Step 1 — pandit's religious credentials
// ─────────────────────────────────────────────────────────
router.post("/credentials", async (req, res) => {
  try {
    const { sampradaya, veda, gotram, gurukul, yearsExperience, bio } = req.body;
    if (!sampradaya)
      return res.status(400).json({ success: false, message: "sampradaya is required" });

    await Pandit.findByIdAndUpdate(req.user._id, {
      sampradaya,
      ...(veda && { veda }),
      ...(gotram && { gotram }),
      ...(gurukul && { gurukul }),
      ...(yearsExperience && { yearsExperience: parseInt(yearsExperience) }),
      ...(bio && { bio: bio.slice(0, 600) }),
    });

    return res.json({ success: true, message: "Credentials saved" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/onboarding/services
// Step 2 — languages + pooja types + pricing
// Body: { languages: [...], pricingList: [{ poojaTypeId, basePrice, durationMinutes, note }] }
// ─────────────────────────────────────────────────────────
router.post("/services", async (req, res) => {
  try {
    const { languages, pricingList, travelRadiusKm } = req.body;

    if (!languages?.length)
      return res.status(400).json({ success: false, message: "At least one language required" });
    if (!pricingList?.length)
      return res.status(400).json({ success: false, message: "At least one pooja service required" });

    // Validate pooja types exist
    const poojaIds = pricingList.map((p) => p.poojaTypeId);
    const validPoojas = await PoojaType.find({ _id: { $in: poojaIds }, isActive: true });
    if (validPoojas.length !== poojaIds.length)
      return res.status(400).json({ success: false, message: "One or more pooja types are invalid" });

    await Pandit.findByIdAndUpdate(req.user._id, {
      languages,
      pricingList,
      ...(travelRadiusKm && { travelRadiusKm: parseInt(travelRadiusKm) }),
    });

    return res.json({ success: true, message: "Services saved" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/onboarding/availability
// Step 3 — weekly availability slots
// Body: { availability: [{ day, startTime, endTime }], blockedDates: [...] }
// ─────────────────────────────────────────────────────────
router.post("/availability", async (req, res) => {
  try {
    const { availability, blockedDates } = req.body;

    if (!availability?.length)
      return res.status(400).json({ success: false, message: "At least one availability slot required" });

    await Pandit.findByIdAndUpdate(req.user._id, {
      availability,
      ...(blockedDates && { blockedDates }),
    });

    return res.json({ success: true, message: "Availability saved" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/onboarding/documents
// Step 4 — upload credential docs + profile photo
// Form field: "photo" for profile | "doc" for credentials | "govtId" for ID
// ─────────────────────────────────────────────────────────
router.post("/documents", upload.single("file"), async (req, res) => {
  try {
    if (!req.file)
      return res.status(400).json({ success: false, message: "No file provided" });

    const { fileType } = req.body; // "photo" | "credential" | "govtId"
    const folder = fileType === "photo"
      ? "panditconnect/pandit-photos"
      : fileType === "govtId"
      ? "panditconnect/govt-ids"
      : "panditconnect/credentials";

    const uploadResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: `pandit_${req.user._id}_${fileType}_${Date.now()}`,
          ...(fileType === "photo" && {
            transformation: [
              { width: 600, height: 600, crop: "fill", gravity: "face" },
              { quality: "auto" },
            ],
          }),
        },
        (err, result) => (err ? reject(err) : resolve(result))
      );
      stream.end(req.file.buffer);
    });

    const url = uploadResult.secure_url;
    let update;

    if (fileType === "photo") {
      // Add to photos array (max 3)
      const pandit = await Pandit.findById(req.user._id).select("photos");
      const photos = pandit.photos || [];
      if (photos.length < 3) photos.push(url);
      update = { photos };
    } else if (fileType === "govtId") {
      update = { govtIdUrl: url };
    } else {
      update = { $push: { credentialDocs: url } };
    }

    await Pandit.findByIdAndUpdate(req.user._id, update);
    return res.json({ success: true, url, message: "Document uploaded" });
  } catch (err) {
    console.error("[ONBOARDING/DOCS]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/onboarding/complete
// Step 5 — submit profile for admin review
// ─────────────────────────────────────────────────────────
router.post("/complete", async (req, res) => {
  try {
    const pandit = await Pandit.findById(req.user._id);

    // Validate minimum required fields
    const missing = [];
    if (!pandit.sampradaya) missing.push("sampradaya");
    if (!pandit.languages?.length) missing.push("languages");
    if (!pandit.pricingList?.length) missing.push("services/pricing");
    if (!pandit.availability?.length) missing.push("availability");
    if (!pandit.city) missing.push("city");

    if (missing.length)
      return res.status(400).json({
        success: false,
        message: "Please complete all required steps",
        missing,
      });

    await Pandit.findByIdAndUpdate(req.user._id, {
      onboardingComplete: true,
      verificationStatus: "under_review",
    });

    return res.json({
      success: true,
      message: "Profile submitted for review. You'll be notified within 24-48 hours once approved. 🙏",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

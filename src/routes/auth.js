// src/routes/auth.js
// Handles registration and login for both Users and Pandits.
// POST /api/auth/user/register
// POST /api/auth/user/login
// POST /api/auth/pandit/register
// POST /api/auth/pandit/login
// GET  /api/auth/me          ← works for both, reads req.userType

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Pandit = require("../models/Pandit");
const { protect } = require("../middleware/auth");

const router = express.Router();

const LOG = (tag, msg, data) =>
  console.log(
    `[AUTH][${tag}] ${msg}${
      data !== undefined ? " → " + JSON.stringify(data) : ""
    }`
  );

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "30d",
  });

const formatUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  phone: user.phone || null,
  avatar: user.avatar || null,
  role: user.role || "user",
  city: user.city || null,
  onboardingComplete: user.onboardingComplete,
  preferredLanguage: user.preferredLanguage,
  preferredTradition: user.preferredTradition,
});

const formatPandit = (pandit) => ({
  id: pandit._id,
  name: pandit.name,
  email: pandit.email,
  phone: pandit.phone,
  photos: pandit.photos || [],
  sampradaya: pandit.sampradaya,
  languages: pandit.languages || [],
  city: pandit.city,
  state: pandit.state,
  verificationStatus: pandit.verificationStatus,
  onboardingComplete: pandit.onboardingComplete,
  isActive: pandit.isActive,
  averageRating: pandit.averageRating,
  totalReviews: pandit.totalReviews,
  yearsExperience: pandit.yearsExperience,
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/user/register
// ─────────────────────────────────────────────────────────
router.post("/user/register", async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    LOG("USER/REGISTER", "attempt", {
      email,
      hasName: !!name,
      hasPassword: !!password,
    });
    if (!name || !email || !password)
      return res
        .status(400)
        .json({ success: false, message: "name, email, password required" });

    if (await User.findOne({ email: email.toLowerCase() }))
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone,
      passwordHash,
    });

    return res.status(201).json({
      success: true,
      token: signToken(user._id),
      user: formatUser(user),
    });
  } catch (err) {
    console.error("[AUTH/USER/REGISTER]", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Registration failed" });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/user/login
// ─────────────────────────────────────────────────────────
router.post("/user/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    LOG("USER/LOGIN", "attempt", { email });
    if (!email || !password)
      return res
        .status(400)
        .json({ success: false, message: "email and password required" });

    const user = await User.findOne({ email: email.toLowerCase() }).select(
      "+passwordHash"
    );
    if (!user || !user.passwordHash)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    return res.json({
      success: true,
      token: signToken(user._id),
      user: formatUser(user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Login failed" });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/pandit/register
// ─────────────────────────────────────────────────────────
router.post("/pandit/register", async (req, res) => {
  try {
    const { name, email, password, phone, sampradaya, city, state } = req.body;
    if (
      !name ||
      !email ||
      !password ||
      !phone ||
      !sampradaya ||
      !city ||
      !state
    )
      return res.status(400).json({
        success: false,
        message:
          "name, email, password, phone, sampradaya, city, state required",
      });

    if (await Pandit.findOne({ email: email.toLowerCase() }))
      return res
        .status(409)
        .json({ success: false, message: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const pandit = await Pandit.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone,
      passwordHash,
      sampradaya,
      city,
      state,
      verificationStatus: "pending",
      isActive: false,
    });

    return res.status(201).json({
      success: true,
      token: signToken(pandit._id),
      pandit: formatPandit(pandit),
      message:
        "Registration successful. Your profile will be reviewed within 24-48 hours.",
    });
  } catch (err) {
    console.error("[AUTH/PANDIT/REGISTER]", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Registration failed" });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/auth/pandit/login
// ─────────────────────────────────────────────────────────
router.post("/pandit/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    LOG("PANDIT/LOGIN", "attempt", { email });
    const pandit = await Pandit.findOne({ email: email.toLowerCase() }).select(
      "+passwordHash"
    );
    if (!pandit || !pandit.passwordHash)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    const valid = await bcrypt.compare(password, pandit.passwordHash);
    if (!valid)
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });

    return res.json({
      success: true,
      token: signToken(pandit._id),
      pandit: formatPandit(pandit),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Login failed" });
  }
});

// ─────────────────────────────────────────────────────────
// GET /api/auth/me — works for both user and pandit
// ─────────────────────────────────────────────────────────
router.get("/me", protect, async (req, res) => {
  try {
    if (req.userType === "user") {
      return res.json({
        success: true,
        userType: "user",
        user: formatUser(req.user),
      });
    }
    return res.json({
      success: true,
      userType: "pandit",
      pandit: formatPandit(req.user),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/auth/me — update profile
// ─────────────────────────────────────────────────────────
router.patch("/me", protect, async (req, res) => {
  try {
    const allowed =
      req.userType === "user"
        ? [
            "name",
            "phone",
            "city",
            "state",
            "preferredLanguage",
            "preferredTradition",
          ]
        : ["name", "phone", "bio", "isAvailableNow", "travelRadiusKm"];

    const updates = {};
    allowed.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    const Model = req.userType === "user" ? User : Pandit;
    const updated = await Model.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true }
    );

    return res.json({
      success: true,
      message: "Updated",
      data:
        req.userType === "user" ? formatUser(updated) : formatPandit(updated),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// PATCH /api/auth/push-token
// ─────────────────────────────────────────────────────────
router.patch("/push-token", protect, async (req, res) => {
  try {
    const { pushToken } = req.body;
    const Model = req.userType === "user" ? User : Pandit;
    await Model.findByIdAndUpdate(req.user._id, { pushToken });
    return res.json({ success: true, message: "Push token saved" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;

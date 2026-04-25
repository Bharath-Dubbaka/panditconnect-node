// src/middleware/auth.js

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Pandit = require("../models/Pandit");

// Protects routes — resolves token from either User or Pandit collection
const protect = async (req, res, next) => {
  try {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith("Bearer "))
      return res.status(401).json({ success: false, message: "No token" });

    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try User first
    let identity = await User.findById(decoded.id);
    if (identity) {
      identity._modelType = "user";
    } else {
      // Try Pandit
      identity = await Pandit.findById(decoded.id);
      if (identity) identity._modelType = "pandit";
    }

    if (!identity)
      return res.status(401).json({ success: false, message: "Not found" });

    identity.lastSeen = new Date();
    await identity.save({ validateBeforeSave: false });

    req.user = identity;
    req.userType = identity._modelType; // "user" | "pandit"
    next();
  } catch {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Extra guard — use after protect() to restrict route to users only
const requireUser = (req, res, next) => {
  if (req.userType !== "user")
    return res
      .status(403)
      .json({ success: false, message: "User access only" });
  next();
};

// Extra guard — use after protect() to restrict route to pandits only
const requirePandit = (req, res, next) => {
  if (req.userType !== "pandit")
    return res
      .status(403)
      .json({ success: false, message: "Pandit access only" });
  next();
};

// Admin guard — checks user.role === "admin"
const requireAdmin = (req, res, next) => {
  if (req.userType !== "user" || req.user.role !== "admin")
    return res
      .status(403)
      .json({ success: false, message: "Admin access only" });
  next();
};

module.exports = { protect, requireUser, requirePandit, requireAdmin };

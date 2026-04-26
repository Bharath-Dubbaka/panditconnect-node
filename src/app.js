// src/app.js
// PanditConnect API — main entry point
// Mirrors VedicFind's app.js structure exactly.

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const http = require("http");
const connectDB = require("./config/db");
const { initSocket } = require("./config/socket");

const authRoutes = require("./routes/auth");
const onboardingRoutes = require("./routes/onboarding");
const panditRoutes = require("./routes/pandits");
const bookingRoutes = require("./routes/bookings");
const catalogRoutes = require("./routes/catalog");
const paymentRoutes = require("./routes/payments");
const panditDashboardRoutes = require("./routes/panditDashboard");
const adminRoutes = require("./routes/admin");

const app = express();
const server = http.createServer(app);

connectDB();

app.use(cors({ origin: "*" }));

// ── Request logger ────────────────────────────────────────
// Shows every incoming request in Railway logs so we can see
// whether the APK is hitting the backend at all
app.use((req, res, next) => {
  const start = Date.now();
  const ua = req.headers["user-agent"] || "unknown";
  const isExpo = ua.includes("Expo") || ua.includes("okhttp");
  console.log(
    `→ ${req.method} ${req.originalUrl} [${isExpo ? "EXPO/APP" : "other"}] ip=${
      req.ip
    }`
  );
  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`← ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});

// IMPORTANT: Raw body for Razorpay webhook must come BEFORE express.json()
// Same pattern as RevenueCat webhook in VedicFind — signature verification
// requires the raw buffer, not the parsed JSON.
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

// Standard JSON for all other routes
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get("/health", (req, res) =>
  res.json({ status: "ok", app: "PanditConnect API", time: new Date() })
);

// ── Routes ────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/onboarding", onboardingRoutes);
app.use("/api/pandits", panditRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/pandit", panditDashboardRoutes);
app.use("/api/admin", adminRoutes);

// Debug routes — dev only
if (process.env.NODE_ENV !== "production") {
  app.use("/api/debug", require("./routes/debug"));
}

// 404 handler
app.use((req, res) =>
  res
    .status(404)
    .json({ success: false, message: `Route ${req.originalUrl} not found` })
);

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 PanditConnect API running on port ${PORT}`);

  // Init Socket.io + attach io to app so route handlers can emit events
  const io = initSocket(server);
  app.set("io", io);
  console.log("🔌 Socket.io ready");
});

// src/routes/payments.js
// Razorpay payment flow:
//   1. POST /api/payments/order        ← create Razorpay order (after pandit accepts)
//   2. Frontend opens Razorpay checkout
//   3. POST /api/payments/verify       ← verify signature + mark booking as paid
//   4. POST /api/payments/webhook      ← Razorpay webhook for async events

const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const Booking = require("../models/Booking");
const { protect, requireUser } = require("../middleware/auth");

const router = express.Router();

const getRazorpay = () =>
  new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

// ─────────────────────────────────────────────────────────
// POST /api/payments/order
// Creates a Razorpay order for a booking.
// Call this after pandit accepts (booking.status === "accepted").
// Body: { bookingId }
// ─────────────────────────────────────────────────────────
router.post("/order", protect, requireUser, async (req, res) => {
  try {
    const { bookingId } = req.body;
    const booking = await Booking.findOne({
      _id: bookingId,
      userId: req.user._id,
      status: "accepted",
      paymentStatus: "pending",
    });

    if (!booking)
      return res.status(404).json({ success: false, message: "Booking not found or payment already done" });

    const razorpay = getRazorpay();
    const order = await razorpay.orders.create({
      amount: booking.totalAmount * 100, // Razorpay uses paise
      currency: "INR",
      receipt: `booking_${booking._id}`,
      notes: {
        bookingId: booking._id.toString(),
        userId: req.user._id.toString(),
        poojaName: booking.poojaName,
      },
    });

    // Save Razorpay order ID to booking
    booking.razorpayOrderId = order.id;
    await booking.save();

    return res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      bookingId: booking._id,
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (err) {
    console.error("[PAYMENTS/ORDER]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/payments/verify
// Called from frontend after Razorpay checkout succeeds.
// Verifies HMAC signature and marks booking as paid.
// Body: { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature }
// ─────────────────────────────────────────────────────────
router.post("/verify", protect, requireUser, async (req, res) => {
  try {
    const { bookingId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    // Verify HMAC signature — standard Razorpay verification
    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpaySignature)
      return res.status(400).json({ success: false, message: "Payment verification failed" });

    const booking = await Booking.findOneAndUpdate(
      { _id: bookingId, userId: req.user._id },
      {
        paymentStatus: "paid",
        razorpayPaymentId,
        razorpaySignature,
      },
      { new: true }
    );

    if (!booking)
      return res.status(404).json({ success: false, message: "Booking not found" });

    return res.json({ success: true, message: "Payment confirmed!", booking });
  } catch (err) {
    console.error("[PAYMENTS/VERIFY]", err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

// ─────────────────────────────────────────────────────────
// POST /api/payments/webhook
// Razorpay sends async events here.
// IMPORTANT: Must be registered with express.raw() in app.js
//            BEFORE express.json() — same as RevenueCat in VedicFind
// ─────────────────────────────────────────────────────────
router.post("/webhook", async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const body = req.body; // raw buffer

    // Verify webhook signature
    const expectedSig = crypto
      .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest("hex");

    if (signature !== expectedSig) {
      console.warn("[PAYMENTS/WEBHOOK] Invalid signature");
      return res.status(400).json({ error: "Invalid signature" });
    }

    const event = JSON.parse(body.toString());
    const eventType = event.event;
    console.log(`[PAYMENTS/WEBHOOK] Event: ${eventType}`);

    if (eventType === "payment.captured") {
      const paymentId = event.payload.payment.entity.id;
      const orderId = event.payload.payment.entity.order_id;
      await Booking.findOneAndUpdate(
        { razorpayOrderId: orderId },
        { paymentStatus: "paid", razorpayPaymentId: paymentId }
      );
    } else if (eventType === "payment.failed") {
      const orderId = event.payload.payment.entity.order_id;
      await Booking.findOneAndUpdate(
        { razorpayOrderId: orderId },
        { paymentStatus: "failed" }
      );
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[PAYMENTS/WEBHOOK]", err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;

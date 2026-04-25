// src/config/socket.js
// Real-time events:
//   booking:new       → pandit gets notified of new booking request
//   booking:accepted  → user gets notified pandit accepted
//   booking:declined  → user gets notified pandit declined
//   booking:completed → triggers review prompt on user side

const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const Pandit = require("../models/Pandit");

// userId → socketId  (works for both users and pandits)
const onlineUsers = new Map();

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  // Auth middleware — accepts tokens from both User and Pandit
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error("No token"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Check user first, then pandit
      let identity = await User.findById(decoded.id).select("name role");
      if (!identity) {
        identity = await Pandit.findById(decoded.id).select("name");
        if (identity) identity.role = "pandit";
      }
      if (!identity) return next(new Error("Identity not found"));

      socket.userId = decoded.id.toString();
      socket.userName = identity.name;
      socket.userRole = identity.role || "user";
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    onlineUsers.set(socket.userId, socket.id);
    console.log(`🟢 ${socket.userName} (${socket.userRole}) connected`);

    // Join personal room for targeted notifications
    socket.join(`user:${socket.userId}`);

    socket.on("disconnect", () => {
      onlineUsers.delete(socket.userId);
      console.log(`🔴 ${socket.userName} disconnected`);
    });
  });

  return io;
};

// Helper used by route handlers to push events to a specific user/pandit
const emitToUser = (io, userId, event, data) => {
  io.to(`user:${userId}`).emit(event, data);
};

module.exports = { initSocket, onlineUsers, emitToUser };

// src/routes/debug.js
// Dev-only debug routes — disabled in production.
// Mount in app.js: if (process.env.NODE_ENV !== "production") { ... }

const express = require("express");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const Pandit = require("../models/Pandit");
const Booking = require("../models/Booking");
const PoojaType = require("../models/PoojaType");
const SamagriItem = require("../models/SamagriItem");

const router = express.Router();

// GET /api/debug/users
router.get("/users", async (req, res) => {
  const users = await User.find()
    .select("name email city phone createdAt")
    .lean();
  return res.json({ count: users.length, users });
});

// GET /api/debug/pandits
router.get("/pandits", async (req, res) => {
  const pandits = await Pandit.find()
    .select(
      "name email city sampradaya verificationStatus isActive averageRating totalBookings createdAt"
    )
    .lean();
  return res.json({ count: pandits.length, pandits });
});

// GET /api/debug/bookings
router.get("/bookings", async (req, res) => {
  const bookings = await Booking.find()
    .populate("userId", "name")
    .populate("panditId", "name")
    .populate("poojaTypeId", "name")
    .select(
      "status scheduledDate scheduledTime totalAmount paymentStatus poojaName"
    )
    .lean();
  return res.json({ count: bookings.length, bookings });
});

// GET /api/debug/poojas
router.get("/poojas", async (req, res) => {
  const poojas = await PoojaType.find()
    .select("name slug category isFeatured isActive estimatedSamagriPrice")
    .lean();
  return res.json({ count: poojas.length, poojas });
});

// DELETE /api/debug/reset-pandit/:email
// Reset pandit verification to pending (for testing)
router.delete("/reset-pandit/:email", async (req, res) => {
  const pandit = await Pandit.findOneAndUpdate(
    { email: req.params.email.toLowerCase() },
    {
      verificationStatus: "pending",
      isActive: false,
      onboardingComplete: false,
    },
    { new: true }
  ).select("name email verificationStatus");
  if (!pandit) return res.status(404).json({ error: "Pandit not found" });
  return res.json({ success: true, pandit });
});

// POST /api/debug/seed-poojas
router.post("/seed-poojas", async (req, res) => {
  const seedData = [
    {
      name: "Satyanarayan Pooja",
      slug: "satyanarayan-pooja",
      category: "Weekly",
      deity: "Lord Vishnu",
      iconEmoji: "🪔",
      shortDescription:
        "Pooja for blessings, prosperity and fulfillment of wishes",
      minDurationMinutes: 90,
      maxDurationMinutes: 120,
      isFeatured: true,
      sortOrder: 1,
    },
    {
      name: "Griha Pravesh",
      slug: "griha-pravesh",
      category: "Griha",
      deity: "Lord Ganesha & Vastu Devata",
      iconEmoji: "🏠",
      shortDescription: "Housewarming ceremony to bless your new home",
      minDurationMinutes: 120,
      maxDurationMinutes: 180,
      isFeatured: true,
      sortOrder: 2,
    },
    {
      name: "Ganesh Pooja",
      slug: "ganesh-pooja",
      category: "Festival",
      deity: "Lord Ganesha",
      iconEmoji: "🐘",
      shortDescription: "Pooja to remove obstacles and seek blessings",
      minDurationMinutes: 60,
      maxDurationMinutes: 90,
      isFeatured: true,
      sortOrder: 3,
    },
    {
      name: "Navagraha Pooja",
      slug: "navagraha-pooja",
      category: "Navagraha",
      deity: "Nine Planets",
      iconEmoji: "🪐",
      shortDescription: "Remedy pooja for planetary peace and harmony",
      minDurationMinutes: 120,
      maxDurationMinutes: 150,
      isFeatured: false,
      sortOrder: 4,
    },
    {
      name: "Baby Naming (Namakarana)",
      slug: "namakarana",
      category: "Life Event",
      deity: "Lord Ganesha",
      iconEmoji: "👶",
      shortDescription: "Sacred naming ceremony for newborns",
      minDurationMinutes: 60,
      maxDurationMinutes: 90,
      isFeatured: false,
      sortOrder: 5,
    },
    {
      name: "Vastu Shanti",
      slug: "vastu-shanti",
      category: "Griha",
      deity: "Vastu Purusha",
      iconEmoji: "🧿",
      shortDescription: "Pooja to harmonize the energy of your space",
      minDurationMinutes: 120,
      maxDurationMinutes: 180,
      isFeatured: false,
      sortOrder: 6,
    },
    {
      name: "Lakshmi Pooja",
      slug: "lakshmi-pooja",
      category: "Weekly",
      deity: "Goddess Lakshmi",
      iconEmoji: "💰",
      shortDescription: "Pooja for wealth, prosperity and abundance",
      minDurationMinutes: 60,
      maxDurationMinutes: 90,
      isFeatured: true,
      sortOrder: 7,
    },
    {
      name: "Rudrabhishek",
      slug: "rudrabhishek",
      category: "Weekly",
      deity: "Lord Shiva",
      iconEmoji: "🔱",
      shortDescription: "Sacred abhishek ritual to Lord Shiva",
      minDurationMinutes: 90,
      maxDurationMinutes: 120,
      isFeatured: false,
      sortOrder: 8,
    },
    {
      name: "Upanayanam",
      slug: "upanayanam",
      category: "Life Event",
      deity: "Brahma / Vishnu / Shiva",
      iconEmoji: "🧵",
      shortDescription: "Sacred thread ceremony for boys",
      minDurationMinutes: 240,
      maxDurationMinutes: 360,
      isFeatured: false,
      sortOrder: 9,
    },
    {
      name: "Mrityunjaya Homam",
      slug: "mrityunjaya-homam",
      category: "Navagraha",
      deity: "Lord Shiva",
      iconEmoji: "🔥",
      shortDescription: "Powerful yagna for health, longevity and protection",
      minDurationMinutes: 180,
      maxDurationMinutes: 240,
      isFeatured: false,
      sortOrder: 10,
    },
  ];
  let created = 0;
  for (const data of seedData) {
    try {
      await PoojaType.findOneAndUpdate({ slug: data.slug }, data, {
        upsert: true,
      });
      created++;
    } catch {}
  }
  return res.json({ success: true, message: `${created} pooja types seeded` });
});

// POST /api/debug/seed-all
// Seeds everything: samagri items, links them to poojas, creates 3 verified Hyderabad pandits
router.post("/seed-all", async (req, res) => {
  try {
    const results = { samagri: 0, poojas: 0, pandits: 0 };

    // ── STEP 1: Seed samagri items ─────────────────────────────────────────
    const samagriData = [
      {
        name: "Cow Ghee (250ml)",
        slug: "cow-ghee-250ml",
        category: "Dairy",
        pricePerUnit: 120,
        unit: "piece",
        iconEmoji: "🫙",
      },
      {
        name: "Panchamrit (Milk, Curd, Honey, Sugar, Ghee)",
        slug: "panchamrit-set",
        category: "Dairy",
        pricePerUnit: 80,
        unit: "set",
        iconEmoji: "🥛",
      },
      {
        name: "Coconut (Whole)",
        slug: "coconut-whole",
        category: "Fruits",
        pricePerUnit: 30,
        unit: "piece",
        iconEmoji: "🥥",
      },
      {
        name: "Banana Bunch",
        slug: "banana-bunch",
        category: "Fruits",
        pricePerUnit: 40,
        unit: "bunch",
        iconEmoji: "🍌",
      },
      {
        name: "Mango (6 pieces)",
        slug: "mango-6pcs",
        category: "Fruits",
        pricePerUnit: 60,
        unit: "set",
        iconEmoji: "🥭",
      },
      {
        name: "Marigold Garland",
        slug: "marigold-garland",
        category: "Flowers",
        pricePerUnit: 50,
        unit: "piece",
        iconEmoji: "🌼",
      },
      {
        name: "Rose Petals (100g)",
        slug: "rose-petals-100g",
        category: "Flowers",
        pricePerUnit: 40,
        unit: "piece",
        iconEmoji: "🌹",
      },
      {
        name: "Lotus Flowers (5 pcs)",
        slug: "lotus-5pcs",
        category: "Flowers",
        pricePerUnit: 60,
        unit: "set",
        iconEmoji: "🪷",
      },
      {
        name: "Agarbatti Pack (Sandalwood)",
        slug: "agarbatti-sandalwood",
        category: "Incense",
        pricePerUnit: 30,
        unit: "pack",
        iconEmoji: "🕯️",
      },
      {
        name: "Dhoop Sticks Pack",
        slug: "dhoop-sticks",
        category: "Incense",
        pricePerUnit: 25,
        unit: "pack",
        iconEmoji: "🪔",
      },
      {
        name: "Camphor (Kapoor) Pack",
        slug: "camphor-pack",
        category: "Incense",
        pricePerUnit: 20,
        unit: "pack",
        iconEmoji: "⬜",
      },
      {
        name: "Diya (Clay Lamp) Set of 11",
        slug: "diya-set-11",
        category: "Lamps",
        pricePerUnit: 30,
        unit: "set",
        iconEmoji: "🪔",
      },
      {
        name: "Sesame Seeds (Til) 100g",
        slug: "sesame-100g",
        category: "Grains",
        pricePerUnit: 20,
        unit: "piece",
        iconEmoji: "🌾",
      },
      {
        name: "Raw Rice (Akshata) 500g",
        slug: "rice-akshata-500g",
        category: "Grains",
        pricePerUnit: 30,
        unit: "piece",
        iconEmoji: "🍚",
      },
      {
        name: "Wheat Flour 500g",
        slug: "wheat-flour-500g",
        category: "Grains",
        pricePerUnit: 25,
        unit: "piece",
        iconEmoji: "🌾",
      },
      {
        name: "Sacred Thread (Kalava/Mauli)",
        slug: "kalava-thread",
        category: "Cloth",
        pricePerUnit: 10,
        unit: "piece",
        iconEmoji: "🧵",
      },
      {
        name: "Yellow Cloth (1m)",
        slug: "yellow-cloth-1m",
        category: "Cloth",
        pricePerUnit: 40,
        unit: "piece",
        iconEmoji: "🟡",
      },
      {
        name: "Red Cloth (1m)",
        slug: "red-cloth-1m",
        category: "Cloth",
        pricePerUnit: 40,
        unit: "piece",
        iconEmoji: "🔴",
      },
      {
        name: "Tulsi Leaves (bunch)",
        slug: "tulsi-leaves",
        category: "Herbs",
        pricePerUnit: 15,
        unit: "bunch",
        iconEmoji: "🌿",
      },
      {
        name: "Bilva Leaves (21 pcs)",
        slug: "bilva-leaves-21",
        category: "Herbs",
        pricePerUnit: 20,
        unit: "set",
        iconEmoji: "🍃",
      },
      {
        name: "Panchameva (Dry Fruits Mix)",
        slug: "panchameva-mix",
        category: "Fruits",
        pricePerUnit: 80,
        unit: "pack",
        iconEmoji: "🥜",
      },
      {
        name: "Chandan (Sandalwood Paste)",
        slug: "chandan-paste",
        category: "Misc",
        pricePerUnit: 35,
        unit: "piece",
        iconEmoji: "🟤",
      },
      {
        name: "Kumkum Pack",
        slug: "kumkum-pack",
        category: "Misc",
        pricePerUnit: 15,
        unit: "pack",
        iconEmoji: "🔴",
      },
      {
        name: "Turmeric Powder 50g",
        slug: "turmeric-50g",
        category: "Misc",
        pricePerUnit: 15,
        unit: "piece",
        iconEmoji: "🟡",
      },
      {
        name: "Modak (Prasad) 6 pcs",
        slug: "modak-6pcs",
        category: "Sweets",
        pricePerUnit: 60,
        unit: "set",
        iconEmoji: "🍬",
      },
      {
        name: "Ladoo (Prasad) 6 pcs",
        slug: "ladoo-6pcs",
        category: "Sweets",
        pricePerUnit: 50,
        unit: "set",
        iconEmoji: "🍡",
      },
      {
        name: "Copper Kalash",
        slug: "copper-kalash",
        category: "Metals",
        pricePerUnit: 150,
        unit: "piece",
        iconEmoji: "🏺",
      },
    ];

    const samagriMap = {}; // slug → _id
    for (const item of samagriData) {
      const doc = await SamagriItem.findOneAndUpdate(
        { slug: item.slug },
        { ...item, inStock: true, isActive: true },
        { upsert: true, new: true }
      );
      samagriMap[item.slug] = doc._id;
      results.samagri++;
    }

    // ── STEP 2: Seed / update pooja types WITH samagri lists ───────────────
    const poojaData = [
      {
        name: "Satyanarayan Pooja",
        slug: "satyanarayan-pooja",
        category: "Weekly",
        deity: "Lord Vishnu",
        iconEmoji: "🪔",
        isFeatured: true,
        sortOrder: 1,
        shortDescription:
          "Pooja for blessings, prosperity and fulfillment of wishes",
        description:
          "Satyanarayan Pooja is one of the most popular Hindu rituals performed to seek blessings of Lord Vishnu. It brings peace, prosperity and fulfillment of wishes to the family.",
        bestTime: "Full Moon, Ekadashi, Festivals",
        minDurationMinutes: 90,
        maxDurationMinutes: 120,
        estimatedSamagriPrice: 485,
        samagriList: [
          { slug: "cow-ghee-250ml", qty: 1 },
          { slug: "panchamrit-set", qty: 1 },
          { slug: "coconut-whole", qty: 2 },
          { slug: "banana-bunch", qty: 1 },
          { slug: "marigold-garland", qty: 2 },
          { slug: "tulsi-leaves", qty: 1 },
          { slug: "agarbatti-sandalwood", qty: 1 },
          { slug: "camphor-pack", qty: 1 },
          { slug: "diya-set-11", qty: 1 },
          { slug: "rice-akshata-500g", qty: 1 },
          { slug: "kalava-thread", qty: 1 },
          { slug: "kumkum-pack", qty: 1 },
          { slug: "chandan-paste", qty: 1 },
          { slug: "ladoo-6pcs", qty: 1 },
          { slug: "yellow-cloth-1m", qty: 1 },
        ],
      },
      {
        name: "Ganesh Pooja",
        slug: "ganesh-pooja",
        category: "Festival",
        deity: "Lord Ganesha",
        iconEmoji: "🐘",
        isFeatured: true,
        sortOrder: 3,
        shortDescription:
          "Pooja to remove obstacles and seek blessings of Lord Ganesha",
        description:
          "Ganesh Pooja is performed before any new beginning — business, home, wedding — to seek Lord Ganesha's blessings for a smooth and obstacle-free journey.",
        bestTime: "Chaturthi, Wednesdays, New Beginnings",
        minDurationMinutes: 60,
        maxDurationMinutes: 90,
        estimatedSamagriPrice: 390,
        samagriList: [
          { slug: "modak-6pcs", qty: 2 },
          { slug: "coconut-whole", qty: 1 },
          { slug: "marigold-garland", qty: 2 },
          { slug: "red-cloth-1m", qty: 1 },
          { slug: "cow-ghee-250ml", qty: 1 },
          { slug: "agarbatti-sandalwood", qty: 1 },
          { slug: "camphor-pack", qty: 1 },
          { slug: "diya-set-11", qty: 1 },
          { slug: "rice-akshata-500g", qty: 1 },
          { slug: "kumkum-pack", qty: 1 },
          { slug: "banana-bunch", qty: 1 },
          { slug: "chandan-paste", qty: 1 },
        ],
      },
      {
        name: "Griha Pravesh",
        slug: "griha-pravesh",
        category: "Griha",
        deity: "Lord Ganesha & Vastu Devata",
        iconEmoji: "🏠",
        isFeatured: true,
        sortOrder: 2,
        shortDescription: "Housewarming ceremony to bless your new home",
        description:
          "Griha Pravesh is performed when moving into a new home. This ritual purifies the space, invokes divine blessings, and ensures peace, prosperity and happiness for the family.",
        bestTime: "Auspicious muhurtas — consult pandit for dates",
        minDurationMinutes: 120,
        maxDurationMinutes: 180,
        estimatedSamagriPrice: 720,
        samagriList: [
          { slug: "copper-kalash", qty: 1 },
          { slug: "cow-ghee-250ml", qty: 2 },
          { slug: "coconut-whole", qty: 3 },
          { slug: "marigold-garland", qty: 4 },
          { slug: "banana-bunch", qty: 2 },
          { slug: "mango-6pcs", qty: 1 },
          { slug: "agarbatti-sandalwood", qty: 2 },
          { slug: "camphor-pack", qty: 2 },
          { slug: "diya-set-11", qty: 2 },
          { slug: "rice-akshata-500g", qty: 2 },
          { slug: "kalava-thread", qty: 2 },
          { slug: "kumkum-pack", qty: 1 },
          { slug: "turmeric-50g", qty: 1 },
          { slug: "chandan-paste", qty: 1 },
          { slug: "yellow-cloth-1m", qty: 1 },
          { slug: "red-cloth-1m", qty: 1 },
          { slug: "tulsi-leaves", qty: 1 },
          { slug: "ladoo-6pcs", qty: 2 },
        ],
      },
      {
        name: "Lakshmi Pooja",
        slug: "lakshmi-pooja",
        category: "Weekly",
        deity: "Goddess Lakshmi",
        iconEmoji: "💰",
        isFeatured: true,
        sortOrder: 7,
        shortDescription: "Pooja for wealth, prosperity and abundance",
        description:
          "Lakshmi Pooja is performed to seek the blessings of Goddess Lakshmi for wealth, prosperity and abundance. Especially auspicious on Fridays and Diwali.",
        bestTime: "Fridays, Diwali, Purnima",
        minDurationMinutes: 60,
        maxDurationMinutes: 90,
        estimatedSamagriPrice: 430,
        samagriList: [
          { slug: "lotus-5pcs", qty: 2 },
          { slug: "rose-petals-100g", qty: 1 },
          { slug: "marigold-garland", qty: 2 },
          { slug: "cow-ghee-250ml", qty: 1 },
          { slug: "panchamrit-set", qty: 1 },
          { slug: "coconut-whole", qty: 1 },
          { slug: "agarbatti-sandalwood", qty: 1 },
          { slug: "camphor-pack", qty: 1 },
          { slug: "diya-set-11", qty: 1 },
          { slug: "kumkum-pack", qty: 1 },
          { slug: "turmeric-50g", qty: 1 },
          { slug: "yellow-cloth-1m", qty: 1 },
          { slug: "ladoo-6pcs", qty: 1 },
          { slug: "chandan-paste", qty: 1 },
        ],
      },
      {
        name: "Navagraha Pooja",
        slug: "navagraha-pooja",
        category: "Navagraha",
        deity: "Nine Planets",
        iconEmoji: "🪐",
        isFeatured: false,
        sortOrder: 4,
        shortDescription: "Remedy pooja for planetary peace and harmony",
        description:
          "Navagraha Pooja appeases all nine planetary deities to remove doshas and negative planetary effects from one's horoscope, bringing peace, health and prosperity.",
        bestTime: "As per horoscope — consult pandit",
        minDurationMinutes: 120,
        maxDurationMinutes: 150,
        estimatedSamagriPrice: 550,
        samagriList: [
          { slug: "sesame-100g", qty: 2 },
          { slug: "rice-akshata-500g", qty: 2 },
          { slug: "cow-ghee-250ml", qty: 2 },
          { slug: "coconut-whole", qty: 3 },
          { slug: "marigold-garland", qty: 3 },
          { slug: "bilva-leaves-21", qty: 1 },
          { slug: "tulsi-leaves", qty: 1 },
          { slug: "agarbatti-sandalwood", qty: 2 },
          { slug: "camphor-pack", qty: 2 },
          { slug: "diya-set-11", qty: 2 },
          { slug: "kumkum-pack", qty: 1 },
          { slug: "chandan-paste", qty: 1 },
          { slug: "panchameva-mix", qty: 1 },
          { slug: "kalava-thread", qty: 2 },
        ],
      },
      {
        name: "Rudrabhishek",
        slug: "rudrabhishek",
        category: "Weekly",
        deity: "Lord Shiva",
        iconEmoji: "🔱",
        isFeatured: false,
        sortOrder: 8,
        shortDescription:
          "Sacred abhishek ritual to Lord Shiva for health and blessings",
        description:
          "Rudrabhishek is the sacred bathing ritual of Lord Shiva with Panchamrit, water, and other holy substances, accompanied by chanting of Rudra Mantras. Bestows health, peace and moksha.",
        bestTime: "Mondays, Maha Shivratri, Shravan month",
        minDurationMinutes: 90,
        maxDurationMinutes: 120,
        estimatedSamagriPrice: 510,
        samagriList: [
          { slug: "panchamrit-set", qty: 2 },
          { slug: "cow-ghee-250ml", qty: 1 },
          { slug: "bilva-leaves-21", qty: 2 },
          { slug: "coconut-whole", qty: 2 },
          { slug: "marigold-garland", qty: 2 },
          { slug: "dhoop-sticks", qty: 1 },
          { slug: "camphor-pack", qty: 2 },
          { slug: "agarbatti-sandalwood", qty: 1 },
          { slug: "diya-set-11", qty: 1 },
          { slug: "chandan-paste", qty: 1 },
          { slug: "kumkum-pack", qty: 1 },
          { slug: "rice-akshata-500g", qty: 1 },
        ],
      },
      {
        name: "Vastu Shanti",
        slug: "vastu-shanti",
        category: "Griha",
        deity: "Vastu Purusha",
        iconEmoji: "🧿",
        isFeatured: false,
        sortOrder: 6,
        shortDescription:
          "Pooja to harmonize the energy of your home or office",
        description:
          "Vastu Shanti pooja is performed to correct vastu doshas and harmonize the energy of a space. Recommended when moving in, renovating, or facing repeated problems in a home or office.",
        bestTime: "Before moving in or after renovation",
        minDurationMinutes: 120,
        maxDurationMinutes: 180,
        estimatedSamagriPrice: 620,
        samagriList: [
          { slug: "copper-kalash", qty: 1 },
          { slug: "cow-ghee-250ml", qty: 2 },
          { slug: "sesame-100g", qty: 1 },
          { slug: "rice-akshata-500g", qty: 2 },
          { slug: "coconut-whole", qty: 2 },
          { slug: "marigold-garland", qty: 3 },
          { slug: "agarbatti-sandalwood", qty: 2 },
          { slug: "camphor-pack", qty: 2 },
          { slug: "diya-set-11", qty: 2 },
          { slug: "kumkum-pack", qty: 1 },
          { slug: "turmeric-50g", qty: 1 },
          { slug: "chandan-paste", qty: 1 },
          { slug: "yellow-cloth-1m", qty: 1 },
          { slug: "kalava-thread", qty: 2 },
        ],
      },
      {
        name: "Baby Naming (Namakarana)",
        slug: "namakarana",
        category: "Life Event",
        deity: "Lord Ganesha",
        iconEmoji: "👶",
        isFeatured: false,
        sortOrder: 5,
        shortDescription: "Sacred naming ceremony for newborns",
        description:
          "Namakarana is the Hindu naming ceremony for a newborn, performed on the 11th or 12th day after birth. The baby receives its formal name through Vedic rituals and blessings.",
        bestTime: "11th or 12th day after birth",
        minDurationMinutes: 60,
        maxDurationMinutes: 90,
        estimatedSamagriPrice: 340,
        samagriList: [
          { slug: "coconut-whole", qty: 1 },
          { slug: "marigold-garland", qty: 2 },
          { slug: "cow-ghee-250ml", qty: 1 },
          { slug: "panchamrit-set", qty: 1 },
          { slug: "agarbatti-sandalwood", qty: 1 },
          { slug: "camphor-pack", qty: 1 },
          { slug: "diya-set-11", qty: 1 },
          { slug: "rice-akshata-500g", qty: 1 },
          { slug: "kalava-thread", qty: 1 },
          { slug: "ladoo-6pcs", qty: 1 },
        ],
      },
      {
        name: "Mrityunjaya Homam",
        slug: "mrityunjaya-homam",
        category: "Navagraha",
        deity: "Lord Shiva",
        iconEmoji: "🔥",
        isFeatured: false,
        sortOrder: 10,
        shortDescription: "Powerful yagna for health, longevity and protection",
        description:
          "Mrityunjaya Homam is a powerful fire ritual dedicated to Lord Shiva in his Mrityunjaya form. Performed for protection from serious illness, accidents and premature death.",
        bestTime: "As per horoscope or during illness",
        minDurationMinutes: 180,
        maxDurationMinutes: 240,
        estimatedSamagriPrice: 850,
        samagriList: [
          { slug: "cow-ghee-250ml", qty: 3 },
          { slug: "sesame-100g", qty: 3 },
          { slug: "bilva-leaves-21", qty: 3 },
          { slug: "coconut-whole", qty: 3 },
          { slug: "wheat-flour-500g", qty: 1 },
          { slug: "rice-akshata-500g", qty: 2 },
          { slug: "marigold-garland", qty: 3 },
          { slug: "agarbatti-sandalwood", qty: 2 },
          { slug: "camphor-pack", qty: 3 },
          { slug: "dhoop-sticks", qty: 2 },
          { slug: "diya-set-11", qty: 2 },
          { slug: "copper-kalash", qty: 1 },
          { slug: "panchamrit-set", qty: 1 },
          { slug: "panchameva-mix", qty: 1 },
        ],
      },
      {
        name: "Upanayanam",
        slug: "upanayanam",
        category: "Life Event",
        deity: "Brahma / Vishnu / Shiva",
        iconEmoji: "🧵",
        isFeatured: false,
        sortOrder: 9,
        shortDescription:
          "Sacred thread ceremony for boys — a major life event",
        description:
          "Upanayanam (Janeu/Yagnopavit ceremony) marks the spiritual initiation of a boy into Vedic studies. One of the most important samskaras in Hindu tradition.",
        bestTime: "Auspicious muhurtas — consult pandit",
        minDurationMinutes: 240,
        maxDurationMinutes: 360,
        estimatedSamagriPrice: 1100,
        samagriList: [
          { slug: "kalava-thread", qty: 5 },
          { slug: "yellow-cloth-1m", qty: 2 },
          { slug: "cow-ghee-250ml", qty: 3 },
          { slug: "coconut-whole", qty: 5 },
          { slug: "banana-bunch", qty: 2 },
          { slug: "mango-6pcs", qty: 2 },
          { slug: "marigold-garland", qty: 5 },
          { slug: "rose-petals-100g", qty: 2 },
          { slug: "rice-akshata-500g", qty: 3 },
          { slug: "sesame-100g", qty: 2 },
          { slug: "agarbatti-sandalwood", qty: 3 },
          { slug: "camphor-pack", qty: 3 },
          { slug: "diya-set-11", qty: 3 },
          { slug: "copper-kalash", qty: 1 },
          { slug: "panchamrit-set", qty: 2 },
          { slug: "panchameva-mix", qty: 2 },
          { slug: "ladoo-6pcs", qty: 3 },
          { slug: "chandan-paste", qty: 2 },
          { slug: "kumkum-pack", qty: 2 },
          { slug: "turmeric-50g", qty: 1 },
        ],
      },
    ];

    for (const pooja of poojaData) {
      const { samagriList, ...poojaFields } = pooja;
      // Build samagri refs
      const samagriRefs = samagriList
        .filter((s) => samagriMap[s.slug])
        .map((s) => ({
          itemId: samagriMap[s.slug],
          quantity: s.qty,
          unit: "piece",
          isOptional: false,
        }));
      await PoojaType.findOneAndUpdate(
        { slug: poojaFields.slug },
        { ...poojaFields, samagriList: samagriRefs },
        { upsert: true }
      );
      results.poojas++;
    }

    // ── STEP 3: Seed 3 verified Hyderabad pandits ──────────────────────────
    const allPoojas = await PoojaType.find({ isActive: true })
      .select("_id slug")
      .lean();
    const poojaIdMap = {};
    allPoojas.forEach((p) => {
      poojaIdMap[p.slug] = p._id;
    });

    const panditData = [
      {
        name: "Pt. Ramakrishna Sharma",
        email: "pandit1@panditconnect.dev",
        phone: "9848012345",
        sampradaya: "Vaishnava",
        veda: "Yajurveda",
        gotram: "Kashyapa",
        gurukul: "Sri Venkateswara Vedic Pathshala, Tirupati",
        yearsExperience: 18,
        bio: "I am a third-generation Vaishnava pandit with 18 years of experience performing poojas across Hyderabad. Specialised in Satyanarayan, Griha Pravesh and Vaishnavite traditions. I perform rituals with full Sanskrit chanting and explain each step to the family.",
        languages: ["Telugu", "Hindi", "Sanskrit"],
        travelRadiusKm: 30,
        city: "Hyderabad",
        state: "Telangana",
        averageRating: 4.8,
        totalReviews: 47,
        completedBookings: 52,
        totalBookings: 54,
        pricingList: [
          { slug: "satyanarayan-pooja", price: 1500, duration: 90 },
          { slug: "griha-pravesh", price: 2500, duration: 150 },
          { slug: "lakshmi-pooja", price: 1200, duration: 75 },
          { slug: "vastu-shanti", price: 3000, duration: 150 },
          { slug: "namakarana", price: 1000, duration: 75 },
        ],
        availability: [
          { day: "Mon", startTime: "06:00", endTime: "19:00" },
          { day: "Tue", startTime: "06:00", endTime: "19:00" },
          { day: "Wed", startTime: "06:00", endTime: "19:00" },
          { day: "Thu", startTime: "06:00", endTime: "19:00" },
          { day: "Fri", startTime: "06:00", endTime: "19:00" },
          { day: "Sat", startTime: "05:30", endTime: "20:00" },
          { day: "Sun", startTime: "05:30", endTime: "20:00" },
        ],
      },
      {
        name: "Pt. Srinivas Avadhani",
        email: "pandit2@panditconnect.dev",
        phone: "9848023456",
        sampradaya: "Smartha",
        veda: "Rigveda",
        gotram: "Bharadwaja",
        gurukul: "Advaita Vedanta Gurukul, Sringeri",
        yearsExperience: 25,
        bio: "Senior Smartha pandit with 25 years experience. Trained at the Sringeri Sharada Peetham tradition. Expert in Navagraha poojas, Homams and complex Vedic rituals. Known for precise mantras and detailed explanations of ritual significance.",
        languages: ["Telugu", "Sanskrit", "Kannada"],
        travelRadiusKm: 25,
        city: "Hyderabad",
        state: "Telangana",
        averageRating: 4.9,
        totalReviews: 93,
        completedBookings: 110,
        totalBookings: 112,
        pricingList: [
          { slug: "navagraha-pooja", price: 3500, duration: 135 },
          { slug: "mrityunjaya-homam", price: 5000, duration: 210 },
          { slug: "rudrabhishek", price: 2000, duration: 105 },
          { slug: "satyanarayan-pooja", price: 1800, duration: 90 },
          { slug: "upanayanam", price: 8000, duration: 300 },
          { slug: "griha-pravesh", price: 3000, duration: 150 },
        ],
        availability: [
          { day: "Mon", startTime: "05:00", endTime: "20:00" },
          { day: "Wed", startTime: "05:00", endTime: "20:00" },
          { day: "Thu", startTime: "05:00", endTime: "20:00" },
          { day: "Fri", startTime: "05:00", endTime: "20:00" },
          { day: "Sat", startTime: "05:00", endTime: "20:00" },
          { day: "Sun", startTime: "05:00", endTime: "20:00" },
        ],
      },
      {
        name: "Pt. Venkatesh Dikshitulu",
        email: "pandit3@panditconnect.dev",
        phone: "9848034567",
        sampradaya: "Shaiva",
        veda: "Samaveda",
        gotram: "Vasishtha",
        gurukul: "Sri Kalahasti Agamic Pathshala",
        yearsExperience: 12,
        bio: "Young and energetic Shaiva pandit, trained in the Agamic tradition of Sri Kalahasti. Fluent in Telugu, Hindi and Sanskrit. I believe in making rituals accessible — I explain every step in simple language so your family truly connects with the pooja.",
        languages: ["Telugu", "Hindi", "Sanskrit"],
        travelRadiusKm: 40,
        city: "Hyderabad",
        state: "Telangana",
        averageRating: 4.7,
        totalReviews: 28,
        completedBookings: 31,
        totalBookings: 33,
        pricingList: [
          { slug: "rudrabhishek", price: 1800, duration: 100 },
          { slug: "ganesh-pooja", price: 800, duration: 70 },
          { slug: "navagraha-pooja", price: 2800, duration: 130 },
          { slug: "satyanarayan-pooja", price: 1200, duration: 90 },
          { slug: "griha-pravesh", price: 2200, duration: 150 },
          { slug: "lakshmi-pooja", price: 1000, duration: 70 },
          { slug: "vastu-shanti", price: 2500, duration: 150 },
        ],
        availability: [
          { day: "Mon", startTime: "06:00", endTime: "20:00" },
          { day: "Tue", startTime: "06:00", endTime: "20:00" },
          { day: "Wed", startTime: "06:00", endTime: "20:00" },
          { day: "Thu", startTime: "06:00", endTime: "20:00" },
          { day: "Fri", startTime: "06:00", endTime: "20:00" },
          { day: "Sat", startTime: "05:00", endTime: "21:00" },
          { day: "Sun", startTime: "05:00", endTime: "21:00" },
        ],
      },
    ];

    const passwordHash = await bcrypt.hash("Pandit2024", 12);

    for (const p of panditData) {
      const { pricingList, availability, ...fields } = p;

      // Build pricing list with real pooja ObjectIds
      const pricing = pricingList
        .filter((pl) => poojaIdMap[pl.slug])
        .map((pl) => ({
          poojaTypeId: poojaIdMap[pl.slug],
          basePrice: pl.price,
          durationMinutes: pl.duration,
        }));

      await Pandit.findOneAndUpdate(
        { email: fields.email },
        {
          ...fields,
          passwordHash,
          pricingList: pricing,
          availability,
          verificationStatus: "verified",
          isActive: true,
          isAvailableNow: true,
          onboardingComplete: true,
          location: { type: "Point", coordinates: [78.4867, 17.385] }, // Hyderabad
        },
        { upsert: true }
      );
      results.pandits++;
    }

    return res.json({
      success: true,
      message: "Full seed complete!",
      results,
      panditLogins: panditData.map((p) => ({
        name: p.name,
        email: p.email,
        password: "Pandit2024",
      })),
    });
  } catch (err) {
    console.error("[SEED-ALL]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
  
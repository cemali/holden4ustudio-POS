// api/transactions.js
// Transaction routes for the real-time POS server.
// Mounted in index.js with: app.use("/api", require("./api/transactions"));
// Updated for Express 5 and @seald-io/nedb (maintained fork of nedb).

const express = require("express");
const path = require("path");
const fs = require("fs");
const Datastore = require("@seald-io/nedb");
const Inventory = require("./inventory");

const router = express.Router();
router.use(express.json());

// Database file lives in <project>/databases/transactions.db
const dbDir = path.join(__dirname, "..", "databases");
fs.mkdirSync(dbDir, { recursive: true });

const transactionsDB = new Datastore({
  filename: path.join(dbDir, "transactions.db"),
  autoload: true,
});

// Start and end of a given day (local time)
function dayRange(dateInput) {
  const start = dateInput ? new Date(dateInput) : new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

// GET /api/  -> health check
router.get("/", (req, res) => {
  res.send("Transactions API");
});

// GET /api/all  -> every transaction, newest first
router.get("/all", async (req, res) => {
  const all = await transactionsDB.findAsync({}).sort({ date: -1 });
  res.json(all);
});

// GET /api/limit?limit=5  -> the N most recent transactions
router.get("/limit", async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 5;
  const recent = await transactionsDB
    .findAsync({})
    .sort({ date: -1 })
    .limit(limit);
  res.json(recent);
});

// GET /api/day-total?date=2026-11-26  -> sales total for a day (default today)
router.get("/day-total", async (req, res) => {
  const { start, end } = dayRange(req.query.date);
  const docs = await transactionsDB.findAsync({
    date: { $gte: start, $lte: end },
  });
  const total = docs.reduce((sum, t) => sum + (parseFloat(t.total) || 0), 0);
  res.json({ date: start, total: Number(total.toFixed(2)), count: docs.length });
});

// GET /api/by-date?date=2026-11-26  -> transactions for a day (default today)
router.get("/by-date", async (req, res) => {
  const { start, end } = dayRange(req.query.date);
  const docs = await transactionsDB
    .findAsync({ date: { $gte: start, $lte: end } })
    .sort({ date: -1 });
  res.json(docs);
});

// POST /api/new  -> record a sale and reduce inventory
router.post("/new", async (req, res) => {
  const transaction = { ...req.body, date: new Date() };
  const saved = await transactionsDB.insertAsync(transaction);
  await Inventory.decrementInventory(saved.products || saved.items || []);
  res.status(201).json(saved);
});

// GET /api/:transactionId  -> one transaction
// Keep this LAST so it doesn't swallow /all, /limit, etc.
router.get("/:transactionId", async (req, res) => {
  const doc = await transactionsDB.findOneAsync({ _id: req.params.transactionId });
  if (!doc) return res.status(404).json({ error: "Transaction not found" });
  res.json(doc);
});

module.exports = router;
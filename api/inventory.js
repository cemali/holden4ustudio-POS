// api/inventory.js
// Inventory routes for the real-time POS server.
// Mounted in index.js with: app.use("/api/inventory", require("./api/inventory"));
// Updated for Express 5 and @seald-io/nedb (maintained fork of nedb).

const express = require("express");
const path = require("path");
const fs = require("fs");
const Datastore = require("@seald-io/nedb");

const router = express.Router();
router.use(express.json());

// Database file lives in <project>/databases/inventory.db
const dbDir = path.join(__dirname, "..", "databases");
fs.mkdirSync(dbDir, { recursive: true });

const inventoryDB = new Datastore({
  filename: path.join(dbDir, "inventory.db"),
  autoload: true,
});

// GET /api/inventory/  -> health check
router.get("/", (req, res) => {
  res.send("Inventory API");
});

// GET /api/inventory/products  -> all products
router.get("/products", async (req, res) => {
  const products = await inventoryDB.findAsync({});
  res.json(products);
});

// GET /api/inventory/product/:productId  -> one product
router.get("/product/:productId", async (req, res) => {
  const product = await inventoryDB.findOneAsync({ _id: req.params.productId });
  if (!product) return res.status(404).json({ error: "Product not found" });
  res.json(product);
});

// POST /api/inventory/product  -> create product
router.post("/product", async (req, res) => {
  const newProduct = await inventoryDB.insertAsync(req.body);
  res.status(201).json(newProduct);
});

// PUT /api/inventory/product  -> update product (body must include _id)
router.put("/product", async (req, res) => {
  const { _id, ...fields } = req.body;
  if (!_id) return res.status(400).json({ error: "_id is required" });

  const { numAffected } = await inventoryDB.updateAsync(
    { _id },
    { $set: fields },
    {}
  );
  if (!numAffected) return res.status(404).json({ error: "Product not found" });

  const updated = await inventoryDB.findOneAsync({ _id });
  res.json(updated);
});

// DELETE /api/inventory/product/:productId  -> delete product
router.delete("/product/:productId", async (req, res) => {
  const numRemoved = await inventoryDB.removeAsync(
    { _id: req.params.productId },
    {}
  );
  if (!numRemoved) return res.status(404).json({ error: "Product not found" });
  res.sendStatus(204);
});

// Helper used by api/transactions.js after a sale:
// subtracts each sold quantity from quantity_on_hand.
router.decrementInventory = async function (products = []) {
  for (const sold of products) {
    const product = await inventoryDB.findOneAsync({ _id: sold._id });
    if (!product || product.quantity_on_hand == null) continue;

    const newQty =
      parseInt(product.quantity_on_hand, 10) - parseInt(sold.quantity, 10);

    await inventoryDB.updateAsync(
      { _id: product._id },
      { $set: { quantity_on_hand: Math.max(newQty, 0) } },
      {}
    );
  }
};

module.exports = router;
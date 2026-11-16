const express = require('express');
const { db } = require('../db');
const { check, route, textFilter, whole, requiredText } = require('../http');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');
const market = require('../marketplace');
const { categoryAliases, categoryCode } = require('../productCategories');

const router = express.Router();
const farmer = requireRole(['FARMER']);
router.use(authenticateToken);

router.get('/products', farmer, route(async (req, res) => {
  const search = textFilter(req.query.search);
  const category = textFilter(req.query.category);
  const brand = textFilter(req.query.brand);
  const after = textFilter(req.query.after);
  const products = await db.product.findMany({
    where: {
      ...market.published, id: after ? { gt: after } : undefined,
      category: category ? { in: categoryAliases(category), mode: 'insensitive' } : undefined,
      brand: brand ? { contains: brand, mode: 'insensitive' } : undefined,
      OR: search ? ['title', 'description', 'brand'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) : undefined,
    },
    orderBy: { id: 'asc' }, take: 31,
  });
  res.json({
    products: products.slice(0, 30).map((product) => ({ ...product, category: categoryCode(product.category) || product.category })),
    next: products.length > 30 ? products[29].id : null,
  });
}));

router.get('/cart', farmer, route(async (req, res) => {
  await market.expireOrders(req.user.id);
  const [items, pending] = await Promise.all([market.cart(db, req.user.id), market.pending(db, req.user.id)]);
  res.json({ ...market.quote(items), pendingOrderId: pending?.id });
}));

router.put('/cart/:productId', farmer, route(async (req, res) => {
  const quantity = whole(req.body.quantity, 'Quantity', 0);
  res.json(await market.saveCart(req.user.id, req.params.productId, quantity));
}));

router.get('/orders', farmer, route(async (req, res) => {
  await market.expireOrders(req.user.id);
  res.json(await db.marketOrder.findMany({
    where: { farmerId: req.user.id }, include: market.itemInclude, orderBy: { createdAt: 'desc' }, take: 100,
  }));
}));

router.get('/vendor-orders', requireRole(['VENDOR']), route(async (req, res) => {
  const where = { vendorId: req.user.id };
  res.json(await db.marketOrder.findMany({
    where: { status: 'ORDER_PLACED', items: { some: where } },
    select: { id: true, createdAt: true, paidAt: true, status: true, items: { where } },
    orderBy: { paidAt: 'desc' }, take: 100,
  }));
}));

router.post('/checkout', farmer, route(async (req, res) => {
  const key = requiredText(req.body.requestKey, 'Checkout reference', 80);
  const totalPaise = whole(req.body.totalPaise, 'Order total', 0, 2147483647);
  const order = await market.reserve(req.user.id, key, req.body.acknowledged, totalPaise);
  res.status(201).json(await market.checkout(order));
}));

async function ownOrder(req) {
  const order = await db.marketOrder.findFirst({
    where: market.purchaserOrder(req.params.id, req.user.id), include: market.itemInclude,
  });
  check(order, 404, 'Order not found.');
  return order;
}

router.post('/orders/:id/pay', farmer, route(async (req, res) => {
  await market.expireOrders(req.user.id);
  res.json(await market.checkout(await ownOrder(req)));
}));

router.post('/orders/:id/verify', farmer, route(async (req, res) => {
  res.json(await market.verifyCheckout(await ownOrder(req), req.body));
}));

module.exports = router;

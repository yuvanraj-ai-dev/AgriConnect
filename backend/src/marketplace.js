const { createHmac, timingSafeEqual } = require('node:crypto');
const { db, serializable } = require('./db');
const { check, HttpError, notify } = require('./http');
const { categoryCode } = require('./productCategories');

const HOLD_MS = 15 * 60 * 1000;
const purchaserOrder = (id, farmerId) => ({ id, farmerId });
const itemInclude = { items: { orderBy: { id: 'asc' } } };
const productInclude = { product: { include: { vendor: { select: { active: true } } } } };
const published = { active: true, deletedAt: null, vendor: { active: true, deletedAt: null } };

function paymentConfig() {
  const key = process.env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET;
  check(key?.startsWith('rzp_test_') && secret, 503, 'Razorpay test checkout is not configured.');
  return { key, secret };
}

async function gateway(path, body) {
  const { key, secret } = paymentConfig();
  try {
    const result = await fetch('https://api.razorpay.com/v1/' + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: 'Basic ' + Buffer.from(key + ':' + secret).toString('base64'),
        'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    if (!result.ok) throw new Error('Gateway HTTP ' + result.status);
    return await result.json();
  } catch (error) {
    console.warn('[Checkout]', error.message);
    throw new HttpError(502, 'Payment gateway unavailable. Your order hold remains active until its expiry.');
  }
}

function signatureMatches(secret, input, signature) {
  if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(input).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

async function cart(tx, farmerId) {
  return tx.cartItem.findMany({ where: { farmerId }, include: productInclude, orderBy: { productId: 'asc' } });
}

function quote(rows) {
  const items = rows.map(({ product, quantity }) => {
    const available = product.active && product.vendor.active && !product.deletedAt ? product.stockQuantity : 0;
    return {
      productId: product.id, vendorId: product.vendorId, title: product.title, category: categoryCode(product.category) || product.category,
      unit: product.unit, unitPaise: Math.round(product.price * 100), quantity, available,
      requiresAcknowledgment: categoryCode(product.category) === 'PESTICIDE', safetyWarning: product.safetyWarning,
    };
  });
  const subtotalPaise = items.reduce((sum, item) => sum + item.unitPaise * item.quantity, 0);
  const taxRate = Number(process.env.MARKETPLACE_TAX_PERCENT || 0);
  const taxPaise = Math.round(subtotalPaise * taxRate / 100);
  return { items, subtotalPaise, taxPaise, totalPaise: subtotalPaise + taxPaise };
}

async function completeOrder(tx, order, paymentId) {
  const updated = await tx.marketOrder.update({
    where: { id: order.id }, data: { status: 'ORDER_PLACED', paidAt: new Date(), paymentId }, include: itemInclude,
  });
  await tx.cartItem.deleteMany({ where: { farmerId: order.farmerId } });
  for (const vendorId of new Set(order.items.map((item) => item.vendorId))) {
    await notify(tx, vendorId, 'MARKET_ORDER', 'Marketplace order ' + order.id + ' has been placed.');
  }
  await notify(tx, order.farmerId, 'ORDER_PLACED', 'Marketplace order ' + order.id + ' has been placed.');
  return updated;
}

async function releaseStock(tx, order) {
  for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
    await tx.product.update({ where: { id: item.productId }, data: { stockQuantity: { increment: item.quantity } } });
  }
}

async function expireOrders(farmerId) {
  const ids = await db.marketOrder.findMany({
    where: { farmerId, status: 'PENDING_PAYMENT', expiresAt: { lte: new Date() } }, select: { id: true }, take: 100,
  });
  for (const { id } of ids) {
    await serializable(async (tx) => {
      const order = await tx.marketOrder.findUnique({ where: { id }, include: itemInclude });
      if (order.status !== 'PENDING_PAYMENT' || order.expiresAt > new Date()) return;
      await tx.marketOrder.update({ where: { id }, data: { status: 'PAYMENT_EXPIRED' } });
      await releaseStock(tx, order);
      await notify(tx, order.farmerId, 'PAYMENT_EXPIRED', 'The payment hold for order ' + id + ' expired. You can check out again from your cart.');
    });
  }
}

async function pending(tx, farmerId) {
  return tx.marketOrder.findFirst({ where: { farmerId, status: 'PENDING_PAYMENT' }, include: itemInclude });
}

async function saveCart(farmerId, productId, quantity) {
  await expireOrders(farmerId);
  return serializable(async (tx) => {
    check(!await pending(tx, farmerId), 409, 'Finish your pending order or wait for its hold to expire before editing your cart.');
    const key = { farmerId, productId };
    if (!quantity) {
      await tx.cartItem.deleteMany({ where: key });
      return quote(await cart(tx, farmerId));
    }
    const product = await tx.product.findFirst({ where: { id: productId, ...published } });
    const maxAvailable = product?.stockQuantity ?? 0;
    check(quantity <= maxAvailable, 409, 'Only ' + maxAvailable + ' available.', { maxAvailable, productId });
    await tx.cartItem.upsert({ where: { farmerId_productId: key }, update: { quantity }, create: { ...key, quantity } });
    return quote(await cart(tx, farmerId));
  });
}

async function reserve(farmerId, requestKey, acknowledgment, expectedTotalPaise) {
  await expireOrders(farmerId);
  return serializable(async (tx) => {
    const existing = await tx.marketOrder.findUnique({ where: { farmerId_requestKey: { farmerId, requestKey } }, include: itemInclude });
    if (existing) return existing;
    check(!await pending(tx, farmerId), 409, 'You already have a pending order. Resume payment from your order history.');
    const summary = quote(await cart(tx, farmerId));
    check(summary.items.length, 400, 'Your cart is empty.');
    check(summary.totalPaise === expectedTotalPaise, 409, 'Prices changed. Review your updated cart total and confirm again.');
    check(summary.totalPaise === 0 || (summary.totalPaise >= 100 && summary.totalPaise <= 2147483647),
      400, 'The payable total must be at least ₹1 and fit the checkout limit.');
    if (summary.totalPaise) paymentConfig();
    for (const item of summary.items) {
      check(item.quantity <= item.available, 409, item.title + ' has only ' + item.available + ' available.',
        { maxAvailable: item.available, productId: item.productId });
      check(!item.requiresAcknowledgment || acknowledgment === true, 400, 'Acknowledge the pesticide safety warnings to continue.');
      const held = await tx.product.updateMany({
        where: { id: item.productId, ...published, stockQuantity: { gte: item.quantity } },
        data: { stockQuantity: { decrement: item.quantity } },
      });
      check(held.count, 409, item.title + ' just changed. Refresh your cart and try again.');
    }
    const order = await tx.marketOrder.create({
      data: {
        farmerId, requestKey, subtotalPaise: summary.subtotalPaise, taxPaise: summary.taxPaise,
        expiresAt: new Date(Date.now() + HOLD_MS),
        items: { create: summary.items.map(({ productId, vendorId, title, quantity, unitPaise }) =>
          ({ productId, vendorId, title, quantity, unitPaise })) },
      },
      include: itemInclude,
    });
    return summary.totalPaise ? order : completeOrder(tx, order, null);
  });
}

async function checkout(order) {
  if (order.status !== 'PENDING_PAYMENT') return { order };
  const { key } = paymentConfig();
  const amount = order.subtotalPaise + order.taxPaise;
  if (!order.gatewayOrderId) {
    const now = new Date();
    const claimed = await db.marketOrder.updateMany({
      where: { id: order.id, status: 'PENDING_PAYMENT', gatewayOrderId: null, expiresAt: { gt: now },
        OR: [{ gatewayLeaseUntil: null }, { gatewayLeaseUntil: { lte: now } }] },
      data: { gatewayLeaseUntil: new Date(now.getTime() + 15000) },
    });
    check(claimed.count, 409, 'Checkout is already starting or has expired. Refresh your orders and try again.');
    try {
      const external = await gateway('orders', { amount, currency: 'INR', receipt: order.id, partial_payment: false });
      check(external?.id, 502, 'The payment gateway did not return an order ID.');
      const linked = await db.marketOrder.updateMany({
        where: { id: order.id, status: 'PENDING_PAYMENT', expiresAt: { gt: new Date() } },
        data: { gatewayOrderId: external.id, gatewayLeaseUntil: null },
      });
      check(linked.count, 409, 'The order hold expired. Return to the cart to try again.');
      order.gatewayOrderId = external.id;
    } catch (error) {
      await db.marketOrder.updateMany({ where: { id: order.id, gatewayOrderId: null }, data: { gatewayLeaseUntil: null } });
      if (error.status === 502) return { order, gatewayError: error.message };
      throw error;
    }
  }
  return { order, payment: { key, order_id: order.gatewayOrderId, amount, currency: 'INR' } };
}

async function reconcile(payment) {
  return serializable(async (tx) => {
    const order = await tx.marketOrder.findUnique({ where: { gatewayOrderId: payment.order_id }, include: itemInclude });
    if (!order) return null;
    check(payment.amount === order.subtotalPaise + order.taxPaise && payment.currency === 'INR',
      400, 'Captured payment amount does not match the order.');
    if (['ORDER_PLACED', 'LATE_PAYMENT'].includes(order.status)) {
      check(order.paymentId === payment.id, 409, 'A different payment is already associated with this order.');
      return order;
    }
    if (order.status === 'PENDING_PAYMENT' && order.expiresAt > new Date()) return completeOrder(tx, order, payment.id);
    if (order.status === 'PENDING_PAYMENT') await releaseStock(tx, order);
    const updated = await tx.marketOrder.update({
      where: { id: order.id }, data: { status: 'LATE_PAYMENT', paymentId: payment.id }, include: itemInclude,
    });
    await notify(tx, order.farmerId, 'LATE_PAYMENT', 'Test payment ' + payment.id + ' arrived after order ' + order.id + ' expired. Contact an administrator for reconciliation.');
    await tx.auditLog.create({ data: { userId: order.farmerId, event: 'LATE_TEST_PAYMENT ' + order.id + ' ' + payment.id } });
    return updated;
  });
}

async function verifyCheckout(order, body) {
  const { secret } = paymentConfig();
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  check(order.gatewayOrderId && order.gatewayOrderId === razorpay_order_id &&
    typeof razorpay_payment_id === 'string' && /^pay_[a-zA-Z0-9]+$/.test(razorpay_payment_id) &&
    signatureMatches(secret, order.gatewayOrderId + '|' + razorpay_payment_id, razorpay_signature),
  400, 'Payment verification failed.');
  const payment = await gateway('payments/' + razorpay_payment_id);
  if (payment.status !== 'captured') return order;
  check(payment.order_id === order.gatewayOrderId, 400, 'Payment verification failed.');
  return reconcile(payment);
}

async function webhook(req, res) {
  paymentConfig();
  check(Buffer.isBuffer(req.body) &&
    signatureMatches(process.env.RAZORPAY_WEBHOOK_SECRET, req.body, req.get('X-Razorpay-Signature')),
  400, 'Invalid payment webhook signature.');
  let event;
  try { event = JSON.parse(req.body); } catch { throw new HttpError(400, 'Invalid webhook JSON.'); }
  if (event.event === 'payment.captured') {
    const payment = event.payload?.payment?.entity;
    check(payment?.status === 'captured' && typeof payment.id === 'string' && typeof payment.order_id === 'string',
      400, 'Invalid captured payment.');
    await reconcile(payment);
  }
  res.sendStatus(204);
}

module.exports = { purchaserOrder, itemInclude, published, cart, quote, pending, saveCart, reserve, checkout, expireOrders, verifyCheckout, webhook };

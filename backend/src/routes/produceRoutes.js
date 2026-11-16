const express = require('express');
const { Prisma } = require('@prisma/client');
const { db, serializable } = require('../db');
const { route, check, requiredText, textFilter, money, whole, dateOnly, DAY, notify } = require('../http');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
const farmer = requireRole(['FARMER']);
const buyer = requireRole(['BUYER']);
const negotiationInclude = {
  listing: true,
  events: { orderBy: { sequence: 'asc' } },
  agreement: true,
};
const awaitingResponse = 'NEGOTIATION_PENDING';
const activeFarmer = { farmer: { active: true, deletedAt: null } };

function quintals(value, label) {
  const raw = String(value ?? '');
  check(/^\d{1,8}(\.\d{1,2})?$/.test(raw) && Number(raw) > 0, 400, label + ' must be greater than zero with at most two decimal places.');
  return new Prisma.Decimal(raw);
}

function verifyQuantity(listing, quantity) {
  check(quantity.lte(listing.quantity), 409, 'Only ' + listing.quantity + ' quintals remain.',
    { maxAvailable: listing.quantity.toString() });
  check(listing.active, 409, 'This batch is currently unavailable.');
  check(quantity.gte(listing.minBatch), 400, 'Minimum order is ' + listing.minBatch + ' quintals.');
}

async function purchase(tx, listing, buyerId, quantity, pricePaise, negotiationId, requestKey) {
  verifyQuantity(listing, quantity);
  const amount = quantity.times(pricePaise).toDecimalPlaces(0);
  check(amount.gte(1) && amount.lte(2147483647), 400, 'The agreement total is out of range.');
  const remaining = listing.quantity.minus(quantity);
  await tx.produceListing.update({
    where: { id: listing.id }, data: { quantity: remaining, active: remaining.gte(listing.minBatch) },
  });
  const agreement = await tx.purchaseAgreement.create({
    data: {
      listingId: listing.id, crop: listing.crop, grade: listing.grade, farmerId: listing.farmerId,
      buyerId, quantity, pricePaise, totalPaise: amount.toNumber(), negotiationId, requestKey,
    },
  });
  for (const userId of [buyerId, listing.farmerId]) {
    await notify(tx, userId, 'PRODUCE_DEAL', 'Deal confirmed for ' + listing.crop + '. Purchase agreement ' + agreement.id + ' is available.');
  }
  return agreement;
}

function history(tx, negotiation, action, proposerId, pricePaise = negotiation.pricePaise) {
  return tx.negotiationEvent.create({
    data: { negotiationId: negotiation.id, action, proposerId, pricePaise },
  });
}

async function expireNegotiations() {
  const due = await db.produceNegotiation.findMany({
    where: { status: awaitingResponse, expiresAt: { lte: new Date() } }, select: { id: true }, take: 100,
  });
  for (const { id } of due) {
    await serializable(async (tx) => {
      const offer = await tx.produceNegotiation.findUnique({ where: { id }, include: { listing: true } });
      if (offer.status !== awaitingResponse || offer.expiresAt > new Date()) return;
      await tx.produceNegotiation.update({ where: { id }, data: { status: 'EXPIRED' } });
      await history(tx, offer, 'EXPIRED', null);
      await notify(tx, offer.buyerId, 'OFFER_EXPIRED', 'Your negotiation for ' + offer.listing.crop + ' expired. Check the listing for the current asking price.');
      await notify(tx, offer.listing.farmerId, 'OFFER_EXPIRED', 'A negotiation for ' + offer.listing.crop + ' expired.');
    });
  }
}

router.use(authenticateToken);
router.get('/listings', buyer, route(async (req, res) => {
  const search = textFilter(req.query.search);
  res.json(await db.produceListing.findMany({
    where: {
      ...activeFarmer, active: true, farmerId: { not: req.user.id }, quantity: { gt: 0 },
      OR: search ? ['crop', 'grade', 'location'].map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })) : undefined,
    },
    orderBy: { createdAt: 'desc' }, take: 100,
  }));
}));

router.get('/mine', farmer, route(async (req, res) => {
  res.json(await db.produceListing.findMany({
    where: { farmerId: req.user.id }, orderBy: { createdAt: 'desc' }, take: 100,
  }));
}));

router.post('/listings', farmer, route(async (req, res) => {
  const quantity = quintals(req.body.quantity, 'Quantity');
  const minBatch = quintals(req.body.minBatch, 'Minimum batch');
  const { allowNegotiation } = req.body;
  check(minBatch.lte(quantity), 400, 'The minimum batch cannot exceed the listed quantity.');
  check(typeof allowNegotiation === 'boolean', 400, 'Choose whether to allow negotiation.');
  const data = {
    farmerId: req.user.id, quantity, minBatch, allowNegotiation,
    crop: requiredText(req.body.crop, 'Crop'), grade: requiredText(req.body.grade, 'Grade'),
    location: requiredText(req.body.location, 'Location', 500), basePricePaise: money(req.body.basePrice, 'Asking price'),
    harvestDate: req.body.harvestDate ? dateOnly(req.body.harvestDate, 'Harvest date') : null,
    imageUrl: req.body.imageUrl ? requiredText(req.body.imageUrl, 'Photo URL', 2048) : null,
  };
  check(!data.imageUrl || /^https:\/\//i.test(data.imageUrl), 400, 'Use an HTTPS photo URL.');
  res.status(201).json(await db.produceListing.create({ data }));
}));

router.post('/listings/:id/buy', buyer, route(async (req, res) => {
  const quantity = quintals(req.body.quantity, 'Quantity');
  const requestKey = requiredText(req.body.requestKey, 'Purchase reference', 80);
  const expectedPrice = whole(req.body.pricePaise, 'Asking price', 1, 2147483647);
  const agreement = await serializable(async (tx) => {
    const id = req.params.id;
    const buyerId = req.user.id;
    const saved = await tx.purchaseAgreement.findUnique({ where: { buyerId_requestKey: { buyerId, requestKey } } });
    if (saved) {
      check(saved.listingId === id && saved.quantity.eq(quantity) && saved.pricePaise === expectedPrice,
        409, 'This purchase reference already belongs to another purchase.');
      return saved;
    }
    const listing = await tx.produceListing.findFirst({ where: { id, ...activeFarmer } });
    check(listing && listing.farmerId !== buyerId, 404, 'Produce batch not found.');
    check(expectedPrice === listing.basePricePaise, 409, 'The asking price changed. Review the listing and try again.');
    return purchase(tx, listing, buyerId, quantity, listing.basePricePaise, null, requestKey);
  });
  res.status(201).json(agreement);
}));

router.post('/listings/:id/offers', buyer, route(async (req, res) => {
  const quantity = quintals(req.body.quantity, 'Quantity');
  const pricePaise = money(req.body.price, 'Offer price');
  const offer = await serializable(async (tx) => {
    const listingId = req.params.id;
    const buyerId = req.user.id;
    const listing = await tx.produceListing.findFirst({ where: { id: listingId, ...activeFarmer } });
    check(listing && listing.farmerId !== buyerId, 404, 'Produce batch not found.');
    check(listing.allowNegotiation, 409, 'This listing uses the asking price.');
    verifyQuantity(listing, quantity);
    const existing = await tx.produceNegotiation.findFirst({
      where: { listingId, buyerId, status: awaitingResponse, expiresAt: { gt: new Date() } },
    });
    check(!existing, 409, 'Review your existing negotiation for this batch.');
    const created = await tx.produceNegotiation.create({
      data: { listingId, buyerId, quantity, pricePaise, status: awaitingResponse, awaiting: 'FARMER', expiresAt: new Date(Date.now() + DAY) },
    });
    await history(tx, created, 'OFFERED', buyerId);
    await notify(tx, listing.farmerId, 'PRODUCE_OFFER', 'New offer for ' + listing.crop + '.');
    return created;
  });
  res.status(201).json(offer);
}));

function party(req) {
  return req.query.view === 'buyer' ? 'BUYER' : 'FARMER';
}

router.get('/negotiations', requireRole(['FARMER', 'BUYER']), route(async (req, res) => {
  await expireNegotiations();
  const role = party(req);
  check(req.user.roles.includes(role), 403, 'This produce view is unavailable.');
  const where = role === 'BUYER' ? { buyerId: req.user.id } : { listing: { farmerId: req.user.id } };
  res.json(await db.produceNegotiation.findMany({
    where, include: negotiationInclude, orderBy: { updatedAt: 'desc' }, take: 100,
  }));
}));

router.get('/agreements', requireRole(['FARMER', 'BUYER']), route(async (req, res) => {
  const role = party(req);
  check(req.user.roles.includes(role), 403, 'This produce view is unavailable.');
  const where = role === 'BUYER' ? { buyerId: req.user.id } : { farmerId: req.user.id };
  const agreements = await db.purchaseAgreement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 100 });
  const otherParty = role === 'BUYER' ? 'farmerId' : 'buyerId';
  const contacts = await db.user.findMany({
    where: { id: { in: [...new Set(agreements.map((item) => item[otherParty]))] }, deletedAt: null },
    select: { id: true, email: true },
  });
  const emails = new Map(contacts.map(({ id, email }) => [id, email]));
  res.json(agreements.map((item) => ({ ...item, contactEmail: emails.get(item[otherParty]) })));
}));

router.post('/negotiations/:id/respond', requireRole(['FARMER', 'BUYER']), route(async (req, res) => {
  const { action, eventSequence } = req.body;
  check(['ACCEPT', 'REJECT', 'COUNTER'].includes(action), 400, 'Choose accept, reject or counter.');
  const price = action === 'COUNTER' ? money(req.body.price, 'Counter price') : undefined;
  const result = await serializable(async (tx) => {
    const offer = await tx.produceNegotiation.findUnique({
      where: { id: req.params.id },
      include: { listing: true, agreement: true, events: { orderBy: { sequence: 'desc' }, take: 1 } },
    });
    const userId = req.user.id;
    const farmerId = offer?.listing.farmerId;
    const role = userId === farmerId && req.user.roles.includes('FARMER') ? 'FARMER' :
      offer?.buyerId === userId && req.user.roles.includes('BUYER') ? 'BUYER' : null;
    check(role, 404, 'Negotiation not found.');
    if (action === 'ACCEPT' && offer.status === 'DEAL_CONFIRMED') return offer.agreement;
    check(offer.status === awaitingResponse && offer.expiresAt > new Date(), 409, 'The negotiation is closed or has expired.');
    check(offer.awaiting === role && offer.events[0]?.sequence === eventSequence, 409, 'The offer changed. Refresh the negotiation before responding.');
    const other = role === 'FARMER' ? offer.buyerId : farmerId;
    if (action !== 'REJECT') {
      check(await tx.user.findFirst({ where: { id: other, active: true, deletedAt: null }, select: { id: true } }),
        409, 'The other party is no longer active.');
    }
    if (action === 'ACCEPT') {
      const signed = await purchase(tx, offer.listing, offer.buyerId, offer.quantity, offer.pricePaise, offer.id, null);
      await history(tx, offer, 'ACCEPTED', userId);
      await tx.produceNegotiation.update({ where: { id: offer.id }, data: { status: 'DEAL_CONFIRMED' } });
      return signed;
    }
    if (action === 'REJECT') {
      await history(tx, offer, 'REJECTED', userId);
      await notify(tx, other, 'OFFER_REJECTED', 'An offer for ' + offer.listing.crop + ' was declined.');
      return tx.produceNegotiation.update({ where: { id: offer.id }, data: { status: 'REJECTED' } });
    }
    verifyQuantity(offer.listing, offer.quantity);
    await history(tx, offer, 'COUNTERED', userId, price);
    await notify(tx, other, 'COUNTER_OFFER', 'New counter-offer for ' + offer.listing.crop + '.');
    return tx.produceNegotiation.update({
      where: { id: offer.id },
      data: { pricePaise: price, awaiting: role === 'FARMER' ? 'BUYER' : 'FARMER', expiresAt: new Date(Date.now() + DAY) },
    });
  });
  res.json(result);
}));

module.exports = { router, expireNegotiations };

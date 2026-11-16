const express = require('express');
const { db } = require('../db');
const { route, check } = require('../http');
const { authenticateToken } = require('../middleware/authMiddleware');
const { emailMode } = require('../mailer');

const router = express.Router();
router.use(authenticateToken);

router.get('/notifications', route(async (req, res) => {
  const userId = req.user.id;
  const [items, unread] = await Promise.all([
    db.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    db.notification.count({ where: { userId, read: false } }),
  ]);
  res.json({ items, unread, emailMode: emailMode() });
}));

router.patch('/notifications/read', route(async (req, res) => {
  await db.notification.updateMany({ where: { userId: req.user.id, read: false }, data: { read: true } });
  res.sendStatus(204);
}));

router.patch('/notifications/:id/read', route(async (req, res) => {
  const update = await db.notification.updateMany({ where: { id: req.params.id, userId: req.user.id }, data: { read: true } });
  check(update.count, 404, 'Notification not found.');
  res.sendStatus(204);
}));

router.get('/dashboard', route(async (req, res) => {
  const { id, roles } = req.user;
  const owned = { farmerId: id };
  const queries = {};
  if (roles.includes('FARMER')) {
    queries.ST = db.soilTestRequest.count({ where: owned });
    queries.MK = db.marketOrder.count({ where: owned });
    queries.LB = db.labourJob.count({ where: owned });
    queries.EQ = db.equipmentReservation.count({ where: owned });
    queries.PR = db.produceListing.count({ where: owned });
  }
  if (roles.includes('LABOURER')) queries.LB_WORKER = db.labourAssignment.count({ where: { workerId: id, status: 'ACCEPTED' } });
  if (roles.includes('VENDOR')) {
    queries.MK_VENDOR = db.marketOrder.count({ where: { status: 'ORDER_PLACED', items: { some: { vendorId: id } } } });
    queries.EQ_OWNER = db.equipmentReservation.count({ where: { machine: { ownerId: id }, status: 'PENDING_APPROVAL' } });
  }
  if (roles.includes('TEST_CENTER')) {
    queries.ST_CENTER = db.soilTestRequest.count({
      where: { center: { agentId: id }, status: { in: ['PENDING', 'BOOKING_CONFIRMED', 'IN_PROGRESS', 'IN_ANALYSIS'] } },
    });
  }
  if (roles.includes('BUYER')) queries.PR_BUYER = db.purchaseAgreement.count({ where: { buyerId: id } });
  if (roles.includes('ADMIN')) queries.ADMIN_PANEL = db.user.count({ where: { active: true, deletedAt: null } });
  const metrics = await Promise.all(Object.entries(queries).map(async ([key, count]) => [key, await count]));
  res.json(Object.fromEntries(metrics));
}));

module.exports = router;

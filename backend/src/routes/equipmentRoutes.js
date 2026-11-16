const express = require('express');
const { db, serializable } = require('../db');
const { route, check, textFilter, money, dateOnly, dateRange, DAY, indiaDay, notify } = require('../http');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
const farmer = requireRole(['FARMER']);
const owner = requireRole(['VENDOR']);
const heldStatuses = ['PENDING_APPROVAL', 'CONFIRMED'];
const listed = { active: true, deletedAt: null, operationalStatus: 'AVAILABLE', owner: { active: true, deletedAt: null } };
const datesOnly = { startDate: true, endDate: true };
const terms = (machine) => machine.depositTerms || (machine.securityDeposit
  ? 'Pay the deposit directly to the owner. Confirm return and refund terms with the owner before pickup.'
  : 'No security deposit.');
const overlap = ({ startDate, endDate }) => ({ startDate: { lte: endDate }, endDate: { gte: startDate } });
const upcoming = () => ({ endDate: { gte: indiaDay() } });
const receiptMachine = { select: { id: true, name: true, type: true, location: true, owner: { select: { email: true } } } };

router.use(authenticateToken);

router.get('/catalog', farmer, route(async (req, res) => {
  const type = textFilter(req.query.type);
  const location = textFilter(req.query.location);
  const max = req.query.maxRate ? money(req.query.maxRate, 'Maximum daily rate') / 100 : undefined;
  const alternativeTo = textFilter(req.query.alternativeTo);
  const range = req.query.startDate || req.query.endDate ? dateRange(req.query) : null;
  const machines = await db.machinery.findMany({
    where: {
      ...listed,
      id: alternativeTo ? { not: alternativeTo } : undefined,
      ownerId: { not: req.user.id }, type: type ? { contains: type, mode: 'insensitive' } : undefined,
      location: location ? { contains: location, mode: 'insensitive' } : undefined,
      dailyRate: max === undefined ? undefined : { lte: max },
      reservations: range ? { none: { ...overlap(range), status: { in: heldStatuses } } } : undefined,
      blockedDates: range ? { none: overlap(range) } : undefined,
    },
    orderBy: [{ dailyRate: 'asc' }, { id: 'asc' }], take: 100,
  });
  res.json(machines.map((machine) => ({ ...machine, depositTerms: terms(machine) })));
}));

async function calendar(tx, machineId, startDate, endDate) {
  const filter = { machineId, endDate: { gte: startDate }, startDate: endDate ? { lte: endDate } : undefined };
  const [reserved, blocked] = await Promise.all([
    tx.equipmentReservation.findMany({ where: { ...filter, status: { in: heldStatuses } }, select: datesOnly }),
    tx.equipmentBlock.findMany({ where: filter, select: datesOnly }),
  ]);
  return [...reserved, ...blocked].sort((a, b) => a.startDate - b.startDate);
}

router.get('/machines/:id/calendar', farmer, route(async (req, res) => {
  const machine = await db.machinery.findFirst({ where: { id: req.params.id, ...listed }, select: { id: true } });
  check(machine, 404, 'Equipment unavailable.');
  const start = dateOnly(req.query.from, 'Calendar start');
  const end = dateOnly(req.query.to, 'Calendar end');
  check(end >= start && end - start <= 93 * DAY, 400, 'Choose a calendar range of up to three months.');
  res.json(await calendar(db, machine.id, start, end));
}));

function nextAvailable(blocks, start, days) {
  let next = start;
  for (const blocked of blocks) {
    if (blocked.endDate < next) continue;
    if (blocked.startDate > next.getTime() + (days - 1) * DAY) break;
    next = new Date(blocked.endDate.getTime() + DAY);
  }
  return { startDate: next.toISOString().slice(0, 10), endDate: new Date(next.getTime() + (days - 1) * DAY).toISOString().slice(0, 10) };
}

router.post('/reservations', farmer, route(async (req, res) => {
  const range = dateRange(req.body);
  const days = (range.endDate - range.startDate) / DAY + 1;
  check(days <= 365, 400, 'Choose up to 365 calendar days. A rental day is a minimum of eight hours.');
  check(req.body.termsAccepted === true, 400, 'Review and accept the rental and deposit terms.');
  const reservation = await serializable(async (tx) => {
    const { machineId } = req.body;
    check(typeof machineId === 'string', 400, 'Choose equipment to rent.');
    const machine = await tx.machinery.findFirst({ where: { id: machineId, ...listed } });
    check(machine && machine.ownerId !== req.user.id, 404, 'Equipment unavailable.');
    const dates = await calendar(tx, machine.id, range.startDate);
    const available = nextAvailable(dates, range.startDate, days);
    check(available.startDate === range.startDate.toISOString().slice(0, 10),
      409, 'Those dates are unavailable. Try ' + available.startDate + ' to ' + available.endDate + '.', { nextAvailable: available });
    const depositTerms = terms(machine);
    const dailyRatePaise = Math.round(machine.dailyRate * 100);
    const depositPaise = Math.round(machine.securityDeposit * 100);
    const feePaise = days * dailyRatePaise;
    check(req.body.feePaise === feePaise && req.body.depositPaise === depositPaise &&
      req.body.depositTerms === depositTerms, 409, 'Rental terms changed. Refresh this listing to review the latest quote.');
    check(dailyRatePaise > 0 && feePaise <= 2147483647 && depositPaise <= 2147483647, 400, 'The rental amount is out of range.');
    const confirmed = machine.instantApproval;
    const result = await tx.equipmentReservation.create({
      data: {
        ...range, machineId, farmerId: req.user.id, dailyRatePaise, feePaise, depositPaise, depositTerms,
        status: confirmed ? 'CONFIRMED' : 'PENDING_APPROVAL', confirmedAt: confirmed ? new Date() : null,
      },
    });
    await notify(tx, machine.ownerId, 'RENTAL_REQUEST', machine.name + ' reservation ' + result.id + (confirmed ? ' was confirmed.' : ' needs approval.'));
    if (confirmed) await notify(tx, req.user.id, 'RENTAL_CONFIRMED', 'Rental ' + result.id + ' for ' + machine.name + ' is confirmed. View its receipt in Equipment Rental.');
    return result;
  });
  res.status(201).json(reservation);
}));

router.get('/reservations/mine', farmer, route(async (req, res) => {
  res.json(await db.equipmentReservation.findMany({
    where: { farmerId: req.user.id }, include: { machine: receiptMachine },
    orderBy: { createdAt: 'desc' }, take: 100,
  }));
}));

router.get('/reservations/owner', owner, route(async (req, res) => {
  const reservations = await db.equipmentReservation.findMany({
    where: { machine: { ownerId: req.user.id } }, include: { machine: receiptMachine },
    orderBy: { createdAt: 'desc' }, take: 100,
  });
  const farmers = await db.user.findMany({
    where: { id: { in: [...new Set(reservations.map((r) => r.farmerId))] }, deletedAt: null },
    select: { id: true, email: true },
  });
  const contacts = new Map(farmers.map((user) => [user.id, user.email]));
  res.json(reservations.map((r) => ({ ...r, farmerEmail: contacts.get(r.farmerId) })));
}));

router.patch('/reservations/:id', owner, route(async (req, res) => {
  const { status } = req.body;
  const reservation = await serializable(async (tx) => {
    const current = await tx.equipmentReservation.findFirst({
      where: { id: req.params.id, machine: { ownerId: req.user.id } }, include: { machine: true },
    });
    check(current, 404, 'Reservation not found.');
    if (current.status === status) return current;
    const canDecide = current.status === 'PENDING_APPROVAL' && ['CONFIRMED', 'REJECTED'].includes(status);
    const canFinish = current.status === 'CONFIRMED' && status === 'COMPLETED' && current.endDate <= indiaDay();
    check(canDecide || canFinish, 409, 'This reservation cannot move to that status.');
    if (status === 'CONFIRMED') {
      check(current.startDate >= indiaDay() && current.machine.active && !current.machine.deletedAt &&
        current.machine.operationalStatus === 'AVAILABLE', 409, 'These rental dates or equipment are no longer available. Decline the request to release the hold.');
    }
    const updated = await tx.equipmentReservation.update({
      where: { id: current.id }, data: { status, confirmedAt: status === 'CONFIRMED' ? new Date() : undefined },
    });
    const suffix = status === 'REJECTED' ? ' Browse alternative machines in Equipment Rental.' :
      status === 'CONFIRMED' ? ' View your receipt in Equipment Rental.' : '';
    await notify(tx, current.farmerId, 'RENTAL_' + status,
      'Rental ' + current.id + ' for ' + current.machine.name + ' is ' + status.toLowerCase() + '.' + suffix);
    return updated;
  });
  res.json(reservation);
}));

router.get('/blocks', owner, route(async (req, res) => {
  res.json(await db.equipmentBlock.findMany({
    where: { machine: { ownerId: req.user.id }, ...upcoming() }, include: { machine: { select: { name: true } } },
    orderBy: { startDate: 'asc' },
  }));
}));

router.post('/machines/:id/blocks', owner, route(async (req, res) => {
  const range = dateRange(req.body);
  const block = await serializable(async (tx) => {
    const machineId = req.params.id;
    const machine = await tx.machinery.findFirst({ where: { id: machineId, ownerId: req.user.id, deletedAt: null } });
    check(machine, 404, 'Equipment not found.');
    check(!(await calendar(tx, machineId, range.startDate, range.endDate)).length, 409,
      'The date range overlaps a booking or an existing block.');
    return tx.equipmentBlock.create({ data: { machineId, ...range } });
  });
  res.status(201).json(block);
}));

router.delete('/blocks/:id', owner, route(async (req, res) => {
  const change = await db.equipmentBlock.deleteMany({ where: { id: req.params.id, machine: { ownerId: req.user.id } } });
  check(change.count, 404, 'Calendar block not found.');
  res.sendStatus(204);
}));

module.exports = router;

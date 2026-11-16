const { pipeline } = require('node:stream/promises');
const { db, serializable } = require('../db');
const { check, requiredText, whole, indiaDayStart, DAY, notify } = require('../http');
const storage = require('../reportStorage');

const centerSelect = { id: true, name: true, location: true, accredited: true, dailyCapacity: true };
const requestInclude = {
  center: { select: centerSelect },
  farmer: { select: { email: true } },
  report: { select: { uploadedAt: true } },
};
const publicCenter = { accredited: true, agent: { active: true, deletedAt: null } };
const confirmed = ['PENDING', 'BOOKING_CONFIRMED'];

exports.createCenter = async (req, res) => {
  const { name, location, dailyCapacity } = req.body;
  const center = await db.soilTestCenter.create({
    data: {
      name: requiredText(name, 'Center name'), location: requiredText(location, 'Location'),
      dailyCapacity: whole(dailyCapacity ?? 10, 'Daily capacity', 1, 500), agentId: req.user.id,
    },
    select: centerSelect,
  });
  res.status(201).json(center);
};

exports.getCenters = async (req, res) => {
  res.json(await db.soilTestCenter.findMany({ where: publicCenter, orderBy: { name: 'asc' }, select: centerSelect }));
};

exports.myCenter = async (req, res) => {
  res.json(await db.soilTestCenter.findUnique({ where: { agentId: req.user.id }, select: centerSelect }));
};

function pickupFilter(pickupAt) {
  const start = indiaDayStart(pickupAt);
  return { pickupAt: { gte: start, lt: new Date(start.getTime() + DAY) }, status: { not: 'CANCELLED' } };
}

exports.bookSoilTest = async (req, res) => {
  const { centerId, pickupAt: input, notes } = req.body;
  const farmAddress = requiredText(req.body.farmAddress, 'Farm address', 500);
  const cropHistory = requiredText(req.body.cropHistory, 'Crop history', 1000);
  const pickupAt = typeof input === 'string' && /(Z|[+-]\d\d:\d\d)$/.test(input) ? new Date(input) : null;
  check(pickupAt && pickupAt.getTime() >= Date.now() + 2 * DAY, 400,
    'Choose a pickup at least 48 hours from now.', { field: 'Pickup slot' });
  const request = await serializable(async (tx) => {
    const center = await tx.soilTestCenter.findFirst({ where: { id: requiredText(centerId, 'Center'), ...publicCenter } });
    check(center, 404, 'Choose an accredited testing center.');
    const filter = pickupFilter(pickupAt);
    const booked = await tx.soilTestRequest.count({ where: { centerId, ...filter } });
    if (booked >= center.dailyCapacity) {
      const alternatives = await tx.soilTestCenter.findMany({
        where: { ...publicCenter, id: { not: centerId } },
        select: { ...centerSelect, _count: { select: { requests: { where: filter } } } },
        orderBy: { name: 'asc' },
      });
      check(false, 409, 'This center is full on the selected day. Choose another center or date.',
        { alternatives: alternatives.filter((c) => c._count.requests < c.dailyCapacity).map(({ id, name }) => ({ id, name })) });
    }
    const created = await tx.soilTestRequest.create({
      data: { centerId, farmerId: req.user.id, farmAddress, cropHistory, pickupAt, status: 'BOOKING_CONFIRMED',
        notes: typeof notes === 'string' ? notes.trim().slice(0, 1000) : null },
      include: requestInclude,
    });
    await notify(tx, center.agentId, 'SOIL_TEST_BOOKED', 'New soil test booking ' + created.id + '.');
    return created;
  });
  res.status(201).json(request);
};

exports.getRequests = async (req, res) => {
  const view = req.query.view || (req.query.centerId ? 'center' : 'farmer');
  const role = view === 'center' ? 'TEST_CENTER' : 'FARMER';
  check(req.user.roles.includes(role), 403, 'This soil testing view is unavailable.');
  const where = view === 'center' ? { center: { agentId: req.user.id } } : { farmerId: req.user.id };
  res.json(await db.soilTestRequest.findMany({ where, include: requestInclude, orderBy: { createdAt: 'desc' } }));
};

exports.start = async (req, res) => {
  const id = req.params.id;
  await serializable(async (tx) => {
    const request = await tx.soilTestRequest.findFirst({ where: { id, center: { agentId: req.user.id } } });
    check(request, 404, 'Booking not found.');
    check(confirmed.includes(request.status), 409, 'This booking has already changed.');
    await tx.soilTestRequest.update({ where: { id }, data: { status: 'IN_ANALYSIS' } });
    await notify(tx, request.farmerId, 'SOIL_IN_ANALYSIS', 'Soil test ' + id + ' is in analysis.');
  });
  res.sendStatus(204);
};

exports.cancel = async (req, res) => {
  const id = req.params.id;
  await serializable(async (tx) => {
    const request = await tx.soilTestRequest.findFirst({ where: { id, farmerId: req.user.id }, include: { center: true } });
    check(request, 404, 'Booking not found.');
    check(confirmed.includes(request.status), 409, 'Cancellation is available before sample collection.');
    await tx.soilTestRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
    await notify(tx, request.center.agentId, 'SOIL_CANCELLED', 'Soil test booking ' + id + ' was cancelled.');
  });
  res.sendStatus(204);
};

exports.upload = async (req, res) => {
  const bookingId = req.params.id;
  const where = { id: bookingId, center: { agentId: req.user.id } };
  const booking = await db.soilTestRequest.findFirst({ where });
  check(booking, 404, 'Booking not found.');
  const inAnalysis = ['IN_ANALYSIS', 'IN_PROGRESS'];
  check(inAnalysis.includes(booking.status), 409, 'Move the booking into analysis before uploading the report.');
  check(req.file?.mimetype === 'application/pdf' && req.file.buffer.subarray(0, 5).toString() === '%PDF-' &&
    req.file.buffer.subarray(-2048).includes('%%EOF'), 400, 'Select a valid PDF report.');
  const fileRef = await storage.save(req.file.buffer);
  try {
    await serializable(async (tx) => {
      const change = await tx.soilTestRequest.updateMany({ where: { ...where, status: { in: inAnalysis } }, data: { status: 'COMPLETED' } });
      check(change.count, 409, 'This booking has already changed.');
      await tx.soilHealthReport.create({ data: { bookingId, fileRef, uploadedBy: req.user.id } });
      await notify(tx, booking.farmerId, 'SOIL_REPORT_READY', 'The soil health report for booking ' + bookingId + ' is ready to download.');
    });
  } catch (error) {
    await storage.remove(fileRef).catch((cleanup) => console.error('Report cleanup failed', cleanup.message));
    throw error;
  }
  res.sendStatus(201);
};

exports.download = async (req, res) => {
  const visibleTo = [];
  if (req.user.roles.includes('FARMER')) visibleTo.push({ farmerId: req.user.id });
  if (req.user.roles.includes('TEST_CENTER')) visibleTo.push({ center: { agentId: req.user.id } });
  const booking = await db.soilTestRequest.findFirst({
    where: { id: req.params.id, OR: visibleTo }, include: { report: true },
  });
  check(booking?.report, 404, 'Report unavailable.');
  const stream = await storage.open(booking.report.fileRef);
  res.set('Cache-Control', 'private, no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.attachment('soil-report-' + booking.id + '.pdf');
  await pipeline(stream, res);
};

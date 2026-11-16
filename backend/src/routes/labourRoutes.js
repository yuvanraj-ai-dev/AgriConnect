const express = require('express');
const { db, serializable } = require('../db');
const { route, check, requiredText, textFilter, whole, money, indiaDay, dateRange, notify } = require('../http');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
const farmer = requireRole(['FARMER']);
const labourer = requireRole(['LABOURER']);
const openNow = () => ({ status: 'OPEN', startDate: { gte: indiaDay() }, farmer: { active: true, deletedAt: null } });
router.use(authenticateToken);

router.get('/profile', labourer, route(async (req, res) => {
  res.json(await db.labourProfile.findUnique({ where: { userId: req.user.id } }));
}));

router.put('/profile', labourer, route(async (req, res) => {
  const { skills, available, dailyRate } = req.body;
  check(Array.isArray(skills) && skills.length && skills.length <= 20, 400, 'Enter between 1 and 20 skills.');
  check(typeof available === 'boolean', 400, 'Choose your availability.');
  const values = {
    skills: [...new Set(skills.map((skill) => requiredText(skill, 'Skill', 50).toLowerCase()))],
    available, dailyWagePaise: money(dailyRate, 'Daily rate'),
  };
  res.json(await db.labourProfile.upsert({
    where: { userId: req.user.id }, update: values, create: { ...values, userId: req.user.id },
  }));
}));

router.get('/directory', farmer, route(async (req, res) => {
  const skill = textFilter(req.query.skill).toLowerCase();
  res.json(await db.labourProfile.findMany({
    where: { available: true, userId: { not: req.user.id }, skills: skill ? { has: skill } : undefined,
      user: { active: true, deletedAt: null } },
    include: { user: { select: { email: true } } },
    orderBy: { userId: 'asc' }, take: 100,
  }));
}));

router.get('/jobs', labourer, route(async (req, res) => {
  const category = textFilter(req.query.category);
  const jobs = await db.labourJob.findMany({
    where: { ...openNow(), category: category ? { contains: category, mode: 'insensitive' } : undefined,
      workers: { none: { workerId: req.user.id, status: { in: ['ACCEPTED', 'INVITED'] } } } },
    orderBy: { startDate: 'asc' }, take: 100,
  });
  res.json(jobs.map((job) => ({ ...job, isOwnPosting: job.farmerId === req.user.id })));
}));

router.get('/my-jobs', farmer, route(async (req, res) => {
  const jobs = await db.labourJob.findMany({
    where: { farmerId: req.user.id }, orderBy: { createdAt: 'desc' }, include: { workers: true }, take: 100,
  });
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(jobs.flatMap((job) => job.workers.map((worker) => worker.workerId)))] } },
    select: { id: true, email: true, deletedAt: true },
  });
  const contacts = new Map(users.filter((user) => !user.deletedAt).map((user) => [user.id, user.email]));
  res.json(jobs.map((job) => ({
    ...job, workers: job.workers.map((worker) => ({ ...worker, email: contacts.get(worker.workerId) })),
  })));
}));

router.get('/assignments', labourer, route(async (req, res) => {
  res.json(await db.labourAssignment.findMany({
    where: { workerId: req.user.id }, include: { job: true }, orderBy: { createdAt: 'desc' }, take: 100,
  }));
}));

function jobFields(body) {
  return {
    category: requiredText(body.category, 'Category'), location: requiredText(body.location, 'Location', 500),
    workerCount: whole(body.workerCount, 'Worker count', 1, 500), dailyWagePaise: money(body.dailyWage, 'Daily wage'),
    ...dateRange(body),
  };
}

router.post('/jobs', farmer, route(async (req, res) => {
  res.status(201).json(await db.labourJob.create({ data: { ...jobFields(req.body), farmerId: req.user.id } }));
}));

router.put('/jobs/:id', farmer, route(async (req, res) => {
  const data = jobFields(req.body);
  const job = await serializable(async (tx) => {
    const existing = await tx.labourJob.findFirst({ where: { id: req.params.id, farmerId: req.user.id } });
    check(existing, 404, 'Job not found.');
    check(existing.status === 'OPEN' && existing.filledSlots === 0, 409, 'Only open jobs with no accepted workers can be edited.');
    const updated = await tx.labourJob.update({ where: { id: existing.id }, data: { ...data, shortfallNotified: false } });
    const invitations = await tx.labourAssignment.findMany({ where: { jobId: existing.id, status: 'INVITED' } });
    for (const invitation of invitations) {
      await notify(tx, invitation.workerId, 'JOB_UPDATED', 'A job you were invited to has new terms: ' + updated.category + '.');
    }
    return updated;
  });
  res.json(job);
}));

async function hasOverlap(tx, job, workerId) {
  return tx.labourAssignment.findFirst({
    where: {
      workerId, status: 'ACCEPTED', jobId: { not: job.id },
      job: { startDate: { lte: job.endDate }, endDate: { gte: job.startDate }, status: { notIn: ['COMPLETED', 'PAID'] } },
    },
    select: { jobId: true },
  });
}

router.post('/jobs/:id/invite', farmer, route(async (req, res) => {
  const workerId = requiredText(req.body.workerId, 'Worker');
  check(workerId !== req.user.id, 400, 'Choose another worker.');
  const invite = await serializable(async (tx) => {
    const job = await tx.labourJob.findFirst({ where: { id: req.params.id, farmerId: req.user.id } });
    check(job, 404, 'Job not found.');
    check(job.status === 'OPEN' && job.startDate >= indiaDay(), 409, 'This job is no longer accepting workers.');
    const worker = await tx.labourProfile.findFirst({ where: { userId: workerId, available: true, user: { active: true, deletedAt: null } } });
    check(worker, 409, 'The worker is currently unavailable.');
    check(!await hasOverlap(tx, job, workerId), 409, 'The worker is already booked for those dates.');
    const key = { jobId: job.id, workerId };
    const existing = await tx.labourAssignment.findUnique({ where: { jobId_workerId: key } });
    if (existing) return existing;
    const created = await tx.labourAssignment.create({ data: { ...key, status: 'INVITED' } });
    await notify(tx, workerId, 'JOB_INVITATION', 'You have a new invitation for ' + job.category + ' in ' + job.location + '.');
    return created;
  });
  res.status(201).json(invite);
}));

router.post('/jobs/:id/accept', labourer, route(async (req, res) => {
  const workerId = req.user.id;
  const result = await serializable(async (tx) => {
    const job = await tx.labourJob.findFirst({ where: { id: req.params.id, farmer: { active: true, deletedAt: null } } });
    check(job, 404, 'Job not found.');
    check(job.farmerId !== workerId, 400, 'Choose a job posted by another farmer.');
    const key = { jobId: job.id, workerId };
    const assignment = await tx.labourAssignment.findUnique({ where: { jobId_workerId: key } });
    if (assignment?.status === 'ACCEPTED') return { assignment };
    check(job.status === 'OPEN' && job.startDate >= indiaDay() && job.filledSlots < job.workerCount,
      409, 'This job is no longer accepting workers.');
    const profile = await tx.labourProfile.findUnique({ where: { userId: workerId } });
    check(profile?.available, 409, 'Set your worker profile to available before accepting a job.');
    if (await hasOverlap(tx, job, workerId)) {
      await notify(tx, workerId, 'JOB_CONFLICT', 'You already have a job during the dates for ' + job.category + '.');
      return { conflict: true };
    }
    const accepted = await tx.labourAssignment.upsert({
      where: { jobId_workerId: key }, update: { status: 'ACCEPTED' }, create: { ...key, status: 'ACCEPTED' },
    });
    const filledSlots = job.filledSlots + 1;
    await tx.labourJob.update({
      where: { id: job.id }, data: { filledSlots, status: filledSlots === job.workerCount ? 'STAFFED' : 'OPEN' },
    });
    await notify(tx, job.farmerId, 'JOB_ACCEPTED', req.user.email + ' accepted your job for ' + job.category + '.');
    return { assignment: accepted };
  });
  check(!result.conflict, 409, 'You are already booked during these dates.');
  res.json(result.assignment);
}));

router.post('/jobs/:id/decline', labourer, route(async (req, res) => {
  const result = await db.labourAssignment.updateMany({
    where: { jobId: req.params.id, workerId: req.user.id, status: 'INVITED' }, data: { status: 'DECLINED' },
  });
  check(result.count, 404, 'Open invitation not found.');
  res.sendStatus(204);
}));

router.patch('/jobs/:id/status', farmer, route(async (req, res) => {
  const next = req.body.status;
  const job = await serializable(async (tx) => {
    const current = await tx.labourJob.findFirst({ where: { id: req.params.id, farmerId: req.user.id } });
    check(current, 404, 'Job not found.');
    const allowed = {
      OPEN: current.filledSlots && current.startDate <= indiaDay() ? 'IN_PROGRESS' : null,
      STAFFED: current.startDate <= indiaDay() ? 'IN_PROGRESS' : null,
      IN_PROGRESS: 'COMPLETED', COMPLETED: 'PAID',
    }[current.status];
    check(allowed && next === allowed, 409, 'This job cannot move to that status.');
    const updated = await tx.labourJob.update({ where: { id: current.id }, data: { status: next } });
    const workers = await tx.labourAssignment.findMany({ where: { jobId: current.id, status: 'ACCEPTED' } });
    for (const worker of workers) await notify(tx, worker.workerId, 'JOB_STATUS', current.category + ' job: ' + next.replaceAll('_', ' ') + '.');
    return updated;
  });
  res.json(job);
}));

async function notifyShortfalls() {
  const ids = await db.labourJob.findMany({
    where: { status: 'OPEN', shortfallNotified: false, startDate: { lte: indiaDay() } },
    select: { id: true }, take: 100,
  });
  for (const { id } of ids) {
    await serializable(async (tx) => {
      const job = await tx.labourJob.findUnique({ where: { id } });
      if (job.shortfallNotified || job.status !== 'OPEN' || job.startDate > indiaDay()) return;
      await tx.labourJob.update({ where: { id }, data: { shortfallNotified: true } });
      await notify(tx, job.farmerId, 'JOB_SHORTFALL',
        job.category + ' starts with ' + job.filledSlots + ' of ' + job.workerCount + ' workers. Review the job in Labour Hiring.');
    });
  }
}

module.exports = { router, notifyShortfalls };

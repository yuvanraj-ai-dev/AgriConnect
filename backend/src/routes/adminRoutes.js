const express = require('express');
const bcrypt = require('bcryptjs');
const { db, serializable } = require('../db');
const { route, check } = require('../http');
const { credentials, emailAddress, newPassword, PUBLIC_ROLES, BUILT_IN_ROLES, userSelect } = require('../access');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
router.use(authenticateToken, requireRole(['ADMIN']));

async function assignedRoles(tx, roles) {
  check(Array.isArray(roles) && roles.length && roles.every((r) => typeof r === 'string'),
    400, 'Select one or more roles.');
  const unique = [...new Set(roles)];
  const custom = unique.filter((role) => !BUILT_IN_ROLES.includes(role));
  if (custom.length) {
    check(await tx.accessRole.count({ where: { name: { in: custom } } }) === custom.length,
      400, 'One or more roles do not exist.');
  }
  return unique;
}

function audit(tx, req, event) {
  return tx.auditLog.create({ data: { userId: req.user.id, event } });
}

router.get('/users', route(async (req, res) => {
  const after = typeof req.query.after === 'string' ? req.query.after : undefined;
  const users = await db.user.findMany({
    where: { deletedAt: null, id: after ? { gt: after } : undefined },
    orderBy: { id: 'asc' }, take: 101, select: userSelect,
  });
  res.json({ users: users.slice(0, 100), next: users.length > 100 ? users[99].id : null });
}));

router.post('/users', route(async (req, res) => {
  const { email, password } = credentials(req.body);
  const passwordHash = await bcrypt.hash(password, 10);
  const user = await serializable(async (tx) => {
    const roles = await assignedRoles(tx, req.body.roles);
    const created = await tx.user.create({ data: { email, passwordHash, roles }, select: userSelect });
    await audit(tx, req, 'USER_CREATED ' + created.id);
    return created;
  });
  res.status(201).json(user);
}));

async function changeUser(req, remove) {
  const { id } = req.params;
  if (!remove && req.body.active !== undefined) {
    check(typeof req.body.active === 'boolean', 400, 'Active must be true or false.');
  }
  const passwordHash = !remove && req.body.password !== undefined
    ? await bcrypt.hash(newPassword(req.body.password), 10)
    : undefined;
  const email = !remove && req.body.email !== undefined ? emailAddress(req.body.email) : undefined;
  return serializable(async (tx) => {
    const user = await tx.user.findFirst({ where: { id, deletedAt: null } });
    check(user, 404, 'User not found.');
    const roles = remove ? [] : req.body.roles === undefined ? user.roles : await assignedRoles(tx, req.body.roles);
    const active = remove ? false : req.body.active ?? user.active;
    if (user.active && user.roles.includes('ADMIN') && (!active || !roles.includes('ADMIN'))) {
      check(await tx.user.count({ where: { id: { not: id }, active: true, deletedAt: null, roles: { has: 'ADMIN' } } }),
        409, 'Keep at least one active administrator.');
    }
    const data = remove
      ? { roles, active, deletedAt: new Date(), email: 'deleted-' + id + '@invalid.local', passwordHash: '' }
      : { roles, active, passwordHash, email };
    const updated = await tx.user.update({ where: { id }, data, select: userSelect });
    if (!active || passwordHash) await tx.session.deleteMany({ where: { userId: id } });
    await audit(tx, req, (remove ? 'USER_DELETED ' : 'USER_UPDATED ') + id);
    return updated;
  });
}

router.patch('/users/:id', route(async (req, res) => res.json(await changeUser(req, false))));
router.delete('/users/:id', route(async (req, res) => {
  await changeUser(req, true);
  res.sendStatus(204);
}));

router.get('/roles', route(async (req, res) => {
  res.json({ builtIn: BUILT_IN_ROLES, assignablePermissions: PUBLIC_ROLES, custom: await db.accessRole.findMany({ orderBy: { name: 'asc' } }) });
}));

function permissions(input) {
  check(Array.isArray(input) && input.every((role) => PUBLIC_ROLES.includes(role)), 400, 'Select valid module permissions.');
  return [...new Set(input)];
}

router.post('/roles', route(async (req, res) => {
  const { name } = req.body;
  check(typeof name === 'string' && /^[A-Z][A-Z0-9_]{1,29}$/.test(name) && !BUILT_IN_ROLES.includes(name),
    400, 'Use a unique uppercase role name of 2–30 letters, digits or underscores.');
  const [role] = await db.$transaction([
    db.accessRole.create({ data: { name, permissions: permissions(req.body.permissions) } }),
    audit(db, req, 'ROLE_CREATED ' + name),
  ]);
  res.status(201).json(role);
}));

router.put('/roles/:name', route(async (req, res) => {
  const { name } = req.params;
  const [role] = await db.$transaction([
    db.accessRole.update({ where: { name }, data: { permissions: permissions(req.body.permissions) } }),
    audit(db, req, 'ROLE_UPDATED ' + name),
  ]);
  res.json(role);
}));

router.delete('/roles/:name', route(async (req, res) => {
  const { name } = req.params;
  await serializable(async (tx) => {
    await tx.accessRole.delete({ where: { name } });
    await tx.$executeRaw`UPDATE "User" SET "roles" = array_remove("roles", ${name}) WHERE ${name} = ANY("roles")`;
    await audit(tx, req, 'ROLE_DELETED ' + name);
  });
  res.sendStatus(204);
}));

router.get('/centers', route(async (req, res) => {
  res.json(await db.soilTestCenter.findMany({ orderBy: { name: 'asc' }, include: { agent: { select: { email: true } } } }));
}));

router.patch('/centers/:id', route(async (req, res) => {
  const { accredited } = req.body;
  check(typeof accredited === 'boolean', 400, 'Accreditation must be true or false.');
  const [center] = await db.$transaction([
    db.soilTestCenter.update({ where: { id: req.params.id }, data: { accredited } }),
    audit(db, req, 'CENTER_ACCREDITATION ' + req.params.id + ' ' + accredited),
  ]);
  res.json(center);
}));

module.exports = router;

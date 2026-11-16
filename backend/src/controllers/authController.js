const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db, serializable } = require('../db');
const { check } = require('../http');
const { PUBLIC_ROLES, credentials, effectiveRoles } = require('../access');

async function register(req, res) {
  const { email, password } = credentials(req.body);
  const { roles } = req.body;
  check(Array.isArray(roles) && roles.length && roles.every((role) => PUBLIC_ROLES.includes(role)),
    400, 'Select one or more available roles.');
  const user = await db.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 10), roles: [...new Set(roles)] },
  });
  res.status(201).json({ message: 'User registered successfully', userId: user.id });
}

async function login(req, res) {
  const { email, password } = req.body;
  check(typeof email === 'string' && typeof password === 'string',
    400, 'Enter your email and password.');
  const user = await db.user.findUnique({ where: { email: email.trim() } });
  check(user?.active && !user.deletedAt && await bcrypt.compare(password, user.passwordHash),
    401, 'Invalid credentials or inactive account.');
  const session = await serializable(async (tx) => {
    const unchanged = await tx.user.findFirst({ where: { id: user.id, active: true, deletedAt: null, passwordHash: user.passwordHash }, select: { id: true } });
    check(unchanged, 401, 'Invalid credentials or inactive account.');
    return tx.session.create({ data: { userId: user.id } });
  });
  const token = jwt.sign({ sid: session.id }, process.env.JWT_SECRET, { subject: user.id, algorithm: 'HS256' });
  res.json({
    token,
    user: { id: user.id, email: user.email, roles: await effectiveRoles(user.roles) },
  });
}

function getMe(req, res) {
  res.json(req.user);
}

async function logout(req, res) {
  await db.session.deleteMany({ where: { id: req.sessionId } });
  res.sendStatus(204);
}

module.exports = { register, login, getMe, logout };

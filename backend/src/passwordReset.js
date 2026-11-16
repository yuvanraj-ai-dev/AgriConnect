const { createHash, randomBytes } = require('node:crypto');
const bcrypt = require('bcryptjs');
const { db, serializable } = require('./db');
const { check } = require('./http');
const { emailAddress, newPassword } = require('./access');
const mailer = require('./mailer');

const LINK_LIFETIME = 30 * 60 * 1000;
const ACCOUNT_COOLDOWN = 2 * 60 * 1000;
const INVALID_LINK = 'This reset link is invalid or expired. Request a new one.';
const digest = (token) => createHash('sha256').update(token).digest('hex');

function resetOrigin() {
  try {
    const url = new URL(process.env.PASSWORD_RESET_ORIGIN);
    const localDevelopment = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname);
    if ((url.protocol === 'https:' || (localDevelopment && url.protocol === 'http:')) &&
      !url.username && !url.password && !url.search && !url.hash && url.pathname === '/') return url.origin;
  } catch {}
  return null;
}

function canReset(user) {
  if (!user?.active || user.deletedAt) return false;
  const mode = mailer.emailMode();
  // Anyone with sandbox access can read the message. Limit it to a dedicated demo account.
  if (mode === 'sandbox') return user.email === process.env.PASSWORD_RESET_SANDBOX_EMAIL &&
    user.email.endsWith('@example.com') && user.roles.length === 1 && user.roles[0] === 'BUYER';
  return mode === 'live';
}

async function sendReset(email) {
  const origin = resetOrigin();
  if (!origin || mailer.emailMode() === 'off') return;
  const token = randomBytes(32).toString('base64url');
  const issued = await serializable(async (tx) => {
    const user = await tx.user.findUnique({ where: { email }, include: { passwordReset: true } });
    if (!canReset(user)) return false;
    const now = new Date();
    if (user.passwordReset && now - user.passwordReset.issuedAt < ACCOUNT_COOLDOWN) return false;
    const data = { tokenHash: digest(token), issuedAt: now, expiresAt: new Date(now.getTime() + LINK_LIFETIME) };
    await tx.passwordReset.upsert({ where: { userId: user.id }, create: { ...data, userId: user.id }, update: data });
    return true;
  });
  if (!issued) return;
  const link = new URL('/reset-password', origin);
  link.hash = new URLSearchParams({ token }).toString();
  await mailer.sendMail({
    to: email, subject: 'Reset your AgriConnect password',
    text: 'Open this link to reset your AgriConnect password. It expires in 30 minutes.\n\n' + link.href +
      '\n\nIf you did not request a reset, you can ignore this email.',
  });
}

function requestReset(req, res) {
  const email = emailAddress(req.body?.email);
  res.status(202).json({ message: 'If this address can receive a reset link, we’ll send one.' });
  void sendReset(email).catch((error) => console.warn('Password reset email failed', mailer.emailError(error)));
}

async function resetPassword(req, res) {
  const { token, password } = req.body || {};
  check(typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token), 400, INVALID_LINK);
  const tokenHash = digest(token);
  const lookup = await db.passwordReset.findUnique({ where: { tokenHash }, include: { user: true } });
  check(lookup && canReset(lookup.user) && lookup.expiresAt > new Date(), 400, INVALID_LINK);
  const passwordHash = await bcrypt.hash(newPassword(password), 10);
  await serializable(async (tx) => {
    const valid = await tx.passwordReset.findUnique({ where: { tokenHash }, include: { user: true } });
    check(valid && canReset(valid.user) && valid.expiresAt > new Date(), 400, INVALID_LINK);
    const claimed = await tx.passwordReset.deleteMany({ where: { userId: valid.userId, tokenHash, expiresAt: { gt: new Date() } } });
    check(claimed.count === 1, 400, INVALID_LINK);
    await tx.user.update({ where: { id: valid.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: valid.userId } });
  });
  res.sendStatus(204);
}

function resetRateLimit(max) {
  const attempts = new Map();
  const windowMs = 15 * 60 * 1000;
  return (req, res, next) => {
    const now = Date.now();
    if (attempts.size >= 2048) {
      for (const [key, entry] of attempts) if (entry.until <= now) attempts.delete(key);
      if (attempts.size >= 2048 && !attempts.has(req.ip)) return res.status(429).json({ message: 'Try again later.' });
    }
    const entry = attempts.get(req.ip);
    const bucket = entry && entry.until > now ? entry : { count: 0, until: now + windowMs };
    attempts.set(req.ip, bucket);
    if (++bucket.count > max) return res.status(429).json({ message: 'Too many requests. Try again later.' });
    next();
  };
}

module.exports = { requestReset, resetPassword, resetRateLimit };

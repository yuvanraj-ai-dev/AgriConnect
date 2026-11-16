const jwt = require('jsonwebtoken');
const { db } = require('../db');
const { SESSION_LENGTH, effectiveRoles, userSelect } = require('../access');
const { route, check } = require('../http');

const authenticateToken = route(async (req, res, next) => {
  const token = /^Bearer (.+)$/i.exec(req.get('Authorization') || '')?.[1];
  check(token, 401, 'Sign in to continue.');
  let claims;
  try {
    claims = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Session Expired' });
  }

  const expired = () => res.status(401).json({ code: 'SESSION_EXPIRED', message: 'Session Expired' });
  if (typeof claims.sid !== 'string' || typeof claims.sub !== 'string') return expired();

  const now = new Date();
  const session = await db.session.updateMany({
    where: {
      id: claims.sid, userId: claims.sub,
      lastActiveAt: { gt: new Date(now.getTime() - SESSION_LENGTH) },
      user: { active: true, deletedAt: null },
    },
    data: { lastActiveAt: now },
  });
  if (!session.count) return expired();
  const user = await db.user.findUnique({ where: { id: claims.sub }, select: userSelect });
  if (!user?.active) return expired();

  req.user = { ...user, assignedRoles: user.roles, roles: await effectiveRoles(user.roles) };
  req.sessionId = claims.sid;
  next();
});

const requireRole = (roles) => route(async (req, res, next) => {
  check(req.user, 401, 'Sign in to continue.');
  if (!roles.some((role) => req.user.roles.includes(role))) {
    console.warn('[RBAC]', req.user.id, 'denied', req.method, req.path);
    await db.auditLog.create({ data: { userId: req.user.id, event: 'ACCESS_DENIED ' + req.method + ' ' + req.path.slice(0, 200) } })
      .catch((error) => console.error('Audit write failed', error.code));
    return res.status(403).json({ message: 'Forbidden: Insufficient permissions' });
  }
  next();
});

module.exports = { authenticateToken, requireRole };

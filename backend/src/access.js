const { db } = require('./db');
const { check } = require('./http');

const PUBLIC_ROLES = ['FARMER', 'LABOURER', 'VENDOR', 'TEST_CENTER', 'BUYER'];
const BUILT_IN_ROLES = [...PUBLIC_ROLES, 'ADMIN'];
const SESSION_LENGTH = 60 * 60 * 1000;
const userSelect = { id: true, email: true, roles: true, active: true };

async function effectiveRoles(roles) {
  const builtIns = roles.filter((role) => BUILT_IN_ROLES.includes(role));
  const custom = roles.filter((role) => !BUILT_IN_ROLES.includes(role));
  if (!custom.length) return builtIns;
  const definitions = await db.accessRole.findMany({ where: { name: { in: custom } } });
  return [...new Set([...builtIns, ...definitions.flatMap((role) => role.permissions)])];
}

function emailAddress(value) {
  const email = typeof value === 'string' ? value.trim() : '';
  check(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254, 400, 'Enter a valid email address.');
  return email;
}

function newPassword(value) {
  check(typeof value === 'string' && value.length >= 8 && Buffer.byteLength(value) <= 72,
    400, 'Use a password of at least 8 characters and at most 72 bytes.');
  return value;
}

function credentials(body) {
  return { email: emailAddress(body.email), password: newPassword(body.password) };
}

module.exports = { PUBLIC_ROLES, BUILT_IN_ROLES, SESSION_LENGTH, userSelect, effectiveRoles, credentials, emailAddress, newPassword };

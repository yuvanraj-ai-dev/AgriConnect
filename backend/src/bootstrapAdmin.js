require('dotenv').config();
const { db } = require('./db');

async function main() {
  const email = process.argv[2];
  if (!email) throw new Error('Usage: npm run admin:grant -- existing-user@example.com');
  const user = await db.user.findUnique({ where: { email } });
  if (!user?.active || user.deletedAt) throw new Error('Register an active account first.');
  await db.user.update({ where: { id: user.id }, data: { roles: [...new Set([...user.roles, 'ADMIN'])] } });
  console.log('Granted ADMIN to ' + email);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; })
  .finally(() => db.$disconnect());

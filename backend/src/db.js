const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();

async function serializable(work) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: 'Serializable' });
    } catch (error) {
      if (error.code !== 'P2034' || attempt >= 4) throw error;
    }
  }
}

module.exports = { db, serializable };

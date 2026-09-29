const express = require('express');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const router = express.Router();

// One-time nuclear reset — clears ALL data from every table.
// Protected by a secret token passed as a query param.
// Usage: POST /api/admin/reset-db?secret=RESET_SECRET
router.post('/reset-db', async (req, res) => {
  const { secret } = req.query;

  if (!secret || secret !== process.env.RESET_SECRET) {
    return res.status(403).json({ error: 'Forbidden — invalid or missing secret.' });
  }

  try {
    // Delete in dependency order (children before parents)
    await prisma.notification.deleteMany({});
    await prisma.soilTestRequest.deleteMany({});
    await prisma.soilTestCenter.deleteMany({});
    await prisma.auditLog.deleteMany({});
    await prisma.user.deleteMany({});

    return res.status(200).json({ message: 'All database records cleared successfully.' });
  } catch (error) {
    console.error('Reset error:', error);
    return res.status(500).json({ error: 'Reset failed', detail: error.message });
  }
});

module.exports = router;

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { PrismaClient } = require('@prisma/client');
const authRoutes = require('./routes/authRoutes');
const soilTestRoutes = require('./routes/soilTestRoutes');
const adminRoutes = require('./routes/adminRoutes');
const vendorRoutes = require('./routes/vendorRoutes');

dotenv.config();

const prisma = new PrismaClient();

// Auto-ensure Product and Machinery tables exist in PostgreSQL on deployment
const ensureTables = async () => {
  try {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Product" (
        "id" TEXT PRIMARY KEY,
        "vendorId" TEXT NOT NULL,
        "title" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "brand" TEXT,
        "description" TEXT,
        "price" DOUBLE PRECISION NOT NULL,
        "unit" TEXT NOT NULL,
        "stockQuantity" INTEGER NOT NULL DEFAULT 0,
        "safetyWarning" TEXT,
        "imageUrl" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "Machinery" (
        "id" TEXT PRIMARY KEY,
        "ownerId" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "dailyRate" DOUBLE PRECISION NOT NULL,
        "securityDeposit" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "location" TEXT NOT NULL,
        "operationalStatus" TEXT NOT NULL DEFAULT 'AVAILABLE',
        "instantApproval" BOOLEAN NOT NULL DEFAULT false,
        "specifications" TEXT,
        "imageUrl" TEXT,
        "active" BOOLEAN NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('[DB] Verified Product and Machinery tables in database.');
  } catch (err) {
    console.warn('[DB] Table verification note:', err.message);
  }
};

ensureTables();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/soil-test', soilTestRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/vendor', vendorRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK' });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

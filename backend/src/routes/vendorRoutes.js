const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// Base authentication applied to all vendor routes
router.use(authenticateToken);

// Stats
router.get('/stats', requireRole(['VENDOR', 'ADMIN']), vendorController.getVendorStats);

// Products (Fertilizers & Inputs)
router.get('/products', vendorController.getProducts);
router.post('/products', requireRole(['VENDOR', 'ADMIN']), vendorController.createProduct);
router.put('/products/:id', requireRole(['VENDOR', 'ADMIN']), vendorController.updateProduct);
router.delete('/products/:id', requireRole(['VENDOR', 'ADMIN']), vendorController.deleteProduct);

// Machinery & Equipment (Rental)
router.get('/machinery', vendorController.getMachinery);
router.post('/machinery', requireRole(['VENDOR', 'ADMIN']), vendorController.createMachinery);
router.put('/machinery/:id', requireRole(['VENDOR', 'ADMIN']), vendorController.updateMachinery);
router.delete('/machinery/:id', requireRole(['VENDOR', 'ADMIN']), vendorController.deleteMachinery);

module.exports = router;

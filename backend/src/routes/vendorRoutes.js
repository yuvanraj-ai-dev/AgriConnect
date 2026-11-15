const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');

// Base authentication applied to all vendor routes
router.use(authenticateToken);

// Stats
router.get('/stats', vendorController.getVendorStats);

// Products (Fertilizers & Inputs)
router.get('/products', vendorController.getProducts);
router.post('/products', vendorController.createProduct);
router.put('/products/:id', vendorController.updateProduct);
router.delete('/products/:id', vendorController.deleteProduct);

// Machinery & Equipment (Rental)
router.get('/machinery', vendorController.getMachinery);
router.post('/machinery', vendorController.createMachinery);
router.put('/machinery/:id', vendorController.updateMachinery);
router.delete('/machinery/:id', vendorController.deleteMachinery);

module.exports = router;

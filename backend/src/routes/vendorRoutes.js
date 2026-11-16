const express = require('express');
const router = express.Router();
const vendorController = require('../controllers/vendorController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');
const { route } = require('../http');

// Base authentication applied to all vendor routes
router.use(authenticateToken, requireRole(['VENDOR', 'ADMIN']));

// Stats
router.get('/stats', route(vendorController.getVendorStats));

// Products (Fertilizers & Inputs)
router.get('/products', route(vendorController.getProducts));
router.post('/products', route(vendorController.createProduct));
router.put('/products/:id', route(vendorController.updateProduct));
router.delete('/products/:id', route(vendorController.deleteProduct));

// Machinery & Equipment (Rental)
router.get('/machinery', route(vendorController.getMachinery));
router.post('/machinery', route(vendorController.createMachinery));
router.put('/machinery/:id', route(vendorController.updateMachinery));
router.delete('/machinery/:id', route(vendorController.deleteMachinery));

module.exports = router;

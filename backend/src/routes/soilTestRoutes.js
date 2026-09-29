const express = require('express');
const router = express.Router();
const soilTestController = require('../controllers/soilTestController');

// TODO: Add auth middlewares (e.g. verifyToken, authorizeRoles) 

// Centers
router.post('/centers', soilTestController.createCenter);
router.get('/centers', soilTestController.getCenters);

// Requests
router.post('/requests', soilTestController.bookSoilTest);
router.get('/requests', soilTestController.getRequests);
router.patch('/requests/:id/status', soilTestController.updateRequestStatus);

module.exports = router;

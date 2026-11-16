const express = require('express');
const multer = require('multer');
const soil = require('../controllers/soilTestController');
const { authenticateToken, requireRole } = require('../middleware/authMiddleware');
const { check, route } = require('../http');

const router = express.Router();
const farmer = requireRole(['FARMER']);
const agent = requireRole(['TEST_CENTER']);
const pdf = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 0 } });

router.use(authenticateToken);
router.get('/centers', farmer, route(soil.getCenters));
router.get('/centers/mine', agent, route(soil.myCenter));
router.post('/centers', agent, route(soil.createCenter));
router.post('/requests', farmer, route(soil.bookSoilTest));
router.get('/requests', requireRole(['FARMER', 'TEST_CENTER']), route(soil.getRequests));
router.post('/requests/:id/cancel', farmer, route(soil.cancel));
router.patch('/requests/:id/status', agent, route((req, res) => {
  check(['IN_PROGRESS', 'IN_ANALYSIS'].includes(req.body.status), 400, 'Use report upload to complete a booking.');
  return soil.start(req, res);
}));
router.put('/requests/:id/report', agent, pdf.single('report'), route(soil.upload));
router.get('/requests/:id/report', requireRole(['FARMER', 'TEST_CENTER']), route(soil.download));

module.exports = router;

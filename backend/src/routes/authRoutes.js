const express = require('express');
const { register, login, getMe, logout } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { route } = require('../http');
const { requestReset, resetPassword, resetRateLimit } = require('../passwordReset');

const router = express.Router();

router.post('/register', route(register));
router.post('/login', route(login));
router.post('/forgot-password', resetRateLimit(30), route(requestReset));
router.post('/reset-password', resetRateLimit(30), route(resetPassword));
router.get('/me', authenticateToken, getMe);
router.post('/logout', authenticateToken, route(logout));

module.exports = router;

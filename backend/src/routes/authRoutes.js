const express = require('express');
const { register, login, getMe, logout } = require('../controllers/authController');
const { authenticateToken } = require('../middleware/authMiddleware');
const { route } = require('../http');

const router = express.Router();

router.post('/register', route(register));
router.post('/login', route(login));
router.get('/me', authenticateToken, getMe);
router.post('/logout', authenticateToken, route(logout));

module.exports = router;

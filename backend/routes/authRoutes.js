const express = require('express');
const router = express.Router();
const { register, login, getMe, refreshAccessToken, logout } = require('../controllers/authController');
const { protect } = require('../middlewares/authMiddleware');

const { patientRegisterRules } = require('../validators/authValidator');
const { validate } = require('../middlewares/validatorMiddleware');
const { registerLimiter, loginLimiter } = require('../middlewares/rateLimiter');

router.post('/register', registerLimiter, patientRegisterRules(), validate, register);
router.post('/login', loginLimiter, login);
router.post('/refresh', refreshAccessToken);
router.post('/logout', logout);
router.get('/me', protect, getMe);

module.exports = router;

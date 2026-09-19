const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth');
const passport = require('../config/passport');

router.post('/register', authController.register);
router.post('/login', authController.login);
router.post('/logout', authController.logout);
router.get('/me', authMiddleware, authController.me);

// Profile / account management
router.patch('/profile', authMiddleware, authController.updateProfile);
router.post('/change-password', authMiddleware, authController.changePassword);
router.get('/usage', authMiddleware, authController.getUsage);
router.delete('/account', authMiddleware, authController.deleteAccount);

// Google OAuth
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: false })
);
router.get('/google/callback',
  passport.authenticate('google', {
    session: false,
    failureRedirect: `${process.env.FRONTEND_URL}/login?error=google_failed`,
  }),
  authController.googleCallback
);

module.exports = router;

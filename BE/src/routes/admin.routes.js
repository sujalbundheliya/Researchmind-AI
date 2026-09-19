const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requireSuperAdmin } = require('../middleware/plan');
const ac = require('../controllers/admin.controller');
const contact = require('../controllers/contact.controller');

// Every admin route requires a valid session AND the super_admin role.
router.use(auth, requireSuperAdmin);

// Users
router.get('/users', ac.listUsers);
router.get('/users/:id', ac.getUser);
router.patch('/users/:id', ac.updateUser);
router.post('/users/:id/reset-usage', ac.resetUsage);
router.delete('/users/:id', ac.deleteUser);

// Documents
router.get('/documents', ac.listDocuments);
router.delete('/documents/:id', ac.deleteDocument);
router.post('/documents/:id/reingest', ac.reingestDocument);

// Contact inbox — submitting is public (see routes/contact.routes.js);
// reading and triaging messages is admin-only.
router.get('/contact-messages', contact.list);
router.patch('/contact-messages/:id', contact.updateStatus);
router.delete('/contact-messages/:id', contact.remove);

// Overview / diagnostics
router.get('/stats', ac.getStats);
router.get('/system', ac.getSystem);
router.get('/audit', ac.getAuditLog);

module.exports = router;

const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { requirePlan } = require('../middleware/plan');
const { checkWorkspaceMember } = require('../middleware/workspace');
const wc = require('../controllers/workspace.controller');

// Workspaces (shared collaboration) shipped in Milestone 4 as a Pro feature.
// Applied to the whole router so create / list / join / invite all require a
// Pro plan (super admins bypass via requirePlan).
router.use(auth, requirePlan('pro'));

router.post('/', wc.createWorkspace);
router.get('/', wc.listWorkspaces);
router.get('/:id', wc.getWorkspace);
router.patch('/:id', checkWorkspaceMember('owner'), wc.updateWorkspace);
router.delete('/:id', checkWorkspaceMember('owner'), wc.deleteWorkspace);
router.post('/:id/invite', checkWorkspaceMember('editor'), wc.inviteMember);
router.post('/join', wc.joinWorkspace);
router.delete('/:id/members/:userId', checkWorkspaceMember('owner'), wc.removeMember);
router.patch('/:id/members/:userId', checkWorkspaceMember('owner'), wc.updateMemberRole);

module.exports = router;

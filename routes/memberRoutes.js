const express = require('express');
const router = express.Router();
const {
  getMembers,
  getMemberById,
  updateMemberStatus,
} = require('../controllers/memberController');

// GET /api/members - Get all real approved members from MongoDB
router.get('/', getMembers);

// GET /api/members/:id - Get single member details
router.get('/:id', getMemberById);

// PATCH /api/members/:id/status - Update member active/inactive status
router.patch('/:id/status', updateMemberStatus);

module.exports = router;

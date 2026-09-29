const { protect, authorize } = require('./authMiddleware');

const adminOnly = [protect, authorize('admin')];

module.exports = {
  adminOnly,
};

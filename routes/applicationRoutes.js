const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const {
  createApplication,
  getApplications,
  updateApplicationStatus,
  updateApplication,
  getApplicationDocuments,
  uploadDocuments,
  resendMemberCredentials,
} = require('../controllers/applicationController');

// GET /api/applications/documents - Get all real document records from MongoDB
router.get('/documents', getApplicationDocuments);

// POST /api/applications/upload-documents - Upload application documents
router.post(
  '/upload-documents',
  upload.fields([
    { name: 'idProof', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'paymentReceipt', maxCount: 1 },
    { name: 'receiptFile', maxCount: 1 },
    { name: 'doc1_photo', maxCount: 1 },
    { name: 'doc2_govId', maxCount: 1 },
    { name: 'doc3_eduCert', maxCount: 1 },
    { name: 'doc4_birthCert', maxCount: 1 },
    { name: 'doc5_utility', maxCount: 1 },
  ]),
  uploadDocuments
);

// GET /api/applications - Get all membership applications
router.get('/', getApplications);

// POST /api/applications - Submit new membership application
router.post(
  '/',
  upload.fields([
    { name: 'idProof', maxCount: 1 },
    { name: 'addressProof', maxCount: 1 },
    { name: 'photo', maxCount: 1 },
    { name: 'signature', maxCount: 1 },
    { name: 'paymentReceipt', maxCount: 1 },
    { name: 'receiptFile', maxCount: 1 },
    { name: 'doc1_photo', maxCount: 1 },
    { name: 'doc2_govId', maxCount: 1 },
    { name: 'doc3_eduCert', maxCount: 1 },
    { name: 'doc4_birthCert', maxCount: 1 },
    { name: 'doc5_utility', maxCount: 1 },
    { name: 'panCard', maxCount: 1 },
    { name: 'incomeCert', maxCount: 1 },
  ]),
  createApplication
);

// PUT & PATCH /api/applications/:id - Update/Edit application details
router.put('/:id', updateApplication);
router.patch('/:id', updateApplication);

// PATCH /api/applications/:id/status - Update application status (Admin approval)
router.patch('/:id/status', updateApplicationStatus);

// POST /api/applications/:id/resend-credentials - Resend member credentials email
router.post('/:id/resend-credentials', resendMemberCredentials);

module.exports = router;


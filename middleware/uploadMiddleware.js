const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directory exists
const uploadDir = path.join(__dirname, '../uploads/documents');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Disk storage engine for persistent file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname || '').toLowerCase() || '.png';
    const cleanFieldName = (file.fieldname || 'doc').replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${cleanFieldName}-${uniqueSuffix}${ext}`);
  },
});

// File filter (accept images up to 5MB and PDFs up to 10MB)
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|gif|pdf|svg|webp/i;
  const extName = allowedExtensions.test(path.extname(file.originalname || '').toLowerCase());
  const mimeType =
    allowedExtensions.test(file.mimetype) ||
    file.mimetype === 'application/pdf' ||
    file.mimetype.startsWith('image/');

  if (extName && mimeType) {
    return cb(null, true);
  }
  cb(new Error('Only document files (PDF, JPG, JPEG, PNG, WEBP) are allowed.'));
};

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB limit per file (handles images and large PDFs)
    files: 25, // Up to 25 files per submission
  },
  fileFilter,
});

module.exports = upload;



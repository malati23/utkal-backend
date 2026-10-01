const multer = require('multer');

// File filter (accept images and PDFs)
const fileFilter = (req, file, cb) => {
  const allowedExtensions = /jpeg|jpg|png|gif|pdf|svg|webp/i;
  const extName = allowedExtensions.test(file.originalname.toLowerCase());
  const mimeType = allowedExtensions.test(file.mimetype) || file.mimetype === 'application/pdf';

  if (extName && mimeType) {
    return cb(null, true);
  }
  cb(new Error('Only document files (PDF, JPG, JPEG, PNG, WEBP) are allowed'));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit
  fileFilter,
});

module.exports = upload;


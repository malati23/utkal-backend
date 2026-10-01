const express = require('express');
const cors = require('cors');
const path = require('path');
const mongoose = require('mongoose');
const env = require('./config/env');
const connectDB = require('./config/db');

const app = express();

// CORS Configuration
app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const cleanOrigin = origin.replace(/\/+$/, '');
      if (env.ALLOWED_ORIGINS.includes(cleanOrigin) || !env.IS_PROD) {
        return callback(null, true);
      }
      return callback(new Error(`CORS policy violation: origin ${origin} is not allowed`));
    },
    credentials: true,
  })
);

// Request Body Parsing Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Ensure uploads directory exists on server launch
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads/documents');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve Uploaded Files Statically with cross-origin headers
app.use(
  '/uploads',
  cors(),
  express.static(path.join(__dirname, 'uploads'), {
    setHeaders: (res) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  })
);

// Test Route: GET /
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'New Utkal Finance API is running',
  });
});

const applicationRoutes = require('./routes/applicationRoutes');
const memberRoutes = require('./routes/memberRoutes');
const authRoutes = require('./routes/authRoutes');

// Health Check Route: GET /api/health
app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.status(200).json({
    success: true,
    message: 'New Utkal Finance backend is healthy',
    database: dbStatus,
  });
});

// API Routes
app.use('/api/applications', applicationRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/auth', authRoutes);


// Centralized Error Handling Middleware
app.use((err, req, res, next) => {
  console.error('API Error:', err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Something went wrong',
  });
});

const PORT = env.PORT;

// Start Express server only after MongoDB connection succeeds
const startServer = async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`Server running in ${env.NODE_ENV} mode on port ${PORT}`);
  });
};

startServer();



/**
 * Centralized Backend Environment Configuration
 * 
 * Consolidates all process.env variables, performs validation,
 * sanitization, type-casting, and establishes clean fallback defaults.
 */

const dotenv = require('dotenv');
const path = require('path');

// Load .env file from backend root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const IS_DEV = NODE_ENV === 'development';

const PORT = parseInt(process.env.PORT, 10) || 5000;

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/new-utkal-finance';

const JWT_SECRET = process.env.JWT_SECRET || 'utkal_finance_super_secret_jwt_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

if (IS_PROD && JWT_SECRET.includes('replace_with_a_secure_random_secret')) {
  console.warn('⚠️ WARNING: Using default JWT_SECRET in production environment! Please set a strong JWT_SECRET in .env.');
}

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/+$/, '');

// Parse Allowed Origins for CORS
const defaultOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'https://utkalfinance.netlify.app',
];

const customOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((origin) => origin.trim().replace(/\/+$/, ''))
  : [];

const ALLOWED_ORIGINS = Array.from(new Set([...defaultOrigins, FRONTEND_URL, ...customOrigins].filter(Boolean)));

// Email / SMTP Configuration
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT, 10) || 465;
const EMAIL_SECURE = process.env.EMAIL_SECURE !== undefined
  ? process.env.EMAIL_SECURE === 'true' || process.env.EMAIL_SECURE === '1'
  : EMAIL_PORT === 465;

const EMAIL_USER = (process.env.EMAIL_USER || '').trim();
// Strip extra whitespace from email passwords (often introduced when copying Gmail app passwords)
const EMAIL_PASSWORD = (process.env.EMAIL_PASSWORD || process.env.EMAIL_PASS || '').trim().replace(/\s+/g, '');

const EMAIL_FROM = (process.env.EMAIL_FROM || EMAIL_USER || 'no-reply@utkalfinance.com').trim();

const env = Object.freeze({
  NODE_ENV,
  IS_PROD,
  IS_DEV,
  PORT,
  MONGO_URI,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  FRONTEND_URL,
  ALLOWED_ORIGINS,
  EMAIL: Object.freeze({
    HOST: EMAIL_HOST,
    PORT: EMAIL_PORT,
    SECURE: EMAIL_SECURE,
    USER: EMAIL_USER,
    PASSWORD: EMAIL_PASSWORD,
    FROM: EMAIL_FROM,
    IS_CONFIGURED: Boolean(EMAIL_USER && EMAIL_PASSWORD),
  }),
});

module.exports = env;

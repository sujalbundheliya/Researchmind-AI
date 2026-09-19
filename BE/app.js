require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const passport = require('./src/config/passport');
const authRoutes = require('./src/routes/auth.routes');
const documentRoutes = require('./src/routes/document.routes');
const chatRoutes = require('./src/routes/chat.routes');
const reviewRoutes = require('./src/routes/review.routes');
const workspaceRoutes = require('./src/routes/workspace.routes');
const writingRoutes = require('./src/routes/writing.routes');
const citationRoutes = require('./src/routes/citation.routes');
const zoteroRoutes = require('./src/routes/zotero.routes');
const billingRoutes = require('./src/routes/billing.routes');
const adminRoutes = require('./src/routes/admin.routes');
const contactRoutes = require('./src/routes/contact.routes');
const billingController = require('./src/controllers/billing.controller');

const uploadsDir = path.resolve(process.env.STORAGE_PATH || './uploads');
fs.mkdirSync(uploadsDir, { recursive: true });

const app = express();

// Security headers
app.use(helmet());

// CORS — locked to frontend origin
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3000';
app.use(cors({
  origin: allowedOrigin,
  credentials: true,
}));

app.use(cookieParser());

// Stripe webhook must receive the raw body for signature verification, so it is
// registered BEFORE the JSON body parser (and before the rate limiters below).
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), billingController.webhook);

app.use(express.json({ limit: '2mb' }));
app.use(passport.initialize());
app.use(morgan('[:date[iso]] :method :url :status :res[content-length] - :response-time ms'));

// ── Rate limiters ─────────────────────────────────────────────────

const rateLimitMessage = (msg) => ({
  handler: (req, res) => res.status(429).json({ error: true, message: msg, code: 'RATE_LIMIT' }),
});

// Global: 500 req / 15 min — generous enough for heavy testing/usage
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  // Skip session-check calls from counting against the global limit so
  // polling-heavy pages never accidentally trigger a forced logout.
  skip: (req) => req.path === '/api/auth/me',
  ...rateLimitMessage('Too many requests. Please wait and try again.'),
}));

// Auth: 30 req / 15 min — only on login/register, not on /me or OAuth redirects
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitMessage('Too many login attempts. Please wait and try again.'),
});

// Upload: 10 req / min
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitMessage('Too many upload requests. Try again in a minute.'),
});

// Chat: 40 req / min
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitMessage('Too many chat requests. Try again in a minute.'),
});

// Contact: 5 req / hour — the only unauthenticated write endpoint, so it needs
// a tighter cap than the global limiter to be worth anything as spam control.
const contactLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  ...rateLimitMessage('Too many messages sent. Please try again later.'),
});

// ── Routes ────────────────────────────────────────────────────────

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/documents/upload', uploadLimiter);
app.use('/api/documents', documentRoutes);
app.use('/api/chat/sessions', chatLimiter);
app.use('/api/chat', chatRoutes);
app.use('/api', reviewRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/writing', writingRoutes);
app.use('/api/citations', citationRoutes);
app.use('/api/zotero', zoteroRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/contact', contactLimiter, contactRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: true, message: 'Route not found', code: 'NOT_FOUND' });
});

// ── Global error handler ───────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: true, message: 'Invalid JSON in request body', code: 'INVALID_JSON' });
  }
  const status = err.status || 500;
  const isDev = process.env.NODE_ENV !== 'production';
  console.error(`[${new Date().toISOString()}] ${status} ${req.method} ${req.path} —`, err.message);
  res.status(status).json({
    error: true,
    message: err.message || 'Internal server error',
    code: err.code || 'SERVER_ERROR',
    ...(isDev && status === 500 ? { stack: err.stack } : {}),
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] ResearchMind backend running on port ${PORT}`);
});

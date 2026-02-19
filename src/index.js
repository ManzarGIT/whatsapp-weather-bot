require('dotenv').config();
const express = require('express');
const { logger } = require('./utils/logger');
const webhookRouter = require('./routes/webhook');
const { validateEnv } = require('./utils/validateEnv');

// Validate all required environment variables on startup
validateEnv();

const app = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({ status: 'ok', service: 'WhatsApp Weather Bot' }));
app.use('/webhook', webhookRouter);

// 404 handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));

// Global error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  logger.info(`🚀 WhatsApp Weather Bot running on port ${PORT}`);
  logger.info(`📡 Webhook URL: http://localhost:${PORT}/webhook`);
});

module.exports = app;

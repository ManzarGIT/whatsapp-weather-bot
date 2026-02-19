const NodeCache = require('node-cache');
const { logger } = require('../utils/logger');
const { sendErrorMessage } = require('../services/whatsappService');

// Store request counts per user phone number
const requestCounts = new NodeCache({ stdTTL: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000') / 1000 });

const MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || '10', 10);

/**
 * Per-user rate limiter for inbound WhatsApp messages.
 * Checks the sender's phone number in the body — not the HTTP client IP.
 */
function rateLimiter(req, res, next) {
  try {
    const body = req.body;
    const messages = body?.entry?.[0]?.changes?.[0]?.value?.messages;

    // Only rate-limit actual user messages, not status callbacks
    if (!messages || messages.length === 0) return next();

    const from = messages[0]?.from;
    if (!from) return next();

    const current = requestCounts.get(from) || 0;

    if (current >= MAX_REQUESTS) {
      logger.warn(`Rate limit exceeded for user: ${from}`);
      const phoneNumberId = body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id;
      if (phoneNumberId) {
        // Fire-and-forget the rate limit message
        sendErrorMessage(phoneNumberId, from, 'rate_limit').catch(() => {});
      }
      // Still return 200 to Meta — never return error codes to webhook
      return res.status(200).json({ status: 'rate_limited' });
    }

    requestCounts.set(from, current + 1);
    next();
  } catch (err) {
    // Never block the webhook on rate limiter errors
    logger.error('Rate limiter error:', err);
    next();
  }
}

module.exports = { rateLimiter };

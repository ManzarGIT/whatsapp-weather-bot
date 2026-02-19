const express = require('express');
const router = express.Router();
const { logger } = require('../utils/logger');
const { handleIncomingMessage } = require('../services/messageHandler');
const { rateLimiter } = require('../middleware/rateLimiter');

/**
 * GET /webhook
 * Meta Cloud API webhook verification handshake.
 * Meta sends hub.challenge — we must echo it back.
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.VERIFY_TOKEN) {
    logger.info('✅ Webhook verified by Meta');
    return res.status(200).send(challenge);
  }

  logger.warn('❌ Webhook verification failed — token mismatch');
  return res.status(403).json({ error: 'Verification failed' });
});

/**
 * POST /webhook
 * Receives all inbound WhatsApp events (messages, status updates, etc.)
 */
router.post('/', rateLimiter, async (req, res) => {
  // Always respond 200 immediately — Meta retries if it doesn't get 200 fast
  res.status(200).json({ status: 'received' });

  try {
    const body = req.body;

    // Validate it's a WhatsApp event
    if (body.object !== 'whatsapp_business_account') return;

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    // Skip status update events (delivered, read, sent)
    if (value?.statuses) return;

    const messages = value?.messages;
    if (!messages || messages.length === 0) return;

    const message = messages[0];
    const from = message.from; // Sender's WhatsApp number
    const phoneNumberId = value.metadata?.phone_number_id;

    logger.info(`📨 Message from ${from}: type=${message.type}`);

    await handleIncomingMessage(message, from, phoneNumberId);
  } catch (err) {
    logger.error('Error processing webhook payload:', err);
  }
});

module.exports = router;

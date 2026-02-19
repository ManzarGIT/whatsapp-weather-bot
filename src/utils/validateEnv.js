const { logger } = require('./logger');

const REQUIRED_VARS = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_ID',
  'VERIFY_TOKEN',
  'OPENWEATHER_API_KEY',
];

function validateEnv() {
  const missing = REQUIRED_VARS.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    logger.error('❌ Missing required environment variables:');
    missing.forEach((key) => logger.error(`   - ${key}`));
    logger.error('Please copy .env.example to .env and fill in all values.');
    process.exit(1);
  }

  logger.info('✅ All environment variables validated');
}

module.exports = { validateEnv };

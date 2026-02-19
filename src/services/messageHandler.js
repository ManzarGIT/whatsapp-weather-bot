const { logger } = require('../utils/logger');
const { getWeatherByCity, getWeatherByCoords, getForecastByCity, getForecastByCoords } = require('./weatherService');
const { sendTextMessage, sendWeatherReport, sendForecastReport, sendErrorMessage } = require('./whatsappService');
const { sessionStore } = require('../utils/sessionStore');

/**
 * Main message dispatcher.
 * Handles all inbound message types: text, location, interactive (button replies)
 */
async function handleIncomingMessage(message, from, phoneNumberId) {
  const type = message.type;

  try {
    if (type === 'text') {
      await handleTextMessage(message.text.body.trim(), from, phoneNumberId);
    } else if (type === 'location') {
      await handleLocationMessage(message.location, from, phoneNumberId);
    } else if (type === 'interactive') {
      await handleInteractiveMessage(message.interactive, from, phoneNumberId);
    } else {
      await sendTextMessage(
        phoneNumberId,
        from,
        '👋 Hi! I can give you real-time weather updates.\n\nJust send me:\n• A *city name* (e.g. "London")\n• Or *share your location* 📍'
      );
    }
  } catch (err) {
    logger.error(`handleIncomingMessage error for ${from}:`, err);
    await sendErrorMessage(phoneNumberId, from, 'general');
  }
}

/**
 * Handle plain text messages.
 * Could be a city name or a command like "forecast".
 */
async function handleTextMessage(text, from, phoneNumberId) {
  const lower = text.toLowerCase();

  // Empty / too short
  if (!text || text.length < 2) {
    return sendTextMessage(
      phoneNumberId,
      from,
      '🤔 Please send a city name (e.g. *"New York"*) or share your 📍 location.'
    );
  }

  // User replied "yes" to forecast prompt
  if (['yes', 'yes please', 'forecast', '3 day', '3-day', 'y'].includes(lower)) {
    const session = sessionStore.get(from);
    if (session?.lastCity) {
      const forecast = await getForecastByCity(session.lastCity, session.units);
      return sendForecastReport(phoneNumberId, from, forecast);
    }
    if (session?.lastCoords) {
      const forecast = await getForecastByCoords(session.lastCoords.lat, session.lastCoords.lon, session.units);
      return sendForecastReport(phoneNumberId, from, forecast);
    }
    return sendTextMessage(phoneNumberId, from, '📍 Please send a city name first, then I can give you the forecast!');
  }

  // User wants Fahrenheit
  if (lower.includes('fahrenheit') || lower === 'f') {
    sessionStore.set(from, { ...sessionStore.get(from), units: 'imperial' });
    return sendTextMessage(phoneNumberId, from, '✅ Switched to Fahrenheit. Now send me a city name!');
  }

  // User wants Celsius
  if (lower.includes('celsius') || lower === 'c') {
    sessionStore.set(from, { ...sessionStore.get(from), units: 'metric' });
    return sendTextMessage(phoneNumberId, from, '✅ Switched to Celsius. Now send me a city name!');
  }

  // Help
  if (['help', 'hi', 'hello', 'hey', 'start'].includes(lower)) {
    return sendTextMessage(
      phoneNumberId,
      from,
      '🌤 *WhatsApp Weather Bot*\n\n' +
      'Here\'s what I can do:\n\n' +
      '📍 Send a *city name* → Get current weather\n' +
      '📎 *Share your location* → Get weather for your exact spot\n' +
      '📅 Reply *"yes"* → Get a 3-day forecast\n' +
      '🌡 Type *"Celsius"* or *"Fahrenheit"* → Switch units\n\n' +
      'Try it: Type *"Tokyo"* 🗾'
    );
  }

  // Treat input as a city name
  const session = sessionStore.get(from) || {};
  const units = session.units || process.env.DEFAULT_UNITS || 'metric';

  const weather = await getWeatherByCity(text, units);

  if (!weather) {
    return sendTextMessage(
      phoneNumberId,
      from,
      `😕 I couldn't find weather data for *"${text}"*.\n\nPlease check the city name and try again, or share your 📍 location instead.`
    );
  }

  // Save to session for forecast follow-up
  sessionStore.set(from, { ...session, lastCity: text, units });

  await sendWeatherReport(phoneNumberId, from, weather);
}

/**
 * Handle GPS location pins shared from WhatsApp.
 */
async function handleLocationMessage(location, from, phoneNumberId) {
  const { latitude, longitude } = location;
  const session = sessionStore.get(from) || {};
  const units = session.units || process.env.DEFAULT_UNITS || 'metric';

  logger.info(`📍 Location from ${from}: lat=${latitude}, lon=${longitude}`);

  const weather = await getWeatherByCoords(latitude, longitude, units);

  if (!weather) {
    return sendErrorMessage(phoneNumberId, from, 'weather');
  }

  sessionStore.set(from, { ...session, lastCoords: { lat: latitude, lon: longitude }, lastCity: null, units });

  await sendWeatherReport(phoneNumberId, from, weather);
}

/**
 * Handle button reply interactions (e.g., "Get Forecast" button).
 */
async function handleInteractiveMessage(interactive, from, phoneNumberId) {
  const buttonId = interactive?.button_reply?.id || interactive?.list_reply?.id;

  if (buttonId === 'get_forecast') {
    const session = sessionStore.get(from) || {};
    const units = session.units || process.env.DEFAULT_UNITS || 'metric';

    let forecast = null;
    if (session.lastCity) {
      forecast = await getForecastByCity(session.lastCity, units);
    } else if (session.lastCoords) {
      forecast = await getForecastByCoords(session.lastCoords.lat, session.lastCoords.lon, units);
    }

    if (forecast) {
      return sendForecastReport(phoneNumberId, from, forecast);
    }
  }

  await sendTextMessage(phoneNumberId, from, '👋 Send me a city name to get started!');
}

module.exports = { handleIncomingMessage };

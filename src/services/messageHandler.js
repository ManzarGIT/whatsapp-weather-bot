const { logger } = require('../utils/logger');
const {
  getWeatherByCity, getWeatherByCoords,
  getForecastByCity, getForecastByCoords,
} = require('./weatherService');
const {
  sendTextMessage, sendWeatherReport,
  sendForecastReport, sendHourlyReport, sendErrorMessage,
} = require('./whatsappService');
const { sessionStore } = require('../utils/sessionStore');

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
      await sendTextMessage(phoneNumberId, from,
        '👋 Hi! Send me any *city or village name* to get weather!\n\n' +
        'Type *help* to see all commands.'
      );
    }
  } catch (err) {
    logger.error(`handleIncomingMessage error for ${from}:`, err);
    await sendErrorMessage(phoneNumberId, from, 'general');
  }
}

async function handleTextMessage(text, from, phoneNumberId) {
  const lower = text.toLowerCase().trim();
  const session = sessionStore.get(from) || {};
  const units = session.units || process.env.DEFAULT_UNITS || 'metric';

  // Empty message
  if (!text || text.length < 2) {
    return sendTextMessage(phoneNumberId, from,
      '🤔 Please send a city or village name!'
    );
  }

  // Help
  if (['help', 'hi', 'hello', 'hey', 'start', 'menu'].includes(lower)) {
    return sendTextMessage(phoneNumberId, from,
      '🌤 *WhatsApp Weather Bot*\n\n' +
      '*Commands:*\n\n' +
      '🏙 Send any *city name* → Current weather\n' +
      '🏘 Send any *village name* → Village weather\n' +
      '📍 *Share location* → Exact GPS weather\n' +
      '📅 Reply *forecast* → 5-day forecast\n' +
      '🕐 Reply *hourly* → Next 6 hours\n' +
      '⭐ Type *save* → Save favorite city\n' +
      '🏠 Type *home* → Get favorite city weather\n' +
      '🌡 Type *fahrenheit* → Switch to °F\n' +
      '🌡 Type *celsius* → Switch to °C\n' +
      '📊 Type *last* → Repeat last weather\n\n' +
      '_Example: Type *"Katihar"* to get started!_'
    );
  }

  // Forecast
  if (['forecast', 'yes', 'yes please', '5 day', '5-day', 'y'].includes(lower)) {
    return await sendForecast(from, phoneNumberId, units);
  }

  // Hourly
  if (['hourly', 'hours', '6 hours', 'hour'].includes(lower)) {
    return await sendHourly(from, phoneNumberId, units);
  }

  // Save favorite city
  if (lower === 'save') {
    if (session.lastCity) {
      sessionStore.set(from, { ...session, favoriteCity: session.lastCity });
      return sendTextMessage(phoneNumberId, from,
        `⭐ *${session.lastCity}* saved as your favorite city!\n\nType *home* anytime to get its weather instantly.`
      );
    }
    return sendTextMessage(phoneNumberId, from,
      '😕 Please search for a city first, then type *save*.'
    );
  }

  // Get favorite city
  if (['home', 'favorite', 'favourite', 'fav'].includes(lower)) {
    if (session.favoriteCity) {
      const weather = await getWeatherByCity(session.favoriteCity, units);
      if (weather) {
        sessionStore.set(from, { ...session, lastCity: session.favoriteCity });
        return sendWeatherReport(phoneNumberId, from, weather);
      }
    }
    return sendTextMessage(phoneNumberId, from,
      '😕 No favorite city saved yet!\n\nSearch for a city first, then type *save*.'
    );
  }

  // Repeat last weather
  if (['last', 'again', 'repeat'].includes(lower)) {
    if (session.lastCity) {
      const weather = await getWeatherByCity(session.lastCity, units);
      if (weather) return sendWeatherReport(phoneNumberId, from, weather);
    }
    if (session.lastCoords) {
      const weather = await getWeatherByCoords(
        session.lastCoords.lat, session.lastCoords.lon, units
      );
      if (weather) return sendWeatherReport(phoneNumberId, from, weather);
    }
    return sendTextMessage(phoneNumberId, from,
      '😕 No recent search found. Please send a city name first!'
    );
  }

  // Switch to Fahrenheit
  if (lower.includes('fahrenheit') || lower === 'f') {
    sessionStore.set(from, { ...session, units: 'imperial' });
    return sendTextMessage(phoneNumberId, from,
      '✅ Switched to *Fahrenheit °F*\n\nSend any city name to get weather!'
    );
  }

  // Switch to Celsius
  if (lower.includes('celsius') || lower === 'c') {
    sessionStore.set(from, { ...session, units: 'metric' });
    return sendTextMessage(phoneNumberId, from,
      '✅ Switched to *Celsius °C*\n\nSend any city name to get weather!'
    );
  }

  // Treat as city or village name
  const weather = await getWeatherByCity(text, units);

  if (!weather) {
    return sendTextMessage(phoneNumberId, from,
      `😕 Could not find *"${text}"*.\n\n` +
      `Please check the spelling or try:\n` +
      `• A nearby bigger city\n` +
      `• Share your 📍 GPS location instead`
    );
  }

  sessionStore.set(from, { ...session, lastCity: text, lastCoords: null, units });
  await sendWeatherReport(phoneNumberId, from, weather);
}

async function handleLocationMessage(location, from, phoneNumberId) {
  const { latitude, longitude } = location;
  const session = sessionStore.get(from) || {};
  const units = session.units || process.env.DEFAULT_UNITS || 'metric';

  logger.info(`📍 Location from ${from}: lat=${latitude}, lon=${longitude}`);

  const weather = await getWeatherByCoords(latitude, longitude, units);

  if (!weather) {
    return sendErrorMessage(phoneNumberId, from, 'weather');
  }

  sessionStore.set(from, {
    ...session,
    lastCoords: { lat: latitude, lon: longitude },
    lastCity: null,
    units
  });

  await sendWeatherReport(phoneNumberId, from, weather);
}

async function handleInteractiveMessage(interactive, from, phoneNumberId) {
  const buttonId = interactive?.button_reply?.id || interactive?.list_reply?.id;
  const session = sessionStore.get(from) || {};
  const units = session.units || process.env.DEFAULT_UNITS || 'metric';

  if (buttonId === 'get_forecast') {
    return await sendForecast(from, phoneNumberId, units);
  }

  if (buttonId === 'get_hourly') {
    return await sendHourly(from, phoneNumberId, units);
  }

  await sendTextMessage(phoneNumberId, from,
    '👋 Send me any city or village name to get started!'
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function sendForecast(from, phoneNumberId, units) {
  const session = sessionStore.get(from) || {};
  let forecast = null;

  if (session.lastCity) {
    forecast = await getForecastByCity(session.lastCity, units);
  } else if (session.lastCoords) {
    forecast = await getForecastByCoords(
      session.lastCoords.lat, session.lastCoords.lon, units
    );
  }

  if (forecast) return sendForecastReport(phoneNumberId, from, forecast);

  return sendTextMessage(phoneNumberId, from,
    '📍 Please send a city or village name first!'
  );
}

async function sendHourly(from, phoneNumberId, units) {
  const session = sessionStore.get(from) || {};
  let forecast = null;

  if (session.lastCity) {
    forecast = await getForecastByCity(session.lastCity, units);
  } else if (session.lastCoords) {
    forecast = await getForecastByCoords(
      session.lastCoords.lat, session.lastCoords.lon, units
    );
  }

  if (forecast) return sendHourlyReport(phoneNumberId, from, forecast);

  return sendTextMessage(phoneNumberId, from,
    '📍 Please send a city or village name first!'
  );
}

module.exports = { handleIncomingMessage };



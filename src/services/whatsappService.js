const axios = require('axios');
const { logger } = require('../utils/logger');

const WA_API_VERSION = 'v20.0';
const WA_BASE = `https://graph.facebook.com/${WA_API_VERSION}`;

async function sendMessage(phoneNumberId, payload) {
  try {
    const { data } = await axios.post(
      `${WA_BASE}/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );
    logger.debug(`Message sent to ${payload.to}: ${data.messages?.[0]?.id}`);
    return data;
  } catch (err) {
    logger.error('WhatsApp API send error:', err.response?.data || err.message);
    throw err;
  }
}

async function sendTextMessage(phoneNumberId, to, text) {
  return sendMessage(phoneNumberId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

async function sendWeatherReport(phoneNumberId, to, weather) {
  const {
    fullLocation, country, temp, feelsLike, heatIndex,
    humidity, windSpeed, windUnit, windDirection,
    condition, emoji, symbol, visibility, pressure,
    dewPoint, cloudCover, sunrise, sunset
  } = weather;

  const rainWarning = weather.raw === 'Rain' || weather.raw === 'Drizzle' || weather.raw === 'Thunderstorm'
    ? '\n\n🌧 *Rain detected! Carry an umbrella!*'
    : '';

  const heatWarning = temp > 38
    ? '\n\n🔥 *Extreme heat! Stay hydrated!*'
    : '';

  const coldWarning = temp < 5
    ? '\n\n🥶 *Very cold! Wear warm clothes!*'
    : '';

  const body =
    `${emoji} *Weather in ${fullLocation}, ${country}*\n\n` +
    `🌡 Temperature: *${temp}${symbol}*\n` +
    `🤔 Feels like: *${feelsLike}${symbol}*\n` +
    `🌡 Heat Index: *${heatIndex}${symbol}*\n` +
    `☁️ Condition: *${condition}*\n` +
    `💧 Humidity: *${humidity}%*\n` +
    `🌫 Dew Point: *${dewPoint}${symbol}*\n` +
    `☁️ Cloud Cover: *${cloudCover}%*\n` +
    `💨 Wind: *${windSpeed} ${windUnit} ${windDirection}*\n` +
    `👁 Visibility: *${visibility}*\n` +
    `📊 Pressure: *${pressure} hPa*\n` +
    `🌅 Sunrise: *${sunrise}* | 🌇 Sunset: *${sunset}*` +
    rainWarning + heatWarning + coldWarning;

  return sendMessage(phoneNumberId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      footer: { text: '📅 Want more details?' },
      action: {
        buttons: [
          { type: 'reply', reply: { id: 'get_forecast', title: '📅 5-Day Forecast' } },
          { type: 'reply', reply: { id: 'get_hourly', title: '🕐 Hourly (6hrs)' } },
        ],
      },
    },
  });
}

async function sendForecastReport(phoneNumberId, to, forecastData) {
  const { city, country, forecasts, symbol, bestTimeOutside } = forecastData;

  let text = `📅 *5-Day Forecast for ${city}, ${country}*\n`;
  text += '─'.repeat(30) + '\n\n';

  for (const day of forecasts) {
    text +=
      `${day.emoji} *${day.label}*\n` +
      `  🌡 High: ${day.high}${symbol} / Low: ${day.low}${symbol}\n` +
      `  ☁️ ${day.condition}\n` +
      `  🌧 Rain Chance: ${day.rainChance}%\n` +
      `  💧 Humidity: ${day.humidity}%\n` +
      `  💨 Wind: ${day.windSpeed} ${day.windUnit}\n\n`;
  }

  text += `🚶 *Best time to go outside today:* ${bestTimeOutside}\n\n`;
  text += '_Data powered by OpenWeatherMap_';

  return sendTextMessage(phoneNumberId, to, text);
}

async function sendHourlyReport(phoneNumberId, to, forecastData) {
  const { city, country, hourly } = forecastData;

  let text = `🕐 *Next 6 Hours in ${city}, ${country}*\n`;
  text += '─'.repeat(30) + '\n\n';

  for (const hour of hourly) {
    text +=
      `${hour.emoji} *${hour.time}*\n` +
      `  🌡 ${hour.temp}${hour.symbol}\n` +
      `  ☁️ ${hour.condition}\n` +
      `  🌧 Rain Chance: ${hour.rainChance}%\n\n`;
  }

  return sendTextMessage(phoneNumberId, to, text);
}

async function sendErrorMessage(phoneNumberId, to, errorType) {
  const messages = {
    city: '😕 Village/City not found. Please check the name and try again.\n\nExamples:\n• *"Mumbai"*\n• *"Katihar"*\n• *"Your village name"*',
    weather: '⚠️ Could not fetch weather right now. Please try again in a moment.',
    general: '⚠️ Something went wrong. Please try again shortly.',
    rate_limit: '🚦 Too many messages! Please wait a minute and try again.',
  };

  return sendTextMessage(phoneNumberId, to, messages[errorType] || messages.general);
}

module.exports = {
  sendTextMessage,
  sendWeatherReport,
  sendForecastReport,
  sendHourlyReport,
  sendErrorMessage,
};
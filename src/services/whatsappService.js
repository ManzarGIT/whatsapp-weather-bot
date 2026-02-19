const axios = require('axios');
const { logger } = require('../utils/logger');

const WA_API_VERSION = 'v20.0';
const WA_BASE = `https://graph.facebook.com/${WA_API_VERSION}`;

/**
 * Core function to send any WhatsApp message payload.
 */
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

/**
 * Send a plain text message.
 */
async function sendTextMessage(phoneNumberId, to, text) {
  return sendMessage(phoneNumberId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: text },
  });
}

/**
 * Send weather report with an interactive "Get 3-Day Forecast" button.
 */
async function sendWeatherReport(phoneNumberId, to, weather) {
  const { city, country, temp, feelsLike, humidity, windSpeed, windUnit, condition, emoji, symbol, visibility, pressure, sunrise, sunset } = weather;

  const body =
    `${emoji} *Weather in ${city}, ${country}*\n\n` +
    `🌡 Temperature: *${temp}${symbol}*\n` +
    `🤔 Feels like: *${feelsLike}${symbol}*\n` +
    `☁️ Condition: *${condition}*\n` +
    `💧 Humidity: *${humidity}%*\n` +
    `💨 Wind: *${windSpeed} ${windUnit}*\n` +
    `👁 Visibility: *${visibility}*\n` +
    `📊 Pressure: *${pressure} hPa*\n` +
    `🌅 Sunrise: *${sunrise}* | 🌇 Sunset: *${sunset}*`;

  // Use interactive buttons to offer forecast
  return sendMessage(phoneNumberId, {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      footer: { text: '📅 Want the 3-day forecast?' },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: 'get_forecast', title: '📅 3-Day Forecast' },
          },
        ],
      },
    },
  });
}

/**
 * Send a 3-day forecast report as text.
 */
async function sendForecastReport(phoneNumberId, to, forecastData) {
  const { city, country, forecasts, symbol } = forecastData;

  let text = `📅 *3-Day Forecast for ${city}, ${country}*\n`;
  text += '─'.repeat(30) + '\n\n';

  for (const day of forecasts) {
    text +=
      `${day.emoji} *${day.label}*\n` +
      `  🌡 High: ${day.high}${symbol} / Low: ${day.low}${symbol}\n` +
      `  ☁️ ${day.condition}\n` +
      `  💧 Humidity: ${day.humidity}%\n` +
      `  💨 Wind: ${day.windSpeed} ${day.windUnit}\n\n`;
  }

  text += '_Data powered by OpenWeatherMap_';

  return sendTextMessage(phoneNumberId, to, text);
}

/**
 * Send a graceful error message based on error type.
 */
async function sendErrorMessage(phoneNumberId, to, errorType) {
  const messages = {
    city: '😕 City not found. Please check the spelling and try again.\n\nExample: *"Paris"*, *"New York"*, *"Mumbai"*',
    weather: '⚠️ I couldn\'t fetch weather data right now. Please try again in a moment.',
    general: '⚠️ Something went wrong on my end. Please try again shortly.',
    rate_limit: '🚦 You\'re sending messages too fast! Please wait a minute and try again.',
  };

  const text = messages[errorType] || messages.general;
  return sendTextMessage(phoneNumberId, to, text);
}

module.exports = {
  sendTextMessage,
  sendWeatherReport,
  sendForecastReport,
  sendErrorMessage,
};

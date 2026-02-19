const axios = require('axios');
const NodeCache = require('node-cache');
const { logger } = require('../utils/logger');

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
const OWM_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '300', 10); // 5 min default

// In-memory cache: avoids hammering OpenWeatherMap for same city/coords
const weatherCache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 60 });

// ─── Condition emoji map ──────────────────────────────────────────────────────
const CONDITION_EMOJIS = {
  Thunderstorm: '⛈',
  Drizzle: '🌦',
  Rain: '🌧',
  Snow: '❄️',
  Mist: '🌫',
  Smoke: '🌫',
  Haze: '🌫',
  Dust: '💨',
  Fog: '🌁',
  Sand: '💨',
  Ash: '🌋',
  Squall: '💨',
  Tornado: '🌪',
  Clear: '☀️',
  Clouds: '☁️',
};

function getEmoji(mainCondition) {
  return CONDITION_EMOJIS[mainCondition] || '🌡';
}

function unitSymbol(units) {
  return units === 'imperial' ? '°F' : units === 'standard' ? 'K' : '°C';
}

function mpsToKmh(mps) {
  return Math.round(mps * 3.6);
}

// ─── Current Weather ──────────────────────────────────────────────────────────

/**
 * Fetch current weather by city name.
 * @returns {WeatherData|null}
 */
async function getWeatherByCity(city, units = 'metric') {
  const cacheKey = `city:${city.toLowerCase()}:${units}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) {
    logger.debug(`Cache hit: ${cacheKey}`);
    return cached;
  }

  try {
    const { data } = await axios.get(`${OWM_BASE}/weather`, {
      params: { q: city, appid: OWM_KEY, units },
      timeout: 8000,
    });
    const result = parseCurrentWeather(data, units);
    weatherCache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (err.response?.status === 404) {
      logger.warn(`City not found: ${city}`);
      return null;
    }
    logger.error(`OpenWeatherMap error (city: ${city}):`, err.message);
    throw err;
  }
}

/**
 * Fetch current weather by GPS coordinates.
 * @returns {WeatherData|null}
 */
async function getWeatherByCoords(lat, lon, units = 'metric') {
  const cacheKey = `coords:${lat.toFixed(2)}:${lon.toFixed(2)}:${units}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${OWM_BASE}/weather`, {
      params: { lat, lon, appid: OWM_KEY, units },
      timeout: 8000,
    });
    const result = parseCurrentWeather(data, units);
    weatherCache.set(cacheKey, result);
    return result;
  } catch (err) {
    logger.error(`OpenWeatherMap error (coords: ${lat},${lon}):`, err.message);
    throw err;
  }
}

function parseCurrentWeather(data, units) {
  const sym = unitSymbol(units);
  const condition = data.weather[0];
  const isMetric = units === 'metric';

  return {
    city: data.name,
    country: data.sys.country,
    temp: Math.round(data.main.temp),
    feelsLike: Math.round(data.main.feels_like),
    humidity: data.main.humidity,
    windSpeed: isMetric ? mpsToKmh(data.wind.speed) : Math.round(data.wind.speed),
    windUnit: isMetric ? 'km/h' : 'mph',
    condition: condition.description.replace(/\b\w/g, (c) => c.toUpperCase()),
    emoji: getEmoji(condition.main),
    symbol: sym,
    visibility: data.visibility ? `${(data.visibility / 1000).toFixed(1)} km` : 'N/A',
    pressure: data.main.pressure,
    sunrise: formatTime(data.sys.sunrise, data.timezone),
    sunset: formatTime(data.sys.sunset, data.timezone),
    uvIndex: null, // Not in free OWM plan — would need One Call API
    raw: condition.main,
  };
}

// ─── 3-Day Forecast ───────────────────────────────────────────────────────────

/**
 * Fetch 3-day daily forecast by city name.
 */
async function getForecastByCity(city, units = 'metric') {
  const cacheKey = `forecast:city:${city.toLowerCase()}:${units}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${OWM_BASE}/forecast`, {
      params: { q: city, appid: OWM_KEY, units, cnt: 24 }, // 24 × 3hr = 3 days
      timeout: 8000,
    });
    const result = parseForecast(data, units);
    weatherCache.set(cacheKey, result);
    return result;
  } catch (err) {
    logger.error(`Forecast error (city: ${city}):`, err.message);
    throw err;
  }
}

/**
 * Fetch 3-day daily forecast by GPS coordinates.
 */
async function getForecastByCoords(lat, lon, units = 'metric') {
  const cacheKey = `forecast:coords:${lat.toFixed(2)}:${lon.toFixed(2)}:${units}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${OWM_BASE}/forecast`, {
      params: { lat, lon, appid: OWM_KEY, units, cnt: 24 },
      timeout: 8000,
    });
    const result = parseForecast(data, units);
    weatherCache.set(cacheKey, result);
    return result;
  } catch (err) {
    logger.error(`Forecast error (coords: ${lat},${lon}):`, err.message);
    throw err;
  }
}

/**
 * Aggregate OWM's 3-hour intervals into daily summaries (3 days).
 */
function parseForecast(data, units) {
  const sym = unitSymbol(units);
  const isMetric = units === 'metric';

  // Group 3hr intervals by calendar day
  const days = {};
  for (const item of data.list) {
    const date = new Date(item.dt * 1000);
    const day = date.toISOString().split('T')[0]; // YYYY-MM-DD
    if (!days[day]) days[day] = [];
    days[day].push(item);
  }

  // Take the next 3 days (skip today if partially populated)
  const dayKeys = Object.keys(days).slice(0, 3);

  const forecasts = dayKeys.map((day) => {
    const intervals = days[day];
    const temps = intervals.map((i) => i.main.temp);
    const conditions = intervals.map((i) => i.weather[0]);
    // Pick the most frequent condition
    const conditionCount = {};
    conditions.forEach((c) => { conditionCount[c.main] = (conditionCount[c.main] || 0) + 1; });
    const dominantCondition = Object.entries(conditionCount).sort((a, b) => b[1] - a[1])[0][0];
    const dominantDesc = conditions.find((c) => c.main === dominantCondition);

    const avgWind = intervals.reduce((s, i) => s + i.wind.speed, 0) / intervals.length;
    const avgHumidity = Math.round(intervals.reduce((s, i) => s + i.main.humidity, 0) / intervals.length);

    return {
      date: day,
      label: formatDayLabel(day),
      high: Math.round(Math.max(...temps)),
      low: Math.round(Math.min(...temps)),
      condition: dominantDesc.description.replace(/\b\w/g, (c) => c.toUpperCase()),
      emoji: getEmoji(dominantCondition),
      windSpeed: isMetric ? mpsToKmh(avgWind) : Math.round(avgWind),
      windUnit: isMetric ? 'km/h' : 'mph',
      humidity: avgHumidity,
      symbol: sym,
    };
  });

  return {
    city: data.city.name,
    country: data.city.country,
    forecasts,
    symbol: sym,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(unixTs, tzOffset) {
  const date = new Date((unixTs + tzOffset) * 1000);
  const h = date.getUTCHours().toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatDayLabel(dateStr) {
  const date = new Date(dateStr + 'T12:00:00Z');
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  if (dateStr === today.toISOString().split('T')[0]) return 'Today';
  if (dateStr === tomorrow.toISOString().split('T')[0]) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

module.exports = {
  getWeatherByCity,
  getWeatherByCoords,
  getForecastByCity,
  getForecastByCoords,
};

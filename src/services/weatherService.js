const axios = require('axios');
const NodeCache = require('node-cache');
const { logger } = require('../utils/logger');

const OWM_BASE = 'https://api.openweathermap.org/data/2.5';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const OWM_KEY = process.env.OPENWEATHER_API_KEY;
const CACHE_TTL = parseInt(process.env.CACHE_TTL || '300', 10);

const weatherCache = new NodeCache({ stdTTL: CACHE_TTL, checkperiod: 60 });

const CONDITION_EMOJIS = {
  Thunderstorm: '⛈', Drizzle: '🌦', Rain: '🌧', Snow: '❄️',
  Mist: '🌫', Smoke: '🌫', Haze: '🌫', Dust: '💨', Fog: '🌁',
  Sand: '💨', Ash: '🌋', Squall: '💨', Tornado: '🌪',
  Clear: '☀️', Clouds: '☁️',
};

const WIND_DIRECTIONS = [
  'N','NNE','NE','ENE','E','ESE','SE','SSE',
  'S','SSW','SW','WSW','W','WNW','NW','NNW'
];

function getEmoji(main) {
  return CONDITION_EMOJIS[main] || '🌡';
}

function unitSymbol(units) {
  return units === 'imperial' ? '°F' : '°C';
}

function mpsToKmh(mps) {
  return Math.round(mps * 3.6);
}

function getWindDirection(degrees) {
  const index = Math.round(degrees / 22.5) % 16;
  return WIND_DIRECTIONS[index];
}

function getUVLevel(uv) {
  if (uv <= 2) return '🟢 Low';
  if (uv <= 5) return '🟡 Moderate';
  if (uv <= 7) return '🟠 High';
  if (uv <= 10) return '🔴 Very High';
  return '🟣 Extreme';
}

function getBestTimeOutside(hourly) {
  if (!hourly || hourly.length === 0) return 'N/A';
  const best = hourly.find(h => {
    const rain = h.pop || 0;
    const temp = h.main.temp;
    return rain < 0.3 && temp > 15 && temp < 35;
  });
  if (!best) return 'Stay indoors today 🏠';
  const time = new Date(best.dt * 1000);
  return time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// ── Village/City Search Using OpenStreetMap ───────────────────────────────────
async function searchLocation(query) {
  const cacheKey = `location:${query.toLowerCase()}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${NOMINATIM_BASE}/search`, {
      params: {
        q: query,
        format: 'json',
        limit: 1,
        addressdetails: 1,
      },
      headers: { 'User-Agent': 'WhatsAppWeatherBot/1.0' },
      timeout: 8000,
    });

    if (!data || data.length === 0) return null;

    const place = data[0];
    const result = {
      lat: parseFloat(place.lat),
      lon: parseFloat(place.lon),
      displayName: place.display_name,
      village: place.address?.village ||
               place.address?.town ||
               place.address?.city ||
               place.address?.county ||
               query,
      country: place.address?.country || '',
      state: place.address?.state || '',
    };

    weatherCache.set(cacheKey, result);
    return result;
  } catch (err) {
    logger.error('Nominatim search error:', err.message);
    return null;
  }
}

// ── Current Weather ───────────────────────────────────────────────────────────
async function getWeatherByCity(city, units = 'metric') {
  // First try OpenStreetMap for better village recognition
  const location = await searchLocation(city);
  if (location) {
    return getWeatherByCoords(location.lat, location.lon, units, location.village, location.country, location.state);
  }

  // Fallback to OWM direct search
  const cacheKey = `city:${city.toLowerCase()}:${units}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${OWM_BASE}/weather`, {
      params: { q: city, appid: OWM_KEY, units },
      timeout: 8000,
    });
    const result = parseCurrentWeather(data, units);
    weatherCache.set(cacheKey, result);
    return result;
  } catch (err) {
    if (err.response?.status === 404) return null;
    logger.error(`OWM error (city: ${city}):`, err.message);
    throw err;
  }
}

async function getWeatherByCoords(lat, lon, units = 'metric', villageName = null, country = null, state = null) {
  const cacheKey = `coords:${lat.toFixed(3)}:${lon.toFixed(3)}:${units}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${OWM_BASE}/weather`, {
      params: { lat, lon, appid: OWM_KEY, units },
      timeout: 8000,
    });
    const result = parseCurrentWeather(data, units, villageName, country, state);
    weatherCache.set(cacheKey, result);
    return result;
  } catch (err) {
    logger.error(`OWM error (coords):`, err.message);
    throw err;
  }
}

function parseCurrentWeather(data, units, villageName = null, countryOverride = null, state = null) {
  const sym = unitSymbol(units);
  const condition = data.weather[0];
  const isMetric = units === 'metric';
  const windSpeed = isMetric ? mpsToKmh(data.wind.speed) : Math.round(data.wind.speed);
  const windDir = getWindDirection(data.wind.deg || 0);

  // Heat index calculation
  const temp = Math.round(data.main.temp);
  const humidity = data.main.humidity;
  const heatIndex = temp > 27
    ? Math.round(-8.78469475556 + 1.61139411 * temp + 2.33854883889 * humidity
        - 0.14611605 * temp * humidity - 0.012308094 * temp * temp
        - 0.0164248277778 * humidity * humidity + 0.002211732 * temp * temp * humidity
        + 0.00072546 * temp * humidity * humidity
        - 0.000003582 * temp * temp * humidity * humidity)
    : temp;

  return {
    city: villageName || data.name,
    fullLocation: state ? `${villageName || data.name}, ${state}` : (villageName || data.name),
    country: countryOverride || data.sys.country,
    temp,
    feelsLike: Math.round(data.main.feels_like),
    heatIndex,
    humidity,
    windSpeed,
    windUnit: isMetric ? 'km/h' : 'mph',
    windDirection: windDir,
    condition: condition.description.replace(/\b\w/g, c => c.toUpperCase()),
    emoji: getEmoji(condition.main),
    symbol: sym,
    visibility: data.visibility ? `${(data.visibility / 1000).toFixed(1)} km` : 'N/A',
    pressure: data.main.pressure,
    dewPoint: Math.round(data.main.temp - ((100 - humidity) / 5)),
    cloudCover: data.clouds?.all || 0,
    sunrise: formatTime(data.sys.sunrise, data.timezone),
    sunset: formatTime(data.sys.sunset, data.timezone),
    raw: condition.main,
    coords: { lat: data.coord.lat, lon: data.coord.lon },
  };
}

// ── Forecast ──────────────────────────────────────────────────────────────────
async function getForecastByCity(city, units = 'metric') {
  const location = await searchLocation(city);
  if (location) {
    return getForecastByCoords(location.lat, location.lon, units, location.village, location.country);
  }

  const cacheKey = `forecast:city:${city.toLowerCase()}:${units}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${OWM_BASE}/forecast`, {
      params: { q: city, appid: OWM_KEY, units, cnt: 40 },
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

async function getForecastByCoords(lat, lon, units = 'metric', villageName = null, country = null) {
  const cacheKey = `forecast:coords:${lat.toFixed(3)}:${lon.toFixed(3)}:${units}`;
  const cached = weatherCache.get(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get(`${OWM_BASE}/forecast`, {
      params: { lat, lon, appid: OWM_KEY, units, cnt: 40 },
      timeout: 8000,
    });
    const result = parseForecast(data, units, villageName, country);
    weatherCache.set(cacheKey, result);
    return result;
  } catch (err) {
    logger.error(`Forecast error (coords):`, err.message);
    throw err;
  }
}

function parseForecast(data, units, villageName = null, countryOverride = null) {
  const sym = unitSymbol(units);
  const isMetric = units === 'metric';

  const days = {};
  for (const item of data.list) {
    const date = new Date(item.dt * 1000).toISOString().split('T')[0];
    if (!days[date]) days[date] = [];
    days[date].push(item);
  }

  const dayKeys = Object.keys(days).slice(0, 5);

  const forecasts = dayKeys.map(day => {
    const intervals = days[day];
    const temps = intervals.map(i => i.main.temp);
    const rainChance = Math.round(Math.max(...intervals.map(i => (i.pop || 0) * 100)));
    const conditions = intervals.map(i => i.weather[0]);
    const conditionCount = {};
    conditions.forEach(c => { conditionCount[c.main] = (conditionCount[c.main] || 0) + 1; });
    const dominantCondition = Object.entries(conditionCount).sort((a, b) => b[1] - a[1])[0][0];
    const dominantDesc = conditions.find(c => c.main === dominantCondition);
    const avgWind = intervals.reduce((s, i) => s + i.wind.speed, 0) / intervals.length;
    const avgHumidity = Math.round(intervals.reduce((s, i) => s + i.main.humidity, 0) / intervals.length);

    return {
      date: day,
      label: formatDayLabel(day),
      high: Math.round(Math.max(...temps)),
      low: Math.round(Math.min(...temps)),
      condition: dominantDesc.description.replace(/\b\w/g, c => c.toUpperCase()),
      emoji: getEmoji(dominantCondition),
      windSpeed: isMetric ? mpsToKmh(avgWind) : Math.round(avgWind),
      windUnit: isMetric ? 'km/h' : 'mph',
      humidity: avgHumidity,
      rainChance,
      symbol: sym,
    };
  });

  // Hourly for next 6 hours
  const hourly = data.list.slice(0, 6).map(item => ({
    time: new Date(item.dt * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    temp: Math.round(item.main.temp),
    condition: item.weather[0].description.replace(/\b\w/g, c => c.toUpperCase()),
    emoji: getEmoji(item.weather[0].main),
    rainChance: Math.round((item.pop || 0) * 100),
    symbol: sym,
  }));

  return {
    city: villageName || data.city.name,
    country: countryOverride || data.city.country,
    forecasts,
    hourly,
    bestTimeOutside: getBestTimeOutside(data.list.slice(0, 8)),
    symbol: sym,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatTime(unixTs, tzOffset) {
  const date = new Date((unixTs + tzOffset) * 1000);
  const h = date.getUTCHours().toString().padStart(2, '0');
  const m = date.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatDayLabel(dateStr) {
  const date = new Date(dateStr + 'T12:00:00Z');
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

module.exports = {
  getWeatherByCity,
  getWeatherByCoords,
  getForecastByCity,
  getForecastByCoords,
  searchLocation,
};
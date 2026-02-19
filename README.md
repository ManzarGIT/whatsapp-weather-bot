# 📱 WhatsApp Weather Bot — Complete Setup Guide

A production-ready WhatsApp chatbot that delivers real-time weather reports to any user, anywhere in the world.

---

## 📁 Project Structure

```
whatsapp-weather-bot/
├── src/
│   ├── index.js                    # App entry point, Express setup
│   ├── routes/
│   │   └── webhook.js              # Webhook GET (verify) + POST (receive messages)
│   ├── services/
│   │   ├── messageHandler.js       # Core message routing logic
│   │   ├── weatherService.js       # OpenWeatherMap API + caching
│   │   └── whatsappService.js      # WhatsApp Cloud API message sender
│   ├── middleware/
│   │   └── rateLimiter.js          # Per-user rate limiting
│   └── utils/
│       ├── logger.js               # Winston structured logging
│       ├── sessionStore.js         # In-memory user session (last city, units)
│       └── validateEnv.js          # Fail-fast env var validation
├── tests/
│   └── test.js                     # Local test simulator (no WhatsApp needed)
├── .env.example                    # Environment variable template
├── .gitignore
├── Dockerfile                      # Container deployment
├── docker-compose.yml
├── render.yaml                     # One-click Render.com deployment
└── package.json
```

---

## 🔑 Step 1: Get Your API Keys

### A) OpenWeatherMap API (Free)
1. Go to [openweathermap.org](https://openweathermap.org/api)
2. Sign up → go to **My API Keys**
3. Copy your key (takes ~10 min to activate)
4. Free plan: 1,000 calls/day, 60 calls/min — plenty for a solo bot

### B) Meta WhatsApp Cloud API
1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a **Business App** → Add **WhatsApp** product
3. From the WhatsApp setup page, grab:
   - **Phone Number ID** → `WHATSAPP_PHONE_ID`
   - **Temporary Access Token** (or generate a **permanent System User token**)
4. For production: Go to **Business Settings → System Users → Generate Token** with `whatsapp_business_messaging` permission — this gives a permanent token.

---

## ⚙️ Step 2: Configure Environment

```bash
cp .env.example .env
```

Edit `.env`:
```env
WHATSAPP_TOKEN=EAAxxxxxxxxxxxxxxx
WHATSAPP_PHONE_ID=123456789012345
VERIFY_TOKEN=my_super_secret_string_123   # you choose this
OPENWEATHER_API_KEY=abc123def456
PORT=3000
DEFAULT_UNITS=metric
CACHE_TTL=300
RATE_LIMIT_MAX=10
RATE_LIMIT_WINDOW_MS=60000
```

---

## 🚀 Step 3: Install & Run Locally

```bash
npm install
npm run dev       # uses nodemon for auto-reload
# or
npm start         # production mode
```

Your server is now at: `http://localhost:3000`

---

## 🌍 Step 4: Expose Locally with ngrok (for webhook testing)

Meta's webhook requires a **public HTTPS URL**. Use ngrok:

```bash
# Install ngrok: https://ngrok.com
ngrok http 3000
```

You'll get something like:
```
Forwarding: https://abc123.ngrok.io → http://localhost:3000
```

Copy that `https://` URL — you need it in Step 5.

---

## 📡 Step 5: Configure WhatsApp Webhook

1. In Meta Developer Portal → Your App → WhatsApp → Configuration
2. Set **Webhook URL**: `https://your-ngrok-url.ngrok.io/webhook`
3. Set **Verify Token**: exactly what you put in `VERIFY_TOKEN`
4. Click **Verify and Save** — Meta will call `GET /webhook` with your token
5. Under **Webhook fields**, subscribe to: `messages`

✅ If verification succeeds, your bot is now receiving live WhatsApp messages.

---

## 🧪 Step 6: Test Locally

```bash
# With server running in another terminal:
node tests/test.js
```

This simulates WhatsApp payloads (text messages, GPS locations, help command, invalid city) without needing a real phone.

To test with a real phone:
1. In Meta Developer Portal → WhatsApp → API Setup → add your number as a test recipient
2. Send a message from that phone to your test WhatsApp number

---

## 🤖 How the Bot Works

```
User sends "London"
    ↓
webhook.js receives POST from Meta
    ↓
rateLimiter.js checks this user's request count
    ↓
messageHandler.js detects it's a text message with a city name
    ↓
weatherService.js calls OpenWeatherMap (or returns cached result)
    ↓
whatsappService.js sends formatted weather report back via Cloud API
    ↓
User sees: 🌤 Weather in London, GB ...
    ↓
User taps "📅 3-Day Forecast" button
    ↓
messageHandler.js fetches forecast using saved session
    ↓
3-day forecast sent back
```

### Supported User Actions

| User sends | Bot does |
|---|---|
| `"London"` | Fetches current weather for London |
| GPS location pin 📍 | Fetches weather for exact coordinates |
| `"yes"` / taps Forecast button | Sends 3-day forecast for last location |
| `"Fahrenheit"` / `"Celsius"` | Switches temperature units |
| `"help"` / `"hi"` | Shows help menu |
| Unknown text | Tries it as a city name |

---

## ☁️ Step 7: Deploy to Production

### Option A: Render.com (Recommended — Easy)

1. Push your code to GitHub (make sure `.env` is in `.gitignore`)
2. Go to [render.com](https://render.com) → New Web Service → Connect repo
3. Build command: `npm install`
4. Start command: `node src/index.js`
5. Add environment variables in Render's dashboard (Environment tab)
6. Click **Deploy**
7. Your URL: `https://your-app.onrender.com`

> ⚠️ Free tier sleeps after 15 min inactivity. Upgrade to Starter ($7/mo) for always-on.

### Option B: Railway.app

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```
Add env vars via Railway dashboard. Auto-deploys on every git push.

### Option C: Docker (Any VPS / AWS / DigitalOcean)

```bash
# On your server:
git clone your-repo
cd whatsapp-weather-bot
cp .env.example .env && nano .env   # fill in values
docker-compose up -d
```

### Option D: AWS EC2 / DigitalOcean Droplet

```bash
# After SSH into your server:
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
git clone your-repo && cd whatsapp-weather-bot
npm install
cp .env.example .env && nano .env

# Install PM2 process manager (keeps app alive)
npm install -g pm2
pm2 start src/index.js --name weather-bot
pm2 save
pm2 startup   # auto-start on reboot
```

Use **nginx** as a reverse proxy + **certbot** for free SSL:
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
# Configure nginx to proxy :80/:443 → localhost:3000
sudo certbot --nginx -d yourdomain.com
```

---

## 🔒 Step 8: Secure Your API Keys

**Never commit `.env` to git.** Here's the full security checklist:

```
✅ .env is in .gitignore
✅ Use platform secret managers (Render / Railway env vars dashboard)
✅ Generate a permanent System User token (not the temp dev token)
✅ Rotate VERIFY_TOKEN periodically
✅ Use HTTPS in production (required by Meta)
✅ Set a rate limit (already built in) to prevent abuse
✅ Monitor your OpenWeatherMap dashboard for unusual call spikes
```

For AWS, use **Secrets Manager** or **Parameter Store** instead of `.env` files.

---

## 📈 Step 9: Scalability Recommendations

### For < 1,000 daily users
- Single Node.js process on Render/Railway is fine
- In-memory cache and sessions work well

### For 1,000–50,000 daily users
- Replace `node-cache` with **Redis** (use `ioredis`) for shared cache across instances
- Replace in-memory sessions with **Redis** too
- Deploy multiple instances behind a load balancer
- Use **OpenWeatherMap's Pro plan** for higher rate limits

### For 50,000+ daily users
- Move to **Kubernetes** or **AWS ECS**
- Add a **message queue** (Redis pub/sub or RabbitMQ) between webhook receiver and message processor — this lets you scale them independently
- Use **AWS ElastiCache** (Redis) for distributed caching
- Consider **One Call API 3.0** from OWM for hourly forecast + UV index

### Redis upgrade (drop-in replacement for node-cache):
```js
// In weatherService.js and sessionStore.js, replace node-cache with:
const { createClient } = require('redis');
const redis = createClient({ url: process.env.REDIS_URL });
await redis.connect();

// Set: await redis.setEx(key, ttlSeconds, JSON.stringify(value));
// Get: const raw = await redis.get(key); const val = JSON.parse(raw);
```

---

## 🌐 Optional Enhancements

### Multi-language support
Detect user's WhatsApp locale from the webhook payload and translate responses using `i18next` or the DeepL API.

### Severe weather alerts
Use OpenWeatherMap's **One Call API** `/onecall` endpoint — it includes `alerts[]` array. Check after each weather fetch and prepend a ⚠️ warning if alerts exist.

### Persistent user preferences
Replace the in-memory `sessionStore` with a **SQLite** (via `better-sqlite3`) or **PostgreSQL** DB to remember preferences across server restarts.

### Analytics
Log each city request to track:
- Most requested cities
- Peak usage times
- Error rates

Use **Grafana + InfluxDB** or just push logs to **Datadog / Logtail**.

---

## 🐛 Troubleshooting

| Problem | Solution |
|---|---|
| Webhook verification fails | Check `VERIFY_TOKEN` matches exactly in `.env` and Meta dashboard |
| "City not found" for valid city | Try the official English name; some cities need country code: `"London,UK"` |
| Messages send but user gets nothing | Check your `WHATSAPP_TOKEN` is valid and not expired |
| OWM returns 401 | API key may not be activated yet (wait 10–15 min after creation) |
| ngrok URL rejected by Meta | Must be `https://` — Meta won't accept `http://` |
| Server crashes on start | Missing env vars — run `node tests/test.js` to see which ones |

---

## 📦 Dependencies Summary

| Package | Purpose |
|---|---|
| `express` | HTTP server + routing |
| `axios` | HTTP client for OWM + WhatsApp APIs |
| `node-cache` | In-memory TTL cache for weather data + rate limiting |
| `dotenv` | Load `.env` into `process.env` |
| `winston` | Structured production logging |
| `nodemon` (dev) | Auto-restart on file changes |

---

*Built with ❤️ using Meta WhatsApp Cloud API + OpenWeatherMap*

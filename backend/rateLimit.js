// backend/rateLimit.js
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// ...your makeStore / limiterHandler exports...

module.exports = {
  rateLimit,
  ipKeyGenerator,
  makeStore,
  limiterHandler,
};


// Shared handler: always include requestId (matches your notesRoutes pattern)
function limiterHandler(req, res, _next, options) {
  const payload =
    typeof options.message === "string"
      ? { error: options.message }
      : options.message || { error: "Too many requests" };

  return res.status(options.statusCode).json({ ...payload, requestId: req.id });
}

// Shared Redis store factory (single Redis connection for whole app)
let makeStore = () => undefined;
let redis = null;

if (process.env.REDIS_URL) {
  const { RedisStore } = require("rate-limit-redis");
  const Redis = require("ioredis");

  redis = new Redis(process.env.REDIS_URL);

  makeStore = (prefix) =>
    new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    });
}

// Graceful shutdown helper (call this from your server entrypoint)
async function closeRateLimitRedis() {
  if (!redis) return;
  try {
    await redis.quit();
  } catch {
    try {
      redis.disconnect();
    } catch {}
  }
}

module.exports = {
  rateLimit,
  makeStore,
  limiterHandler,
  closeRateLimitRedis,
  ipKeyGenerator,
};

// backend/rateLimit.js
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

// Shared handler: always include requestId (matches your notesRoutes pattern)
function limiterHandler(req, res, _next, options) {
  const payload =
    typeof options.message === "string"
      ? { error: options.message }
      : options.message || { error: "Too many requests" };

  return res.status(options.statusCode).json({ ...payload, requestId: req.id });
}

// Redis store factory (optional)
let redis = null;
let makeStoreImpl = () => undefined;

if (process.env.REDIS_URL) {
  const { RedisStore } = require("rate-limit-redis");
  const Redis = require("ioredis");

  redis = new Redis(process.env.REDIS_URL);

  makeStoreImpl = (prefix) =>
    new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    });
}

function makeStore(prefix) {
  return makeStoreImpl(prefix);
}

// Graceful shutdown helper (call this from your server entrypoint if you want)
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
  ipKeyGenerator,
  makeStore,
  limiterHandler,
  closeRateLimitRedis,
};

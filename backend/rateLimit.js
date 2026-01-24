// backend/rateLimit.js
const { rateLimit } = require("express-rate-limit");
const { getClientIp } = require("./clientIp");

// Shared handler: always include requestId (matches your notesRoutes pattern)
function limiterHandler(req, res, _next, options) {
  const reset = req.rateLimit?.resetTime; // Date
  const retryAfterSeconds = reset
    ? Math.max(1, Math.ceil((reset.getTime() - Date.now()) / 1000))
    : null;

  const baseMsg =
    typeof options.message === "string"
      ? options.message
      : options.message?.error || "Too many requests.";

  const waitHuman =
    retryAfterSeconds == null
      ? null
      : retryAfterSeconds < 60
        ? `${retryAfterSeconds}s`
        : `${Math.ceil(retryAfterSeconds / 60)}m`;

  if (retryAfterSeconds != null) {
    res.setHeader("Retry-After", String(retryAfterSeconds)); // nice for frontend too
  }

  return res.status(options.statusCode || 429).json({
    error: waitHuman ? `${baseMsg} Try again in ${waitHuman}.` : baseMsg,
    retryAfterSeconds,
    requestId: req.id,
  });
}

// ✅ Prefer Fly/CF client IP for rate limit keys
function ipKeyGenerator(req) {
  return getClientIp(req) || req.ip || "unknown";
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

// backend/server.js
const app = require("./app");
const { closePool } = require("./pgClient");
const { PORT } = require("./config/env");
const { closeRateLimitRedis } = require("./rateLimit"); // ✅ add
const { startPurgeJob } = require("./purgeJob");


const server = app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});

startPurgeJob();

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received — shutting down gracefully...`);

  // Stop accepting new connections
  server.close(async () => {
    try {
      // ✅ close Redis first (rate limit store)
      await closeRateLimitRedis();
      console.log("Rate-limit Redis closed.");
    } catch (e) {
      console.error("Error closing rate-limit Redis:", e);
    }

    try {
      await closePool();
      console.log("Postgres pool closed.");
    } catch (e) {
      console.error("Error closing Postgres pool:", e);
    } finally {
      process.exit(0);
    }
  });

  // Force exit if something hangs
  setTimeout(async () => {
    try {
      await closeRateLimitRedis();
    } catch {}
    console.error("Force shutdown (timeout).");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

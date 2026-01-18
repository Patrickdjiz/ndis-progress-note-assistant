// backend/server.js
const app = require("./app");
const { closePool } = require("./pgClient");
const { PORT } = require("./config/env");
const { closeRateLimitRedis } = require("./rateLimit");
const { runRetentionPurgeJob } = require("./retentionPurgeJob");

const server = app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});


// ✅ Retention + purge job (daily)
if (process.env.RETENTION_JOB_ENABLED === "true") {
  const run = async () => {
    try {
      const out = await runRetentionPurgeJob();
      console.log("Retention job:", out);
    } catch (e) {
      console.error("Retention job failed:", e);
    }
  };

  // optional: run once on boot
  if (process.env.RETENTION_JOB_RUN_ON_BOOT === "true") {
    run();
  }

  // run every 24 hours
  setInterval(run, 24 * 60 * 60 * 1000).unref();
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received — shutting down gracefully...`);

  server.close(async () => {
    try {
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

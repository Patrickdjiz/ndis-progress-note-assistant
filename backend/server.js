// backend/server.js
const app = require("./app");
const { closePool } = require("./pgClient");
const { PORT } = require("./config/env");

const server = app.listen(PORT, () => {
  console.log(`API listening on port ${PORT}`);
});

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`${signal} received — shutting down gracefully...`);

  // Stop accepting new connections
  server.close(async () => {
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
  setTimeout(() => {
    console.error("Force shutdown (timeout).");
    process.exit(1);
  }, 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

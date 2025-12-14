// server.js
const app = require("./app");
const { PORT, NODE_ENV } = require("./config/env");

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT} (${NODE_ENV})`);
});

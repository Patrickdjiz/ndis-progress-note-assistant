// server.js
const app = require("./app");

const PORT = 5000;

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});

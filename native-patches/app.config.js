// app.config.js — Testing build (no backend required)
// Removes the Replit dev-server dependency so the app builds and runs
// without a running Express backend. All AI calls go directly to Kimi API.

const { expo } = require("./app.json");

module.exports = { expo };

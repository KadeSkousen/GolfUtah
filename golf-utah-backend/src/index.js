// Golf Utah Backend — Main Server

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const alertRoutes = require('./routes/alerts');
const { startAlertWorker } = require('./workers/alertWorker');

const app = express();
const PORT = process.env.PORT || 3001;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
}));

app.use(express.json());

// Request logger (simple, no dependencies)
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
});

// ─── ROUTES ───────────────────────────────────────────────────────────────────

app.use('/api', apiRoutes);
app.use('/api', alertRoutes);

// Root — useful for Render/Railway health checks
app.get('/', (req, res) => {
  res.json({
    name: 'Golf Utah API',
    version: '1.0.0',
    status: 'running',
    docs: 'See README.md for API documentation',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ─── START ────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n⛳  Golf Utah API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/api/health`);
  console.log(`   Courses: http://localhost:${PORT}/api/courses`);
  console.log(`   Search: http://localhost:${PORT}/api/tee-times?date=2026-03-15&players=2\n`);

  // Start the SMS alert background worker
  startAlertWorker();
});

module.exports = app;

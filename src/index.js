require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const alertRoutes = require('./routes/alerts');
const { startAlertWorker } = require('./workers/alertWorker');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));
app.use(express.json());
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now()-start}ms)`));
  next();
});

app.use('/api', apiRoutes);
app.use('/api', alertRoutes);
app.use(express.static(path.join(__dirname, '../public')));
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  fs.existsSync(indexPath) ? res.sendFile(indexPath) : res.json({ name: 'Golf Utah API', status: 'running' });
});
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

app.listen(PORT, () => {
  console.log(`\n⛳  Golf Utah running on port ${PORT}`);
  // startAlertWorker(); // Disabled until alerts feature is activated
});
module.exports = app;

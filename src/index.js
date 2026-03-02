require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiRoutes = require('./routes/api');
const alertRoutes = require('./routes/alerts');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] }));
app.use(express.json());

app.use('/api', apiRoutes);
app.use('/api', alertRoutes);

app.get('/debug', (req, res) => {
  const cwd = process.cwd();
  const publicPath = path.join(cwd, 'public');
  const indexPath = path.join(publicPath, 'index.html');
  res.json({
    cwd,
    publicPath,
    indexExists: fs.existsSync(indexPath),
    publicExists: fs.existsSync(publicPath),
    publicContents: fs.existsSync(publicPath) ? fs.readdirSync(publicPath) : 'folder not found',
    dirname: __dirname,
  });
});

app.use(express.static(path.join(process.cwd(), 'public')));
app.get('/', (req, res) => {
  const indexPath = path.join(process.cwd(), 'public', 'index.html');
  fs.existsSync(indexPath) ? res.sendFile(indexPath) : res.json({ name: 'Golf Utah API', status: 'running' });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: 'Internal server error' }); });

app.listen(PORT, () => console.log(`\n⛳  Golf Utah running on port ${PORT}`));
module.exports = app;


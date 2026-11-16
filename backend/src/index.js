require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { route } = require('./http');
const { webhook } = require('./marketplace');
const { startBackgroundJobs } = require('./background');

const app = express();
const origins = process.env.FRONTEND_ORIGIN?.split(',').map((value) => value.trim()).filter(Boolean);
app.use(cors(origins?.length ? { origin: origins } : undefined));

app.post(['/api/market/webhook', '/market/webhook'], express.raw({ type: 'application/json', limit: '1mb' }), route(webhook));
app.use(express.json({ limit: '128kb' }));

const routes = {
  auth: require('./routes/authRoutes'),
  'soil-test': require('./routes/soilTestRoutes'),
  admin: require('./routes/adminRoutes'),
  vendor: require('./routes/vendorRoutes'),
  market: require('./routes/marketRoutes'),
  labour: require('./routes/labourRoutes').router,
  equipment: require('./routes/equipmentRoutes'),
  produce: require('./routes/produceRoutes').router,
  platform: require('./routes/platformRoutes'),
  media: require('./routes/mediaRoutes'),
};
for (const [name, router] of Object.entries(routes)) {
  app.use(['/api/' + name, '/' + name], router);
}

app.get(['/health', '/api/health'], (req, res) => res.json({ status: 'OK' }));

app.use((req, res) => res.status(404).json({ message: 'Endpoint not found.' }));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'The uploaded file exceeds the size limit.' });
  if (error.name === 'MulterError') return res.status(400).json({ message: 'Choose one file and try again.' });
  if (error.code === 'P2002') return res.status(409).json({ message: 'A record with these details already exists.' });
  if (error.code === 'P2025') return res.status(404).json({ message: 'Record not found.' });
  if (error.code === 'P2034') return res.status(409).json({ message: 'Another request changed this record. Try again.' });
  if (error.status && Number.isInteger(error.status) && error.status >= 400 && error.status < 600) {
    return res.status(error.status).json({ message: error.expose === false ? 'Request failed.' : error.message, ...error.details });
  }
  console.error(error);
  res.status(500).json({ message: 'The request could not be completed.' });
});

if (require.main === module) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required.');
  const port = process.env.PORT || 5000;
  app.listen(port, () => {
    console.log('Server running on port ' + port);
    startBackgroundJobs();
  });
}

module.exports = app;

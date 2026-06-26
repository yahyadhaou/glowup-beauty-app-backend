require('dotenv').config();
const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');

const { testConnection } = require('./src/config/db');
const { general }        = require('./src/middleware/rateLimit');
const errorHandler       = require('./src/middleware/errorHandler');
const logger             = require('./src/utils/logger');

const app = express();

// ── Security middleware ───────────────────────────────────────
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin:      process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
  methods:     ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(cookieParser(process.env.COOKIE_SECRET));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(morgan('combined', { stream: { write: msg => logger.info(msg.trim()) } }));
app.use(general);

// ── Routes ────────────────────────────────────────────────────
app.use('/api/auth',          require('./src/routes/auth'));
app.use('/api/profile',       require('./src/routes/profile'));
app.use('/api/bookings',      require('./src/routes/bookings'));
app.use('/api/providers',     require('./src/routes/providers'));
app.use('/api/notifications', require('./src/routes/notifications'));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'glowup-client-api' }));
app.all('*', (req, res) => res.status(404).json({ error: 'Route not found.' }));

app.use(errorHandler);

// ── Start ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
testConnection().then(() => {
  app.listen(PORT, () => logger.info(`glowup-client-api running on port ${PORT}`));
});

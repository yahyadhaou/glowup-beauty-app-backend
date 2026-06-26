# GlowUp — Customer API

REST API for the GlowUp customer mobile app. Handles authentication, provider discovery, bookings, reviews, favourites, and notifications.

- **Runtime:** Node.js 18+ / Express 4
- **Database:** MySQL 8 (shared `glowup` database)
- **Port:** 4000

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env and fill in all values

# 3. Set up the database (first time only)
mysql -u root -p < ../glowup-db/schema.sql

# 4. Start development server
npm run dev

# 5. Health check
curl http://localhost:4000/health
```

---

## Project Structure

```
glowup-client-api/
├── server.js                    # App entry point
├── .env.example                 # Required environment variables
└── src/
    ├── config/
    │   └── db.js                # MySQL connection pool
    ├── utils/
    │   ├── jwt.js               # Token sign / verify / hash
    │   ├── hash.js              # bcrypt password utilities
    │   ├── email.js             # Nodemailer + email templates
    │   └── logger.js            # Winston logger
    ├── middleware/
    │   ├── auth.js              # JWT bearer verification
    │   ├── rateLimit.js         # 3-tier rate limiting
    │   ├── validate.js          # Input validation error formatter
    │   └── errorHandler.js      # Centralised error responses
    └── routes/
        ├── auth.js              # Register, login, refresh, logout, reset
        ├── profile.js           # Profile CRUD, favourites, delete account
        ├── bookings.js          # Create/list/cancel bookings, reviews
        ├── providers.js         # Browse and view studio profiles
        └── notifications.js     # List and mark notifications as read
```

---

## API Endpoints

### Auth — `/api/auth`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register new customer. Sends verification email. |
| GET | `/api/auth/verify-email?token=` | Verify email address. |
| POST | `/api/auth/login` | Login. Returns access token + sets httpOnly refresh cookie. |
| POST | `/api/auth/refresh` | Rotate refresh token. Returns new access token. |
| POST | `/api/auth/logout` | Revoke refresh token and clear cookie. |
| POST | `/api/auth/forgot-password` | Send password reset email. |
| POST | `/api/auth/reset-password` | Reset password. Revokes all sessions. |

### Profile — `/api/profile` *(requires auth)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/profile/me` | Get own profile. |
| PATCH | `/api/profile/me` | Update name, phone, language. |
| PATCH | `/api/profile/change-password` | Change password. Logs out all devices. |
| DELETE | `/api/profile/me` | Soft delete account (requires password). |
| GET | `/api/profile/favourites` | List saved studios. |
| POST | `/api/profile/favourites/:id` | Save a studio. |
| DELETE | `/api/profile/favourites/:id` | Remove a studio from favourites. |

### Bookings — `/api/bookings` *(requires auth)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bookings` | List bookings. Filter: `status`, `page`, `limit`. |
| GET | `/api/bookings/:id` | Booking detail with service and provider info. |
| POST | `/api/bookings` | Create booking. Validates no slot conflict. Notifies provider. |
| PATCH | `/api/bookings/:id/cancel` | Cancel a pending or confirmed booking. |
| POST | `/api/bookings/:id/review` | Submit 1–5 star review for a completed booking. |

### Providers — `/api/providers` *(requires auth)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/providers` | Browse approved studios. Filter: `category`, `search`, `sort`, `page`. |
| GET | `/api/providers/:id` | Full studio profile + services + hours + reviews + gallery. |

### Notifications — `/api/notifications` *(requires auth)*

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/notifications` | Last 50 notifications. |
| PATCH | `/api/notifications/:id/read` | Mark single notification as read. |
| PATCH | `/api/notifications/read-all` | Mark all as read. |

---

## Security

| Layer | Details |
|-------|---------|
| **JWT** | Access token 15 min, refresh token 7 days (rotated on each use) |
| **Refresh tokens** | Stored as SHA-256 hashes in DB — raw token never persisted |
| **Cookies** | httpOnly + Secure + SameSite=Strict |
| **Passwords** | bcrypt 12 rounds. Min 8 chars + uppercase + digit |
| **Account lockout** | 5 failed logins → locked 30 minutes |
| **Rate limiting** | General: 200/15min · Auth: 10/15min · Reset: 3/hr |
| **Headers** | Helmet.js (CSP, HSTS, X-Frame-Options, etc.) |
| **CORS** | Whitelist via `CLIENT_URL` env variable |
| **SQL injection** | 100% parameterised queries via mysql2 |
| **Input validation** | express-validator on all routes |
| **Enumeration** | Forgot-password always returns same message |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values.

| Variable | Description |
|----------|-------------|
| `PORT` | Server port (default 4000) |
| `DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME` | MySQL connection |
| `JWT_ACCESS_SECRET` | Min 64-char random string |
| `JWT_REFRESH_SECRET` | Min 64-char random string (different from access) |
| `JWT_ACCESS_EXPIRES` | e.g. `15m` |
| `JWT_REFRESH_EXPIRES` | e.g. `7d` |
| `SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS` | Email server |
| `EMAIL_FROM` | e.g. `"GlowUp <noreply@glowup.app>"` |
| `CLIENT_URL` | Frontend URL for CORS + email links |
| `COOKIE_SECRET` | Random string for cookie signing |

---

## Scripts

```bash
npm start      # Production
npm run dev    # Development with nodemon
```

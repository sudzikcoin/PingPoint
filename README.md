[![CI](https://github.com/sudzikcoin/PingPoint/actions/workflows/ci.yml/badge.svg)](https://github.com/sudzikcoin/PingPoint/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-Proprietary-blue)

# PingPoint

**Real-time logistics tracking for brokers, dispatchers, and drivers.**

PingPoint is a MacroPoint-style tracking platform that's simpler and more affordable. It enables freight brokers to monitor driver locations in real-time, share tracking links with customers, and gain insights through analytics.

## Roles & Applications

| Role | Application | Description |
|------|-------------|-------------|
| **Broker** | PingPoint Control | Web console for load management, driver assignment, analytics |
| **Driver** | PingPoint Driver | Mobile-friendly interface for location updates, stop check-ins |
| **Admin** | Admin Panel | User management, subscriptions, audit logs |
| **Customer** | Public Tracking | Read-only tracking links for shippers/receivers |

## Key Features

- **Load Management** - Create, assign, and track loads with multi-stop support
- **Real-Time Tracking** - GPS pings from drivers with live map visualization
- **PDF Parsing** - AI-powered rate confirmation parsing with Claude API
- **Geofencing** - Automatic arrival/departure detection based on GPS coordinates
- **Public Tracking Links** - Share read-only tracking with customers via unique tokens
- **Driver CRM** - Manage drivers with performance stats, tags, favorites
- **Shipper/Receiver CRM** - Address book with autocomplete for frequent locations
- **Analytics Dashboard** - On-time %, delay metrics, CO2 emissions, driver/shipper breakdowns
- **Exception Monitoring** - Automatic alerts for late deliveries, signal loss, long dwells
- **Webhook Integrations** - Push events to external systems (TMS, ELD)
- **Referral Program** - Earn bonus loads for referring other brokers
- **Driver Loyalty Points** - Tap-to-earn rewards for timely updates
- **Dual Themes** - "Arcade 90s" retro neon or "Premium Dark" modern metallic
- **PWA Support** - Installable on mobile devices

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, Tailwind CSS v4, Radix UI |
| Backend | Express.js, TypeScript, Node.js 18+ |
| Database | PostgreSQL with Drizzle ORM |
| Auth | JWT sessions (HTTP-only cookies) |
| Payments | Stripe (credits), Solana Pay (USDC subscriptions) |
| Email | Resend |
| AI | Anthropic Claude (PDF parsing) |
| Maps | Leaflet, Nominatim (geocoding) |
| Logging | Winston with daily rotation |
| Testing | Vitest, Supertest, Playwright |

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- PostgreSQL >= 14
- npm

### Installation

```bash
# Clone repository
git clone [repository-url]
cd pingpoint

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values (see Configuration section)

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

The app will be available at `http://localhost:5000`.

## Repository Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # UI components
│   │   ├── pages/          # Route pages
│   │   ├── context/        # React contexts (theme, auth)
│   │   └── lib/            # Utilities
│   └── index.html
├── server/                 # Express backend
│   ├── routes.ts           # API endpoints
│   ├── storage.ts          # Database operations
│   ├── auth.ts             # Authentication
│   ├── middleware/         # Express middleware
│   ├── services/           # Business logic
│   ├── jobs/               # Background jobs (geofencing)
│   ├── billing/            # Stripe & Solana integration
│   └── config/             # Environment & configuration
├── shared/                 # Shared code
│   └── schema.ts           # Drizzle schema + Zod types
├── docs/                   # Documentation
└── package.json
```

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/pingpoint` |
| `JWT_SECRET` | Secret for JWT tokens (min 32 chars) | Generate with `openssl rand -base64 32` |

### Important Variables

| Variable | Description | Where to Get |
|----------|-------------|--------------|
| `ANTHROPIC_API_KEY` | Claude API for PDF parsing | [console.anthropic.com](https://console.anthropic.com/) |
| `RESEND_API_KEY` | Email service | [resend.com](https://resend.com/) |
| `STRIPE_SECRET_KEY` | Payment processing | [dashboard.stripe.com](https://dashboard.stripe.com/) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook validation | Stripe Dashboard > Webhooks |
| `ADMIN_EMAIL` | Admin panel login email | Your choice |
| `ADMIN_PASSWORD` | Admin panel password | Your choice |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `5000` | Server port |
| `ENABLE_CRON_JOBS` | `true` | Enable background geofence monitoring |
| `ENABLE_RATE_LIMITING` | `true` | Enable API rate limiting |
| `ENABLE_FILE_LOGGING` | `true` | Enable file-based logging |
| `CORS_STRICT` | `true` (prod) | Enforce strict CORS in production |
| `SKIP_ENV_VALIDATION` | `false` | Skip startup validation (debugging only) |

See `.env.example` for complete documentation.

## Security Features

- **JWT Authentication** - HTTP-only cookies with secure flags
- **Rate Limiting** - Configurable limits per endpoint:
  - General API: 200 requests/15 min
  - Login: 10 attempts/15 min
  - Signup: 5 attempts/min
  - PDF parsing: 20/hour
  - Load creation: 100/hour
- **CORS Protection** - Strict origin checking in production
- **Security Headers** - X-Content-Type-Options, X-Frame-Options, HSTS
- **Environment Validation** - Startup checks for required configuration
- **Trusted Devices** - Device fingerprinting for login flows

## API Overview

### Authentication
- `POST /api/brokers/signup` - Create account
- `POST /api/brokers/login` - Login (sends verification email)
- `POST /api/brokers/verify` - Verify email token
- `POST /api/brokers/logout` - Logout

### Loads
- `GET /api/loads` - List broker's loads
- `POST /api/loads` - Create new load
- `GET /api/loads/:id` - Get load details
- `PATCH /api/loads/:id` - Update load
- `DELETE /api/loads/:id` - Delete load

### Drivers
- `GET /api/drivers` - List broker's drivers
- `POST /api/drivers` - Create driver
- `GET /api/driver/:token` - Driver access (via token)
- `POST /api/driver/:token/ping` - Submit GPS ping

### Analytics
- `GET /api/analytics/overview` - Dashboard metrics
- `GET /api/analytics/loads.csv` - Export CSV

### Billing
- `GET /api/billing/summary` - Current plan & usage
- `POST /api/billing/stripe/create-checkout` - Purchase credits
- `POST /api/billing/solana/create-intent` - USDC subscription

See [docs/API.md](docs/API.md) for complete API reference.

## Testing

```bash
# Run unit tests
npm test

# Run with coverage
npm run test:coverage

# Run E2E tests
npm run e2e
```

**Warning**: Tests use `resetDatabase()` which truncates all tables. Never run tests against production data.

## Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Requirements

- `NODE_ENV=production`
- `DATABASE_URL` pointing to production database
- `JWT_SECRET` with 32+ characters
- `PINGPOINT_PUBLIC_URL` set to your domain

### Recommended Hosting

- **Replit** - Native support with auto-deployments
- **Railway/Render** - Easy PostgreSQL setup
- **Docker** - See `docker-compose.yml` (if available)

## Pricing

| Plan | Price | Loads/Month | Features |
|------|-------|-------------|----------|
| **Free** | $0 | 3 | Basic tracking, 30-day analytics |
| **Pro** | $99/mo | 200 | Full analytics, webhooks, priority support |
| **Credits** | ~$0.99/load | Pay-as-you-go | Extra loads beyond plan limits |

*Pro plan available via USDC (Solana Pay) for crypto-friendly pricing.*

## Status & Roadmap

### Completed
- Core load/driver/tracking functionality
- Geofence-based auto arrival/departure
- Analytics with CO2 emissions
- Stripe billing integration
- Solana Pay for USDC subscriptions
- Webhook system
- Exception monitoring (late, no-signal, long-dwell)
- Admin panel with audit logs
- Referral program with bonus loads
- Driver loyalty points (tap-to-earn)
- Rate limiting & CORS security
- Environment validation
- Winston logging with rotation

### In Progress
- Rate confirmation end-to-end attachment flow
- Enhanced admin broker detail page

### Planned
- Telematics/ELD integrations
- Database scaling (PostGIS, archiving)
- Mobile native apps
- SMS notifications via Twilio

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Setup Guide](docs/SETUP.md)
- [Database Schema](docs/DB_SCHEMA.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Security](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)

## License

Proprietary. All rights reserved.

## Support

For issues or questions, contact support or open an issue in this repository.

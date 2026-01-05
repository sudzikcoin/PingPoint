# PingPoint

[![CI](https://github.com/OWNER/pingpoint/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/pingpoint/actions/workflows/ci.yml)

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
- **Public Tracking Links** - Share read-only tracking with customers via unique tokens
- **Driver CRM** - Manage drivers with performance stats, tags, favorites
- **Shipper/Receiver CRM** - Address book with autocomplete for frequent locations
- **Analytics Dashboard** - On-time %, delay metrics, CO2 emissions, driver/shipper breakdowns
- **Exception Monitoring** - Automatic alerts for late deliveries, signal loss, long dwells
- **Webhook Integrations** - Push events to external systems (TMS, ELD)
- **Rate Confirmations** - Upload and attach documents to loads
- **Dual Themes** - "Arcade 90s" retro neon or "Premium Dark" modern metallic
- **Driver Loyalty Points** - Tap-to-earn rewards for timely updates
- **PWA Support** - Installable on mobile devices

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, Vite, Tailwind CSS, Radix UI |
| Backend | Express.js, TypeScript |
| Database | PostgreSQL with Drizzle ORM |
| Auth | JWT sessions (HTTP-only cookies) |
| Payments | Stripe (credits), Solana Pay (USDC subscriptions) |
| Email | Resend |
| Hosting | Replit |

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
│   └── services/           # Business logic
├── shared/                 # Shared code
│   └── schema.ts           # Drizzle schema + Zod types
├── docs/                   # Documentation
└── package.json
```

## Quick Start

See [docs/SETUP.md](docs/SETUP.md) for detailed instructions.

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, secrets, etc.

# Run database migrations
npm run db:push

# Start development server
npm run dev
```

The app will be available at `http://localhost:5000`.

## Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Setup Guide](docs/SETUP.md)
- [Database Schema](docs/DB_SCHEMA.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Troubleshooting](docs/TROUBLESHOOTING.md)
- [Security](docs/SECURITY.md)
- [Roadmap](docs/ROADMAP.md)

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
- Analytics with CO2 emissions (when coordinates available)
- Stripe billing integration
- Webhook system
- Exception monitoring
- Admin panel

### In Progress
- Rate confirmation end-to-end attachment flow
- Enhanced admin broker detail page

### Planned
- Referral program (coming soon)
- Telematics/ELD integrations
- Database scaling (PostGIS, archiving)
- Mobile native apps

## License

Proprietary. All rights reserved.

## Support

For issues or questions, contact support or open an issue in this repository.

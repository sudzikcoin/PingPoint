# Setup Guide

## Requirements

- **Node.js** 18+ (20 recommended)
- **PostgreSQL** 14+ (or Replit's built-in database)
- **npm** or **yarn**

## Environment Variables

Create a `.env` file in the project root (or configure in Replit Secrets):

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SESSION_SECRET` | Random string for session signing | `your-random-secret-here` |
| `JWT_SECRET` | Secret for JWT tokens | `another-random-secret` |

### Stripe (for billing)

| Variable | Description |
|----------|-------------|
| `STRIPE_SECRET_KEY` | Stripe secret key (sk_...) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret (whsec_...) |
| `STRIPE_PRICE_PRO_MONTHLY` | Stripe Price ID for Pro plan |

### Email

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Resend API key for sending emails |

### Admin Panel

| Variable | Description |
|----------|-------------|
| `ADMIN_EMAIL` | Admin login email |
| `ADMIN_PASSWORD` | Admin login password |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `PINGPOINT_CO2_KG_PER_MILE` | `1.68` | CO2 emission factor (kg/mile) |
| `APP_URL` | Auto-detected | Base URL for email links |

## Installation

```bash
# Clone the repository
git clone https://github.com/your-org/pingpoint.git
cd pingpoint

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values
```

## Database Setup

PingPoint uses Drizzle ORM with PostgreSQL.

```bash
# Push schema to database
npm run db:push
```

The server also runs auto-migration on startup, so you can skip manual migration if preferred.

## Running the Application

### Development

```bash
npm run dev
```

This starts both the Vite dev server and Express backend. The app will be available at `http://localhost:5000`.

### Production

```bash
npm run build
npm start
```

## Verifying Setup

1. **Health Check**: Visit `http://localhost:5000/api/health`
   - Should return `{ "status": "ok" }`

2. **Database Connection**: Check server logs for:
   ```
   [DB] Database connection established
   [DB] Database is up to date
   ```

3. **Email Sending**: Logs will show:
   ```
   [ENV] Email sending: ENABLED
   ```
   (or DISABLED if RESEND_API_KEY is missing)

4. **Admin Panel**: Logs will show:
   ```
   [ADMIN] Admin login: ENABLED
   ```
   (or DISABLED if admin credentials missing)

## First Login

1. Navigate to `/app/login`
2. Enter your email address
3. Check your email for the magic link
4. Click the link to complete authentication

**Note**: If email is disabled, check server logs for the verification link.

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues.

## Next Steps

- [Architecture Overview](ARCHITECTURE.md) - Understand the system design
- [API Reference](API.md) - Explore available endpoints
- [Database Schema](DB_SCHEMA.md) - Learn the data model

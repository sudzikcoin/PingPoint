# Architecture Overview

PingPoint is a full-stack TypeScript application with a React frontend, Express backend, and PostgreSQL database.

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
├─────────────────┬─────────────────┬─────────────────────────────┤
│ Broker Console  │  Driver App     │  Public Tracking            │
│ (React SPA)     │  (React PWA)    │  (React, read-only)         │
└────────┬────────┴────────┬────────┴──────────────┬──────────────┘
         │                 │                       │
         ▼                 ▼                       ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Express API Server                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │   Auth   │  │  Loads   │  │ Tracking │  │    Webhooks      │ │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────────┘ │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                           │
│  (Drizzle ORM, 30 tables, multi-tenant by brokerId)             │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

### `/client` - Frontend
- **React 18** with Vite bundler
- **Wouter** for client-side routing
- **React Query** for server state management
- **Tailwind CSS** with custom theme variables
- **Radix UI** for accessible components

### `/server` - Backend
- **Express.js** REST API
- **TypeScript** for type safety
- **JWT-based authentication** with HTTP-only cookies
- **Drizzle ORM** for database queries

### `/shared` - Shared Code
- **Drizzle schema** definitions
- **Zod schemas** for validation
- **Type definitions** shared between client and server

## High-Level Data Flow

### 1. Load Creation
```
Broker → POST /api/loads → Database
       → Generates driverToken + publicToken
       → Returns load with tracking URLs
```

### 2. Driver Tracking
```
Driver → POST /api/driver/:token/ping → Rate Limiter (1 per 30s per load)
       → Database (tracking_pings)
       → Webhook Dispatcher (if configured)
```

### 3. Public Tracking
```
Customer → GET /api/public/:token → Read-only load data
         → GET /api/public/:token/pings → Location history
         (No authentication required, read-only access)
```

### 4. Analytics
```
Broker → GET /api/analytics/overview → Aggregated metrics
       → Computed from loads, stops, tracking_pings
       → CO2 calculated from stop coordinates
```

### 5. Webhooks
```
Load Status Change → Webhook Service
                   → Queue delivery attempts
                   → POST to configured endpoints
                   → Log success/failure
```

## Multi-Tenancy

All data is scoped by `brokerId`:

- Every query filters by the authenticated broker's ID
- Public tracking uses read-only tokens (no broker auth)
- Admin endpoints bypass tenant filtering with explicit permissions

## Authentication Flows

### Broker Auth
1. Login via email link (passwordless)
2. JWT issued in HTTP-only cookie (`pingpoint_session`)
3. Cookie validated on protected routes
4. 24-hour session expiry

### Driver Auth
1. Receives unique `driverToken` per load
2. Token provides access only to assigned load
3. No persistent session required

### Admin Auth
1. Separate login endpoint
2. Checks against `ADMIN_EMAIL` + `ADMIN_PASSWORD`
3. Separate JWT cookie (`pingpoint_admin_session`)

### Public Tracking
1. Uses `publicToken` from load
2. Read-only access, no authentication
3. Rate-limited to prevent abuse

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| Driver pings | 1 request | 30 seconds per load |
| Public tracking | 60 requests | 1 minute per IP |
| API general | 100 requests | 1 minute per user |

## External Integrations

### Stripe
- **Checkout Sessions** for credit purchases
- **Webhooks** for payment confirmation
- **Customer Portal** for subscription management

### Solana Pay
- **USDC payments** for Pro subscriptions
- **QR code generation** for mobile payments

### Resend (Email)
- **Verification emails** for broker signup
- **Notification emails** for load status changes

## Performance Considerations

### Database Indexes
- 40+ indexes on frequently queried columns
- Compound indexes on (brokerId, status, createdAt)
- Unique constraints on tokens

### Caching Strategy
- React Query with stale-time configuration
- Session data cached in cookies
- No server-side caching (stateless design)

### Background Jobs
- Exception scanner runs every 5 minutes
- Webhook retries with exponential backoff

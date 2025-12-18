# PingPoint - Logistics Tracking Platform

## Overview

PingPoint is a real-time logistics tracking platform designed for brokers, dispatchers, and drivers. It provides a MacroPoint-style tracking experience with dual visual themes: a retro "Arcade 90s" mode (default) inspired by classic arcade games, and a "Premium Dark" mode with modern metallic aesthetics.

The platform enables brokers to create and manage loads, assign drivers, and share tracking links with customers. Drivers can view their assigned loads, update stop statuses (arrive/depart), and upload proof of delivery documents. The system generates unique tracking tokens for both driver access and public customer tracking.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18 with Vite as the build tool and development server.

**Routing**: Wouter (lightweight client-side router) with the following route structure:
- `/` - Landing page with console selector (Broker/Driver)
- `/app/*` - Broker/Dispatcher control zone (loads management, billing, settings)
- `/driver/*` - Driver mobile interface (dashboard, load details)
- `/public/track/:token` - Public customer tracking pages
- `/verify` - Email verification endpoint

**State Management**: 
- React Query (TanStack Query) for server state and API caching
- React Context for theme switching (arcade90s vs premium)
- Local component state for UI interactions

**Styling**:
- Tailwind CSS v4 with custom theme extensions
- Two complete visual themes implemented via CSS variables and conditional classNames
- Theme toggle persists preference to localStorage
- Custom arcade-style components (scanlines, pixel fonts, neon glows) for retro mode

**UI Component Library**: Radix UI primitives wrapped with custom styling (shadcn/ui pattern)

**Design Patterns**:
- Dual theme system allows runtime switching without page reload
- Theme context provides `theme` and `setTheme` throughout component tree
- Conditional rendering based on `theme === "arcade90s"` for visual variants
- Mobile-first responsive design with desktop optimizations for broker console

### Backend Architecture

**Framework**: Express.js server with TypeScript

**API Pattern**: RESTful endpoints under `/api/*` namespace:
- `/api/brokers/*` - Broker authentication, workspace management
- `/api/loads/*` - Load CRUD operations, listing with pagination
- `/api/drivers/*` - Driver management
- `/api/tracking/*` - Location updates, stop status changes

**Authentication**: 
- JWT-based broker sessions stored in HTTP-only cookies
- Cookie name: `pingpoint_broker_session`
- 30-day expiration with automatic renewal
- Helper functions: `createBrokerSession()`, `getBrokerFromRequest()`, `clearBrokerSession()`

**Session Management**:
- Server-side session validation on protected routes
- Broker context derived from JWT payload
- No password authentication (email-based verification flow)

**Email (Resend) Configuration**:
- Required environment variables:
  - `RESEND_API_KEY` - API key from the SAME Resend account where suverse.io is verified
  - `MAIL_FROM` - Must be set to `PingPoint <info@suverse.io>` for production emails
- Diagnostic endpoint: `GET /api/email/diagnostics` - returns config status without exposing secrets
- Note: If you see Resend error "You can only send testing emails...", your RESEND_API_KEY is from a Resend account where the domain is not verified OR MAIL_FROM is not set correctly.

**Build Process**:
- Custom esbuild configuration for server bundling
- Vite for client-side builds
- Server dependencies bundled to reduce cold start times
- Allowlist system for critical dependencies (Drizzle, PostgreSQL drivers, etc.)

**Development Mode**:
- Vite dev server with HMR proxy
- Request logging middleware with timing
- Runtime error overlay (Replit plugin)

### Data Storage

**ORM**: Drizzle ORM with PostgreSQL dialect

**Database Schema** (12 tables):

1. **brokers** - Broker accounts/workspaces
   - id (UUID), name, email (unique), emailVerified (boolean)
   - One-to-many with loads and verification tokens

2. **verificationTokens** - Email verification system
   - id, brokerId (FK), token (unique), expiresAt, used (boolean)

3. **drivers** - Driver records
   - id (UUID), phone
   - One-to-many with loads and tracking pings

4. **loads** - Shipment records
   - id, brokerId (FK), driverId (FK nullable), loadNumber (unique)
   - shipperName, carrierName, equipmentType, customerRef, rateAmount
   - status, trackingToken (unique), driverToken (unique)
   - pickupEta, deliveryEta, billingMonth, isBillable
   - isArchived, archivedAt (for auto-archiving feature)

5. **stops** - Pickup/delivery locations
   - id, loadId (FK), type (PICKUP/DELIVERY), sequence (integer)
   - name, addressLine1, city, state, zip, country
   - windowStart, windowEnd, status, arrivedAt, departedAt

6. **trackingPings** - Driver location history
   - id, loadId (FK), driverId (FK nullable)
   - lat, lng, accuracy, source, createdAt

7. **activityLogs** - Audit trail for entities
   - id, entityType, entityId, action, actorType, actorId
   - previousValue, newValue, metadata, createdAt

8. **brokerFieldHints** - Typeahead suggestions
   - id, brokerId, fieldKey, value, usageCount, lastUsedAt

9. **brokerEntitlements** - Billing entitlements (Stage 1-2)
   - id (UUID), brokerId (FK), plan, cycleStartAt, cycleEndAt
   - includedLoads, loadsUsed, status, createdAt, updatedAt

10. **brokerCredits** - Extra load credits balance
    - id (UUID), brokerId (FK), creditsBalance, createdAt, updatedAt

11. **stripeWebhookEvents** - Webhook idempotency tracking
    - id (UUID), eventId (unique), type, processedAt

12. **stripePayments** - Payment records
    - id (UUID), brokerId (FK), checkoutSessionId, paymentIntentId
    - amount, currency, status, creditsGranted, createdAt

**Relationships**:
- Broker → Loads (1:N)
- Broker → VerificationTokens (1:N)
- Driver → Loads (1:N)
- Driver → TrackingPings (1:N)
- Load → Stops (1:N)
- Load → TrackingPings (1:N)

**Migration Strategy**: Drizzle Kit with schema-first migrations to `/migrations` directory

**Connection Pooling**: pg (node-postgres) Pool with connection string from environment

### Authentication and Authorization

**Broker Workflow**:
1. Broker enters email and name on "New Load" form
2. Backend finds or creates broker record (email as unique identifier)
3. JWT token signed with broker ID and set as HTTP-only cookie
4. Verification email sent with magic link (placeholder implementation)
5. Subsequent requests authenticated via cookie validation

**Driver Access**:
- Driver token generated per load (format: `drv_[random]`)
- Token embedded in SMS/link sent to driver phone
- Driver accesses `/driver/:token` or `/driver/loads/:id`
- No session required (token-based access to specific loads)

**Public Tracking**:
- Tracking token generated per load (format: `trk_[random]`)
- Shared with customers for real-time visibility
- Public route `/public/track/:token` requires no authentication

**Security Considerations**:
- JWT secret from environment variable (defaults to dev value if unset)
- Secure flag on cookies in production
- SameSite: lax for CSRF protection
- HTTP-only cookies prevent XSS access
- Token uniqueness enforced at database level

### External Dependencies

**Database**: PostgreSQL (Replit Development Database)
- Connection via `DATABASE_URL` environment variable
- Drizzle ORM handles queries and migrations
- pg driver with connection pooling

**Email Service** (Placeholder):
- SendVerificationEmail function logs to console
- TODO: Integrate SendGrid, Postmark, or similar provider
- Used for broker verification and console access links

**SMS Service** (Placeholder):
- SendDriverSMS function logs to console  
- TODO: Integrate Twilio or similar SMS gateway
- Used for driver app/tracking links

**Third-Party UI Libraries**:
- Radix UI (headless component primitives)
- Lucide React (icon system)
- date-fns (date formatting and manipulation)
- class-variance-authority and clsx (conditional styling utilities)

**Development Tools**:
- Replit-specific Vite plugins (cartographer, dev banner, runtime error modal)
- Meta images plugin for OpenGraph tag injection
- TypeScript with strict mode enabled

**Payment/Billing Integration** (Stage 1-2 + PRO Implemented):
- FREE tier: 3 loads per 30-day cycle, auto-resets at cycle end
- PRO tier: $99/month, 200 loads per 30-day cycle (via Solana Pay USDC)
- Extra load credits: $0.99 each via Stripe Checkout
- Load limit enforcement in POST /api/loads (returns 402 when blocked)
- Billing service: `server/billing/entitlements.ts` handles limits and credits
- Stripe integration: `server/billing/stripe.ts` handles checkout and webhooks
- Solana Pay integration: `server/billing/solana.ts` handles PRO plan USDC payments
- Database tables: brokerEntitlements, brokerCredits, stripeWebhookEvents, stripePayments, solanaPaymentIntents
- Environment variables needed:
  - Stripe: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_EXTRA_LOAD
  - Solana: SOLANA_MERCHANT_WALLET (required), SOLANA_RPC_URL (optional, defaults to mainnet), SOLANA_USDC_MINT (optional)
- Billing UI: `/app/billing` shows usage summary, PRO upgrade with QR, and credit purchase

**Solana Pay PRO Flow**:
1. Broker clicks "Pay with USDC (Solana)" on billing page
2. Backend creates payment intent with unique reference pubkey
3. Frontend displays QR code with Solana Pay URL
4. Broker scans with Solana wallet and pays 99 USDC
5. Frontend polls `/api/billing/solana/intents/:id` every 4 seconds
6. Backend uses `findReference` + `validateTransfer` to verify on-chain payment
7. On confirmation, broker entitlements upgraded to PRO (200 loads, 30 days)
8. PRO reverts to FREE when cycle expires (requires renewal)

**Webhooks** (Placeholder):
- Integrations page has webhook toggle UI
- TODO: Implement outbound webhook system for load status changes
- Intended for TMS/AgentOS integration

## Driver Mobile App (Expo/React Native)

**Location**: `apps/driver-mobile/`

**Purpose**: Native mobile app for drivers providing background GPS tracking with the existing web driver interface in a WebView.

**Features**:
- WebView wrapper for `/driver/<token>` web pages
- Deep linking: `pingpoint://driver/<token>`
- Background location tracking with Task Manager
- Foreground service for Android (persistent notification)
- Offline ping queue (stores up to 20 pings, flushes on reconnect)

**Technical Stack**:
- Expo SDK 52 with React Native
- expo-location for GPS
- expo-task-manager for background tasks
- react-native-webview for driver interface
- AsyncStorage for token and queue persistence

**Tracking Configuration**:
- Accuracy: Balanced (battery-efficient)
- Update interval: 20 seconds
- Distance filter: 75 meters
- Throttle: Max 1 ping per 10 seconds

**Environment Variables** (in apps/driver-mobile):
- `EXPO_PUBLIC_WEB_BASE_URL` - Base URL for driver web interface
- `EXPO_PUBLIC_API_BASE_URL` - Base URL for API endpoints

**Development**:
```bash
cd apps/driver-mobile
npm install
npx expo start
```

**Building for Android**:
```bash
eas login
eas build -p android --profile preview  # APK for testing
eas build -p android --profile production  # AAB for Play Store
```

**Note**: The mobile app is a separate project. Changes to main repo should not affect it, and vice versa.

## Test Infrastructure

**Framework**: Vitest with Supertest for API testing

**Test Files** (server/tests/):
- `brokerMagicLink.test.ts` - Magic link email flow
- `magicLinkVerification.test.ts` - Token verification
- `brokerLoadsListing.test.ts` - Load CRUD and pagination
- `driverAccessAndLoads.test.ts` - Driver token access
- `driverLocationAndStatus.test.ts` - Location pings
- `publicTracking.test.ts` - Public tracking API
- `health.test.ts` - Health endpoint
- `billingEntitlements.test.ts` - Billing system and load limits

**Test Utilities** (server/tests/utils/):
- `dbTestUtils.ts` - Database reset and test data factories
- `testApp.ts` - Test application bootstrap

**Running Tests**: `npm test` or `npx vitest run`

## Production Hardening

**Middleware Stack** (server/middleware/):
- `errorHandler.ts` - Centralized error handling with typed errors
- `logger.ts` - Structured request logging
- `rateLimit.ts` - In-memory rate limiting
- `security.ts` - Security headers and CORS

**Rate Limits**:
- `/api/brokers/send-verification`: 5/min
- `/api/brokers/verify`: 10/min  
- `/api/driver/:token/ping`: 60/min

**Database Indices**: Optimized for common queries on brokerId, status, tokens, timestamps

**Pagination**: All list endpoints support `?page=N&limit=N` with metadata response

## API Documentation

See `docs/API.md` for complete endpoint reference
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

**Database Schema** (8 core tables):

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

**Payment Integration** (Placeholder):
- Billing page UI exists with Stripe/crypto payment options
- No active Stripe SDK integration
- TODO: Implement actual payment processing

**Webhooks** (Placeholder):
- Integrations page has webhook toggle UI
- TODO: Implement outbound webhook system for load status changes
- Intended for TMS/AgentOS integration

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
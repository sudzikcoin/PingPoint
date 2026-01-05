# PingPoint - Logistics Tracking Platform

## Overview

PingPoint is a real-time logistics tracking platform for brokers, dispatchers, and drivers, offering a MacroPoint-style tracking experience. It features dual visual themes: a retro "Arcade 90s" mode and a modern "Premium Dark" mode. The platform allows brokers to manage loads, assign drivers, and share tracking links, while drivers can update stop statuses and upload proof of delivery. It generates unique tracking tokens for both driver access and public customer tracking, aiming to streamline logistics operations and enhance visibility.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### UI/UX Decisions

- **Dual Theming**: "Arcade 90s" (default, retro arcade aesthetic) and "Premium Dark" (modern metallic). Themes are switchable at runtime and persist via local storage.
- **Styling**: Tailwind CSS v4 with custom themes via CSS variables. Radix UI primitives are used for components.
- **Responsive Design**: Mobile-first approach with desktop optimizations for the broker console.

### Technical Implementations

- **Frontend**: React 18 with Vite, Wouter for routing, React Query for server state, and React Context for theme management.
- **Backend**: Express.js with TypeScript, providing RESTful APIs for brokers, loads, drivers, and tracking.
- **Authentication**: JWT-based sessions for brokers (HTTP-only cookies) and token-based access for drivers and public tracking. Email verification for broker access.
    - **Login/Signup Separation**: Login (/api/brokers/login) requires existing account; Signup (/api/brokers/signup) creates new accounts with auto-verification email.
    - **Feature Flag**: AUTH_AUTO_CREATE_BROKER=false (default) prevents /api/brokers/ensure from auto-creating accounts.
    - **Rate Limiting**: 5 req/min on signup, 10 req/min on login.
    - **Email Normalization**: All auth operations use trim().toLowerCase() consistently.
- **Admin Authentication**: Separate JWT-based admin session (pingpoint_admin_session cookie). Requires ADMIN_EMAIL, ADMIN_PASSWORD, and JWT_SECRET environment variables. 24-hour session expiry. Admin panel at /app/admin/login with protected data routes.
- **Build Process**: Custom esbuild for server bundling and Vite for client-side.
- **PWA Support**: Manifest and a comprehensive icon set for installability on mobile devices.
- **Driver Mobile App**: A separate Expo/React Native application (`apps/driver-mobile`) acts as a WebView wrapper for the driver interface, providing background GPS tracking, deep linking, and an offline ping queue.

### Feature Specifications

- **Load Management**: Create, manage, and assign loads; update load statuses. Rate confirmation upload with file attachment to loads.
- **Driver Management**: Full driver CRM at /app/drivers with:
    - **Driver CRUD**: Create, update drivers with name, phone, email, truck number, equipment type.
    - **Tags & Flags**: Tags (e.g., reefer, team), favorite and blocked status.
    - **Performance Stats**: Per-driver statsTotalLoads, statsOnTimeLoads, statsLateLoads computed via driverStatsService.
    - **Filtering**: Search by name/phone/email/truck, filter by favorites/blocked.
    - **Recommendations**: GET /api/loads/recommend-drivers suggests top drivers for new loads.
- **Shipper/Receiver CRM**: Mini-CRM for managing shippers and receivers at /api/shippers and /api/receivers.
    - **Data Model**: Separate shippers and receivers tables with address, contact info.
    - **Load Linking**: Loads can optionally link to shipperId/receiverId for autocomplete and analytics.
    - **Autocomplete**: Search API for typeahead when creating loads.
- **Tracking**: Real-time location pings from drivers, public customer tracking links.
- **Billing**:
    - **Tiers**: FREE (3 loads/month), PRO ($99/month, 200 loads/month via Solana Pay USDC).
    - **Credits**: Extra loads purchasable at $0.99 each via Stripe Checkout.
    - **Enforcement**: Load limits enforced at the API level.
    - **Integrations**: Stripe for credit purchases and Solana Pay for PRO plan subscriptions.
- **Promotions & Referrals**:
    - **Promo Codes**: Validated via /api/billing/promo/validate, stored in Stripe session metadata, redeemed on subscription activation.
    - **Promo Types**: FIXED_LOAD_CREDITS (grants bonus loads), PERCENT_FIRST_SUBSCRIPTION, FIXED_FIRST_SUBSCRIPTION (future: Stripe coupon integration).
    - **Referral Program**: Brokers get auto-generated 8-char referral codes. Referrer earns 20 loads, referred user earns 10 loads on first PRO subscription.
    - **Tracking**: promotionRedemptions table tracks per-user redemptions, referrals table tracks referral relationships and reward status.
- **Exception Monitoring**:
    - **Exception Types**: LATE (delivery >15min past expected), NO_SIGNAL (no ping for >20min), LONG_DWELL (>60min at stop without departure).
    - **Detection**: Background service scans every 5 minutes for exception conditions.
    - **Auto-Resolution**: Exceptions auto-clear when conditions improve (signal restored, departed, delivered).
    - **UI**: Dedicated Exceptions page (/app/exceptions) with filtering, pagination, and manual resolution.
- **Notifications**:
    - **Status Updates**: Email notifications when load status changes (DELIVERED).
    - **Broker Notifications**: Styled HTML emails sent to broker on status changes (EMAIL_BROKER_STATUS preference).
    - **Client Notifications**: Optional emails to shipper/receiver contacts if EMAIL_CLIENT_STATUS enabled and contacts available.
    - **Preferences**: Notification settings managed in Settings page with toggles for each channel.
- **Analytics & CO₂ Tracking**:
    - **Metrics**: Total loads, on-time %, average delay, pickup/delivery dwell times, CO₂ emissions.
    - **Breakdowns**: Performance stats by driver and by shipper.
    - **CO₂ Estimation**: Uses broker-configurable co2FactorGramPerMile (default 1610 g/mi for Class 8 trucks) and load distanceMiles.
    - **Date Filtering**: Quick presets (7d, 30d, 90d) with plan-based limitations.
    - **Plan Gating**: Free plan limited to 30-day history and 50 loads export; Pro has full access.
    - **CSV Export**: Download analytics data via /api/analytics/loads.csv.
    - **UI**: Dedicated Analytics page (/app/analytics) with overview cards, driver/shipper tables, and loads detail tab.
- **Driver Loyalty Points (Tap-to-Earn)**:
    - **Points System**: Off-chain loyalty points stored in driver_reward_accounts table.
    - **Event Types**: FIRST_LOCATION_SHARE (10pts), ARRIVE_PICKUP (20pts), DEPART_PICKUP (20pts), ARRIVE_DELIVERY (20pts), DEPART_DELIVERY (30pts), LOAD_ON_TIME (50pts).
    - **Triggers**: Points awarded automatically on geofence auto-arrive/depart and manual stop status updates.
    - **API**: GET /api/driver/:token includes rewardBalance; GET /api/driver/:token/rewards returns balance details; PATCH /api/driver/:token/stop/:stopId returns reward info in response.
    - **Driver UI**: Balance displayed in driver dashboard header; animated "+X PingPoints" popup on reward earned.

### System Design Choices

- **Database**: PostgreSQL via Drizzle ORM.
    - **Schema**: 30 tables managing brokers, loads, drivers, stops, tracking pings, billing (entitlements, credits, payments), exceptions, notification preferences, shippers, receivers, driver rewards, and audit logs.
    - **Migrations**: Drizzle Kit for schema-first migrations, with auto-migration on server startup.
    - **Performance Indexes**: 40+ indexes across all tables optimizing dashboard queries, exception filtering, and high-volume tracking_pings operations. Unique constraints provide automatic indexes on key columns. See `docs/database.md` for details.
- **API Design**: RESTful endpoints under `/api/*`.
- **Security**: JWT secret from environment variables, secure and HTTP-only cookies, SameSite: lax for CSRF protection, rate limiting on critical endpoints.
- **Admin Panel**: Protected admin dashboard at /app/admin with tabs for Users, Subscriptions, Audit Logs, and Promotions. Requires separate admin auth (not broker auth). Admin login disabled if ADMIN_EMAIL, ADMIN_PASSWORD, or JWT_SECRET is missing.
- **Error Handling**: Centralized error handling and structured request logging.
- **Testing**: Vitest with Supertest for API testing, covering key workflows like authentication, load management, and driver tracking.

## External Dependencies

- **Database**: PostgreSQL (Replit Development Database)
- **Email Service**: Resend (for broker verification and access links)
- **SMS Service**: Placeholder (planned integration with Twilio or similar)
- **Payment Gateways**:
    - **Stripe**: For extra load credit purchases and webhook processing.
    - **Solana Pay**: For PRO plan subscriptions using USDC.
- **UI Libraries**:
    - Radix UI (headless components)
    - Lucide React (icons)
    - date-fns (date utilities)
    - class-variance-authority, clsx (styling utilities)
- **Development Tools**:
    - Replit-specific Vite plugins
    - TypeScript
    - Vitest (testing)
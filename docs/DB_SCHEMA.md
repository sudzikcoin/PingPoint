# Database Schema

PingPoint uses PostgreSQL with Drizzle ORM. The schema is defined in `shared/schema.ts`.

## Overview

The database contains 30 tables organized into functional groups:

```
┌─────────────────────────────────────────────────────────────────┐
│                         Core Entities                            │
├─────────────────┬─────────────────┬─────────────────────────────┤
│     brokers     │     drivers     │         loads               │
│                 │                 │           ↓                 │
│                 │                 │         stops               │
│                 │                 │           ↓                 │
│                 │                 │    tracking_pings           │
└─────────────────┴─────────────────┴─────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         Billing                                  │
├─────────────────┬─────────────────┬─────────────────────────────┤
│broker_entitlements│ broker_credits │    broker_usage            │
│                 │                 │                             │
│stripe_payments  │stripe_webhook_events│solana_payment_intents   │
└─────────────────┴─────────────────┴─────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                         Integrations                             │
├─────────────────┬─────────────────┬─────────────────────────────┤
│ webhook_configs │webhook_delivery │ exception_events            │
│                 │    _logs        │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

## Core Tables

### brokers
Primary user account table.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| email | varchar | Unique email address |
| companyName | varchar | Business name |
| phone | varchar | Contact phone |
| timezone | varchar | Preferred timezone |
| co2FactorGramPerMile | numeric | Custom CO2 factor (default 1610) |
| createdAt | timestamp | Account creation date |

### drivers
Driver profiles managed by brokers.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| brokerId | uuid | FK to brokers |
| name | varchar | Driver name |
| phone | varchar | Phone number |
| email | varchar | Email address |
| truckNumber | varchar | Vehicle identifier |
| equipmentType | varchar | Trailer type |
| tags | text[] | Custom tags (e.g., "reefer", "team") |
| isFavorite | boolean | Favorite status |
| isBlocked | boolean | Block status |
| statsTotalLoads | integer | Computed total loads |
| statsOnTimeLoads | integer | Computed on-time loads |
| statsLateLoads | integer | Computed late loads |

### loads
Load/shipment records.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| brokerId | uuid | FK to brokers |
| driverId | uuid | FK to drivers (nullable) |
| loadNumber | varchar | User-facing load number |
| status | varchar | CREATED, ASSIGNED, IN_TRANSIT, DELIVERED, CANCELLED |
| driverToken | varchar | Unique token for driver access |
| publicToken | varchar | Unique token for public tracking |
| shipperName | varchar | Shipper company |
| receiverName | varchar | Receiver company |
| equipmentType | varchar | Required equipment |
| rateAmount | numeric | Rate/payment amount |
| distanceMiles | numeric | Computed or manual distance |
| createdAt | timestamp | Creation date |
| updatedAt | timestamp | Last update |

### stops
Pickup/delivery stops for loads.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| loadId | uuid | FK to loads |
| type | varchar | PICKUP or DELIVERY |
| sequence | integer | Stop order |
| name | varchar | Location name |
| fullAddress | varchar | Complete address |
| city | varchar | City |
| state | varchar | State/province |
| lat | numeric | Latitude |
| lng | numeric | Longitude |
| scheduledAt | timestamp | Expected arrival |
| arrivedAt | timestamp | Actual arrival |
| departedAt | timestamp | Actual departure |
| status | varchar | PENDING, ARRIVED, DEPARTED |

### tracking_pings
GPS location updates from drivers.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| loadId | uuid | FK to loads |
| lat | numeric | Latitude |
| lng | numeric | Longitude |
| accuracy | numeric | GPS accuracy (meters) |
| speed | numeric | Speed (mph) |
| heading | numeric | Direction (degrees) |
| createdAt | timestamp | Ping timestamp |

## Billing Tables

### broker_entitlements
Subscription status and limits.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| brokerId | uuid | FK to brokers |
| plan | varchar | FREE or PRO |
| loadsPerMonth | integer | Monthly load limit |
| validUntil | timestamp | Subscription expiry |

### broker_credits
Purchased load credits.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| brokerId | uuid | FK to brokers |
| credits | integer | Available credits |
| expiresAt | timestamp | Credit expiry |

### broker_usage
Monthly usage tracking.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| brokerId | uuid | FK to brokers |
| month | varchar | YYYY-MM format |
| loadsCreated | integer | Loads created this month |

## Integration Tables

### webhook_configs
Webhook endpoint configurations.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| brokerId | uuid | FK to brokers |
| url | varchar | Endpoint URL |
| events | text[] | Subscribed event types |
| secret | varchar | Signing secret |
| isActive | boolean | Enable/disable |

### webhook_delivery_logs
Webhook delivery attempts.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| webhookConfigId | uuid | FK to webhook_configs |
| event | varchar | Event type |
| payload | jsonb | Sent payload |
| responseStatus | integer | HTTP status code |
| success | boolean | Delivery success |
| attemptedAt | timestamp | Attempt time |

### exception_events
Monitoring alerts.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| loadId | uuid | FK to loads |
| type | varchar | LATE, NO_SIGNAL, LONG_DWELL |
| severity | varchar | INFO, WARNING, CRITICAL |
| status | varchar | OPEN, RESOLVED |
| resolvedAt | timestamp | Resolution time |
| createdAt | timestamp | Detection time |

## Driver Rewards Tables

### driver_reward_accounts
Driver loyalty point balances.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| driverId | uuid | FK to drivers |
| balance | integer | Current point balance |

### driver_reward_transactions
Point earning history.

| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| driverAccountId | uuid | FK to driver_reward_accounts |
| eventType | varchar | FIRST_LOCATION_SHARE, ARRIVE_PICKUP, etc. |
| points | integer | Points earned |
| loadId | uuid | Related load |
| createdAt | timestamp | Transaction time |

## Other Tables

- **shippers** / **receivers** - Address book entries
- **rate_confirmation_files** - Document attachments
- **verification_tokens** - Email verification
- **notification_preferences** - Alert settings
- **promotions** / **promotion_redemptions** - Promo codes
- **referrals** - Referral program tracking
- **activity_logs** - User activity audit
- **admin_audit_logs** - Admin action audit
- **broker_devices** - PWA push subscriptions
- **broker_field_hints** - Typeahead suggestions
- **stop_geofence_state** - Geofence tracking state

## Indexes

The database includes 40+ indexes for optimal query performance:

### Primary Query Indexes
```sql
-- Load queries by broker
CREATE INDEX idx_loads_broker_status ON loads(brokerId, status);
CREATE INDEX idx_loads_broker_created ON loads(brokerId, createdAt DESC);

-- Tracking ping queries
CREATE INDEX idx_pings_load_created ON tracking_pings(loadId, createdAt DESC);

-- Exception queries
CREATE INDEX idx_exceptions_broker_status ON exception_events(brokerId, status);
```

### Unique Constraints (with automatic indexes)
- `loads.driverToken` - Unique driver access tokens
- `loads.publicToken` - Unique public tracking tokens
- `brokers.email` - Unique email addresses

## Future Considerations

### PostGIS Extension
For advanced geospatial queries:
```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry column
ALTER TABLE stops ADD COLUMN location geometry(Point, 4326);
CREATE INDEX idx_stops_location ON stops USING GIST(location);
```

### Archiving Strategy
For high-volume deployments:
```sql
-- Archive old tracking pings
CREATE TABLE tracking_pings_archive (LIKE tracking_pings);

-- Move old data
INSERT INTO tracking_pings_archive
SELECT * FROM tracking_pings WHERE createdAt < NOW() - INTERVAL '90 days';
```

### Partitioning
For very large tables:
```sql
-- Partition tracking_pings by month
CREATE TABLE tracking_pings (
  ...
) PARTITION BY RANGE (createdAt);
```

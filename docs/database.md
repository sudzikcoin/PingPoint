# PingPoint Database Documentation

## Overview

PingPoint uses PostgreSQL with Drizzle ORM for data persistence. The schema is defined in `shared/schema.ts` and migrations are managed via Drizzle Kit.

## Database Tables

The database consists of 30+ tables organized into functional groups:

### Core Business Tables
- **brokers** - Broker accounts and settings
- **loads** - Load/shipment records
- **stops** - Pickup and delivery stops per load
- **drivers** - Driver records with performance stats

### CRM Tables
- **shippers** - Shipper contact information
- **receivers** - Receiver contact information

### Tracking Tables
- **tracking_pings** - Real-time location data from drivers
- **stop_geofence_state** - Anti-flap state for auto arrive/depart

### Billing Tables
- **broker_entitlements** - Plan limits and cycle tracking
- **broker_usage** - Load usage per billing cycle
- **broker_credits** - Extra load credits balance
- **stripe_payments** - Stripe payment records
- **solana_payment_intents** - Solana Pay USDC payments
- **stripe_webhook_events** - Idempotency tracking

### Promotion & Referral Tables
- **promotions** - Promo code definitions
- **promotion_redemptions** - Per-user redemption tracking
- **referrals** - Referral relationships and rewards

### Webhook Tables
- **webhook_configs** - Per-broker webhook settings
- **webhook_delivery_logs** - Delivery attempt history

### Driver Rewards Tables
- **driver_reward_accounts** - Points balance per driver
- **driver_reward_transactions** - Points earning history

### Exception Monitoring
- **exception_events** - LATE, NO_SIGNAL, LONG_DWELL exceptions

### Authentication & Audit
- **verification_tokens** - Email verification tokens
- **broker_devices** - Trusted device tracking
- **broker_field_hints** - Typeahead suggestions
- **notification_preferences** - Email notification settings
- **activity_logs** - Entity change history
- **admin_audit_logs** - Admin action history

### Documents
- **rate_confirmation_files** - Uploaded rate confirmation documents

## Running Migrations

### Local Development

1. Ensure `DATABASE_URL` is set in your environment
2. Generate migration files (if schema changed):
   ```bash
   npx drizzle-kit generate
   ```
3. Apply migrations:
   ```bash
   npx drizzle-kit migrate
   ```

Or use the quick push method for development:
```bash
npm run db:push
```

### Production

1. SSH into the production server
2. Export the production `DATABASE_URL`
3. Run migrations:
   ```bash
   npx drizzle-kit migrate
   ```

## Performance Indexes

The following indexes have been added to optimize query performance. Note that columns with unique constraints automatically get indexes, so they are not listed here.

### Core Tables
- **loads**: Indexes on `broker_id`, `(broker_id, status)`, `created_at`, `driver_id`
- **stops**: Indexes on `load_id`, `(load_id, type)`
- **tracking_pings**: Indexes on `load_id`, `(load_id, created_at)`, `driver_id`
- **drivers**: Indexes on `broker_id`, `phone`

### Billing Tables
- **broker_entitlements**: Index on `plan` (brokerId has unique constraint)
- **broker_usage**: Index on `(broker_id, cycle_start_at)`

### Webhook Tables
- **webhook_delivery_logs**: Indexes on `broker_id`, `event_type`, `created_at`

### Exception & Notification Tables
- **exception_events**: Indexes on `broker_id`, `load_id`, `type`, `(broker_id, resolved_at)`
- **notification_preferences**: Indexes on `broker_id`, `(broker_id, channel)`

### Audit Tables
- **admin_audit_logs**: Indexes on `target_broker_id`, `actor_broker_id`, `created_at`
- **activity_logs**: Indexes on `(entity_type, entity_id)`, `created_at`

### Other Tables
- **shippers/receivers**: Index on `broker_id`
- **verification_tokens**: Index on `broker_id`
- **broker_devices**: Indexes on `broker_id`, `(broker_id, device_id)`
- **broker_field_hints**: Index on `(broker_id, field_key)`
- **rate_confirmation_files**: Indexes on `broker_id`, `load_id`
- **promotions**: Index on `active`
- **promotion_redemptions**: Indexes on `broker_id`, `promotion_id`
- **referrals**: Indexes on `referrer_id`, `referred_id`, `referrer_code`
- **driver_reward_transactions**: Index on `(reward_account_id, load_id, event_type)` (unique)

## Performance Notes

1. **tracking_pings** is the highest-volume table and can grow large. Consider implementing periodic archival for pings older than 90 days.

2. The composite index on `(load_id, created_at)` for tracking_pings enables efficient "last ping" queries.

3. The `(broker_id, status)` composite index on loads optimizes dashboard filtering.

4. Exception queries benefit from the `(broker_id, resolved_at)` index for filtering unresolved exceptions.

## Schema Changes

When making schema changes:

1. Modify `shared/schema.ts`
2. Generate migration: `npx drizzle-kit generate`
3. Review generated SQL in `migrations/` folder
4. Apply: `npx drizzle-kit migrate`

Never manually edit migration files. If a migration fails, fix the schema and regenerate.

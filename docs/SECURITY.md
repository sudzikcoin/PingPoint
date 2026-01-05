# Security

## Access Models

PingPoint uses three distinct authentication models:

| Access Type | Authentication | Scope | Description |
|-------------|----------------|-------|-------------|
| **Broker Session** | JWT cookie (`pingpoint_session`) | Full broker account | Web console access, all CRUD operations |
| **Driver Token** | URL token (`driverToken`) | Single load | Mobile-friendly load updates, location pings |
| **Public Tracking** | URL token (`trackingToken`) | Single load, read-only | Customer-facing tracking link |

### Broker Console (Session Auth)

- JWT stored in HTTP-only, secure cookie
- 24-hour expiration
- SameSite: lax for CSRF protection
- All queries scoped by `brokerId`

### Driver App (Token Auth)

- Token embedded in URL (magic link sent via SMS/email)
- Token tied to specific load
- Can submit location pings and update stop status
- Cannot access other loads or broker data

### Public Tracking (Token Auth)

- Read-only access token
- Shared with shippers/receivers
- Returns minimal data (no PII)
- Subject to TTL and rate limiting

## Public Tracking Links

### Token Requirements

- **Entropy**: 32 bytes of cryptographic randomness
- **Format**: Base64url encoded (URL-safe)
- **Generation**: `crypto.randomBytes(32).toString('base64url')`

### TTL (Time-to-Live)

Public tracking links expire after delivery:

- **Active loads**: Always accessible
- **Delivered loads**: Accessible for `PUBLIC_TRACKING_TTL_DAYS` (default: 7 days) after delivery
- **Expired**: Returns HTTP 410 Gone

### Rate Limiting

Public tracking endpoints are rate-limited:

- **Limit**: `PUBLIC_TRACKING_RPM` requests per minute per IP+token (default: 60)
- **Caching**: Responses cached for 10 seconds to reduce database load
- **Exceeded**: Returns HTTP 429 Too Many Requests

### Response Minimization

Public tracking responses include only safe fields:

**Included:**
- Load number, status, creation date
- Stop locations (city/state only), scheduled times, actual arrival/departure
- Last known location (lat/lng), timestamp

**Excluded:**
- Broker ID, driver ID, driver contact info
- Rate/billing information
- Webhook configurations
- Internal notes

## GPS Ping Validation

### Coordinate Validation

All GPS pings are validated:

| Check | Requirement | Action |
|-------|-------------|--------|
| Latitude range | -90 to +90 | Reject if out of range |
| Longitude range | -180 to +180 | Reject if out of range |
| Type validation | Must be finite numbers | Reject if invalid |

### Timestamp Sanity

- **Future limit**: Reject if timestamp > now + `GPS_MAX_FUTURE_SKEW_SECONDS` (default: 300s / 5 min)
- **Age limit**: Reject if timestamp < now - `GPS_MAX_AGE_HOURS` (default: 24 hours)

### Accuracy Bounds

- **Maximum accuracy**: `GPS_MAX_ACCURACY_METERS` (default: 5000m)
- Pings with accuracy > threshold are rejected
- Geofence evaluation skipped for low-accuracy pings

### Anti-Teleport Detection

Detects physically impossible location jumps:

1. Fetch last accepted ping for same driver+load
2. Calculate distance (Haversine formula)
3. Calculate time delta
4. Compute implied speed (mph)
5. If speed > `GPS_MAX_SPEED_MPH` (default: 120), reject with 422

### Ownership Enforcement

Before accepting a ping:

1. Verify driver is assigned to the load
2. Verify load belongs to the broker context
3. Reject with 403 if unauthorized

### Logging Strategy

- Rejected pings logged with reason code (not raw PII)
- Format: `[TrackingPing] REJECTED reason=<code> token=<truncated>`
- Console logging for MVP; production should use structured logging

## Rate Limiting

### Driver Ping Endpoint

| Limiter | Key | Limit | Window |
|---------|-----|-------|--------|
| Per-load | `load:{loadId}:{driverId}` | 1 ping | 30 seconds |
| IP burst | IP address | `TRACKING_PING_RPM` (120) | 1 minute |

### Public Tracking Endpoint

| Limiter | Key | Limit | Window |
|---------|-----|-------|--------|
| Token+IP | `{ip}:{token}` | `PUBLIC_TRACKING_RPM` (60) | 1 minute |

### Implementation Notes

- MVP uses in-memory rate limiting
- State cleared on server restart
- Production should use Redis for distributed rate limiting

## Authentication Strategy

### Broker Authentication Flow

PingPoint separates login from signup to prevent unauthorized account creation:

**Signup Flow (new accounts):**
```
1. User enters email on /signup page
2. POST /api/brokers/signup creates account
3. Server generates verification token (48h TTL)
4. Verification email sent automatically
5. User clicks link
6. Server verifies token, creates JWT session
7. JWT stored in HTTP-only cookie
```

**Login Flow (existing accounts):**
```
1. User enters email on /login page
2. POST /api/brokers/login validates account exists
3. If account not found → 404 ACCOUNT_NOT_FOUND (user redirected to signup)
4. If email not verified → 403 EMAIL_NOT_VERIFIED
5. If trusted device → instant login
6. If untrusted device → magic link sent, user clicks to verify
```

**Feature Flag:**
- `AUTH_AUTO_CREATE_BROKER` (default: false)
- When false: `/api/brokers/ensure` returns 404 for unknown emails
- When true: legacy behavior (auto-creates accounts)

**Email Normalization:**
- All auth operations use `email.trim().toLowerCase()`
- Utility: `server/utils/normalizeEmail.ts`

**Rate Limiting:**
| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/brokers/signup` | 5 requests | 60 seconds |
| `/api/brokers/login` | 10 requests | 60 seconds |
| `/api/brokers/send-verification` | 5 requests | 60 seconds |

All broker API calls:
1. Extract JWT from cookie
2. Verify signature and expiration
3. Load broker from database
4. Scope all queries by `brokerId`

### Driver Authentication Flow

```
1. Broker assigns driver to load
2. System generates unique driverToken
3. Magic link sent to driver (SMS/email)
4. Driver accesses load via token URL
5. Token validated on each request
```

Driver API calls:
1. Extract token from URL parameter
2. Look up load by `driverToken`
3. Verify load exists and has assigned driver
4. Validate ownership before mutations

### Public Tracking Flow

```
1. Load created with trackingToken
2. Broker shares tracking URL
3. Customer accesses via token
4. Read-only data returned
```

Public API calls:
1. Extract token from URL parameter
2. Look up load by `trackingToken`
3. Check TTL (if delivered)
4. Return safe response shape

## Admin Authentication

Separate from broker authentication:

- Uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` environment variables
- Separate cookie: `pingpoint_admin_session`
- 24-hour session expiration
- Not connected to broker accounts

## Environment Variables

### Security Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Required | Secret for signing JWT tokens |
| `PUBLIC_TRACKING_TTL_DAYS` | 7 | Days after delivery before tracking link expires |
| `PUBLIC_TRACKING_RPM` | 60 | Rate limit for public tracking (requests/min) |
| `GPS_MAX_ACCURACY_METERS` | 5000 | Maximum acceptable GPS accuracy |
| `GPS_MAX_FUTURE_SKEW_SECONDS` | 300 | Maximum timestamp in future (seconds) |
| `GPS_MAX_AGE_HOURS` | 24 | Maximum ping age (hours) |
| `GPS_MAX_SPEED_MPH` | 120 | Maximum speed before anti-teleport triggers |
| `TRACKING_PING_RPM` | 120 | Rate limit for ping endpoint (requests/min) |

## Security TODOs

Future security enhancements:

- [ ] **Token hashing**: Store token hashes instead of plaintext for new tokens
- [ ] **PostGIS/Geofencing**: Server-side coordinate validation against known locations
- [ ] **WAF/CDN caching**: Edge caching for public tracking responses
- [ ] **Redis rate limiting**: Distributed rate limiting for multi-instance deployments
- [ ] **Anomaly scoring**: ML-based detection of suspicious ping patterns
- [ ] **Token rotation**: Allow brokers to regenerate tracking tokens
- [ ] **Audit logging**: Comprehensive audit trail to database

## Webhook Security

### Signature Verification

Outgoing webhooks include HMAC signatures:

```
X-PingPoint-Signature: sha256=<signature>
```

Recipients should verify:
```javascript
const expectedSignature = crypto
  .createHmac('sha256', webhookSecret)
  .update(requestBody)
  .digest('hex');

if (signature !== `sha256=${expectedSignature}`) {
  throw new Error('Invalid signature');
}
```

### Incoming Webhooks (Stripe)

Stripe webhooks verified using:
```typescript
const event = stripe.webhooks.constructEvent(
  body,
  signature,
  process.env.STRIPE_WEBHOOK_SECRET
);
```

## Data Protection

### Sensitive Data Handling

- Passwords: Not stored (passwordless auth)
- Tokens: High-entropy, cryptographically random
- API keys: Environment variables only
- Payment data: Handled by Stripe (PCI compliant)

### Logging

Sensitive data excluded from logs:
- Session tokens truncated
- Full tokens never logged
- API keys masked

## Input Validation

All inputs validated using Zod schemas:

```typescript
const loadSchema = z.object({
  shipperName: z.string().min(1).max(255),
  rateAmount: z.string().regex(/^\d+(\.\d{2})?$/),
  // ...
});
```

Invalid inputs return `400 Bad Request`.

## SQL Injection Prevention

Drizzle ORM uses parameterized queries:

```typescript
// Safe - parameterized
await db.query.loads.findFirst({
  where: eq(loads.id, loadId)
});

// Never do this
// db.execute(`SELECT * FROM loads WHERE id = '${loadId}'`)
```

## XSS Prevention

React auto-escapes rendered content:

```jsx
// Safe - content is escaped
<div>{userInput}</div>

// Dangerous - avoid unless sanitized
<div dangerouslySetInnerHTML={{ __html: userInput }} />
```

## CORS Configuration

API allows credentials from same origin:

```typescript
app.use(cors({
  origin: true,
  credentials: true
}));
```

Public tracking endpoints allow any origin (read-only data).

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public issue
2. Email security concerns to the maintainers
3. Include steps to reproduce
4. Allow time for fix before disclosure

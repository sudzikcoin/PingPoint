# Security

## Authentication

### Session Management

PingPoint uses JWT tokens stored in HTTP-only cookies:

```
Cookie: pingpoint_session=<jwt>
```

**Security properties:**
- `httpOnly: true` - Not accessible via JavaScript
- `secure: true` - HTTPS only (in production)
- `sameSite: lax` - CSRF protection
- 24-hour expiration

### Passwordless Login

Authentication uses email-based magic links:

1. User enters email
2. Server generates verification token (expires in 15 minutes)
3. Link sent via email
4. User clicks link to authenticate
5. JWT session cookie set

**No passwords are stored.**

### Admin Authentication

Admin panel uses separate credentials:

- Configured via `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- Separate cookie: `pingpoint_admin_session`
- Should use strong, unique password
- Not connected to broker accounts

## Authorization

### Multi-Tenant Data Isolation

All data is scoped by `brokerId`:

```typescript
// Example: Get loads for authenticated broker
const loads = await db.query.loads.findMany({
  where: eq(loads.brokerId, broker.id) // Always filtered
});
```

Brokers cannot access other brokers' data.

### Token-Based Access

- **Driver Token**: Access only to assigned load
- **Public Token**: Read-only access to load tracking

Tokens are:
- Randomly generated (cryptographically secure)
- Load-specific
- Cannot access other loads

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
- Tokens: Stored as plain text (random, high-entropy)
- API keys: Environment variables only
- Payment data: Handled by Stripe (PCI compliant)

### Environment Variables

Secrets stored in:
- `.env` file (development, gitignored)
- Replit Secrets (production)

**Never commit secrets to repository.**

### Logging

Sensitive data excluded from logs:
- Session tokens truncated
- Passwords never logged
- API keys masked

## Rate Limiting

Protection against abuse:

| Endpoint | Limit |
|----------|-------|
| Email verification | 5/minute |
| Login attempts | 10/minute |
| Driver pings | 1/30s per load |
| General API | 100/minute |

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

## Security Recommendations

### For Operators

1. **Use strong secrets** - Generate random values for SESSION_SECRET, JWT_SECRET
2. **Enable HTTPS** - Required for secure cookies
3. **Monitor logs** - Watch for unusual activity
4. **Keep dependencies updated** - Run `npm audit` regularly

### For Development

1. **Never commit secrets**
2. **Use `.env.example`** with placeholder values
3. **Run security scans** - `npm audit`, Snyk, etc.
4. **Review PRs** for security issues

## Reporting Security Issues

If you discover a security vulnerability:

1. **Do not** open a public issue
2. Email security concerns to the maintainers
3. Include steps to reproduce
4. Allow time for fix before disclosure

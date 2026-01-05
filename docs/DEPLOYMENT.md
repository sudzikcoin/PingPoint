# Deployment Guide

## Replit Deployment

PingPoint is designed to run on Replit with minimal configuration.

### Initial Setup

1. **Fork or import the repository** into Replit
2. **Configure Secrets** (Replit's environment variables):
   - Click the "Secrets" tab in the sidebar
   - Add all required environment variables (see [SETUP.md](SETUP.md))

### Required Secrets

```
DATABASE_URL=postgresql://...
SESSION_SECRET=your-random-secret
JWT_SECRET=another-random-secret
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
RESEND_API_KEY=re_...
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=secure-password
```

### Database

Replit provides a built-in PostgreSQL database:
- The `DATABASE_URL` is automatically available
- Use the Database tab to view/edit data
- Migrations run automatically on server start

### Running

1. Click **Run** to start the application
2. The app will be available at `https://your-repl.replit.app`
3. Check the console for startup logs

### Publish (Deploy)

1. Click **Deploy** in the top-right
2. Choose "Static" or "Reserved VM" based on needs
3. Configure custom domain if desired

## Stripe Webhook Configuration

### Setup Webhook Endpoint

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click **Add endpoint**
3. Enter URL: `https://your-app.replit.app/api/stripe/webhook`
4. Select events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`

### Get Webhook Secret

1. After creating the endpoint, click on it
2. Click **Reveal** under "Signing secret"
3. Copy the `whsec_...` value
4. Add it as `STRIPE_WEBHOOK_SECRET` in Replit Secrets

### Verify Webhook

Test by creating a test checkout:
1. Log in as a broker
2. Go to Billing > Upgrade
3. Complete a test payment
4. Check server logs for webhook processing

## Environment-Specific Configuration

### Development
```
NODE_ENV=development
```
- Detailed error messages
- Hot reloading enabled
- Stripe test mode

### Production
```
NODE_ENV=production
```
- Minified error responses
- Optimized builds
- Stripe live mode

## Custom Domain

### Replit Custom Domains

1. In Deploy settings, click **Custom Domain**
2. Enter your domain (e.g., `app.pingpoint.com`)
3. Add the provided DNS records to your domain registrar
4. Wait for SSL certificate provisioning

### Update APP_URL

If using a custom domain, set:
```
APP_URL=https://app.pingpoint.com
```

This ensures email links use the correct domain.

## Monitoring

### Server Logs

View in the Replit console or:
```bash
# If SSH access available
tail -f /var/log/app.log
```

### Key Log Messages

Successful startup:
```
[DB] Database connection established
[DB] Database is up to date
[ENV] Email sending: ENABLED
[ADMIN] Admin login: ENABLED
[Exception] Starting periodic exception scanning every 5 minutes
5:00:00 AM [express] serving on port 5000
```

### Health Check

```bash
curl https://your-app.replit.app/api/health
# Returns: {"status":"ok"}
```

## Scaling Considerations

### Database Connections

Replit's PostgreSQL has connection limits. For high traffic:
- Implement connection pooling
- Consider PgBouncer

### Background Jobs

The exception scanner runs every 5 minutes. For higher load:
- Consider external job queue (e.g., Redis + BullMQ)
- Separate worker process

### Static Assets

For better performance:
- Use CDN for static files
- Enable caching headers

## Backup & Recovery

### Database Backups

Replit provides automatic backups. For manual backup:
```bash
pg_dump $DATABASE_URL > backup.sql
```

### Restore
```bash
psql $DATABASE_URL < backup.sql
```

## Troubleshooting Deployment

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for common issues.

### Common Deployment Issues

1. **App won't start**
   - Check for missing environment variables
   - Verify DATABASE_URL is correct

2. **Stripe webhooks failing**
   - Verify webhook URL is correct
   - Check STRIPE_WEBHOOK_SECRET matches

3. **Emails not sending**
   - Verify RESEND_API_KEY is set
   - Check Resend dashboard for errors

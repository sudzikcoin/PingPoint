# Troubleshooting Guide

## Analytics Issues

### Analytics Page Stuck on "Loading..."

**Symptoms:**
- Analytics page shows infinite loading spinner
- "Loading analytics..." message never goes away

**Causes & Solutions:**

1. **Session expired or missing**
   ```bash
   # Check session status
   curl -X GET "https://your-app.replit.app/api/debug/session" \
     -H "Cookie: pingpoint_session=YOUR_TOKEN"
   ```
   - If returns `401`, you need to log in again
   - Navigate to `/app/login` and re-authenticate

2. **API returning error**
   ```bash
   # Check analytics endpoint
   curl -X GET "https://your-app.replit.app/api/analytics/overview?from=2024-01-01&to=2024-01-31" \
     -H "Cookie: pingpoint_session=YOUR_TOKEN"
   ```
   - Check for error messages in response
   - Verify date format is ISO 8601

3. **Browser console errors**
   - Open browser DevTools (F12)
   - Check Console tab for JavaScript errors
   - Check Network tab for failed requests

### CO2 Values Showing as Null

**This is expected behavior** when stops don't have GPS coordinates.

CO2 is calculated from:
1. Stop coordinates (lat/lng)
2. Haversine distance between stops
3. Emission factor (default 1.68 kg/mile)

**To enable CO2 tracking:**
- Ensure stops have `lat` and `lng` values
- Coordinates are set when drivers check in with GPS enabled

## Authentication Issues

### Can't Log In

1. **Check email delivery**
   - Look in spam/junk folder
   - Verify RESEND_API_KEY is configured

2. **Check server logs for verification link**
   - If email is disabled, the link is logged to console

3. **Verify email format**
   - Must be valid email address
   - Check for typos

### Session Keeps Expiring

- Sessions expire after 24 hours
- Check browser isn't blocking cookies
- Ensure using HTTPS in production

## Stripe Issues

### Webhook Not Firing

1. **Verify webhook URL**
   - Must be `https://your-app.replit.app/api/stripe/webhook`
   - Must be accessible from internet (not localhost)

2. **Check webhook secret**
   - Must match `STRIPE_WEBHOOK_SECRET` in environment
   - Get from Stripe Dashboard > Webhooks > endpoint > Signing secret

3. **Check event types**
   - Ensure subscribed to correct events
   - Common: `checkout.session.completed`, `invoice.payment_succeeded`

4. **View webhook logs**
   - Stripe Dashboard > Webhooks > endpoint > Webhook attempts
   - Check for error messages

### Payment Not Recorded

1. Check webhook is receiving events
2. Check server logs for processing errors
3. Verify customer email matches broker email

## Tracking Issues

### Driver Pings Not Showing

1. **Check driver token**
   - Token must be valid and not expired
   - Token is load-specific

2. **Check rate limiting**
   - Pings limited to 1 per 30 seconds per load
   - Wait and retry

3. **Check location permissions**
   - Driver device must allow GPS
   - Browser must allow location access

4. **Check network connectivity**
   - Pings require internet connection

### Public Tracking Link Not Working

1. **Verify token**
   - Check `publicToken` on load is set
   - Token is in URL path: `/track/{token}`

2. **Load must exist**
   - Deleted loads won't track
   - Archived loads may have limited data

3. **Check CORS**
   - Public endpoint should allow any origin
   - Check browser console for CORS errors

## Database Issues

### Connection Failed

1. **Check DATABASE_URL**
   - Must be valid PostgreSQL connection string
   - Format: `postgresql://user:pass@host:port/database`

2. **Check database is running**
   - Replit database should auto-start
   - Check Replit's Database tab

3. **Check connection limit**
   - Too many connections can cause failures
   - Restart the app to release connections

### Migration Errors

1. **Check schema syntax**
   - Review `shared/schema.ts` for errors
   - Run `npm run db:generate` to check

2. **Rollback if needed**
   - Replit provides checkpoint rollback
   - Or manually revert schema changes

## Performance Issues

### Slow API Responses

1. **Check database queries**
   - Enable query logging
   - Look for missing indexes

2. **Check server resources**
   - Replit VMs have limited CPU/memory
   - Consider upgrading plan

3. **Optimize queries**
   - Add indexes for common filters
   - Limit result sets with pagination

### High Memory Usage

1. **Check for memory leaks**
   - Monitor over time
   - Restart if grows continuously

2. **Reduce query size**
   - Don't load entire tables
   - Use pagination

## Common Error Messages

### "Not authenticated"
- Session expired or missing
- Log in again at `/app/login`

### "Rate limited"
- Too many requests
- Wait before retrying

### "Load not found"
- Invalid load ID
- Load may have been deleted

### "Invalid token"
- Driver/public token is incorrect
- Token may have been regenerated

### "Internal server error"
- Check server logs for details
- May be database or code error

## Getting Help

1. **Check server logs** in Replit console
2. **Check browser DevTools** for client errors
3. **Search existing issues** in repository
4. **Open new issue** with:
   - Steps to reproduce
   - Expected vs actual behavior
   - Relevant log messages
   - Browser/environment info

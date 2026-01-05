# API Reference

Base URL: `https://your-app.replit.app` (or `http://localhost:5000` for development)

All authenticated broker endpoints require the `pingpoint_session` cookie.

## Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/brokers/send-verification` | 5 requests | 1 minute |
| `/api/brokers/verify` | 10 requests | 1 minute |
| `/api/driver/:token/ping` | 1 request | 30 seconds per load |
| General API | 100 requests | 1 minute per user |

---

## Authentication

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/brokers/ensure` | Create or get broker by email |
| POST | `/api/brokers/send-verification` | Send verification email |
| POST | `/api/brokers/verify` | Verify email token |
| GET | `/api/brokers/me` | Get current broker profile |
| PATCH | `/api/brokers/me` | Update broker profile |
| POST | `/api/brokers/logout` | Clear session |

## Loads

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loads` | List broker's loads (with filters) |
| POST | `/api/loads` | Create new load |
| GET | `/api/loads/:id` | Get load details |
| PATCH | `/api/loads/:id` | Update load |
| DELETE | `/api/loads/:id` | Delete load |
| POST | `/api/loads/:id/archive` | Archive load |
| GET | `/api/loads/archived` | List archived loads |
| GET | `/api/loads/:id/pings` | Get tracking pings for load |

### Query Parameters for GET /api/loads
- `status` - Filter by status (CREATED, IN_TRANSIT, DELIVERED, etc.)
- `driverId` - Filter by assigned driver
- `search` - Search by load number
- `page`, `limit` - Pagination

## Stops

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loads/:loadId/stops` | List stops for load |
| POST | `/api/loads/:loadId/stops` | Add stop to load |
| PATCH | `/api/stops/:id` | Update stop |
| DELETE | `/api/stops/:id` | Delete stop |

## Drivers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/drivers` | List broker's drivers |
| POST | `/api/drivers` | Create driver |
| GET | `/api/drivers/:id` | Get driver details |
| PATCH | `/api/drivers/:id` | Update driver |
| DELETE | `/api/drivers/:id` | Delete driver |
| GET | `/api/loads/recommend-drivers` | Get recommended drivers for new load |

## Shippers & Receivers

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/shippers` | List shippers |
| POST | `/api/shippers` | Create shipper |
| GET | `/api/receivers` | List receivers |
| POST | `/api/receivers` | Create receiver |

## Driver Interface (Token-Based)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/driver/:token` | Get assigned load |
| POST | `/api/driver/:token/ping` | Submit location ping |
| PATCH | `/api/driver/:token/stop/:stopId` | Update stop status |
| GET | `/api/driver/:token/rewards` | Get loyalty points balance |

## Public Tracking (No Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/track/:token` | Get public load view |
| GET | `/api/public/:token` | Alias for public tracking |
| GET | `/api/public/:token/pings` | Get location history |

## Analytics

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/overview` | Get metrics overview |
| GET | `/api/analytics` | Alias for overview |
| GET | `/api/analytics/loads` | Get paginated loads with analytics |
| GET | `/api/analytics/loads-detail` | Alias for loads |
| GET | `/api/analytics/loads.csv` | Export loads as CSV |

### Query Parameters
- `from`, `to` - ISO date range
- `page`, `limit` - Pagination (for /loads)

## Billing

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/billing` | Get current plan & usage |
| POST | `/api/billing/checkout` | Create Stripe checkout session |
| POST | `/api/billing/portal` | Create Stripe customer portal |
| POST | `/api/billing/solana/create` | Create Solana payment intent |
| GET | `/api/billing/solana/:id/status` | Check payment status |
| POST | `/api/billing/promo/validate` | Validate promo code |

## Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks` | List configured webhooks |
| POST | `/api/webhooks` | Create webhook config |
| PATCH | `/api/webhooks/:id` | Update webhook |
| DELETE | `/api/webhooks/:id` | Delete webhook |
| GET | `/api/webhooks/:id/logs` | Get delivery logs |

## Exceptions

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/exceptions` | List active exceptions |
| PATCH | `/api/exceptions/:id/resolve` | Manually resolve exception |

## Admin (Requires Admin Auth)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Admin login |
| GET | `/api/admin/users` | List all brokers |
| GET | `/api/admin/subscriptions` | List subscriptions |
| GET | `/api/admin/audit-logs` | Get audit logs |
| GET | `/api/admin/promotions` | List promotions |

## Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/debug/session` | Verify session status |
| GET | `/api/typeahead/:field` | Get field suggestions |

---

## Example Requests

### Get Analytics Overview

```bash
curl -X GET "https://your-app.replit.app/api/analytics/overview?from=2024-01-01T00:00:00Z&to=2024-01-31T23:59:59Z" \
  -H "Cookie: pingpoint_session=YOUR_SESSION_TOKEN" \
  -H "Accept: application/json"
```

Response:
```json
{
  "totalLoads": 45,
  "deliveredLoads": 38,
  "onTimeLoads": 32,
  "lateLoads": 6,
  "onTimePercent": 84,
  "avgDelayMinutes": 45,
  "avgPickupDwellMinutes": 12,
  "avgDeliveryDwellMinutes": 8,
  "co2TotalKg": 1250.5,
  "byDrivers": [
    {
      "driverId": "uuid",
      "driverName": "John Doe",
      "totalLoads": 15,
      "onTimePercent": 87
    }
  ],
  "byShippers": [...],
  "plan": "PRO",
  "limited": false
}
```

### List Loads

```bash
curl -X GET "https://your-app.replit.app/api/loads?status=IN_TRANSIT&page=1&limit=10" \
  -H "Cookie: pingpoint_session=YOUR_SESSION_TOKEN" \
  -H "Accept: application/json"
```

Response:
```json
{
  "items": [
    {
      "id": "uuid-here",
      "loadNumber": "LD-001",
      "status": "IN_TRANSIT",
      "driverName": "John Doe",
      "stops": [...]
    }
  ],
  "total": 25,
  "page": 1,
  "limit": 10,
  "totalPages": 3
}
```

### Submit Driver Ping

```bash
curl -X POST "https://your-app.replit.app/api/driver/DRIVER_TOKEN/ping" \
  -H "Content-Type: application/json" \
  -d '{
    "lat": 41.8781,
    "lng": -87.6298,
    "accuracy": 10,
    "speed": 65,
    "heading": 180
  }'
```

Response:
```json
{
  "ok": true,
  "pingId": "uuid-here",
  "reward": {
    "type": "FIRST_LOCATION_SHARE",
    "points": 10
  }
}
```

### Create Load

```bash
curl -X POST "https://your-app.replit.app/api/loads" \
  -H "Cookie: pingpoint_session=YOUR_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "shipperName": "Acme Corp",
    "carrierName": "Fast Freight",
    "equipmentType": "DRY_VAN",
    "rateAmount": "1500.00",
    "pickup": {
      "name": "Warehouse A",
      "fullAddress": "123 Main St, Dallas, TX 75001"
    },
    "delivery": {
      "name": "Distribution Center",
      "fullAddress": "456 Oak Ave, Houston, TX 77001"
    }
  }'
```

---

## Error Responses

All errors return JSON with this structure:

```json
{
  "error": "Error message here"
}
```

Common HTTP status codes:
- `400` - Bad request (validation error)
- `401` - Unauthorized (missing/invalid session)
- `403` - Forbidden (insufficient permissions)
- `404` - Not found
- `429` - Rate limited
- `500` - Internal server error

# PingPoint API Documentation

## Base URL
- Development: `http://localhost:5000`
- Production: Your deployed Replit URL

## Authentication
Most broker endpoints require authentication via HTTP-only cookies. Authenticate by:
1. Creating/ensuring a broker via `POST /api/brokers/ensure`
2. Verifying email via `POST /api/brokers/verify`

## Rate Limiting
Sensitive endpoints are rate-limited:
- `/api/brokers/send-verification`: 5 requests/minute
- `/api/brokers/verify`: 10 requests/minute
- `/api/driver/:token/ping`: 60 requests/minute

## Endpoints

### Health
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |

### Broker Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/brokers/ensure` | Create or get broker by email |
| POST | `/api/brokers/send-verification` | Send verification email |
| POST | `/api/brokers/verify` | Verify email token |
| GET | `/api/brokers/me` | Get current broker profile |
| PATCH | `/api/brokers/me` | Update broker profile |
| POST | `/api/brokers/logout` | Clear session |

### Loads (Authenticated)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/loads` | List loads (paginated) |
| GET | `/api/loads/:id` | Get load details |
| POST | `/api/loads` | Create new load |
| PATCH | `/api/loads/:id` | Update load |
| POST | `/api/loads/:id/archive` | Archive load |
| GET | `/api/loads/archived` | List archived loads |
| GET | `/api/loads/export/csv` | Export loads as CSV |

### Driver API (Token-based)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/driver/:token` | Get driver load info |
| POST | `/api/driver/:token/ping` | Submit location ping |
| PATCH | `/api/driver/:token/stop/:stopId` | Update stop status |

### Public Tracking
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/track/:token` | Get public tracking info |

### Typeahead
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/typeahead/:field` | Get field suggestions |

## Request/Response Examples

### Create Load
```json
POST /api/loads
{
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
}
```

### Paginated Response
```json
GET /api/loads?page=1&limit=25
{
  "items": [...],
  "total": 100,
  "page": 1,
  "limit": 25,
  "totalPages": 4
}
```

## Error Responses
All errors return JSON with this structure:
```json
{
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

Common HTTP status codes:
- 400: Bad Request (validation error)
- 401: Unauthorized
- 404: Not Found
- 429: Rate Limited
- 500: Internal Server Error

# PingPoint VPS Deployment Guide

Simple guide to deploy PingPoint on a VPS using Docker Compose.

## What's New in Production Reliability

- **Auto-migrations**: Database tables are created automatically on container start
- **Env validation**: Missing or placeholder config values are detected and logged
- **Healthcheck**: Container reports healthy when `/api/health` returns 200
- **PWA icons**: Custom truck+pin icons for iOS/Android Add-to-Home-Screen

## Hardware Recommendations

### Minimum (Pilot/Small Production)
- **CPU**: 1-2 vCPU
- **RAM**: 2-4 GB
- **Storage**: 20-40 GB SSD

This handles dozens of brokers, thousands of loads, and hundreds of active drivers.

## Prerequisites

- Ubuntu 22.04 (or similar Linux)
- Docker installed
- Docker Compose plugin (`docker compose` command)

### Quick Docker Installation

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin

# Verify
docker --version
docker compose version
```

## Deployment Steps

### 1. Copy Project to Server

```bash
git clone <your-repo-url> pingpoint
cd pingpoint
```

### 2. Configure Environment

Create a `.env` file with these required values:

```bash
# Database password (change this!)
POSTGRES_PASSWORD=your_secure_password_here

# JWT secret for authentication (generate with: openssl rand -base64 32)
JWT_SECRET=your_32_char_plus_secret_here

# Email (for magic link authentication)
RESEND_API_KEY=re_your_resend_api_key
MAIL_FROM=PingPoint <info@yourdomain.com>

# Public URL (important for email links)
PINGPOINT_PUBLIC_URL=https://telematics.suverse.io
```

### 3. Start Services

```bash
docker compose up -d --build
```

The app will:
1. Wait for database to be ready
2. Automatically create all database tables if they don't exist
3. Start serving requests

### 4. Verify Deployment

```bash
# Check containers are running and healthy
docker compose ps

# Check logs for any errors
docker compose logs -f app

# Verify database tables exist
docker compose exec db psql -U pingpoint -d pingpoint -c '\dt'

# Test health endpoint
curl http://localhost:8080/api/health
```

### 5. Access PingPoint

Open in browser: `http://YOUR_SERVER_IP:8080`

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `POSTGRES_PASSWORD` | Yes | Database password |
| `DATABASE_URL` | Auto | Built from POSTGRES_PASSWORD |
| `JWT_SECRET` | Yes | 32+ char secret for JWT signing |
| `RESEND_API_KEY` | No* | Resend.com API key for emails |
| `MAIL_FROM` | No* | Sender address (must match Resend domain) |
| `PINGPOINT_PUBLIC_URL` | Recommended | Base URL for email links |

*Email features disabled if not set

## Troubleshooting

### "relation 'brokers' does not exist"

This means database tables weren't created. The app should auto-create them on startup, but you can force it:

```bash
docker compose exec app npx drizzle-kit push --force
```

### Email sending fails

Check the logs for specific error messages:

```bash
docker compose logs app | grep -i email
```

Common issues:
- `RESEND_API_KEY` is missing or a placeholder value
- `MAIL_FROM` domain doesn't match your Resend verified domain
- Account is on free tier (can only send to verified emails)

### Container unhealthy

```bash
# Check health endpoint manually
docker compose exec app wget -qO- http://localhost:8080/api/health

# View detailed logs
docker compose logs --tail=100 app
```

## Common Operations

### View Logs
```bash
docker compose logs -f app
docker compose logs -f db
```

### Update Application
```bash
git pull
docker compose up -d --build
```

### Backup Database
```bash
docker compose exec db pg_dump -U pingpoint pingpoint > backup.sql
```

### Restore Database
```bash
cat backup.sql | docker compose exec -T db psql -U pingpoint pingpoint
```

### Stop Services
```bash
docker compose down
```

### Full Reset (destroys data!)
```bash
docker compose down -v
docker compose up -d --build
```

## PWA / Add to Home Screen (iOS)

After deploying, users can add PingPoint to their home screen:

1. Open PingPoint in Safari
2. Tap Share button → "Add to Home Screen"
3. The custom truck+pin icon will appear

**Important**: If updating icons, users must:
- Remove the existing home screen shortcut
- Re-add it to get the new icon

iOS caches PWA icons aggressively. The v3 icons use versioned filenames to help with cache busting.

## Adding HTTPS (Recommended for Production)

### Option 1: Nginx + Let's Encrypt

```bash
# Install Nginx and Certbot
sudo apt install nginx certbot python3-certbot-nginx

# Create Nginx config
sudo nano /etc/nginx/sites-available/pingpoint
```

```nginx
server {
    server_name telematics.suverse.io;
    
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Enable site and get SSL
sudo ln -s /etc/nginx/sites-available/pingpoint /etc/nginx/sites-enabled/
sudo certbot --nginx -d telematics.suverse.io
sudo systemctl reload nginx
```

### Option 2: Caddy (Simpler)

```bash
# Install Caddy
sudo apt install caddy

# Configure
echo 'telematics.suverse.io {
    reverse_proxy localhost:8080
}' | sudo tee /etc/caddy/Caddyfile

sudo systemctl restart caddy
```

Caddy automatically obtains and renews SSL certificates.

## Regenerating PWA Icons

If you want to customize the PWA icon:

1. Edit `scripts/generate-pwa-icons.mjs` to change the SVG design
2. Run: `npm run generate:pwa-icons` (or `node scripts/generate-pwa-icons.mjs`)
3. Commit the new icons
4. Rebuild and deploy

The icons use sharp to convert SVG to PNG at multiple sizes.

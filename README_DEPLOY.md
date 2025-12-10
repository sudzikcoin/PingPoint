# PingPoint VPS Deployment Guide

This guide explains how to deploy PingPoint on a VPS (Virtual Private Server) using Docker.

## Hardware Recommendations

### Minimum Requirements (Pilot/Small Production)
| Resource | Specification |
|----------|--------------|
| CPU | 1-2 vCPU |
| RAM | 2-4 GB |
| Storage | 20-40 GB SSD |

This configuration supports:
- Dozens of brokers
- Thousands of loads
- Tens to hundreds of active drivers

### Recommended for Growth
| Resource | Specification |
|----------|--------------|
| CPU | 2-4 vCPU |
| RAM | 4-8 GB |
| Storage | 40-80 GB SSD |

## Prerequisites

1. **VPS with Ubuntu 22.04 LTS** (or similar Linux distribution)
2. **Docker** installed ([Install Docker](https://docs.docker.com/engine/install/ubuntu/))
3. **Docker Compose** plugin installed ([Install Docker Compose](https://docs.docker.com/compose/install/))
4. **Domain name** pointed to your VPS IP (optional but recommended)

### Quick Docker Installation (Ubuntu)

```bash
# Update packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh

# Add your user to docker group
sudo usermod -aG docker $USER

# Install Docker Compose plugin
sudo apt install docker-compose-plugin

# Verify installation
docker --version
docker compose version
```

## Deployment Options

### Option 1: Docker Compose (Recommended)

This option runs PingPoint with Postgres database and Nginx reverse proxy.

#### Step 1: Clone/Copy Project

```bash
# Clone from repository
git clone <your-repo-url> pingpoint
cd pingpoint

# Or copy files to server
scp -r ./pingpoint user@your-vps-ip:/home/user/
```

#### Step 2: Configure Environment

```bash
# Copy environment template
cp .env.production.example .env

# Edit with your values
nano .env
```

**Required environment variables:**
- `POSTGRES_PASSWORD` - Strong database password
- `JWT_SECRET` - Random string for JWT signing (`openssl rand -base64 32`)
- `RESEND_API_KEY` - Your Resend API key for emails
- `PINGPOINT_PUBLIC_URL` - Your public domain (e.g., `https://pingpoint.example.com`)

#### Step 3: Start Services

```bash
# Build and start all services
docker compose up -d

# Check status
docker compose ps

# View logs
docker compose logs -f app
```

#### Step 4: Run Database Migrations

```bash
# Push schema to database (run once after first deployment or schema changes)
# Note: This requires tsx which is a dev dependency, so we run it from source
docker compose exec app npx drizzle-kit push

# Or if you need to run migrations from the host machine:
# DATABASE_URL=postgres://pingpoint:yourpassword@localhost:5432/pingpoint npx drizzle-kit push
```

**Important**: Make sure to run migrations after the first deployment and whenever the schema changes.

### Option 2: Standalone Docker (Without Compose)

Use this if you have an existing Postgres database or want to run without Nginx.

```bash
# Build the image
docker build -t pingpoint-app .

# Run with external database
docker run -d \
  --name pingpoint-app \
  --restart unless-stopped \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgres://user:password@your-db-host:5432/pingpoint \
  -e JWT_SECRET=your_jwt_secret \
  -e RESEND_API_KEY=your_resend_key \
  -e PINGPOINT_PUBLIC_URL=https://yourdomain.com \
  -v pingpoint-uploads:/app/uploads \
  pingpoint-app
```

## Common Operations

### View Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f app
docker compose logs -f db
docker compose logs -f nginx
```

### Update Application

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose build app
docker compose up -d app
```

### Backup Database

```bash
# Create backup
docker compose exec db pg_dump -U pingpoint pingpoint > backup_$(date +%Y%m%d).sql

# Restore backup
docker compose exec -T db psql -U pingpoint pingpoint < backup_20241210.sql
```

### Stop Services

```bash
# Stop all services (preserves data)
docker compose stop

# Stop and remove containers (preserves volumes)
docker compose down

# Stop and remove everything including volumes (DESTRUCTIVE!)
docker compose down -v
```

## Setting Up HTTPS (Recommended)

### Option A: Using Certbot with Nginx

1. **Install Certbot on VPS:**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   ```

2. **Update Nginx config** in `deploy/nginx.conf`:
   - Change `server_name _;` to `server_name yourdomain.com;`

3. **Restart Nginx:**
   ```bash
   docker compose restart nginx
   ```

4. **Run Certbot:**
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

### Option B: Using Caddy (Alternative)

If you prefer automatic HTTPS, replace Nginx with Caddy:

```yaml
# In docker-compose.yml, replace nginx service with:
caddy:
  image: caddy:alpine
  container_name: pingpoint-caddy
  restart: unless-stopped
  ports:
    - "80:80"
    - "443:443"
  volumes:
    - ./deploy/Caddyfile:/etc/caddy/Caddyfile:ro
    - caddy_data:/data
    - caddy_config:/config
  networks:
    - pingpoint-network
```

Create `deploy/Caddyfile`:
```
yourdomain.com {
    reverse_proxy app:8080
}
```

## Troubleshooting

### App Won't Start

```bash
# Check logs
docker compose logs app

# Common issues:
# - DATABASE_URL incorrect
# - Database not ready (wait for db health check)
# - Port already in use
```

### Database Connection Failed

```bash
# Verify db is running
docker compose ps db

# Check db logs
docker compose logs db

# Test connection
docker compose exec db psql -U pingpoint -d pingpoint -c "SELECT 1;"
```

### Nginx 502 Bad Gateway

```bash
# Check if app is running
docker compose ps app

# Verify app is healthy
docker compose exec app wget --spider http://localhost:8080/api/health
```

## Security Checklist

Before going to production:

- [ ] Change all default passwords in `.env`
- [ ] Generate strong `JWT_SECRET`
- [ ] Enable HTTPS/TLS
- [ ] Configure firewall (only allow 80, 443, and SSH)
- [ ] Set up automated backups
- [ ] Enable automatic security updates on VPS
- [ ] Consider rate limiting in Nginx config

## Firewall Configuration (UFW)

```bash
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

## Support

For issues specific to deployment, check the Docker and Docker Compose logs. For application issues, refer to the main README and API documentation in `docs/API.md`.

# PingPoint VPS Deployment Guide

Simple guide to deploy PingPoint on a VPS using Docker Compose.

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

```bash
cp .env.production.example .env
nano .env
```

Fill in these values:
- `POSTGRES_PASSWORD` - Database password
- `JWT_SECRET` - Run `openssl rand -base64 32` to generate
- `RESEND_API_KEY` - Your Resend API key
- `PINGPOINT_PUBLIC_URL` - Your server URL (e.g., `http://YOUR_IP:8080`)

### 3. Start Services

```bash
docker compose up -d
```

### 4. Check Status

```bash
docker compose ps
docker compose logs -f app
```

### 5. Access PingPoint

Open in browser: `http://YOUR_SERVER_IP:8080`

## Common Operations

### View Logs
```bash
docker compose logs -f app
docker compose logs -f db
```

### Update Application
```bash
git pull
docker compose build app
docker compose up -d app
```

### Backup Database
```bash
docker compose exec db pg_dump -U pingpoint pingpoint > backup.sql
```

### Stop Services
```bash
docker compose down
```

## Adding HTTPS (Later)

To use a custom domain with HTTPS:
1. Point your domain DNS to the server IP
2. Install Nginx or Caddy as a reverse proxy in front of PingPoint
3. Use Let's Encrypt for free SSL certificates

For now, this guide covers running PingPoint directly on port 8080 via Docker.

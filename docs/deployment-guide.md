# Photonic Wallet — VPS Deployment Guide

## Overview

Photonic Wallet can be deployed as:
1. **Web App** — Static SPA served via nginx/Caddy (recommended for public access)
2. **Desktop App** — Tauri binary (for standalone distribution)
3. **CLI Tool** — `photonic-factory` for batch minting operations

This guide covers **web app deployment** on a VPS.

---

## Prerequisites

- **VPS**: Ubuntu 22.04+ (2 CPU, 4 GB RAM, 20 GB SSD minimum)
- **Docker** and **Docker Compose** installed
- **Domain name** pointed to your VPS IP (for HTTPS)
- **ElectrumX server** running and accessible (WebSocket endpoint)

---

## Quick Start (Docker)

```bash
# Clone and enter the repo
git clone https://github.com/AustinWilloughby/Photonic-Wallet.git
cd Photonic-Wallet

# Copy environment template
cp .env.example .env
# Edit .env with your settings

# Option A: Plain HTTP (port 3000, behind your own reverse proxy)
docker compose up -d photonic-wallet

# Option B: With Caddy auto-HTTPS (ports 80 + 443)
# First edit docker/Caddyfile — replace wallet.yourdomain.com with your domain
docker compose --profile with-caddy up -d
```

The wallet will be accessible at:
- **Option A**: `http://your-vps-ip:3000`
- **Option B**: `https://wallet.yourdomain.com`

---

## Manual Build (No Docker)

```bash
# Install pnpm
corepack enable && corepack prepare pnpm@latest --activate

# Install dependencies
pnpm install

# Build
pnpm build

# The built static files are in packages/app/dist/
# Serve with any static file server:
npx serve packages/app/dist -l 3000
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│                    VPS                       │
│                                             │
│  ┌─────────┐      ┌──────────────────┐      │
│  │  Caddy   │─────▶│  nginx (in Docker)│     │
│  │  :443    │      │  serves dist/    │      │
│  └─────────┘      └──────────────────┘      │
│                                             │
└─────────────────────────────────────────────┘
         │
         │ WebSocket (wss://)
         ▼
┌─────────────────────┐
│   ElectrumX Server  │
│   (external or      │
│    self-hosted)      │
└─────────────────────┘
```

The wallet is a **client-side SPA**. All blockchain operations happen in the browser via WebSocket connections to an ElectrumX server. The VPS only serves static files.

---

## ElectrumX Server Configuration

The wallet needs a WebSocket-enabled ElectrumX server. Options:

### Use a Public Server
The wallet ships with default server configurations. For testing, this is sufficient.

### Self-Host (Recommended for Production)
See the [RXinDexer](https://github.com/AustinWilloughby/RXinDexer) repository for a full ElectrumX setup with Glyph indexing support.

```bash
# Example: Run ElectrumX alongside the wallet
docker compose -f docker-compose.yml -f path/to/electrumx/docker-compose.yml up -d
```

---

## HTTPS Requirements

**HTTPS is required** for WebCrypto API functions (encryption, key derivation) when not on localhost. Options:

1. **Caddy** (included in docker-compose): Automatic Let's Encrypt certificates
2. **Cloudflare**: DNS proxy with automatic SSL
3. **Certbot**: Manual certificate management with nginx

---

## Security Checklist

- [ ] HTTPS enabled (required for crypto operations)
- [ ] Security headers configured (included in nginx.conf)
- [ ] ElectrumX connection uses WSS (not plain WS)
- [ ] Firewall allows only ports 80, 443
- [ ] Docker runs as non-root (configured in Dockerfile)
- [ ] Regular security updates on VPS OS

---

## Monitoring

```bash
# Check container health
docker compose ps

# View logs
docker compose logs -f photonic-wallet

# Check nginx access logs
docker compose exec photonic-wallet cat /var/log/nginx/access.log
```

---

## Updating

```bash
git pull
docker compose build --no-cache
docker compose up -d
```

---

## V2 Hard Fork Support

Photonic Wallet fully supports the V2 hard fork (activation block 410,000):
- Per-algorithm dMint contract bytecodes (Blake3, K12, SHA256d)
- On-chain PoW validation via OP_BLAKE3/OP_K12
- Container tokens, authority tokens, WAVE naming
- Encrypted content with timelocked reveal

No additional configuration is needed for V2 features.

# DelovaHome Relay Server

**Zero-knowledge relay for secure remote access to your DelovaHome hub.**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)

## 🔐 What is this?

A lightweight WebSocket relay server that enables remote access to your DelovaHome smart home hub **without port forwarding** and **without compromising your privacy**.

### Key Features

- ✅ **Zero-Knowledge Architecture**: Cannot decrypt your traffic
- ✅ **End-to-End Encrypted**: All data encrypted between app and hub
- ✅ **No Data Storage**: Stateless routing only
- ✅ **Lightweight**: < 50MB memory, runs on minimal VPS
- ✅ **Open Source**: Fully auditable code
- ✅ **Self-Hostable**: Run your own for maximum privacy

## 🏗️ How It Works

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│             │  WSS    │              │  WSS    │             │
│  Mobile App │◄───────►│    Relay     │◄───────►│  Hub (Home) │
│  (Remote)   │  E2E    │   (Cannot    │  E2E    │  (Local)    │
│             │  Encr.  │   Decrypt)   │  Encr.  │             │
└─────────────┘         └──────────────┘         └─────────────┘
```

The relay server:
- ✅ Routes encrypted WebSocket messages
- ✅ Maintains connection mapping (Hub ID → WebSocket)
- ❌ Cannot read message contents
- ❌ Does not store any data
- ❌ Has no access to your credentials

## 🚀 Quick Start

### Using Official Relay (Free)

Just enable remote access in your hub settings. That's it!

The hub will automatically connect to `relay.delovahome.com`.

### Self-Hosting (Maximum Privacy)

#### 1. Clone & Install

```bash
git clone https://github.com/delovahome/relay-server.git
cd relay-server
npm install
```

#### 2. Run

```bash
npm start
```

Server runs on port 8080 by default.

#### 3. Configure Hub

In your hub settings (Settings → Cloud & Remote):
- Relay Server URL: `wss://your-domain.com:8080`
- Click "Regenerate Credentials"
- Scan new QR code in app

## 🐳 Docker Deployment

```bash
docker run -d \
  --name delovahome-relay \
  -p 8080:8080 \
  --restart unless-stopped \
  delovahome/relay-server
```

Or with docker-compose:

```yaml
version: '3.8'
services:
  relay:
    image: delovahome/relay-server
    ports:
      - "8080:8080"
    restart: unless-stopped
    environment:
      - RELAY_PORT=8080
```

## ☁️ VPS Deployment

### Recommended Providers

| Provider | Price/Month | Specs | Region |
|----------|-------------|-------|--------|
| [DigitalOcean](https://digitalocean.com) | $6 | 1 vCore, 1GB RAM | Global |
| [Hetzner](https://hetzner.com) | €4.5 | 1 vCore, 2GB RAM | EU |
| [Linode](https://linode.com) | $5 | 1 vCore, 1GB RAM | Global |

### Setup Guide

```bash
# 1. SSH into your VPS
ssh root@your-vps-ip

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# 3. Clone & setup
git clone https://github.com/delovahome/relay-server.git
cd relay-server
npm install

# 4. Setup as service (systemd)
cat > /etc/systemd/system/relay.service <<EOF
[Unit]
Description=DelovaHome Relay Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/root/relay-server
ExecStart=/usr/bin/node relayServer.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

# 5. Start service
systemctl enable relay
systemctl start relay

# 6. Setup HTTPS with Let's Encrypt (optional but recommended)
apt-get install -y certbot
certbot certonly --standalone -d your-domain.com

# 7. Setup Nginx reverse proxy with SSL
apt-get install -y nginx
cat > /etc/nginx/sites-available/relay <<EOF
server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
    }
}
EOF

ln -s /etc/nginx/sites-available/relay /etc/nginx/sites-enabled/
systemctl restart nginx
```

## 📊 Performance

**Capacity** (per 1 vCore, 1GB RAM):
- 1000+ concurrent connections
- 10,000+ messages/second throughput
- < 50MB memory usage

**Latency**:
- Same region: 20-50ms
- Cross-region: 100-200ms
- Negligible overhead (~5ms)

**Bandwidth**:
- Control commands: ~500 bytes
- Camera stream: proxied transparently
- Overhead: ~5%

## 🔒 Security

### What the relay CAN see:
- Hub IDs (random identifiers)
- Connection timestamps
- Message sizes (encrypted)

### What the relay CANNOT see:
- Message contents (E2E encrypted)
- Your devices or home layout
- Passwords or credentials
- Personal data

### Cryptography Details

**Transport Security**: TLS 1.3 (WebSocket over HTTPS)

**Authentication**: HMAC-SHA256 signatures with timestamp

**No Client Data**: Zero storage, all in-memory

**Open Source**: Fully auditable code

## 🛠️ Configuration

Environment variables:

```bash
# Port (default: 8080)
export RELAY_PORT=8080

# Log level (default: info)
export LOG_LEVEL=info

# Max connections per IP (default: 10)
export MAX_CONNECTIONS_PER_IP=10
```

## 📈 Monitoring

**Health Check Endpoint:**
```bash
curl http://localhost:8080/health
```

Response:
```json
{
  "status": "ok",
  "hubs": 42,
  "clients": 128,
  "timestamp": 1234567890
}
```

**Logs:**
```bash
# If running with systemd
journalctl -u relay -f

# If running directly
npm start
```

## 🤝 Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📜 License

MIT License - completely free and open source.

## 🔗 Links

- [Main Hub Repository](https://github.com/delovahome/hub)
- [Privacy Architecture Docs](../PRIVACY_ARCHITECTURE.md)
- [Mobile App](https://github.com/delovahome/mobile)

## 💬 Support

- GitHub Issues: [Report bugs or request features](https://github.com/delovahome/relay-server/issues)
- Discord: [Join our community](https://discord.gg/delovahome)
- Email: support@delovahome.com

---

**Made with ❤️ for privacy-conscious smart home users**


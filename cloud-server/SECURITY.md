# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in the DelovaHome Relay Server, please report it by emailing:

📧 **security@delovahome.com**

**Please do NOT open a public GitHub issue for security vulnerabilities.**

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if available)

### Response Time

- **Initial Response**: Within 48 hours
- **Fix Timeline**: Critical issues within 7 days
- **Credit**: Security researchers will be credited in release notes

## Security Features

### Zero-Knowledge Architecture

The relay server is designed with privacy as a core principle:

✅ **No Decryption**: Cannot decrypt end-to-end encrypted traffic  
✅ **No Storage**: All data is in-memory, nothing persisted  
✅ **Stateless**: No session storage, no user database  
✅ **Open Source**: Fully auditable code  

### What the Relay CAN See

- Hub IDs (random identifiers, not personal data)
- Connection timestamps
- Message sizes (encrypted content)

### What the Relay CANNOT See

- Message contents (E2E encrypted with AES-256-GCM)
- Your home layout or device list
- Passwords or credentials
- Personal identifiable information

### Transport Security

- TLS 1.3 required (no downgrade)
- HMAC-SHA256 authentication
- Timestamp validation (prevents replay attacks)
- Rate limiting per IP

## Security Best Practices

### For Self-Hosting

1. **Always use HTTPS/WSS** (not HTTP/WS)
2. **Enable firewall** (only port 8080/443 open)
3. **Keep Node.js updated** (security patches)
4. **Use strong SSL certificates** (Let's Encrypt recommended)
5. **Monitor logs** for suspicious activity
6. **Set resource limits** (prevent DoS)

### Example Firewall Rules (ufw)

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp   # SSH
ufw allow 443/tcp  # HTTPS/WSS
ufw enable
```

### Docker Security

```bash
# Run as non-root
docker run --user 1001:1001 ...

# Read-only filesystem
docker run --read-only ...

# Drop capabilities
docker run --cap-drop ALL ...

# Resource limits
docker run --memory 256m --cpus 0.5 ...
```

## Known Limitations

- **No DDoS protection built-in** (use Cloudflare or similar)
- **Single-threaded** (horizontal scaling via load balancer)
- **In-memory state** (restart clears connections)

## Recommended Infrastructure

### Minimal Setup
- Behind Cloudflare (DDoS protection)
- SSL termination at Nginx
- Rate limiting at reverse proxy level

### Production Setup
- Load balancer (Nginx/HAProxy)
- Multiple relay instances
- Health checks + auto-restart
- Log aggregation (ELK stack)
- Monitoring (Prometheus + Grafana)

## Security Checklist

Before deploying:

- [ ] SSL/TLS configured (HTTPS only)
- [ ] Firewall rules set
- [ ] Non-root user running service
- [ ] Resource limits configured
- [ ] Logging enabled
- [ ] Health checks configured
- [ ] Automatic security updates enabled
- [ ] Monitoring alerts set up

## Audit History

- **2024-02**: Initial security review
- **2024-02**: Penetration test (no critical issues)
- **2024-02**: Zero-knowledge architecture verification

## Compliance

- ✅ **GDPR**: No personal data stored
- ✅ **Zero-Knowledge**: Cannot access user data
- ✅ **Open Source**: Full transparency
- ✅ **Privacy by Design**: Built-in from day 1

## Updates

Security updates are released as soon as possible:

- **Critical**: Within 24-48 hours
- **High**: Within 7 days
- **Medium/Low**: Next minor version

Subscribe to releases on GitHub to be notified.

---

Last updated: February 2024

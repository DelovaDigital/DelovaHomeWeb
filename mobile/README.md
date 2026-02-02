# DelovaHome Mobile App

**Privacy-first smart home app met automatische lokaal/remote switching**

## 🔐 Privacy & Security

### Lokaal-First Architectuur

De app gebruikt een **intelligente verbindingsmanager** die automatisch kiest tussen:

1. **Lokaal (WiFi)**: Directe verbinding via mDNS discovery
   - ✅ Snelst (10-50ms latency)
   - ✅ Geen internet nodig
   - ✅ 100% privé

2. **Remote (Tunnel)**: End-to-end encrypted via relay
   - ✅ Werkt overal (4G/5G/WiFi buiten huis)
   - ✅ Geen port forwarding
   - ✅ Zero-knowledge relay (kan data niet lezen)

### E2E Encryptie

Wanneer je via tunnel verbindt:
- **ECDH key exchange** (secp256k1)
- **AES-256-GCM encryptie**
- **PBKDF2 key derivation** (100k iterations)
- Relay server kan **geen data decrypten**

## 🚀 Setup

### 1. Flutter Dependencies

```bash
flutter pub get
```

Nieuwe dependencies voor tunnel:
- `web_socket_channel` - WebSocket communicatie
- `pointycastle` - Cryptografie (ECDH, AES-GCM)
- `crypto` - Hashing en key derivation
- `qr_code_scanner` - QR code scanning

### 2. Build & Run

```bash
# Android
flutter run

# iOS (requires Mac + Xcode)
flutter run --device-id <your-iphone-id>

# Release build
flutter build apk --release
```

## 📱 Gebruik

### Eerste Setup

1. Open app
2. Tik op "Scan Hub QR Code"
3. Scan de QR-code van je hub (Settings → Cloud & Remote)
4. App maakt automatisch E2E encrypted verbinding
5. Klaar!

### Automatische Switching

De app detecteert automatisch waar je bent:

**Thuis (zelfde WiFi als hub)**:
- App → Direct naar hub (lokaal)
- ✅ Super snel, geen relay

**Onderweg (mobiel netwerk)**:
- App → Relay → Hub (tunnel)
- ✅ End-to-end encrypted

## 🏗️ Architectuur

### Key Components

**SecureTunnelClient** (`lib/services/secure_tunnel_client.dart`):
- WebSocket verbinding met relay
- ECDH key exchange
- AES-256-GCM encryptie

**ConnectionManager** (`lib/services/connection_manager.dart`):
- Auto-detect lokaal vs remote
- Fallback naar tunnel
- Transparante API

**Screens**:
- `qr_scanner_screen.dart` - QR scanner voor pairing
- `connection_settings_screen.dart` - Verbinding beheer

## 📜 License

MIT License - Open source


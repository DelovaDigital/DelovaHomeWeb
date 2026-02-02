# Privacy-First Remote Access Architectuur

## 🔐 Filosofie

**Alles blijft lokaal, maar toch overal bereikbaar.**

DelovaHome is gebouwd met privacy als kernprincipe. Anders dan traditionele smart home oplossingen die je data naar de cloud sturen, blijft bij DelovaHome:

- ✅ **100% van je data op jouw hub** (lokaal in je huis)
- ✅ **Alle processing op jouw hardware** (geen cloud AI die meekijkt)
- ✅ **End-to-end encryptie** (alleen jij kan je data lezen)
- ✅ **Zero-knowledge relay** (onze servers zien alleen encrypted packets)

## 🏗️ Architectuur Overzicht

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│                 │         │                  │         │                 │
│  Mobile App     │◄───────►│  Relay Server    │◄───────►│   Hub (Thuis)  │
│  (Onderweg)     │  E2E    │  (Zero-Know)     │  E2E    │   (Raspberry)  │
│                 │  Encr.  │  Encrypted       │  Encr.  │                 │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                      ▲
                                      │
                              Kan NIET decrypten
                              Routeert alleen
```

### Hoe het werkt:

1. **Hub registratie**: Jouw hub genereert unieke credentials (Hub ID + Secret)
2. **Websocket tunnel**: Hub maakt permanente encrypted verbinding met relay
3. **App connectie**: App scant QR-code en krijgt hub credentials
4. **Key exchange**: App en hub doen ECDH key exchange via relay
5. **Session key**: Ze maken gezamenlijk een session key (relay ziet dit niet)
6. **E2E communicatie**: Alle requests/responses zijn AES-256-GCM encrypted

## 🛡️ Security Details

### Cryptografie

**Key Exchange**: ECDH (secp256k1 curve)
- App genereert ephemeral keypair
- Hub genereert ephemeral keypair  
- Ze delen public keys via relay
- Berekenen shared secret (relay kan dit niet)
- Leiden session key af met PBKDF2 (100,000 iteraties)

**Encryptie**: AES-256-GCM
- Symmetric encryption met session key
- GCM mode voor authenticated encryption
- Nieuwe IV voor elk bericht
- Auth tag voorkomt tampering

**Authenticatie**: HMAC-SHA256
- Hub authenticeert met timestamped signature
- Replay attacks voorkomen door timestamp check (5 min window)

### Wat de relay WEL kan zien:
- Hub ID (maar niet wat je thuis hebt)
- Timestamp van verbindingen
- Grootte van packets (maar niet inhoud)

### Wat de relay NIET kan zien:
- Wat voor apparaten je hebt
- Wanneer je lampen aan/uit gaan
- Camera streams
- Je locatie of aanwezigheid
- Je instellingen of scenes
- Wachtwoorden of credentials

## 🏠 Self-Hosted Relay (Maximale Privacy)

Voor absolute privacy kun je je eigen relay draaien:

```bash
# Op je eigen VPS (DigitalOcean, Hetzner, etc.)
git clone https://github.com/delovahome/relay-server.git
cd relay-server
npm install
npm start

# Of met Docker
docker run -p 8080:8080 delovahome/relay-server
```

Dan in hub settings:
- Relay Server URL: `wss://jouw-domain.com:8080`

Nu gaat al je verkeer via je eigen server. DelovaHome ziet helemaal niks meer.

## 📱 App Connectie

### QR Code Pairing

De QR-code bevat:
```json
{
  "type": "delovahome_hub",
  "hubId": "abc123...",
  "accessToken": "xyz789...",
  "timestamp": 1234567890
}
```

- **hubId**: Public identifier (geen gevoelige data)
- **accessToken**: HMAC van hubId met hub secret (eenmalig gebruik)
- **timestamp**: Voor replay protection

### Session Flow

1. App scant QR → krijgt hubId + accessToken
2. App verbindt met relay: `wss://relay.delovahome.com`
3. App stuurt session_init met eigen public key (encrypted)
4. Relay routeert naar hub
5. Hub stuurt public key terug
6. App + Hub berekenen session key
7. Alle volgende requests zijn E2E encrypted met session key

## 🔄 Vergelijking met Andere Oplossingen

### Traditional Cloud (bijv. Google Home, Amazon Alexa)
❌ Al je data gaat naar hun servers  
❌ Ze kunnen meekijken wanneer ze willen  
❌ AI processing in de cloud  
❌ Gaat offline als cloud down is  
✅ Werkt overal zonder setup  

### Home Assistant Cloud (Nabu Casa)
⚠️ Optioneel: end-to-end encrypted  
⚠️ Vertrouwen op Nabu Casa infrastructure  
✅ Support het project  
❌ Betaald ($6.50/maand)  

### VPN / Port Forwarding
✅ Volledig privé  
❌ Complexe setup (router config)  
❌ Statisch IP of DDNS nodig  
❌ VPN overhead  
❌ Vaak geblokkeerd door ISP/carrier  

### **DelovaHome Secure Tunnel** ⭐
✅ Volledig privé (E2E encrypted)  
✅ Zero-knowledge relay  
✅ Gratis (of self-hosted)  
✅ Geen port forwarding  
✅ Werkt altijd (ook op 4G/5G)  
✅ Simpele QR-code setup  

## 🚀 Gebruik

### Hub Setup (eenmalig)

1. Open Settings → Cloud & Remote
2. Klik "Enable" bij Tunnel Status
3. Hub genereert credentials automatisch
4. QR-code verschijnt

### App Pairing

1. Open DelovaHome app
2. Tik op "Add Hub"  
3. Scan QR-code vanaf hub settings
4. App maakt automatisch E2E encrypted verbinding
5. Klaar! Je kunt nu overal je hub bedienen

### Self-Hosted Relay (optioneel)

1. Draai relay op je VPS (zie boven)
2. Settings → Cloud & Remote → Relay Server URL
3. Vul in: `wss://jouw-domain.com:8080`
4. Regenereer credentials (nieuwe QR-code)
5. App opnieuw pairen

## 💰 Kosten

### Officiële Relay (relay.delovahome.com)
- **Gratis** voor persoonlijk gebruik
- Fair use policy: max 1000 requests/uur per hub
- Geen data opslag, alleen routing
- 99.9% uptime SLA

### Self-Hosted
- **$5-10/maand** voor kleine VPS (1 vCore, 1GB RAM)
- Aanbevolen providers: DigitalOcean, Hetzner, Linode
- Onbeperkt aantal hubs/gebruikers
- Volledige controle

## 🔧 Technische Details

### Relay Server Specificaties
- Node.js WebSocket server
- Stateless (geen database)
- In-memory session tracking
- Horizontaal schaalbaar
- < 50MB memory per 1000 clients

### Hub Client
- Auto-reconnect met exponential backoff
- Heartbeat elke 30 seconden
- Session key rotation (optioneel, per 24u)
- Graceful degradation (lokaal blijft werken)

### Network Requirements
- **Hub**: Uitgaande HTTPS/WSS (443) → altijd mogelijk
- **App**: Uitgaande HTTPS/WSS (443) → altijd mogelijk  
- **Geen** poorten openen in router
- **Geen** statisch IP nodig

## 🎯 Use Cases

### Thuis
- Directe lokale verbinding (sneller)
- Tunnel als fallback (als discovery faalt)

### Onderweg
- Tunnel is primary connection
- Geen VPN nodig
- Werkt op mobiel netwerk (4G/5G)

### Vakantie
- Monitor je huis
- Camera streams
- Notifications bij beweging
- Apparaten aan/uit

### Delen met Familie
- Genereer extra QR-codes
- Per gebruiker eigen credentials
- Revoke access door regenereren

## 📊 Performance

Gemiddelde latency (ms):
- **Lokaal**: 10-50ms
- **Tunnel (NL → NL)**: 50-150ms  
- **Tunnel (NL → VS)**: 150-300ms
- **VPN**: 100-500ms

Bandwidth:
- Command (licht aan/uit): ~500 bytes
- Camera stream: ~1-5 Mbps
- Relay overhead: ~5%

## 🔒 Compliance & Privacy

- **GDPR compliant**: Geen personal data op relay
- **No logging**: Alleen errors/warnings
- **No analytics**: Geen tracking
- **Open source**: Code volledig inzichtelijk
- **Self-hosted optie**: Maximale controle

## 🛠️ Troubleshooting

### Hub kan niet verbinden met relay
```bash
# Check of relay bereikbaar is
curl https://relay.delovahome.com/health

# Check hub logs
journalctl -u delovahome -f
```

### App kan geen verbinding maken
1. Check of tunnel enabled is (groen icon)
2. Regenereer credentials (nieuwe QR-code)
3. Check relay URL (juist protocol: wss://)
4. Probeer self-hosted relay

### Langzame verbinding
- Check relay latency: ping relay.delovahome.com
- Overweeg relay dichter bij jou (EU/US/Asia)
- Self-host voor minimale latency

## 📚 Verder Lezen

- [WebSocket Security Best Practices](https://tools.ietf.org/html/rfc6455)
- [ECDH Key Exchange](https://en.wikipedia.org/wiki/Elliptic-curve_Diffie%E2%80%93Hellman)
- [AES-GCM Authenticated Encryption](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
- [Zero-Knowledge Architecture](https://en.wikipedia.org/wiki/Zero-knowledge_proof)

## 🤝 Contributing

Verbeteringen aan de tunnel/relay zijn welkom:

```bash
git clone https://github.com/delovahome/hub.git
cd hub/script
# Edit tunnelClient.js

git clone https://github.com/delovahome/relay-server.git
cd relay-server
# Edit relayServer.js
```

## 📜 License

MIT License - Volledig open source en gratis te gebruiken.

---

**Gemaakt met ❤️ voor privacy-bewuste smart home gebruikers**

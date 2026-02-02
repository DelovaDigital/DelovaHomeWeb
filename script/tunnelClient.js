/**
 * DelovaHome Secure Tunnel Client
 * Zero-knowledge relay for remote access without port forwarding
 * All data is end-to-end encrypted between app and hub
 */

const crypto = require('crypto');
const WebSocket = require('ws');
const EventEmitter = require('events');

class TunnelClient extends EventEmitter {
    constructor(hubId, hubSecret, relayUrl = 'wss://relay.delovahome.com') {
        super();
        this.hubId = hubId;
        this.hubSecret = hubSecret;
        this.relayUrl = relayUrl;
        this.ws = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 5000;
        this.heartbeatInterval = null;
        this.sessionKeys = new Map(); // clientId -> sessionKey
    }

    async connect() {
        try {
            console.log(`[Tunnel] Connecting to relay: ${this.relayUrl}`);
            
            this.ws = new WebSocket(this.relayUrl, {
                headers: {
                    'X-Hub-ID': this.hubId,
                    'X-Hub-Token': await this.generateAuthToken()
                }
            });

            this.ws.on('open', () => this.handleOpen());
            this.ws.on('message', (data) => this.handleMessage(data));
            this.ws.on('error', (err) => this.handleError(err));
            this.ws.on('close', () => this.handleClose());

        } catch (err) {
            console.error('[Tunnel] Connection failed:', err);
            this.scheduleReconnect();
        }
    }

    async generateAuthToken() {
        const timestamp = Date.now();
        const payload = `${this.hubId}:${timestamp}`;
        const signature = crypto
            .createHmac('sha256', this.hubSecret)
            .update(payload)
            .digest('hex');
        return Buffer.from(`${payload}:${signature}`).toString('base64');
    }

    handleOpen() {
        console.log('[Tunnel] Connected to relay');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startHeartbeat();
        this.emit('connected');
    }

    async handleMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            
            switch (message.type) {
                case 'ping':
                    this.send({ type: 'pong', timestamp: Date.now() });
                    break;

                case 'client_request':
                    await this.handleClientRequest(message);
                    break;

                case 'session_init':
                    await this.handleSessionInit(message);
                    break;

                case 'error':
                    console.error('[Tunnel] Relay error:', message.error);
                    break;

                default:
                    console.warn('[Tunnel] Unknown message type:', message.type);
            }
        } catch (err) {
            console.error('[Tunnel] Message handling error:', err);
        }
    }

    async handleSessionInit(message) {
        const { clientId, publicKey } = message;
        
        // Perform ECDH key exchange
        const ecdh = crypto.createECDH('secp256k1');
        const hubPublicKey = ecdh.generateKeys();
        const sharedSecret = ecdh.computeSecret(Buffer.from(publicKey, 'base64'));
        
        // Derive session key using HKDF
        const sessionKey = crypto.pbkdf2Sync(
            sharedSecret,
            'delovahome-session',
            100000,
            32,
            'sha256'
        );

        this.sessionKeys.set(clientId, sessionKey);

        // Send hub public key to client
        this.send({
            type: 'session_init_response',
            clientId,
            publicKey: hubPublicKey.toString('base64')
        });

        console.log(`[Tunnel] Session established with client: ${clientId}`);
    }

    async handleClientRequest(message) {
        const { clientId, requestId, encrypted } = message;
        
        const sessionKey = this.sessionKeys.get(clientId);
        if (!sessionKey) {
            console.error('[Tunnel] No session key for client:', clientId);
            return;
        }

        try {
            // Decrypt request
            const decrypted = this.decrypt(encrypted, sessionKey);
            const request = JSON.parse(decrypted);

            console.log(`[Tunnel] Decrypted request from ${clientId}:`, request.method, request.path);

            // Forward to local server
            const response = await this.forwardToLocalServer(request);

            // Encrypt response
            const encryptedResponse = this.encrypt(JSON.stringify(response), sessionKey);

            // Send back via relay
            this.send({
                type: 'hub_response',
                clientId,
                requestId,
                encrypted: encryptedResponse
            });

        } catch (err) {
            console.error('[Tunnel] Request handling error:', err);
            this.send({
                type: 'hub_response',
                clientId,
                requestId,
                error: 'Internal error'
            });
        }
    }

    async forwardToLocalServer(request) {
        const fetch = (await import('node-fetch')).default;
        const localUrl = `http://localhost:${process.env.PORT || 3000}${request.path}`;

        try {
            const res = await fetch(localUrl, {
                method: request.method,
                headers: {
                    'Content-Type': 'application/json',
                    'X-Tunnel-Client': 'local',
                    ...request.headers
                },
                body: request.body ? JSON.stringify(request.body) : undefined
            });

            const data = await res.text();
            return {
                status: res.status,
                headers: Object.fromEntries(res.headers.entries()),
                body: data
            };
        } catch (err) {
            console.error('[Tunnel] Local forward error:', err);
            return {
                status: 500,
                body: JSON.stringify({ error: 'Failed to forward request' })
            };
        }
    }

    encrypt(data, key) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
        
        let encrypted = cipher.update(data, 'utf8', 'base64');
        encrypted += cipher.final('base64');
        
        const authTag = cipher.getAuthTag();
        
        return {
            iv: iv.toString('base64'),
            encrypted,
            authTag: authTag.toString('base64')
        };
    }

    decrypt(data, key) {
        const decipher = crypto.createDecipheriv(
            'aes-256-gcm',
            key,
            Buffer.from(data.iv, 'base64')
        );
        
        decipher.setAuthTag(Buffer.from(data.authTag, 'base64'));
        
        let decrypted = decipher.update(data.encrypted, 'base64', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    }

    send(message) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    startHeartbeat() {
        this.heartbeatInterval = setInterval(() => {
            if (this.isConnected) {
                this.send({ type: 'ping', timestamp: Date.now() });
            }
        }, 30000); // Every 30 seconds
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    handleError(err) {
        console.error('[Tunnel] WebSocket error:', err.message || err);
        
        // Check if it's a DNS/network error
        if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
            console.warn(`[Tunnel] Relay server not reachable (${err.code})`);
            console.warn(`[Tunnel] Hint: Configure a relay server or start self-hosted relay at: npm start (in cloud-server/)`);
        }
    }

    handleClose() {
        console.log('[Tunnel] Connection closed');
        this.isConnected = false;
        this.stopHeartbeat();
        this.emit('disconnected');
        thisconsole.warn('[Tunnel] Tunnel disabled - relay server not available');
            console.warn('[Tunnel] To enable remote access:');
            console.warn('[Tunnel]   1. Check relay URL in hub settings');
            console.warn('[Tunnel]   2. Start self-hosted relay: cd cloud-server && npm start');
            console.warn('[Tunnel]   3. Set relay URL to: wss://localhost:8080');
            this.emit('error', new Error('Relay server not reachable'));
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`[Tunnel] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxR
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
        
        console.log(`[Tunnel] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
        
        setTimeout(() => this.connect(), delay);
    }

    disconnect() {
        this.stopHeartbeat();
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.sessionKeys.clear();
    }
}

module.exports = TunnelClient;

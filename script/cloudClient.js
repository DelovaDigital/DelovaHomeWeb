const WebSocket = require('ws');
const fetch = require('node-fetch'); // Ensure node-fetch is available in your package.json

class CloudClient {
    constructor(localApiUrl) {
        // Default to HTTPS if not specified, as server.js prefers HTTPS
        // But we need to handle the case where SSL is missing.
        // Ideally, server.js should pass the correct URL.
        // For now, let's default to https://127.0.0.1:3000 to match server.js default
        this.localApiUrl = localApiUrl || 'https://127.0.0.1:3000';
        this.ws = null;
        this.config = null;
        this.reconnectInterval = 5000;
        this.maxReconnectInterval = 60000; // Max 60 seconds between retries
        this.reconnectAttempts = 0;
        this.reconnectTimer = null;
        this.pingInterval = null;
        this.pingTimeout = null;
        this.isReconnecting = false;
    }

    loadConfig() {
        try {
            const fs = require('fs');
            if (fs.existsSync('cloud-config.json')) {
                this.config = JSON.parse(fs.readFileSync('cloud-config.json', 'utf8'));
                return true;
            }
        } catch (e) {
            console.error('Failed to load cloud config:', e);
        }
        return false;
    }

    saveConfig(config) {
        const fs = require('fs');
        this.config = config;
        fs.writeFileSync('cloud-config.json', JSON.stringify(config, null, 2));
    }

    async linkHub(cloudUrl, username, password, hubName, email = null) {
        const https = require('https');
        const agent = new https.Agent({ rejectUnauthorized: false });

        // 0. Register if email is provided
        if (email) {
            console.log('[Cloud] Registering new user...');
            const regRes = await fetch(`${cloudUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, email }),
                agent: cloudUrl.startsWith('https') ? agent : undefined
            });
            const regData = await regRes.json();
            if (!regData.success && regData.error !== 'Username taken') {
                 throw new Error(regData.error || 'Registration failed');
            }
        }

        // 1. Login to Cloud to get User Token
        const loginRes = await fetch(`${cloudUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            agent: cloudUrl.startsWith('https') ? agent : undefined
        });
        const loginData = await loginRes.json();
        
        if (!loginData.success) throw new Error(loginData.error || 'Login failed');
        
        // 2. Link Hub
        // Check if we already have a hubId in config to preserve it
        let hubId;
        if (this.loadConfig() && this.config.hubId) {
            hubId = this.config.hubId;
        } else {
            hubId = require('uuid').v4();
        }
        
        const linkRes = await fetch(`${cloudUrl}/api/hub/link`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${loginData.token}`
            },
            body: JSON.stringify({ hubId, name: hubName }),
            agent: cloudUrl.startsWith('https') ? agent : undefined
        });
        
        const linkData = await linkRes.json();
        if (!linkData.success) throw new Error(linkData.error || 'Linking failed');
        
        // 3. Save Config
        const config = {
            cloudUrl,
            hubId: linkData.hubId,
            hubSecret: linkData.hubSecret
        };
        this.saveConfig(config);
        
        // 4. Connect
        this.connect();
        return config;
    }

    connect() {
        if (!this.loadConfig()) {
            console.log('[Cloud] No config found. Waiting for setup.');
            return;
        }

        // Prevent multiple simultaneous connection attempts
        if (this.isReconnecting) {
            console.log('[Cloud] Connection attempt already in progress, skipping...');
            return;
        }

        this.isReconnecting = true;

        // Clean up any existing connection
        this.cleanup();

        const { cloudUrl, hubId, hubSecret } = this.config;
        // Convert http/https to ws/wss
        const wsUrl = cloudUrl.replace(/^http/, 'ws') + `?id=${hubId}&secret=${hubSecret}`;

        console.log(`[Cloud] Connecting to ${wsUrl}... (attempt ${this.reconnectAttempts + 1})`);
        
        try {
            // Allow self-signed certs for internal/dev setups
            this.ws = new WebSocket(wsUrl, { 
                rejectUnauthorized: false,
                handshakeTimeout: 10000 // 10 second timeout for connection
            });

            this.ws.on('open', () => {
                console.log('[Cloud] Connected to Cloud Server');
                this.reconnectAttempts = 0; // Reset attempts on successful connection
                this.isReconnecting = false;
                this.startHeartbeat();
            });

            this.ws.on('message', async (data) => {
                try {
                    const msg = JSON.parse(data);
                    
                    // Handle pong response
                    if (msg.type === 'PONG') {
                        if (this.pingTimeout) {
                            clearTimeout(this.pingTimeout);
                            this.pingTimeout = null;
                        }
                        return;
                    }
                    
                    if (msg.type === 'REQUEST') {
                        this.handleRequest(msg.payload);
                    }
                } catch (e) {
                    console.error('[Cloud] Error handling message:', e);
                }
            });

            this.ws.on('close', (code, reason) => {
                console.log(`[Cloud] Disconnected (code: ${code}, reason: ${reason || 'none'})`);
                this.isReconnecting = false;
                this.stopHeartbeat();
                this.scheduleReconnect();
            });

            this.ws.on('error', (err) => {
                console.error('[Cloud] Connection error:', err.message);
                this.isReconnecting = false;
                // Don't call cleanup here as 'close' will be fired after 'error'
            });

            this.ws.on('ping', () => {
                // Respond to server pings
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.pong();
                }
            });

        } catch (err) {
            console.error('[Cloud] Failed to create WebSocket:', err.message);
            this.isReconnecting = false;
            this.scheduleReconnect();
        }
    }

    cleanup() {
        // Clear any pending reconnect timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        // Stop heartbeat
        this.stopHeartbeat();

        // Close existing WebSocket connection
        if (this.ws) {
            try {
                this.ws.removeAllListeners();
                if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
                    this.ws.terminate();
                }
            } catch (e) {
                console.error('[Cloud] Error cleaning up WebSocket:', e.message);
            }
            this.ws = null;
        }
    }

    scheduleReconnect() {
        // Don't schedule if already scheduled
        if (this.reconnectTimer) {
            return;
        }

        // Calculate reconnect delay with exponential backoff
        const delay = Math.min(
            this.reconnectInterval * Math.pow(1.5, this.reconnectAttempts),
            this.maxReconnectInterval
        );
        
        this.reconnectAttempts++;
        console.log(`[Cloud] Reconnecting in ${Math.round(delay/1000)}s... (attempt ${this.reconnectAttempts})`);
        
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    startHeartbeat() {
        // Stop any existing heartbeat
        this.stopHeartbeat();

        // Send ping every 30 seconds
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Set a timeout to detect if pong is not received
                this.pingTimeout = setTimeout(() => {
                    console.log('[Cloud] Ping timeout - connection appears dead');
                    this.ws.terminate(); // This will trigger 'close' event
                }, 10000); // 10 second timeout for pong response

                try {
                    this.ws.send(JSON.stringify({ type: 'PING', timestamp: Date.now() }));
                } catch (e) {
                    console.error('[Cloud] Failed to send ping:', e.message);
                    clearTimeout(this.pingTimeout);
                    this.pingTimeout = null;
                }
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
        if (this.pingTimeout) {
            clearTimeout(this.pingTimeout);
            this.pingTimeout = null;
        }
    }

    disconnect() {
        console.log('[Cloud] Manually disconnecting...');
        this.reconnectAttempts = 0; // Reset so we don't keep trying to reconnect
        // Clear scheduled reconnects
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        this.cleanup();
    }

    async handleRequest(payload) {
        const { id, method, path, body, query, headers } = payload;
        console.log(`[Cloud] Proxy Request: ${method} ${path}`);

        try {
            // Forward request to local Express server
            // Use 127.0.0.1 instead of localhost to avoid IPv6 issues
            // Also check if we should use HTTP port (3001) or HTTPS port (3000)
            // Based on server.js, HTTP is on port + 1 (3001) if SSL is active, or port (3000) if not.
            // To be safe, let's try to detect or just use the HTTP port if we know it.
            // But cloudClient doesn't know if SSL is active.
            // Let's try 127.0.0.1:3000 first.
            
            let url = `${this.localApiUrl}${path}`;
            // Replace localhost with 127.0.0.1 to avoid socket hang up on some systems
            url = url.replace('localhost', '127.0.0.1');

            // If query params are provided in the payload, append them
            // Note: If path already contains query params (from req.url), we should be careful not to duplicate
            if (query && Object.keys(query).length > 0) {
                const separator = url.includes('?') ? '&' : '?';
                url += separator + new URLSearchParams(query).toString();
            }

            // Create a custom agent to handle potential self-signed certs if using HTTPS
            const https = require('https');
            const agent = new https.Agent({
                rejectUnauthorized: false
            });

            const requestHeaders = { 'Content-Type': 'application/json' };
            if (headers) {
                Object.assign(requestHeaders, headers);
            }

            const options = {
                method,
                headers: requestHeaders,
                agent: url.startsWith('https') ? agent : undefined,
                redirect: 'manual'
            };
            
            if (body && (method === 'POST' || method === 'PUT')) {
                options.body = JSON.stringify(body);
            }

            const res = await fetch(url, options);
            
            // Capture headers to support redirects and other metadata
            const responseHeaders = {};
            res.headers.forEach((val, key) => { responseHeaders[key] = val; });

            // Handle non-JSON responses (like 404 html)
            const contentType = res.headers.get('content-type');
            let data;
            if (contentType && contentType.includes('application/json')) {
                data = await res.json();
            } else {
                // For redirects or HTML, get text
                data = await res.text();
                // Try to parse as JSON just in case, but keep as string if not
                try {
                    data = JSON.parse(data);
                } catch {
                    // Keep as string
                }
            }

            // Send response back to Cloud
            this.ws.send(JSON.stringify({
                type: 'RESPONSE',
                payload: {
                    id,
                    status: res.status,
                    headers: responseHeaders,
                    data
                }
            }));

        } catch (e) {
            console.error('[Cloud] Local request failed:', e);
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify({
                    type: 'RESPONSE',
                    payload: {
                        id,
                        status: 500,
                        data: { error: 'Local Hub Error: ' + e.message }
                    }
                }));
            }
        }
    }

    async registerUser(username, password) {
        if (!this.config) return;
        const { cloudUrl, hubId, hubSecret } = this.config;
        
        const https = require('https');
        const agent = new https.Agent({ rejectUnauthorized: false });
        const fetch = require('node-fetch');

        const res = await fetch(`${cloudUrl}/api/hub/register-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hubId, hubSecret, username, password }),
            agent: cloudUrl.startsWith('https') ? agent : undefined
        });
        
        const data = await res.json();
        if (!data.success) throw new Error(data.error);
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN && !this.isReconnecting;
    }

    getConnectionStatus() {
        if (!this.config) {
            return { connected: false, status: 'not_configured', attempts: 0 };
        }
        
        if (!this.ws) {
            return { connected: false, status: 'disconnected', attempts: this.reconnectAttempts };
        }

        const stateMap = {
            [WebSocket.CONNECTING]: 'connecting',
            [WebSocket.OPEN]: 'connected',
            [WebSocket.CLOSING]: 'closing',
            [WebSocket.CLOSED]: 'closed'
        };

        return {
            connected: this.ws.readyState === WebSocket.OPEN,
            status: stateMap[this.ws.readyState] || 'unknown',
            attempts: this.reconnectAttempts,
            isReconnecting: this.isReconnecting
        };
    }
}

module.exports = new CloudClient();

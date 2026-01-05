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
        // 0. Register if email is provided
        if (email) {
            console.log('[Cloud] Registering new user...');
            const regRes = await fetch(`${cloudUrl}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, email })
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
            body: JSON.stringify({ username, password })
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
            body: JSON.stringify({ hubId, name: hubName })
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

        const { cloudUrl, hubId, hubSecret } = this.config;
        // Convert http/https to ws/wss
        const wsUrl = cloudUrl.replace(/^http/, 'ws') + `?id=${hubId}&secret=${hubSecret}`;

        console.log(`[Cloud] Connecting to ${wsUrl}...`);
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', () => {
            console.log('[Cloud] Connected to Cloud Server');
        });

        this.ws.on('message', async (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.type === 'REQUEST') {
                    this.handleRequest(msg.payload);
                }
            } catch (e) {
                console.error('[Cloud] Error handling message:', e);
            }
        });

        this.ws.on('close', () => {
            console.log('[Cloud] Disconnected. Reconnecting in 5s...');
            setTimeout(() => this.connect(), this.reconnectInterval);
        });

        this.ws.on('error', (err) => {
            console.error('[Cloud] Connection error:', err.message);
        });
    }

    async handleRequest(payload) {
        const { id, method, path, body, query } = payload;
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

            if (query && Object.keys(query).length > 0) {
                url += '?' + new URLSearchParams(query).toString();
            }

            // Create a custom agent to handle potential self-signed certs if using HTTPS
            const https = require('https');
            const agent = new https.Agent({
                rejectUnauthorized: false
            });

            const options = {
                method,
                headers: { 'Content-Type': 'application/json' },
                agent: url.startsWith('https') ? agent : undefined
            };
            
            if (body && (method === 'POST' || method === 'PUT')) {
                options.body = JSON.stringify(body);
            }

            const res = await fetch(url, options);
            
            // Handle non-JSON responses (like 404 html)
            const contentType = res.headers.get('content-type');
            let data;
            if (contentType && contentType.includes('application/json')) {
                data = await res.json();
            } else {
                const text = await res.text();
                try {
                    data = JSON.parse(text);
                } catch {
                    data = { error: res.statusText, text: text.substring(0, 100) };
                }
            }

            // Send response back to Cloud
            this.ws.send(JSON.stringify({
                type: 'RESPONSE',
                payload: {
                    id,
                    status: res.status,
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
}

module.exports = new CloudClient();

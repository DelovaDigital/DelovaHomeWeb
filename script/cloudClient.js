const WebSocket = require('ws');
const fetch = require('node-fetch'); // Ensure node-fetch is available in your package.json

class CloudClient {
    constructor(localApiUrl) {
        this.localApiUrl = localApiUrl || 'http://localhost:3000';
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

    async linkHub(cloudUrl, username, password, hubName) {
        // 1. Login to Cloud to get User Token
        const loginRes = await fetch(`${cloudUrl}/api/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const loginData = await loginRes.json();
        
        if (!loginData.success) throw new Error(loginData.error || 'Login failed');
        
        // 2. Link Hub
        const hubId = require('uuid').v4(); // Generate a new ID for this hub if not exists
        
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
            // We can use fetch to call our own local API
            let url = `${this.localApiUrl}${path}`;
            if (query && Object.keys(query).length > 0) {
                url += '?' + new URLSearchParams(query).toString();
            }

            const options = {
                method,
                headers: { 'Content-Type': 'application/json' }
            };
            
            if (body && (method === 'POST' || method === 'PUT')) {
                options.body = JSON.stringify(body);
            }

            const res = await fetch(url, options);
            const data = await res.json(); // Assuming JSON response for now

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

module.exports = new CloudClient();

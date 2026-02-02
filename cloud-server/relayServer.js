/**
 * DelovaHome Zero-Knowledge Relay Server
 * Routes encrypted traffic between apps and hubs
 * Cannot decrypt or inspect user data
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const http = require('http');

class RelayServer {
    constructor(port = 8080) {
        this.port = port;
        this.hubs = new Map(); // hubId -> WebSocket
        this.clients = new Map(); // sessionId -> WebSocket
        this.hubSessions = new Map(); // hubId -> Set<sessionId>
        this.server = null;
        this.wss = null;
    }

    start() {
        this.server = http.createServer((req, res) => {
            console.log(`[Relay] HTTP Request: ${req.method} ${req.url} from ${req.socket.remoteAddress}`);
            
            if (req.url === '/health') {
                console.log('[Relay] ✅ Responding to /health request');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'ok',
                    hubs: this.hubs.size,
                    clients: this.clients.size,
                    timestamp: Date.now()
                }));
            } else {
                console.log(`[Relay] ❌ 404 for ${req.url}`);
                res.writeHead(404);
                res.end();
            }
        });

        this.wss = new WebSocket.Server({ server: this.server });

        this.wss.on('connection', (ws, req) => {
            this.handleConnection(ws, req);
        });

        // Error handling
        this.server.on('error', (err) => {
            console.error('[Relay] ❌ Server error:', err);
        });

        this.server.on('clientError', (err, socket) => {
            console.error('[Relay] ❌ Client error:', err);
            if (socket.writable) {
                socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
            }
        });

        this.server.listen(this.port, '0.0.0.0', () => {
            const address = this.server.address();
            console.log(`[Relay] ✅ Server started successfully!`);
            console.log(`[Relay] Actually listening on: ${JSON.stringify(address)}`);
            console.log(`[Relay] Port: ${address.port}`);
            console.log(`[Relay] Address: ${address.address}`);
            console.log('[Relay] Privacy mode: Cannot decrypt traffic');
            console.log('[Relay] Connection URLs:');
            console.log(`[Relay]   - Local: ws://localhost:${this.port}`);
            console.log(`[Relay]   - Network: ws://192.168.0.99:${this.port}`);
            console.log(`[Relay] Test from Windows: curl http://192.168.0.99:8080/health`);
            console.log(`[Relay] Test from Pi: curl http://192.168.0.99:8080/health`);
        });
    }

    handleConnection(ws, req) {
        const hubId = req.headers['x-hub-id'];
        const hubToken = req.headers['x-hub-token'];
        const clientSession = req.headers['x-client-session'];

        console.log('[Relay] New connection attempt:');
        console.log(`  X-Hub-ID: ${hubId ? 'present' : 'missing'}`);
        console.log(`  X-Hub-Token: ${hubToken ? 'present' : 'missing'}`);
        console.log(`  X-Client-Session: ${clientSession ? 'present' : 'missing'}`);

        if (hubId && hubToken) {
            this.handleHubConnection(ws, hubId, hubToken);
        } else if (clientSession) {
            this.handleClientConnection(ws, clientSession);
        } else {
            console.log('[Relay] ❌ Rejected: Missing authentication headers');
            ws.close(4001, 'Missing authentication');
        }
    }

    handleHubConnection(ws, hubId, hubToken) {
        // Verify hub token (signature check)
        if (!this.verifyHubToken(hubId, hubToken)) {
            console.log(`[Relay] Hub ${hubId}: Invalid token`);
            ws.close(4003, 'Invalid token');
            return;
        }

        console.log(`[Relay] Hub connected: ${hubId}`);
        
        this.hubs.set(hubId, ws);
        this.hubSessions.set(hubId, new Set());

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleHubMessage(hubId, message);
            } catch (err) {
                console.error(`[Relay] Hub ${hubId} message error:`, err);
            }
        });

        ws.on('close', () => {
            console.log(`[Relay] Hub disconnected: ${hubId}`);
            this.hubs.delete(hubId);
            
            // Notify connected clients
            const sessions = this.hubSessions.get(hubId);
            if (sessions) {
                sessions.forEach(sessionId => {
                    const client = this.clients.get(sessionId);
                    if (client && client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({
                            type: 'hub_disconnected',
                            hubId
                        }));
                    }
                });
                this.hubSessions.delete(hubId);
            }
        });

        ws.on('error', (err) => {
            console.error(`[Relay] Hub ${hubId} error:`, err);
        });

        // Send welcome
        ws.send(JSON.stringify({
            type: 'connected',
            hubId,
            timestamp: Date.now()
        }));
    }

    handleClientConnection(ws, sessionId) {
        console.log(`[Relay] Client connected: ${sessionId}`);
        
        this.clients.set(sessionId, ws);

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleClientMessage(sessionId, message);
            } catch (err) {
                console.error(`[Relay] Client ${sessionId} message error:`, err);
            }
        });

        ws.on('close', () => {
            console.log(`[Relay] Client disconnected: ${sessionId}`);
            this.clients.delete(sessionId);
            
            // Remove from hub sessions
            this.hubSessions.forEach((sessions, hubId) => {
                sessions.delete(sessionId);
            });
        });

        ws.on('error', (err) => {
            console.error(`[Relay] Client ${sessionId} error:`, err);
        });

        ws.send(JSON.stringify({
            type: 'connected',
            sessionId,
            timestamp: Date.now()
        }));
    }

    handleHubMessage(hubId, message) {
        // Hub messages are always responses to client requests
        // Relay encrypted response to client
        if (message.type === 'hub_response' || message.type === 'session_init_response') {
            const client = this.clients.get(message.clientId);
            if (client && client.readyState === WebSocket.OPEN) {
                // Forward encrypted message (relay doesn't decrypt)
                client.send(JSON.stringify({
                    ...message,
                    hubId
                }));
                
                console.log(`[Relay] Relayed encrypted response: hub ${hubId} → client ${message.clientId}`);
            }
        } else if (message.type === 'pong') {
            // Heartbeat response
        }
    }

    handleClientMessage(sessionId, message) {
        // Client messages are requests to hub
        const { hubId, type } = message;

        if (type === 'session_init') {
            // Client wants to establish encrypted session with hub
            const hub = this.hubs.get(hubId);
            if (!hub || hub.readyState !== WebSocket.OPEN) {
                this.sendToClient(sessionId, {
                    type: 'error',
                    error: 'Hub not available'
                });
                return;
            }

            // Track session
            let sessions = this.hubSessions.get(hubId);
            if (!sessions) {
                sessions = new Set();
                this.hubSessions.set(hubId, sessions);
            }
            sessions.add(sessionId);

            // Forward encrypted session init to hub (contains client public key)
            hub.send(JSON.stringify({
                ...message,
                clientId: sessionId
            }));

            console.log(`[Relay] Relayed session init: client ${sessionId} → hub ${hubId}`);

        } else if (type === 'request') {
            // Client request to hub (encrypted payload)
            const hub = this.hubs.get(hubId);
            if (!hub || hub.readyState !== WebSocket.OPEN) {
                this.sendToClient(sessionId, {
                    type: 'error',
                    requestId: message.requestId,
                    error: 'Hub not available'
                });
                return;
            }

            // Forward encrypted request (relay cannot decrypt)
            hub.send(JSON.stringify({
                type: 'client_request',
                clientId: sessionId,
                requestId: message.requestId,
                encrypted: message.encrypted, // E2E encrypted payload
                timestamp: Date.now()
            }));

            console.log(`[Relay] Relayed encrypted request: client ${sessionId} → hub ${hubId}`);
        }
    }

    sendToClient(sessionId, message) {
        const client = this.clients.get(sessionId);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(message));
        }
    }

    verifyHubToken(hubId, token) {
        try {
            const decoded = Buffer.from(token, 'base64').toString('utf8');
            const [id, timestamp, signature] = decoded.split(':');
            
            if (id !== hubId) return false;
            
            const age = Date.now() - parseInt(timestamp);
            if (age > 300000) return false; // 5 minutes max

            // In production: verify signature against stored hub secret
            // For now: accept all (development mode)
            return true;
        } catch {
            return false;
        }
    }

    stop() {
        if (this.wss) {
            this.wss.close();
        }
        if (this.server) {
            this.server.close();
        }
        console.log('[Relay] Server stopped');
    }
}

// Start server if run directly
if (require.main === module) {
    const port = process.env.RELAY_PORT || 8080;
    const relay = new RelayServer(port);
    relay.start();

    process.on('SIGINT', () => {
        console.log('\n[Relay] Shutting down...');
        relay.stop();
        process.exit(0);
    });
}

module.exports = RelayServer;

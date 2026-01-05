const express = require('express');
const WebSocket = require('ws');
const http = require('http');
const uuid = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'delovahome-secret-key-change-me';

app.use(express.json());
app.use(cors());

// --- Data Store (Simple JSON for now) ---
const DATA_FILE = 'cloud-data.json';
let data = { users: [], hubs: [] };

if (fs.existsSync(DATA_FILE)) {
    data = JSON.parse(fs.readFileSync(DATA_FILE));
}

function saveData() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// --- Active Connections ---
const connectedHubs = new Map(); // hubId -> WebSocket
const pendingRequests = new Map(); // requestId -> res

// --- Middleware ---
const authenticate = (req, res, next) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });
    
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (e) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

// --- Auth Routes ---

app.post('/api/auth/register', async (req, res) => {
    const { username, password, email } = req.body;
    
    if (data.users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Username taken' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = { id: uuid.v4(), username, password: hashedPassword, email, hubs: [] };
    
    data.users.push(user);
    saveData();
    
    res.json({ success: true, message: 'User registered' });
});

app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;
    const user = data.users.find(u => u.username === username);
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET);
    res.json({ success: true, token, user: { id: user.id, username: user.username, hubs: user.hubs } });
});

// --- Hub Management ---

// Called by the Hub during setup to link itself to a user account
app.post('/api/hub/link', authenticate, (req, res) => {
    const { hubId, name } = req.body;
    const userId = req.user.id;
    
    // Check if hub already linked
    let hub = data.hubs.find(h => h.id === hubId);
    if (!hub) {
        hub = { id: hubId, ownerId: userId, name: name || 'My Hub', secret: uuid.v4() };
        data.hubs.push(hub);
    } else {
        if (hub.ownerId !== userId) return res.status(403).json({ error: 'Hub already linked to another user' });
        hub.name = name || hub.name;
    }
    
    // Update user's hub list
    const user = data.users.find(u => u.id === userId);
    if (!user.hubs.includes(hubId)) {
        user.hubs.push(hubId);
    }
    
    saveData();
    
    // Return the secret the hub needs to connect via WebSocket
    res.json({ success: true, hubId: hub.id, hubSecret: hub.secret });
});

// --- Proxy Logic ---

// Client sends command to Cloud -> Cloud forwards to Hub
app.all('/api/proxy/:hubId/*', authenticate, (req, res) => {
    const { hubId } = req.params;
    const path = req.params[0]; // The part after /api/proxy/:hubId/
    
    // Verify ownership
    const user = data.users.find(u => u.id === req.user.id);
    if (!user.hubs.includes(hubId)) return res.status(403).json({ error: 'Access denied to this hub' });
    
    const ws = connectedHubs.get(hubId);
    if (!ws) return res.status(503).json({ error: 'Hub is offline' });
    
    const requestId = uuid.v4();
    const command = {
        id: requestId,
        method: req.method,
        path: '/' + path, // e.g. /api/devices
        body: req.body,
        query: req.query
    };
    
    // Send to Hub
    ws.send(JSON.stringify({ type: 'REQUEST', payload: command }));
    
    // Wait for response
    pendingRequests.set(requestId, res);
    
    // Timeout after 10s
    setTimeout(() => {
        if (pendingRequests.has(requestId)) {
            pendingRequests.get(requestId).status(504).json({ error: 'Hub timeout' });
            pendingRequests.delete(requestId);
        }
    }, 10000);
});

// --- WebSocket Server (For Hubs) ---

wss.on('connection', (ws, req) => {
    // Extract Hub ID and Secret from URL or Headers
    // Example: ws://cloud-server/hub?id=...&secret=...
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const hubId = urlParams.get('id');
    const secret = urlParams.get('secret');
    
    const hub = data.hubs.find(h => h.id === hubId);
    
    if (!hub || hub.secret !== secret) {
        ws.close(1008, 'Invalid credentials');
        return;
    }
    
    console.log(`Hub connected: ${hubId}`);
    connectedHubs.set(hubId, ws);
    
    ws.on('message', (message) => {
        try {
            const msg = JSON.parse(message);
            
            if (msg.type === 'RESPONSE') {
                const { id, status, data } = msg.payload;
                if (pendingRequests.has(id)) {
                    const res = pendingRequests.get(id);
                    res.status(status).json(data);
                    pendingRequests.delete(id);
                }
            }
        } catch (e) {
            console.error('Error parsing message from hub:', e);
        }
    });
    
    ws.on('close', () => {
        console.log(`Hub disconnected: ${hubId}`);
        connectedHubs.delete(hubId);
    });
});

server.listen(PORT, () => {
    console.log(`Cloud Server running on port ${PORT}`);
});

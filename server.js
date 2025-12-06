// Load local .env file early so `process.env` contains DB_* vars when other modules read them
try {
  require('dotenv').config();
} catch (e) {
  // dotenv is optional; if it's not installed we'll rely on environment variables
}

// Suppress DEP0123 warning (TLS ServerName to IP)
const originalEmit = process.emit;
process.emit = function (name, data, ...args) {
    if (name === 'warning' && typeof data === 'object' && data.code === 'DEP0123') {
        return false;
    }
    return originalEmit.apply(process, [name, data, ...args]);
};

const express = require('express');
const path = require('path');
const bcrypt = require('bcrypt');
// const sql = require('mssql'); // Removed to use db.sql
const { exec } = require('child_process');
const db = require('./script/db');
const nasManager = require('./script/nasManager');
const cameraStreamManager = require('./script/cameraStream');
const WebSocket = require('ws');
const url = require('url');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Bonjour = require('bonjour-service').Bonjour;

const app = express();
const port = process.env.PORT || 3000;

// --- Global Error Handlers to prevent crash ---
process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
});

// --- Hub Identity & Discovery ---
const HUB_CONFIG_PATH = path.join(__dirname, 'hub_config.json');
let hubConfig = {
    hubId: null,
    name: 'DelovaHome Hub',
    version: '1.0.0'
};

// Load or Generate Hub ID
if (fs.existsSync(HUB_CONFIG_PATH)) {
    try {
        hubConfig = JSON.parse(fs.readFileSync(HUB_CONFIG_PATH, 'utf8'));
    } catch (e) { console.error('Error reading hub config:', e); }
}

if (!hubConfig.hubId) {
    hubConfig.hubId = uuidv4();
    try {
        fs.writeFileSync(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2));
        console.log('Generated new Hub ID:', hubConfig.hubId);
    } catch (e) { console.error('Error saving hub config:', e); }
}

// Sync with Database (SystemConfig table)
async function initHubConfigFromDB() {
    console.log('Starting DB Sync...');
    try {
        console.log('Step 1: Getting DB Pool...');
        const pool = await db.getPool();
        console.log('Step 1: Pool acquired.');

        // SIMPLE TEST FIRST - Like test_crash.js
        console.log('Step 1.5: Running simple test query...');
        await pool.request().query('SELECT 1 as val');
        console.log('Step 1.5: Simple query passed.');

        const sql = db.sql; 
        if (!sql) throw new Error('db.sql is undefined - check db.js exports');
        
        // Ensure SystemConfig table exists
        console.log('Step 3: Checking SystemConfig table...');
        const tableRes = await pool.request().query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'SystemConfig'");
        
        if (tableRes.recordset.length === 0) {
            console.log('Step 3a: Creating SystemConfig table...');
            await pool.request().query(`
                CREATE TABLE SystemConfig (
                    KeyName NVARCHAR(50) PRIMARY KEY,
                    KeyValue NVARCHAR(255)
                )
            `);
            console.log('Created SystemConfig table in SQL Server');
        } else {
            console.log('Step 3b: SystemConfig table exists.');
        }

        // Sync HubId
        console.log('Step 4: Syncing HubId...');
        let dbHubId = null;
        const idRes = await pool.request().query("SELECT KeyValue FROM SystemConfig WHERE KeyName = 'HubId'");
        if (idRes.recordset.length > 0) {
            dbHubId = idRes.recordset[0].KeyValue;
        }

        if (dbHubId) {
            console.log(`Step 4a: Found DB Hub ID: ${dbHubId}`);
            if (hubConfig.hubId !== dbHubId) {
                console.log(`Updating local Hub ID from DB: ${dbHubId}`);
                hubConfig.hubId = dbHubId;
                fs.writeFileSync(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2));
            }
        } else {
            console.log('Step 4b: DB Hub ID empty. Saving local ID to DB...');
            // Use simple string concatenation for debug safety if parameters are crashing
            const q = `INSERT INTO SystemConfig (KeyName, KeyValue) VALUES ('HubId', '${hubConfig.hubId}')`;
            await pool.request().query(q);
            console.log('Saved Hub ID to SQL Server');
        }

        // Sync HubName
        console.log('Step 5: Syncing HubName...');
        let dbHubName = null;
        const nameRes = await pool.request().query("SELECT KeyValue FROM SystemConfig WHERE KeyName = 'HubName'");
        if (nameRes.recordset.length > 0) {
            dbHubName = nameRes.recordset[0].KeyValue;
        }

        if (dbHubName) {
            if (hubConfig.name !== dbHubName) {
                hubConfig.name = dbHubName;
                fs.writeFileSync(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2));
            }
        } else {
             const q = `INSERT INTO SystemConfig (KeyName, KeyValue) VALUES ('HubName', '${hubConfig.name}')`;
             await pool.request().query(q);
        }
        
        console.log('DB Sync completed successfully.');
        return { success: true };

    } catch (err) {
        console.error('Database sync error (SystemConfig):', err);
        return { success: false, error: err.message, stack: err.stack };
    }
}

// Ensure Users table exists and has correct schema
async function initUsersTable() {
    try {
        const pool = await db.getPool();
        // Check for Users table (standardized name)
        const tableRes = await pool.request().query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Users' AND TABLE_SCHEMA = 'dbo'");
        
        if (tableRes.recordset.length === 0) {
            console.log('Creating Users table...');
            await pool.request().query(`
                CREATE TABLE Users (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Username NVARCHAR(255) NOT NULL UNIQUE,
                    PasswordHash NVARCHAR(255) NOT NULL,
                    Role NVARCHAR(50) DEFAULT 'User',
                    CreatedAt DATETIME DEFAULT GETDATE()
                )
            `);
            console.log('Created Users table.');
        } else {
            console.log('Users table exists. Verifying schema...');
            const colsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND TABLE_SCHEMA = 'dbo'");
            const cols = colsRes.recordset.map(r => r.COLUMN_NAME);

            // Check for Role
            if (!cols.find(c => c.toLowerCase() === 'role')) {
                console.log('Schema Update: Adding Role column...');
                await pool.request().query("ALTER TABLE Users ADD Role NVARCHAR(50) DEFAULT 'User'");
            }

            // Check for HubAccess
            if (!cols.find(c => c.toLowerCase() === 'hubaccess')) {
                console.log('Schema Update: Adding HubAccess column...');
                await pool.request().query("ALTER TABLE Users ADD HubAccess BIT DEFAULT 1");
                // Set existing users to have access by default
                await pool.request().query("UPDATE Users SET HubAccess = 1 WHERE HubAccess IS NULL");
            }

            // Check for Id
            const idCol = cols.find(c => c.toLowerCase() === 'id');
            if (!idCol) {
                // Check for other common ID names
                const otherId = cols.find(c => /^(user_id|userid)$/i.test(c));
                if (otherId) {
                    console.log(`Schema Update: Renaming ${otherId} to Id...`);
                    await pool.request().query(`EXEC sp_rename 'Users.${otherId}', 'Id', 'COLUMN'`);
                } else {
                    console.log('Schema Update: Adding Id column...');
                    // Attempt to add IDENTITY column. This works in SQL Server even if table has data.
                    try {
                        await pool.request().query("ALTER TABLE Users ADD Id INT IDENTITY(1,1) PRIMARY KEY");
                    } catch (e) {
                        console.error('Failed to add Id column (might already have a PK):', e.message);
                        // Fallback: Try adding just the column without PK constraint if PK exists
                        if (e.message.includes('Primary Key')) {
                             await pool.request().query("ALTER TABLE Users ADD Id INT IDENTITY(1,1)");
                        }
                    }
                }
            }
            
            // Check for CreatedAt
            if (!cols.find(c => c.toLowerCase() === 'createdat')) {
                 console.log('Schema Update: Adding CreatedAt column...');
                 await pool.request().query("ALTER TABLE Users ADD CreatedAt DATETIME DEFAULT GETDATE()");
            }
        }
    } catch (err) {
        console.error('Error initializing Users table:', err);
    }
}

// Run DB sync asynchronously, catch any top-level errors
initHubConfigFromDB().then(() => initUsersTable()).catch(err => console.error('Fatal DB Sync Error:', err));

app.get('/api/system/ping', (req, res) => {
    res.json({ ok: true, message: 'Server is running' });
});

app.get('/api/system/sync-db', async (req, res) => {
    console.log('Manual DB Sync triggered via API');
    try {
        const result = await initHubConfigFromDB();
        res.json(result);
    } catch (e) {
        console.error('Route handler error:', e);
        res.status(500).json({ success: false, error: e.message, stack: e.stack });
    }
});

// Start mDNS Advertisement
let bonjour;
try {
    bonjour = new Bonjour();
    bonjour.publish({ name: `DelovaHome-${hubConfig.hubId.substring(0, 8)}`, type: 'http', port: port, txt: { id: hubConfig.hubId, version: hubConfig.version, type: 'delovahome' } });
    console.log(`Advertising DelovaHome Hub on network (ID: ${hubConfig.hubId})`);
} catch (e) {
    console.error('Failed to start mDNS advertisement:', e);
}

app.use(express.json());
// Serve static files from project root
app.use(express.static(__dirname));

app.post('/api/camera/stream', (req, res) => {
    const { deviceId, rtspUrl } = req.body;
    if (!deviceId || !rtspUrl) {
        return res.status(400).json({ ok: false, message: 'Missing deviceId or rtspUrl' });
    }
    
    // We don't start the stream here anymore, we just confirm we are ready.
    // The stream will start when the WebSocket connects.
    // Or we can pre-warm it.
    cameraStreamManager.getStream(deviceId, rtspUrl);
    
    res.json({ ok: true });
});

app.post('/api/camera/stop', (req, res) => {
    const { deviceId } = req.body;
    if (deviceId) {
        cameraStreamManager.stopStream(deviceId);
    }
    res.json({ ok: true });
});

// Login endpoint: expects JSON { username, password }
// Login endpoint: expects JSON { username, password }
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ ok: false, message: 'Missing credentials' });
  }

  try {
    const pool = await db.getPool();
    
    const result = await pool.request()
        .input('username', db.sql.NVarChar(255), username)
        .query("SELECT Id, Username, PasswordHash, Role, HubAccess FROM Users WHERE Username = @username");

    const user = result.recordset[0];

    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    if (user.HubAccess === false) {
        return res.status(403).json({ ok: false, message: 'Access to this Hub is denied.' });
    }

    const match = await bcrypt.compare(password, user.PasswordHash);
    if (!match) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    // Authentication succeeded.
    res.json({ 
        ok: true, 
        userId: user.Id, 
        username: user.Username, 
        role: user.Role,
        hubInfo: {
            id: hubConfig.hubId,
            name: hubConfig.name,
            version: hubConfig.version
        }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// Registration endpoint: expects JSON { username, password }
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ ok: false, message: 'Missing username or password' });

  try {
    const pool = await db.getPool();
    
    // Check if user exists in standard Users table
    const existsRes = await pool.request()
        .input('username', db.sql.NVarChar(255), username)
        .query("SELECT COUNT(1) as cnt FROM Users WHERE Username = @username");
    
    if (existsRes.recordset[0].cnt > 0) {
        return res.status(409).json({ ok: false, message: 'User already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    await pool.request()
        .input('username', db.sql.NVarChar(255), username)
        .input('passwordHash', db.sql.NVarChar(255), passwordHash)
        .query("INSERT INTO Users (Username, PasswordHash) VALUES (@username, @passwordHash)");

    res.json({ ok: true, message: 'User created' });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// Validate Session Endpoint
app.get('/api/me', async (req, res) => {
    const userId = req.query.userId;
    if (!userId) return res.status(401).json({ ok: false });

    try {
        const pool = await db.getPool();
        const result = await pool.request()
            .input('id', db.sql.Int, userId)
            .query("SELECT Id, Username, Role, HubAccess FROM Users WHERE Id = @id");
        
        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            if (user.HubAccess === false) {
                return res.status(403).json({ ok: false, message: 'Access denied' });
            }
            res.json({
                ok: true,
                userId: user.Id,
                username: user.Username,
                role: user.Role,
                hubInfo: {
                    id: hubConfig.hubId,
                    name: hubConfig.name,
                    version: hubConfig.version
                }
            });
        } else {
            res.status(401).json({ ok: false });
        }
    } catch (e) {
        res.status(500).json({ ok: false });
    }
});

// List Users Endpoint
app.get('/api/users', async (req, res) => {
    try {
        const pool = await db.getPool();
        const result = await pool.request().query("SELECT Id, Username, Role, HubAccess, CreatedAt FROM Users");
        res.json({ ok: true, users: result.recordset });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// Toggle User Access Endpoint
app.post('/api/users/:id/access', async (req, res) => {
    const { id } = req.params;
    const { access } = req.body; // boolean

    try {
        const pool = await db.getPool();
        await pool.request()
            .input('id', db.sql.Int, id)
            .input('access', db.sql.Bit, access ? 1 : 0)
            .query("UPDATE Users SET HubAccess = @access WHERE Id = @id");
        
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

const deviceManager = require('./script/deviceManager');
const spotifyManager = require('./script/spotifyManager');

// --- Spotify API ---
app.get('/api/spotify/login', (req, res) => {
    const url = spotifyManager.getAuthUrl();
    if (url) res.redirect(url);
    else res.status(500).send('Spotify Client ID not configured');
});

app.get('/api/spotify/callback', async (req, res) => {
    const code = req.query.code;
    if (await spotifyManager.handleCallback(code)) {
        res.redirect('/');
    } else {
        res.status(500).send('Spotify authentication failed');
    }
});

app.get('/api/spotify/status', async (req, res) => {
    const state = await spotifyManager.getPlaybackState();
    res.json(state || { is_playing: false });
});

app.post('/api/spotify/control', async (req, res) => {
    const { command, value } = req.body;
    if (command === 'play') await spotifyManager.play();
    else if (command === 'pause') await spotifyManager.pause();
    else if (command === 'next') await spotifyManager.next();
    else if (command === 'previous') await spotifyManager.previous();
    else if (command === 'set_volume') await spotifyManager.setVolume(value);
    else if (command === 'transfer') await spotifyManager.transferPlayback(value);
    else if (command === 'play_context') await spotifyManager.playContext(value);
    res.json({ ok: true });
});

app.get('/api/spotify/devices', async (req, res) => {
    const devices = await spotifyManager.getDevices();
    res.json(devices);
});

app.get('/api/spotify/playlists', async (req, res) => {
    const playlists = await spotifyManager.getUserPlaylists();
    res.json(playlists);
});

app.get('/api/spotify/albums', async (req, res) => {
    const albums = await spotifyManager.getUserAlbums();
    res.json(albums);
});

// --- Device API ---
const roomsStore = require('./script/roomsStore');

// Simple SSE (Server-Sent Events) broadcaster for rooms changes
const sseClients = [];

function broadcastEvent(name, data){
  const payload = typeof data === 'string' ? data : JSON.stringify(data || {});
  sseClients.forEach(res => {
    try{
      res.write(`event: ${name}\n`);
      res.write(`data: ${payload}\n\n`);
    }catch(e){ /* ignore client errors */ }
  });
}

// subscribe to roomsStore changes
if (roomsStore && roomsStore.events && typeof roomsStore.events.on === 'function'){
  roomsStore.events.on('rooms-changed', (data) => {
    broadcastEvent('rooms-changed', data);
  });
}

// Rooms API (server-backed persistence)
app.get('/api/rooms', (req, res) => {
  try{
    const rooms = roomsStore.getRooms();
    res.json(rooms);
  }catch(e){ res.status(500).json({ ok:false, message:'Could not read rooms' }); }
});

app.post('/api/rooms', (req, res) => {
  const { name } = req.body || {};
  if(!name) return res.status(400).json({ ok:false, message:'Missing name' });
  try{
    const room = roomsStore.createRoom(name);
    res.json({ ok:true, room });
  }catch(e){ res.status(500).json({ ok:false }); }
});

app.put('/api/rooms/:id', (req, res) => {
  const { id } = req.params; const { name } = req.body || {};
  if(!name) return res.status(400).json({ ok:false, message:'Missing name' });
  try{ roomsStore.renameRoom(id, name); res.json({ ok:true }); }catch(e){ res.status(500).json({ ok:false }); }
});

app.delete('/api/rooms/:id', (req, res) => {
  const { id } = req.params;
  try{ roomsStore.deleteRoom(id); res.json({ ok:true }); }catch(e){ res.status(500).json({ ok:false }); }
});

app.get('/api/room-mapping', (req, res) => {
  try{ const map = roomsStore.getMap(); res.json(map); }catch(e){ res.status(500).json({}); }
});

app.post('/api/room-mapping', (req, res) => {
  const { deviceId, roomId } = req.body || {};
  if(!deviceId) return res.status(400).json({ ok:false, message:'Missing deviceId' });
  try{ roomsStore.assignDevice(deviceId, roomId); res.json({ ok:true }); }catch(e){ res.status(500).json({ ok:false }); }
});

// SSE endpoint for clients to receive rooms/mapping updates
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders && res.flushHeaders();

  // send an initial comment to establish the stream
  res.write(': connected\n\n');

  sseClients.push(res);

  req.on('close', () => {
    const idx = sseClients.indexOf(res);
    if (idx !== -1) sseClients.splice(idx, 1);
  });
});

// Speedtest endpoints
app.get('/api/speedtest/ping', (req, res) => {
  res.json({ ts: Date.now() });
});

app.get('/api/speedtest/file', (req, res) => {
  // Serve a generated binary blob of requested size (default 1MB)
  const size = parseInt(req.query.size || '1048576', 10);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(size));
  res.setHeader('Cache-Control', 'no-cache, no-store');
  // stream zeros in chunks
  const chunk = Buffer.alloc(64*1024, 0);
  let remaining = size;
  function sendNext(){
    if(remaining<=0){ return res.end(); }
    const toSend = Math.min(remaining, chunk.length);
    res.write(toSend===chunk.length ? chunk : chunk.slice(0,toSend), () => {
      remaining -= toSend;
      // use setImmediate to avoid blocking
      setImmediate(sendNext);
    });
  }
  sendNext();
});

// System Status API
app.get('/api/status', (req, res) => {
    const uptime = process.uptime();
    const memory = process.memoryUsage();
    const cpu = process.cpuUsage();
    
    res.json({
        ok: true,
        uptime,
        memory: {
            rss: memory.rss,
            heapTotal: memory.heapTotal,
            heapUsed: memory.heapUsed
        },
        cpu: {
            user: cpu.user,
            system: cpu.system
        },
        timestamp: Date.now()
    });
});

// Device API
app.get('/api/devices', (req, res) => {
    const devices = deviceManager.getAllDevices();
    const map = roomsStore.getMap();
    const rooms = roomsStore.getRooms();

    // Merge room info
    const enrichedDevices = devices.map(d => {
        const roomId = map[d.id];
        const room = rooms.find(r => r.id === roomId);
        return {
            ...d,
            roomId: roomId || null,
            roomName: room ? room.name : null
        };
    });

    res.json(enrichedDevices);
});

app.post('/api/devices/:id/command', async (req, res) => {
    const { id } = req.params;
    const { command, value } = req.body;
    
    // console.log(`Received command for ${id}: ${command} = ${value}`);

    const device = await deviceManager.controlDevice(id, command, value);
    
    if (device) {
        res.json({ ok: true, device });
    } else {
        res.status(404).json({ ok: false, message: 'Device not found' });
    }
});

app.post('/api/scenes/:name', async (req, res) => {
    const { name } = req.params;
    try {
        const result = await deviceManager.activateScene(name);
        res.json({ ok: true, result });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

app.post('/api/devices/:id/refresh', async (req, res) => {
    const { id } = req.params;
    await deviceManager.refreshDevice(id);
    res.json({ ok: true });
});

app.get('/api/devices/:id/state', async (req, res) => {
    const { id } = req.params;
    const device = deviceManager.getDevice(id);
    if (!device) {
        return res.status(404).json({ ok: false, message: 'Device not found' });
    }
    
    const state = await deviceManager.getDeviceState(device.ip, device.protocol);
    res.json({ ok: true, state });
});

app.post('/api/pair/start', async (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ ok: false, message: 'IP address required' });

    try {
        const result = await deviceManager.startPairing(ip);
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.post('/api/pair/pin', async (req, res) => {
    const { pin } = req.body;
    if (!pin) return res.status(400).json({ ok: false, message: 'PIN required' });

    try {
        const result = await deviceManager.submitPairingPin(pin);
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

// NAS API
app.get('/api/nas', (req, res) => {
    res.json(nasManager.getNasList());
});

app.post('/api/nas', async (req, res) => {
    try {
        const result = await nasManager.addNas(req.body);
        res.json(result);
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.get('/api/nas/:id/files', async (req, res) => {
    const { id } = req.params;
    const { path } = req.query;
    try {
        const files = await nasManager.listFiles(id, path || '');
        
        // Filter out . and ..
        const filtered = files.filter(f => f.name !== '.' && f.name !== '..');
        
        // Sort folders first
        filtered.sort((a, b) => {
            if (a.isDirectory === b.isDirectory) return a.name.localeCompare(b.name);
            return a.isDirectory ? -1 : 1;
        });
        
        res.json(filtered);
    } catch (err) {
        console.error('Error listing files:', err);
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.get('/api/nas/:id/stream', async (req, res) => {
    const { id } = req.params;
    const { path: filePath } = req.query;
    
    try {
        // Try to get a stream directly (supports SMB2/Linux fallback)
        const stream = await nasManager.getFileStream(id, filePath);
        if (stream) {
            // Set headers for video streaming
            res.setHeader('Content-Type', 'video/mp4'); // Default to mp4, browser will handle others usually
            // Note: smbclient stream doesn't support range requests easily, so seeking might be limited.
            
            // Pipe the stream to the response
            stream.pipe(res);
            stream.on('error', (err) => {
                console.error('Stream error:', err);
                if (!res.headersSent) res.status(500).send('Stream error');
            });
            return;
        }

        // Fallback to local file path (Native mode legacy)
        const localPath = await nasManager.getLocalFilePath(id, filePath);
        if (!localPath) {
            return res.status(404).send('File not found or not accessible');
        }
        res.sendFile(localPath);
    } catch (err) {
        console.error('Stream error:', err);
        if (!res.headersSent) res.status(500).send('Error streaming file');
    }
});

// --- System Update Endpoints ---

app.get('/api/system/info', (req, res) => {
    res.json({
        ok: true,
        hubId: hubConfig.hubId,
        name: hubConfig.name,
        version: hubConfig.version,
        status: 'online',
        uptime: process.uptime()
    });
});

app.get('/api/system/check-update', (req, res) => {
    // 1. Check Git
    exec('git fetch && git status -uno', (err, stdoutGit, stderrGit) => {
        const gitUpdateAvailable = !err && stdoutGit.includes('Your branch is behind');
        
        // 2. Check APT (Simulate) - Uses cached lists, so it might be slightly stale but safe without sudo
        exec('apt-get -s upgrade', (err2, stdoutApt, stderrApt) => {
            let aptUpdateAvailable = false;
            let aptMessage = "";
            
            if (!err2) {
                // Look for "X upgraded"
                const match = stdoutApt.match(/(\d+) upgraded/);
                if (match && parseInt(match[1]) > 0) {
                    aptUpdateAvailable = true;
                    aptMessage = `${match[1]} system packages available.`;
                }
            }
            
            const canUpdate = gitUpdateAvailable || aptUpdateAvailable;
            let message = "";
            if (gitUpdateAvailable) message += "Hub software update available.\n";
            if (aptUpdateAvailable) message += aptMessage;
            
            if (!canUpdate) message = "System is up to date.";

            res.json({ canUpdate, message, git: gitUpdateAvailable, apt: aptUpdateAvailable });
        });
    });
});

app.post('/api/system/update', (req, res) => {
    console.log('Starting system update...');
    
    // We attempt to update both. 
    // Note: sudo apt-get upgrade -y requires passwordless sudo for the user running this script.
    const cmd = 'git pull && npm install && sudo apt-get update && sudo apt-get upgrade -y && sudo apt-get autoremove -y';

    // Increase maxBuffer to 5MB to handle verbose apt output
    exec(cmd, { maxBuffer: 1024 * 1024 * 5 }, (err, stdout, stderr) => {
        if (err) {
            console.error('Update failed:', stderr);
            return res.status(500).json({ error: 'Update failed', details: stderr });
        }
        console.log('Update successful:', stdout);
        res.json({ success: true, message: 'Update successful. Restarting...' });
        
        // Restart the server after a short delay
        setTimeout(() => {
            console.log('Restarting server...');
            process.exit(0); // Systemd/PM2 should restart this process
        }, 1000);
    });
});

const https = require('https');
const http = require('http');

// WebSocket Upgrade Handling
const wss = new WebSocket.Server({ noServer: true });

const handleUpgrade = (request, socket, head) => {
    const parsedUrl = url.parse(request.url, true);
    const pathname = parsedUrl.pathname;
    
    if (pathname === '/api/camera/stream/ws') {
        wss.handleUpgrade(request, socket, head, (ws) => {
            const query = parsedUrl.query;
            const deviceId = query.deviceId;
            const rtspUrl = query.rtspUrl;
            
            if (deviceId && rtspUrl) {
                const stream = cameraStreamManager.getStream(deviceId, rtspUrl);
                stream.addClient(ws);
            } else {
                ws.close();
            }
        });
    } else {
        socket.destroy();
    }
};

let server;
try {
    const httpsOptions = {
        key: fs.readFileSync('server.key'),
        cert: fs.readFileSync('server.cert')
    };
    server = https.createServer(httpsOptions, app);
    server.listen(port, () => {
        console.log(`Server running at https://localhost:${port}`);
    });

    // Also start HTTP server for local devices (Mobile App WebView) to bypass SSL
    const httpPort = parseInt(port) + 1;
    const httpServer = http.createServer(app);
    httpServer.listen(httpPort, () => {
        console.log(`HTTP Server (for local streaming) running at http://localhost:${httpPort}`);
    });
    httpServer.on('upgrade', handleUpgrade);

} catch (e) {
    console.log('SSL certificates not found or invalid, falling back to HTTP');
    server = app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}

server.on('upgrade', handleUpgrade);

(async () => {
  try {
    await db.testConnection();
    console.log('Database connection: OK');
  } catch (err) {
    console.error('Database connection: FAILED');
    console.error(err.message || err);
    console.error('\nCommon causes: SQL Server not running, TCP/IP disabled, wrong host/port, firewall, or SQL auth disabled.');
  }
})();

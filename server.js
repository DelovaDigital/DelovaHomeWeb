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
const { exec } = require('child_process');
const db = require('./script/db');
const nasManager = require('./script/nasManager');
const cameraStreamManager = require('./script/cameraStream');
const WebSocket = require('ws');
const url = require('url');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
// Serve static files from project root
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
    const sql = db.sql;
    // Try to discover a suitable users table and column names dynamically.
    // 1) look for tables with "user" or "gebruik" in the name
    const tablesRes = await pool.request()
      .query("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND (LOWER(TABLE_NAME) LIKE '%user%' OR LOWER(TABLE_NAME) LIKE '%gebruik%')");

    let candidates = tablesRes.recordset || [];
    // fallback common names if discovery found nothing
    if (candidates.length === 0) {
      candidates = [
        { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Users' },
        { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'User' },
        { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Accounts' },
        { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Gebruikers' }
      ];
    }

    let user = null;
    let foundMeta = null;

    for (const t of candidates) {
      const schema = t.TABLE_SCHEMA;
      const table = t.TABLE_NAME;
      // get columns for this table
      const colsRes = await pool.request()
        .input('schema', sql.NVarChar, schema)
        .input('table', sql.NVarChar, table)
        .query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema AND TABLE_NAME=@table");

      const cols = (colsRes.recordset || []).map(r => r.COLUMN_NAME);
      // heuristics for username / password / id columns
      const usernameCol = cols.find(c => /^(username|user_name|user|login|gebruikersnaam)$/i.test(c)) || cols.find(c => /user/i.test(c));
      const passwordCol = cols.find(c => /^(password|passwordhash|passwoord|wachtwoord|pwd|pass_hash)$/i.test(c)) || cols.find(c => /(pass|pwd|hash|wacht)/i.test(c));
      const idCol = cols.find(c => /^(id|user_id|userid|userId)$/i.test(c)) || cols.find(c => /id$/i.test(c));

      if (!usernameCol || !passwordCol) {
        // try next candidate
        continue;
      }

      // build safe query using bracket quoting
      const selId = idCol ? `[${idCol}] AS id,` : '';
      const q = `SELECT ${selId} [${usernameCol}] AS username, [${passwordCol}] AS passwordHash FROM [${schema}].[${table}] WHERE [${usernameCol}] = @username`;

      try {
        const result = await pool.request()
          .input('username', sql.NVarChar(255), username)
          .query(q);

        if (result.recordset && result.recordset.length > 0) {
          user = result.recordset[0];
          foundMeta = { schema, table, usernameCol, passwordCol, idCol };
          break;
        }
      } catch (err) {
        // ignore and try next candidate
        console.warn('Query against', schema + '.' + table, 'failed:', err && err.message);
        continue;
      }
    }

    if (!user) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    // Authentication succeeded. For now respond with a simple success payload.
    // In production, create a session or issue a JWT instead of returning raw user data.
    res.json({ ok: true, userId: user.id || null, username: user.username, meta: foundMeta });
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
    const sql = db.sql;

    // discover candidate user tables similar to login logic
    const tablesRes = await pool.request()
      .query("SELECT TABLE_SCHEMA, TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE='BASE TABLE' AND (LOWER(TABLE_NAME) LIKE '%user%' OR LOWER(TABLE_NAME) LIKE '%gebruik%')");
    let candidates = tablesRes.recordset || [];
    if (candidates.length === 0) {
      candidates = [
        { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Users' },
        { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'User' },
        { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Accounts' },
        { TABLE_SCHEMA: 'dbo', TABLE_NAME: 'Gebruikers' }
      ];
    }

    let created = false;
    let createdMeta = null;

    for (const t of candidates) {
      const schema = t.TABLE_SCHEMA;
      const table = t.TABLE_NAME;
      const colsRes = await pool.request()
        .input('schema', sql.NVarChar, schema)
        .input('table', sql.NVarChar, table)
        .query("SELECT COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA=@schema AND TABLE_NAME=@table");

      const cols = (colsRes.recordset || []).map(r => ({ name: r.COLUMN_NAME, nullable: r.IS_NULLABLE === 'YES' }));
      const colNames = cols.map(c => c.name);

      const usernameCol = colNames.find(c => /^(username|user_name|user|login|gebruikersnaam)$/i.test(c)) || colNames.find(c => /user/i.test(c));
      const passwordCol = colNames.find(c => /^(password|passwordhash|passwoord|wachtwoord|pwd|pass_hash)$/i.test(c)) || colNames.find(c => /(pass|pwd|hash|wacht)/i.test(c));

      if (!usernameCol || !passwordCol) continue;

      // check duplicate
      const existsQ = `SELECT COUNT(1) AS cnt FROM [${schema}].[${table}] WHERE [${usernameCol}] = @username`;
      const existsRes = await pool.request().input('username', sql.NVarChar(255), username).query(existsQ);
      if (existsRes.recordset && existsRes.recordset[0] && existsRes.recordset[0].cnt > 0) {
        return res.status(409).json({ ok: false, message: 'User already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      // attempt insert; build columns/params only for username & password
      const insertQ = `INSERT INTO [${schema}].[${table}] ([${usernameCol}], [${passwordCol}]) VALUES (@username, @passwordHash)`;
      try {
        await pool.request()
          .input('username', sql.NVarChar(255), username)
          .input('passwordHash', sql.NVarChar(4000), passwordHash)
          .query(insertQ);

        created = true;
        createdMeta = { schema, table, usernameCol, passwordCol };
        break;
      } catch (err) {
        console.warn('Insert into', schema + '.' + table, 'failed:', err && err.message);
        // try next candidate
        continue;
      }
    }

    if (!created) return res.status(500).json({ ok: false, message: 'Could not create user; table/columns may be incompatible' });

    res.json({ ok: true, message: 'User created', meta: createdMeta });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ ok: false, message: 'Server error' });
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

// Device API
app.get('/api/devices', (req, res) => {
    res.json(deviceManager.getAllDevices());
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

app.get('/api/system/check-update', (req, res) => {
    // Check if we are behind origin/main
    exec('git fetch && git status -uno', (err, stdout, stderr) => {
        if (err) {
            console.error('Git check failed:', err);
            return res.status(500).json({ error: 'Failed to check for updates' });
        }
        // "Your branch is behind" indicates an update is available
        const canUpdate = stdout.includes('Your branch is behind');
        res.json({ canUpdate, message: stdout });
    });
});

app.post('/api/system/update', (req, res) => {
    console.log('Starting system update...');
    exec('git pull && npm install', (err, stdout, stderr) => {
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
const fs = require('fs');

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
} catch (e) {
    console.log('SSL certificates not found or invalid, falling back to HTTP');
    server = app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}

// WebSocket Upgrade Handling
const wss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
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
});

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

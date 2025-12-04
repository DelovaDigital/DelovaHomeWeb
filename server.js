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
const db = require('./script/db');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

// Serve static files from project root
app.use(express.static(path.join(__dirname)));

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

app.listen(port, () => console.log(`Server running at http://localhost:${port}`));

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

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
const knxManager = require('./script/knxManager');
const mqttManager = require('./script/mqttManager');
const mqttBroker = require('./script/mqttBroker');
const energyManager = require('./script/energyManager');
const automationManager = require('./script/automationManager');
const sceneManager = require('./script/sceneManager'); // Scene & Mode Management
const ps5Manager = require('./script/ps5Manager');
const psnManager = require('./script/psnManager');
const presenceManager = require('./script/presenceManager');
const aiManager = require('./script/aiManager');
const hueManager = require('./script/hueManager');
const discoveryService = require('./script/discoveryService');
const cloudClient = require('./script/cloudClient');
const WebSocket = require('ws');
const url = require('url');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const Bonjour = require('bonjour-service').Bonjour;
const dgram = require('dgram');

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
const DEFAULT_HUB_CONFIG = {
    hubId: null,
    name: 'DelovaHome Hub',
    version: '1.0.0'
};
let hubConfig = { ...DEFAULT_HUB_CONFIG };

// Load or Generate Hub ID
if (fs.existsSync(HUB_CONFIG_PATH)) {
    try {
        const loadedConfig = JSON.parse(fs.readFileSync(HUB_CONFIG_PATH, 'utf8'));
        // Merge loaded config with defaults to ensure all fields exist
        hubConfig = { ...DEFAULT_HUB_CONFIG, ...loadedConfig };
    } catch (e) { console.error('Error reading hub config:', e); }
}

if (!hubConfig.hubId) {
    hubConfig.hubId = uuidv4();
    try {
        fs.writeFileSync(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2));
        console.log('Generated new Hub ID:', hubConfig.hubId);
    } catch (e) { console.error('Error saving hub config:', e); }
} else {
    // Ensure file is up to date with any missing default fields
    try {
        fs.writeFileSync(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2));
    } catch (e) { console.error('Error updating hub config:', e); }
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

        // Sync HubId - DISABLED for Multi-Hub Isolation
        // We want each Hub to maintain its own identity (hub_config.json) and not sync with a global DB value.
        /*
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
        */
       console.log(`Multi-Hub Isolation: Using Local Hub ID: ${hubConfig.hubId}`);

        // Sync HubName - DISABLED for Multi-Hub Isolation
        /*
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
        */
        
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
        const tableRes = await pool.request().query("SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'Users' AND TABLE_SCHEMA = 'dbo'");
        
        if (tableRes.recordset.length === 0) {
            console.log('Creating Users table...');
            await pool.request().query(`
                CREATE TABLE Users (
                    Id INT IDENTITY(1,1) PRIMARY KEY,
                    Username NVARCHAR(255) NOT NULL,
                    PasswordHash NVARCHAR(255) NOT NULL,
                    Role NVARCHAR(50) DEFAULT 'User',
                    HubID NVARCHAR(255) NOT NULL,
                    CreatedAt DATETIME DEFAULT GETDATE()
                )
            `);
            // Add unique constraint for Username + HubID
            await pool.request().query("ALTER TABLE Users ADD CONSTRAINT UQ_Username_HubID UNIQUE(Username, HubID)");
            console.log('Created Users table with HubID support.');
        } else {
            console.log('Users table exists. Verifying schema...');
            const colsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND TABLE_SCHEMA = 'dbo'");
            const cols = colsRes.recordset.map(r => r.COLUMN_NAME.toLowerCase());

            // Add HubID if it doesn't exist
            if (!cols.includes('hubid')) {
                console.log('Schema Update: Adding HubID column...');
                await pool.request().query("ALTER TABLE Users ADD HubID NVARCHAR(255)");
                
                // Migrate existing users to the current hub ID.
                console.log('Migrating existing users to current HubID...');
                await pool.request().query(`UPDATE Users SET HubID = '${hubConfig.hubId}' WHERE HubID IS NULL`);

                // Now make it NOT NULL
                await pool.request().query("ALTER TABLE Users ALTER COLUMN HubID NVARCHAR(255) NOT NULL");
                
                // Drop the old unique constraint on Username if it exists, then add the new composite one
                try {
                    // Find the name of the unique constraint on Username
                    const constraintRes = await pool.request().query(`
                        SELECT name FROM sys.key_constraints 
                        WHERE type = 'UQ' AND parent_object_id = OBJECT_ID('Users') 
                        AND OBJECT_NAME(parent_object_id) = 'Users'
                    `);

                    const usernameConstraint = constraintRes.recordset.find(r => {
                        const getColumnForConstraint = `
                            SELECT col_name(parent_object_id, column_id) as ColumnName
                            FROM sys.index_columns
                            WHERE object_id = OBJECT_ID('Users') 
                            AND index_id = (SELECT index_id FROM sys.indexes WHERE name = '${r.name}')
                        `;
                        // This is getting too complex for a simple check. Let's just try to drop a common default name.
                        return true;
                    });
                    
                    if (constraintRes.recordset.length > 0) {
                        const constraintName = constraintRes.recordset[0].name;
                         // Only drop if it's a single-column constraint on Username
                        const colCountRes = await pool.request().query(`
                            SELECT COUNT(1) as cnt FROM sys.index_columns 
                            WHERE object_id = OBJECT_ID('Users') 
                            AND index_id = (SELECT index_id FROM sys.indexes WHERE name = '${constraintName}')
                        `);

                        if(colCountRes.recordset[0].cnt === 1) {
                            console.log(`Dropping old unique constraint '${constraintName}' on Username...`);
                            await pool.request().query(`ALTER TABLE Users DROP CONSTRAINT ${constraintName}`);
                        }
                    }
                } catch(e) {
                    console.warn("Could not drop old unique constraint on username, it might not exist or logic was flawed. Continuing.", e.message);
                }

                console.log('Adding composite unique constraint on Username and HubID...');
                try {
                    await pool.request().query("ALTER TABLE Users ADD CONSTRAINT UQ_Username_HubID UNIQUE(Username, HubID)");
                } catch(e) {
                    if (e.message.includes("already exists")) {
                        console.log("Composite unique constraint already exists.");
                    } else {
                        throw e;
                    }
                }
            }

            // Drop HubAccess column if it exists
            if (cols.includes('hubaccess')) {
                console.log('Schema Update: Dropping obsolete HubAccess column...');
                // First drop default constraint if it exists
                try {
                    const constraintRes = await pool.request().query(`
                        SELECT name FROM sys.default_constraints 
                        WHERE parent_object_id = OBJECT_ID('Users') 
                        AND col_name(parent_object_id, parent_column_id) = 'HubAccess'
                    `);
                    if (constraintRes.recordset.length > 0) {
                        const constraintName = constraintRes.recordset[0].name;
                        await pool.request().query(`ALTER TABLE Users DROP CONSTRAINT ${constraintName}`);
                    }
                } catch (e) {
                    console.warn("Could not drop default constraint for HubAccess, it might not exist.", e.message);
                }
                await pool.request().query("ALTER TABLE Users DROP COLUMN HubAccess");
            }

            // Check for Role
            if (!cols.includes('role')) {
                console.log('Schema Update: Adding Role column...');
                await pool.request().query("ALTER TABLE Users ADD Role NVARCHAR(50) DEFAULT 'User'");
            }
            
            // Check for CreatedAt
            if (!cols.includes('createdat')) {
                 console.log('Schema Update: Adding CreatedAt column...');
                 await pool.request().query("ALTER TABLE Users ADD CreatedAt DATETIME DEFAULT GETDATE()");
            }

            // --- Add columns for Spotify per-user auth ---
            if (!cols.includes('spotifyaccesstoken')) {
                console.log('Schema Update: Adding SpotifyAccessToken column...');
                await pool.request().query("ALTER TABLE Users ADD SpotifyAccessToken NVARCHAR(512) NULL");
            }
            if (!cols.includes('spotifyrefreshtoken')) {
                console.log('Schema Update: Adding SpotifyRefreshToken column...');
                await pool.request().query("ALTER TABLE Users ADD SpotifyRefreshToken NVARCHAR(512) NULL");
            }
            if (!cols.includes('spotifytokenexpiration')) {
                console.log('Schema Update: Adding SpotifyTokenExpiration column...');
                await pool.request().query("ALTER TABLE Users ADD SpotifyTokenExpiration BIGINT NULL");
            }
        }
    } catch (err) {
        console.error('Error initializing Users table:', err);
    }
}

async function initPresenceUsers() {
    try {
        const pool = await db.getPool();
        const result = await pool.request()
            .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
            .query("SELECT Id, Username FROM Users WHERE HubID = @hubId");
            
        result.recordset.forEach(user => {
            presenceManager.addPerson(user.Id, user.Username, 'mobile-app');
        });
        console.log(`[Presence] Loaded ${result.recordset.length} users from DB.`);
    } catch (e) {
        console.error('Failed to load users for presence:', e);
    }
}

// Run DB sync asynchronously, catch any top-level errors
initHubConfigFromDB()
    .then(() => initUsersTable())
    .then(() => initPresenceUsers())
    .catch(err => console.error('Fatal DB Sync Error:', err));

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

app.get('/api/cloud/status', (req, res) => {
    const status = cloudClient.getConnectionStatus();
    const config = cloudClient.config || {};
    res.json({ 
        ...status,
        cloudUrl: config.cloudUrl,
        hubId: hubConfig.hubId 
    });
});

app.post('/api/cloud/reconnect', (req, res) => {
    try {
        console.log('[API] Manual cloud reconnect requested');
        cloudClient.disconnect(); // Clean disconnect
        setTimeout(() => {
            cloudClient.connect(); // Reconnect after a short delay
        }, 1000);
        res.json({ success: true, message: 'Reconnect initiated' });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Start mDNS Advertisement
let bonjour;
try {
    bonjour = new Bonjour();
    // Publish as generic HTTP (for compatibility)
    bonjour.publish({ name: `DelovaHome-${hubConfig.hubId.substring(0, 8)}`, type: 'http', port: port, txt: { id: hubConfig.hubId, version: hubConfig.version, type: 'delovahome' } });
    // Publish as specific service type (for better discovery)
    bonjour.publish({ name: `DelovaHome-${hubConfig.hubId.substring(0, 8)}`, type: 'delovahome', port: port, txt: { id: hubConfig.hubId, version: hubConfig.version } });
    console.log(`Advertising DelovaHome Hub on network (ID: ${hubConfig.hubId})`);
} catch (e) {
    console.error('Failed to start mDNS advertisement:', e);
}

// Start UDP Broadcast Listener (Fallback Discovery)
// MOVED TO BOTTOM OF FILE TO AVOID CONFLICTS


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
    
    // Find the user for the current hub
    const result = await pool.request()
        .input('username', db.sql.NVarChar(255), username)
        .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
        .query("SELECT Id, Username, PasswordHash, Role FROM Users WHERE Username = @username AND HubID = @hubId");

    const user = result.recordset[0];

    if (!user) {
      // To prevent user enumeration, we give a generic error.
      // Multi-Hub Isolation: Do NOT check other hubs.
      /*
      const otherHubsRes = await pool.request()
        .input('username', db.sql.NVarChar(255), username)
        .query("SELECT COUNT(1) as cnt FROM Users WHERE Username = @username");
      
      if (otherHubsRes.recordset[0].cnt > 0) {
          return res.status(401).json({ ok: false, message: 'Invalid credentials. This user may exist on another hub.' });
      }
      */
        
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    const match = await bcrypt.compare(password, user.PasswordHash);
    if (!match) {
      return res.status(401).json({ ok: false, message: 'Invalid credentials' });
    }

    // Authentication succeeded.
    
    // Auto-register user for presence tracking
    presenceManager.addPerson(user.Id, user.Username, 'mobile-app');

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
    
    // Check if user exists for this specific hub
    const existsRes = await pool.request()
        .input('username', db.sql.NVarChar(255), username)
        .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
        .query("SELECT COUNT(1) as cnt FROM Users WHERE Username = @username AND HubID = @hubId");
    
    if (existsRes.recordset[0].cnt > 0) {
        return res.status(409).json({ ok: false, message: 'User already exists on this hub' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    
    await pool.request()
        .input('username', db.sql.NVarChar(255), username)
        .input('passwordHash', db.sql.NVarChar(255), passwordHash)
        .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
        .query("INSERT INTO Users (Username, PasswordHash, HubID) VALUES (@username, @passwordHash, @hubId)");

    res.json({ ok: true, message: 'User created' });
  } catch (err) {
    // Catch unique constraint violation error
    if (err.number === 2627 || err.number === 2601) { // Unique constraint violation
        return res.status(409).json({ ok: false, message: 'User already exists on this hub' });
    }
    console.error('Register error:', err);
    res.status(500).json({ ok: false, message: 'Server error' });
  }
});

// --- General Settings API ---
app.get('/api/settings', (req, res) => {
    // Return safe subset of hubConfig
    res.json({
        hubId: hubConfig.hubId,
        name: hubConfig.name,
        version: hubConfig.version,
        timezone: hubConfig.timezone || 'Europe/Brussels'
    });
});

app.post('/api/settings', express.json(), (req, res) => {
    const { timezone, name } = req.body || {};
    let changed = false;

    if (timezone) {
        hubConfig.timezone = timezone;
        automationManager.setTimezone(timezone);
        changed = true;
    }
    
    if (name) {
        hubConfig.name = name;
        changed = true;
    }

    if (changed) {
        try {
            fs.writeFileSync(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2));
            res.json({ ok: true, settings: hubConfig });
        } catch (e) {
            res.status(500).json({ ok: false, message: 'Failed to save settings' });
        }
    } else {
        res.json({ ok: true });
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
            .query("SELECT Id, Username, Role, HubID FROM Users WHERE Id = @id");
        
        if (result.recordset.length > 0) {
            const user = result.recordset[0];
            // IMPORTANT: Check if the user belongs to the current hub
            if (user.HubID !== hubConfig.hubId) {
                return res.status(403).json({ ok: false, message: 'Access to this hub is denied for this user.' });
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

// Check if setup is needed (i.e., no users exist)
app.get('/api/setup/status', async (req, res) => {
    try {
        const pool = await db.getPool();
        const result = await pool.request()
            .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
            .query("SELECT COUNT(*) as count FROM Users WHERE HubID = @hubId");
        
        res.json({ 
            ok: true, 
            setupNeeded: result.recordset[0].count === 0 
        });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// List Users Endpoint
app.get('/api/users', async (req, res) => {
    try {
        const pool = await db.getPool();
        const result = await pool.request()
            .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
            .query(`
                SELECT 
                    Id, 
                    Username, 
                    Role, 
                    CreatedAt,
                    CASE WHEN SpotifyAccessToken IS NOT NULL THEN 1 ELSE 0 END AS HasSpotify
                FROM Users 
                WHERE HubID = @hubId
            `);
        res.json({ ok: true, users: result.recordset });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// Delete User Endpoint
app.delete('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        const pool = await db.getPool();
        // Ensure we only delete users belonging to this hub
        const result = await pool.request()
            .input('id', db.sql.Int, userId)
            .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
            .query("DELETE FROM Users WHERE Id = @id AND HubID = @hubId");
            
        if (result.rowsAffected[0] > 0) {
            // Remove from Presence Manager
            presenceManager.removePerson(userId);
            
            res.json({ ok: true });
        } else {
            res.status(404).json({ ok: false, message: 'User not found or not authorized' });
        }
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// Create User Endpoint
app.post('/api/users', async (req, res) => {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ ok: false, message: 'Username and password required' });

    try {
        const pool = await db.getPool();
        
        // Check if username exists on this hub
        const check = await pool.request()
            .input('username', db.sql.NVarChar(255), username)
            .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
            .query("SELECT Id FROM Users WHERE Username = @username AND HubID = @hubId");
            
        if (check.recordset.length > 0) {
            return res.status(400).json({ ok: false, message: 'Username already exists on this Hub' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const insertResult = await pool.request()
            .input('username', db.sql.NVarChar(255), username)
            .input('passwordHash', db.sql.NVarChar(255), hashedPassword)
            .input('role', db.sql.NVarChar(50), role || 'User')
            .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
            .query("INSERT INTO Users (Username, PasswordHash, Role, HubID, CreatedAt) VALUES (@username, @passwordHash, @role, @hubId, GETDATE()); SELECT SCOPE_IDENTITY() AS Id;");
            
        const newUserId = insertResult.recordset[0].Id;

        // Add to Presence Manager immediately
        presenceManager.addPerson(newUserId, username, 'mobile-app');

        // Sync with Cloud if connected
        if (cloudClient.isConnected()) {
             try {
                 console.log(`[Cloud] Syncing new user '${username}' to Cloud...`);
                 await cloudClient.registerUser(username, password);
                 console.log(`[Cloud] User '${username}' synced successfully.`);
             } catch (e) {
                 console.error('[Cloud] Failed to sync user to cloud:', e.message);
                 // Don't fail the request, just log it.
             }
        }

        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// Update User Role Endpoint
app.put('/api/users/:id', async (req, res) => {
    const userId = req.params.id;
    const { role } = req.body;
    
    try {
        const pool = await db.getPool();
        await pool.request()
            .input('id', db.sql.Int, userId)
            .input('role', db.sql.NVarChar(50), role)
            .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
            .query("UPDATE Users SET Role = @role WHERE Id = @id AND HubID = @hubId");
            
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

const deviceManager = require('./script/deviceManager');
const sonosManager = require('./script/sonosManager');

// Load spotifyManager defensively to avoid crashing the whole server if the module has syntax errors
let spotifyManager;
try {
    spotifyManager = require('./script/spotifyManager');
    spotifyManager.available = true;
} catch (e) {
    console.error('Failed to load spotifyManager module:', e);
    // Provide a safe fallback so routes can still operate without Spotify
    spotifyManager = {
        available: false,
        getAuthUrl: () => null,
        handleCallback: async () => false,
        getPlaybackState: async () => null,
        play: async () => { throw new Error('Spotify unavailable'); },
        pause: async () => { throw new Error('Spotify unavailable'); },
        next: async () => { throw new Error('Spotify unavailable'); },
        previous: async () => { throw new Error('Spotify unavailable'); },
        setVolume: async () => { throw new Error('Spotify unavailable'); },
        transferPlayback: async () => { throw new Error('Spotify unavailable'); },
        playContext: async () => { throw new Error('Spotify unavailable'); },
        playUris: async () => { throw new Error('Spotify unavailable'); },
        getDevices: async () => [],
        getUserPlaylists: async () => [],
        getUserAlbums: async () => [],
        search: async () => ({ tracks: [], artists: [] })
    };
}

// --- Spotify API ---

// This endpoint starts the OAuth flow for a specific user.
app.get('/api/spotify/login', (req, res) => {
    // The user ID must be passed to know who to link the token to.
    let { userId, username } = req.query;
    
    // Fallback to Cloud Headers if missing
    if (!username && req.headers['x-delova-username']) {
        username = req.headers['x-delova-username'];
    }

    // If userId is missing but we have username, that's fine, spotifyManager will resolve it.
    // If userId is present but is a UUID (Cloud ID), we also rely on username.
    
    if (!userId && !username) {
        return res.status(400).send('User ID or Username is required to link Spotify account.');
    }
    
    // Determine Base URL (Handle Cloud Proxy)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const localBaseUrl = `${protocol}://${host}`;
    
    const url = spotifyManager.getAuthUrl(userId, username, localBaseUrl, hubConfig.hubId);
    if (url) {
        res.redirect(url);
    } else {
        res.status(500).send('Spotify Client ID not configured');
    }
});

// Spotify redirects here after the user grants permission.
app.get('/api/spotify/callback', async (req, res) => {
    const { code, state } = req.query;
    try {
        if (await spotifyManager.handleCallback(code, state)) {
            // Try to redirect back to the settings page if localBaseUrl is available
            try {
                const stateObj = JSON.parse(Buffer.from(state, 'base64').toString('utf8'));
                if (stateObj.localBaseUrl) {
                    return res.redirect(`${stateObj.localBaseUrl}/pages/settings.html?tab=integrations`);
                }
            } catch (e) {
                console.error('Error parsing state for redirect:', e);
            }
            // Fallback if no localBaseUrl
            res.send('<script>window.close();</script>');
        } else {
            res.status(500).send('Spotify authentication failed. Check server logs.');
        }
    } catch (e) {
        console.error('Spotify Callback Error:', e);
        res.status(500).send('Internal Server Error during Spotify Callback');
    }
});

app.post('/api/spotify/logout', async (req, res) => {
    const userId = req.body.userId;
    if (!userId) {
        return res.status(400).json({ ok: false, message: 'Missing userId' });
    }
    const success = await spotifyManager.disconnect(userId);
    if (success) {
        res.json({ ok: true });
    } else {
        res.status(500).json({ ok: false, message: 'Failed to disconnect Spotify' });
    }
});

// A middleware to extract userId for spotify routes
const requireSpotifyUser = async (req, res, next) => {
    let userId = req.query.userId || (req.body && req.body.userId);
    let username = req.query.username || (req.body && req.body.username);
    
    // Fallback to Cloud Headers
    if (!username && req.headers['x-delova-username']) {
        username = req.headers['x-delova-username'];
    }

    if (!userId && !username) {
        return res.status(400).json({ ok: false, message: 'Missing userId or username for Spotify request' });
    }

    // If userId is missing or invalid (UUID), try to resolve it from username
    if ((!userId || !/^\d+$/.test(userId)) && username) {
        try {
            const pool = await db.getPool();
            // Try exact match first
            let result = await pool.request()
                .input('username', db.sql.NVarChar(255), username)
                .query('SELECT Id FROM Users WHERE Username = @username');
            
            if (result.recordset.length > 0) {
                userId = result.recordset[0].Id;
            } else {
                // Try case-insensitive match on Hub
                const hubId = hubConfig.hubId;
                result = await pool.request()
                    .input('hubId', db.sql.NVarChar(255), hubId)
                    .query('SELECT Id, Username FROM Users WHERE HubID = @hubId');
                
                const match = result.recordset.find(u => u.Username.toLowerCase() === username.toLowerCase());
                if (match) {
                    userId = match.Id;
                } else if (result.recordset.length > 0) {
                    // Fallback to first user
                    userId = result.recordset[0].Id;
                }
            }
        } catch (e) {
            console.error('Error resolving user in middleware:', e);
        }
    }

    req.userId = userId;
    req.username = username;
    next();
};

app.get('/api/spotify/status', requireSpotifyUser, async (req, res) => {
    try {
        const state = await spotifyManager.getPlaybackState(req.userId, req.username);
        res.json(state || { is_playing: false });
    } catch (e) {
        console.error('Error getting spotify status:', e);
        res.json({ is_playing: false, error: 'Spotify unavailable' });
    }
});

// This 'me' is about the Spotify connection, not the hub user. 
app.get('/api/spotify/me', requireSpotifyUser, async (req, res) => { 
    try {
        const headers = await spotifyManager.getHeaders(req.userId, req.username);
        if (!headers) {
            return res.json({ available: false, device: null, message: 'Spotify not linked' });
        }
        
        // We can optionally fetch the device state here too
        const state = await spotifyManager.getPlaybackState(req.userId, req.username);
        res.json({ available: true, device: state && state.device ? state.device : null });

    } catch (e) {
        console.error('Error in /api/spotify/me:', e);
        res.json({ available: false, device: null });
    }
});



// Helper to resolve Cast Device ID to Spotify Device ID
async function resolveSpotifyDeviceId(userId, deviceId) {
    // Handle special local device IDs (cast:IP or sonos:UUID)
    if (typeof deviceId === 'string' && (deviceId.startsWith('cast:') || deviceId.startsWith('sonos:'))) {
        const isCast = deviceId.startsWith('cast:');
        const id = deviceId.split(':')[1]; // IP or UUID
        let localDevice = null;
        
        if (isCast) {
             const d = deviceManager.getCastDevices().find(d => d.ip === id);
             if (d) localDevice = { name: d.name, type: 'cast' };
        } else {
             // Sonos
             const devices = sonosManager.getDiscoveredDevices();
             const d = devices.find(d => d.uuid === id);
             if (d) localDevice = { name: d.name, type: 'sonos' };
        }

        if (!localDevice) {
            console.warn(`[Spotify] Could not find local device details for ${deviceId}`);
            return deviceId; 
        }

        console.log(`[Spotify] Resolving Spotify Connect ID for '${localDevice.name}' (${localDevice.type})...`);
        
        if (isCast) {
            try {
                // Only Cast needs explicit launch
                await deviceManager.launchSpotifyOnCastDevice(id);
            } catch (e) {
                console.warn('Failed to launch Spotify on Cast device:', e);
            }
        }
        
        // Polling loop to wait for device to appear in Spotify Connect
        for (let i = 0; i < 20; i++) {
            // Check cache first if possible, but here we call API
            // Add slight delay before first check if launching
            if (i > 0) await new Promise(r => setTimeout(r, 1000));
            
            const devices = await spotifyManager.getDevices(userId);
            
            // Loose matching for device names
            // Sonos names often match exactly, but might have encoding diffs or extra spaces
            const match = devices.find(d => 
                d.name === localDevice.name || 
                d.name.toLowerCase().includes(localDevice.name.toLowerCase()) ||
                localDevice.name.toLowerCase().includes(d.name.toLowerCase())
            );

            if (match) {
                console.log(`[Spotify] Found resolved ID: ${match.id} (matched ${match.name})`);
                return match.id;
            }
        }
        
        console.warn(`[Spotify] Timeout waiting for '${localDevice.name}' to appear.`);
        // If we can't find it, we return the original ID, which will likely fail in Spotify API,
        // but it allows the 'transfer-or-sonos' endpoint to catch it later if using that flow.
        return deviceId;
    }
    return deviceId;
}

app.post('/api/spotify/control', requireSpotifyUser, async (req, res) => {
    const { command, value, deviceId } = req.body;
    try {
        // Resolve device ID if it's a Cast device
        let targetDeviceId = deviceId;
        if (command === 'transfer') targetDeviceId = value; // Transfer passes ID in value
        
        if (targetDeviceId && targetDeviceId.startsWith('cast:')) {
            targetDeviceId = await resolveSpotifyDeviceId(req.userId, targetDeviceId);
        }

        // Handle Sonos explicit ID resolution (if selected from our merged list)
        if (targetDeviceId && targetDeviceId.startsWith('sonos:')) {
            const uuid = targetDeviceId.replace('sonos:', '');
            // Try to resolve to a Spotify Device ID
            let resolved = await resolveSpotifyDeviceId(req.userId, { name: 'Sonos', id: targetDeviceId }); // Helper usually takes device object, but we'll adapt logic
            
            // If resolveSpotifyDeviceId just returns input, it means it failed.
            // We need a specific logic for Sonos UUID -> Spotify ID resolution
            // We can try to find a spotify device with same name as sonos device
            try {
               const sonosDev = await sonosManager._getDevice(uuid); // This is internal but useful
               if (sonosDev) {
                   const spotifyDevices = await spotifyManager.getDevices(req.userId, req.username);
                   const match = spotifyDevices.find(d => 
                       d.name.toLowerCase() === sonosDev.Name.toLowerCase() ||
                       (d.name.toLowerCase().includes(sonosDev.Name.toLowerCase()) && d.type === 'Speaker')
                   );
                   if (match) {
                       console.log(`[Spotify] Resolved Sonos ${uuid} (${sonosDev.Name}) to Spotify ID ${match.id}`);
                       targetDeviceId = match.id;
                   } else {
                       console.warn(`[Spotify] Could not resolve Sonos ${uuid} to a Spotify Device ID. Falling back to explicit Sonos playback if applicable.`);
                       
                       // Fallback for UPnP control
                       if (command === 'play_context' || command === 'play') {
                           const uri = command === 'play_context' ? value : (value && value.uris ? value.uris[0] : null);
                           if (uri) {
                               console.log(`[Spotify] Fallback: Playing URI directly on Sonos via UPnP: ${uri}`);
                               await sonosManager.play(uuid, uri, null);
                               return res.json({ ok: true, method: 'sonos_fallback' });
                           }
                       } else if (command === 'next') {
                           await sonosManager.next(uuid);
                           return res.json({ ok: true, method: 'sonos_fallback' });
                       } else if (command === 'previous') {
                           await sonosManager.previous(uuid);
                           return res.json({ ok: true, method: 'sonos_fallback' });
                       } else if (command === 'pause') {
                           await sonosManager.pause(uuid);
                           return res.json({ ok: true, method: 'sonos_fallback' });
                       }
                   }
               }
            } catch (e) {
                console.error('[Spotify] Error resolving Sonos ID:', e);
            }
        }

        if (command === 'play') await spotifyManager.play(req.userId, value ? value.uris : undefined, targetDeviceId, req.username);
        else if (command === 'pause') await spotifyManager.pause(req.userId, req.username);
        else if (command === 'next') await spotifyManager.next(req.userId, req.username);
        else if (command === 'previous') await spotifyManager.previous(req.userId, req.username);
        else if (command === 'set_volume') await spotifyManager.setVolume(req.userId, value, req.username);
        else if (command === 'transfer') await spotifyManager.transferPlayback(req.userId, targetDeviceId, req.username);
        else if (command === 'play_context') await spotifyManager.playContext(req.userId, value, targetDeviceId, req.username);
        else if (command === 'play_uris') await spotifyManager.playUris(req.userId, value, targetDeviceId, req.username);
        else return res.status(400).json({ ok: false, message: `Invalid command: ${command}`});

        res.json({ ok: true });
    } catch (err) {
        console.error('Error handling spotify control command:', err);
        res.status(500).json({ ok: false, message: err.message || 'Spotify control error' });
    }
});

// Try transfer via Spotify Connect, if that fails and a Sonos UUID is provided, attempt Sonos playback.
app.post('/api/spotify/transfer-or-sonos', requireSpotifyUser, async (req, res) => {
    const { deviceId, sonosUuid, uris } = req.body || {};
    if (!deviceId && !sonosUuid) {
        return res.status(400).json({ ok: false, message: 'deviceId or sonosUuid required' });
    }

    try {
        if (deviceId) {
            // Try Spotify transfer first
            try {
                await spotifyManager.transferPlayback(req.userId, deviceId, req.username);
                return res.json({ ok: true, method: 'spotify', message: 'Transferred via Spotify' });
            } catch (e) {
                console.warn('Spotify transfer failed, will attempt Sonos fallback if provided:', e.message || e);
            }
        }

        if (sonosUuid) {
            // Determine a URI to play: prefer provided uris, then current playback
            let playUri = null;
            if (uris && Array.isArray(uris) && uris.length > 0) playUri = uris[0];
            if (!playUri) {
                try {
                    const state = await spotifyManager.getPlaybackState(req.userId, req.username);
                    if (state && state.item && state.item.uri) playUri = state.item.uri;
                    else if (state && state.context && state.context.uri) playUri = state.context.uri;
                } catch (e) {
                    console.warn('Could not fetch playback state for Sonos fallback:', e.message || e);
                }
            }

            if (!playUri) return res.status(400).json({ ok: false, message: 'No URI available for Sonos playback' });

            try {
                const result = await sonosManager.play(sonosUuid, playUri, null);
                return res.json({ ok: true, method: 'sonos', result });
            } catch (e) {
                console.error('Sonos fallback failed:', e);
                return res.status(500).json({ ok: false, message: 'Sonos playback failed', error: e.message || e });
            }
        }

        return res.status(500).json({ ok: false, message: 'Transfer failed and no Sonos fallback performed' });
    } catch (err) {
        console.error('Error in transfer-or-sonos:', err);
        res.status(500).json({ ok: false, message: err.message || 'transfer-or-sonos failed' });
    }
});

app.get('/api/spotify/devices', requireSpotifyUser, async (req, res) => {
    try {
        const spotifyDevices = await spotifyManager.getDevices(req.userId, req.username);
        
        // Get local Cast devices
        const castDevices = deviceManager.getCastDevices();
        // Get local Sonos devices
        const sonosDevices = sonosManager.getDiscoveredDevices();
        
        const mergedDevices = [...spotifyDevices];
        
        // Merge Cast Devices
        castDevices.forEach(cast => {
            const exists = spotifyDevices.some(d => d.name === cast.name);
            if (!exists) {
                mergedDevices.push({
                    id: `cast:${cast.ip}`,
                    is_active: false,
                    is_private_session: false,
                    is_restricted: false,
                    name: cast.name,
                    type: 'CastAudio',
                    volume_percent: cast.state.volume || 100,
                    is_cast: true
                });
            }
        });

        // Merge Sonos Devices
        sonosDevices.forEach(sonos => {
            // Check if already in list (Spotify Connect often finds them)
            const exists = spotifyDevices.some(d => d.name === sonos.name || d.name.includes(sonos.name));
            if (!exists) {
                mergedDevices.push({
                    id: `sonos:${sonos.uuid}`,
                    is_active: false,
                    is_private_session: false,
                    is_restricted: false,
                    name: sonos.name, // Use local name
                    type: 'Speaker', // Standard Spotify type
                    volume_percent: 50, // Default as we might not know it easily without querying
                    is_sonos: true // Custom flag
                });
            }
        });

        res.json(mergedDevices);
    } catch (e) {
        console.error('Error getting spotify devices:', e);
        res.json([]);
    }
});

app.get('/api/spotify/playlists', requireSpotifyUser, async (req, res) => {
    try {
        const playlists = await spotifyManager.getUserPlaylists(req.userId, req.username);
        res.json(playlists);
    } catch (e) {
        if (e.message === 'SPOTIFY_NOT_REGISTERED') {
            return res.status(403).json({ error: 'User not registered in Spotify Dashboard' });
        }
        console.error('Error getting spotify playlists:', e);
        res.json([]);
    }
});

app.get('/api/spotify/albums', requireSpotifyUser, async (req, res) => {
    try {
        const albums = await spotifyManager.getUserAlbums(req.userId, req.username);
        res.json(albums);
    } catch (e) {
        console.error('Error getting spotify albums:', e);
        res.json([]);
    }
});

app.get('/api/spotify/search', requireSpotifyUser, async (req, res) => {
    const q = req.query.q || '';
    try {
        const results = await spotifyManager.search(req.userId, q, req.username);
        res.json(results);
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// --- Sonos API ---
app.get('/api/sonos/devices', (req, res) => {
    try {
        const devices = sonosManager.getDiscoveredDevices();
        res.json({ ok: true, devices });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

app.get('/api/sonos/:uuid/state', async (req, res) => {
    const { uuid } = req.params;
    try {
        const state = await sonosManager.getPlaybackState(uuid);
        res.json({ ok: true, state });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

app.post('/api/sonos/:uuid/command', async (req, res) => {
    const { uuid } = req.params;
    const { command, value } = req.body;

    try {
        let result = null;
        switch (command) {
            case 'play':
                const { uri, metadata } = value || {};
                result = await sonosManager.play(uuid, uri, metadata);
                break;
            case 'pause':
                result = await sonosManager.pause(uuid);
                break;
            case 'next':
                result = await sonosManager.next(uuid);
                break;
            case 'previous':
                result = await sonosManager.previous(uuid);
                break;
            case 'set_volume':
                result = await sonosManager.setVolume(uuid, value);
                break;
            default:
                return res.status(400).json({ ok: false, message: 'Invalid command' });
        }
        res.json({ ok: true, result });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// Play a Spotify URI on a Sonos device (best-effort)
// Body: { spotifyUri: string, metadata?: string }
// Note: Sonos may accept different URI/metadata formats; this endpoint forwards the provided URI
// to the Sonos manager which attempts to set AVTransportURI and start playback.
const { createDidlLiteForSpotifyTrack } = require('./script/sonosHelper');

app.post('/api/sonos/:uuid/play-spotify', async (req, res) => {
    const { uuid } = req.params;
    const { spotifyUri, metadata, userId } = req.body || {};

    if (!spotifyUri) {
        return res.status(400).json({ ok: false, message: 'spotifyUri is required' });
    }

    try {
        let metaToUse = metadata || null;

        // If spotifyUri looks like a Spotify track and we have a userId, fetch track metadata and build DIDL-Lite
        try {
            let trackId = null;
            const m = spotifyUri.match(/(?:spotify:track:|track\/)([A-Za-z0-9_-]{10,})/);
            if (m && m[1]) trackId = m[1];
            // Also handle https://open.spotify.com/track/{id}
            if (!trackId) {
                const m2 = spotifyUri.match(/open\.spotify\.com\/track\/([A-Za-z0-9_-]{10,})/);
                if (m2 && m2[1]) trackId = m2[1];
            }

            if (trackId && userId) {
                const track = await spotifyManager.getTrack(userId, trackId);
                if (track) {
                    metaToUse = createDidlLiteForSpotifyTrack(track);
                }
            }
        } catch (e) {
            console.warn('Could not enrich metadata for Sonos playback:', e.message || e);
        }

        const result = await sonosManager.play(uuid, spotifyUri, metaToUse);
        res.json({ ok: true, result, metadataUsed: !!metaToUse });
    } catch (e) {
        console.error(`Error playing Spotify URI on Sonos ${uuid}:`, e);
        res.status(500).json({ ok: false, message: e.message || 'Failed to play on Sonos' });
    }
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

    // Merge Sonos Devices from sonosManager
    try {
        const sonosDevices = sonosManager.getDiscoveredDevices().map(d => ({
            id: `sonos:${d.uuid}`,
            name: d.name,
            type: 'sonos',
            platform: 'sonos',
            online: true,
            uuid: d.uuid,
            state: { on: true, volume: 25, playingState: 'stopped' } // Default state prevents frontend crash
        }));

        sonosDevices.forEach(sd => {
             const exists = devices.some(d => d.name && d.name.toLowerCase() === sd.name.toLowerCase());
             if (!exists) {
                 devices.push(sd);
             }
        });
    } catch (e) {
        console.error('Error merging Sonos devices:', e);
    }

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

app.post('/api/devices/scan', (req, res) => {
    deviceManager.startDiscovery();
    res.json({ ok: true, message: 'Discovery started' });
});

app.post('/api/devices/pair', async (req, res) => {
    const { ip, type, username, password, pin } = req.body;

    if (type === 'hue') {
        const result = await hueManager.pairBridge(ip);
        if (result.success) {
            return res.json({ ok: true, message: 'Paired with Hue Bridge', username: result.username });
        } else {
            return res.status(400).json({ ok: false, message: result.error || 'Pairing failed' });
        }
    }
    
    if (!ip || !type) return res.status(400).json({ ok: false, error: 'Missing IP or Type' });
    
    try {
        const result = await deviceManager.pairDevice(ip, type, { username, password, pin });
        res.json(result);
    } catch (e) {
        console.error('Pairing error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

app.post('/api/devices/unpair', (req, res) => {
    const { ip } = req.body;
    if (!ip) return res.status(400).json({ ok: false, error: 'Missing IP' });
    
    deviceManager.unpairDevice(ip);
    res.json({ ok: true, message: 'Device unpaired' });
});

// --- PS5 Control ---
app.get('/api/ps5/devices', async (req, res) => {
    const devices = await ps5Manager.getDevices();
    res.json(devices);
});

app.post('/api/ps5/:id/wake', async (req, res) => {
    const result = await ps5Manager.wake(req.params.id);
    res.json(result);
});

app.post('/api/ps5/:id/standby', async (req, res) => {
    const result = await ps5Manager.standby(req.params.id);
    res.json(result);
});

app.post('/api/ps5/:id/command', async (req, res) => {
    const { command } = req.body;
    const result = await ps5Manager.sendCommand(req.params.id, command);
    res.json(result);
});

// PS5 Pairing Flow
let currentAuthUrl = null;
let isPinRequired = false;
let pairingStatus = 'idle'; // idle, pairing, auth_required, pin_required, success, error
let pairingError = null;

ps5Manager.on('authUrl', (url) => {
    currentAuthUrl = url;
    pairingStatus = 'auth_required';
});

ps5Manager.on('pin-required', () => {
    isPinRequired = true;
    pairingStatus = 'pin_required';
});

app.post('/api/ps5/:id/pair', async (req, res) => {
    currentAuthUrl = null;
    isPinRequired = false;
    pairingStatus = 'pairing';
    pairingError = null;
    
    // Start pairing in background (it blocks until auth code is submitted)
    ps5Manager.pair(req.params.id).then(result => {
        console.log('Pairing finished:', result);
        if (result.success) {
            pairingStatus = 'success';
        } else {
            pairingStatus = 'error';
            pairingError = result.error;
        }
    });
    
    // Wait briefly for auth URL or PIN request
    let attempts = 0;
    const checkStatus = setInterval(() => {
        attempts++;
        if (pairingStatus === 'auth_required') {
            clearInterval(checkStatus);
            res.json({ status: 'auth_required', url: currentAuthUrl });
        } else if (pairingStatus === 'pin_required') {
            clearInterval(checkStatus);
            res.json({ status: 'pin_required' });
        } else if (pairingStatus === 'error') {
            clearInterval(checkStatus);
            res.json({ status: 'error', error: pairingError });
        } else if (attempts > 40) { // 4 seconds timeout
            clearInterval(checkStatus);
            res.json({ status: 'started', message: 'Pairing started, check status later' });
        }
    }, 100);
});

app.post('/api/ps5/pair-submit', (req, res) => {
    const { code } = req.body;
    if (ps5Manager.submitAuthCode(code)) {
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'No pending auth request' });
    }
});

app.post('/api/ps5/pin-submit', (req, res) => {
    const { pin } = req.body;
    if (ps5Manager.submitPin(pin)) {
        res.json({ success: true });
    } else {
        res.status(400).json({ success: false, error: 'No pending PIN request' });
    }
});

// Add a status endpoint for polling
app.get('/api/ps5/pair-status', (req, res) => {
    res.json({ 
        status: pairingStatus, 
        url: currentAuthUrl,
        error: pairingError
    });
});

app.post('/api/ps5/:id/forget', async (req, res) => {
    const { id } = req.params;
    const result = await ps5Manager.forget(id);
    res.json(result);
});

// --- PSN API Endpoints ---

app.post('/api/psn/auth', async (req, res) => {
    const { npsso } = req.body;
    if (!npsso) return res.status(400).json({ error: 'Missing NPSSO token' });
    
    const result = await psnManager.authenticate(npsso);
    if (result.success) {
        res.json({ success: true });
    } else {
        res.status(500).json(result);
    }
});

app.get('/api/psn/games', async (req, res) => {
    try {
        const games = await psnManager.getGameLibrary();
        res.json(games);
    } catch (e) {
        if (e.message === 'Not authenticated') {
            res.status(401).json({ error: 'Not authenticated' });
        } else {
            res.status(500).json({ error: e.message });
        }
    }
});

app.post('/api/ps5/:id/launch', async (req, res) => {
    const { titleId } = req.body;
    if (!titleId) return res.status(400).json({ error: 'Missing titleId' });
    
    const result = await ps5Manager.startTitle(req.params.id, titleId);
    if (result.success) {
        res.json({ success: true });
    } else {
        res.status(500).json(result);
    }
});

app.post('/api/camera/webrtc/offer', async (req, res) => {
    const { deviceId, rtspUrl, sdp } = req.body;
    if (!deviceId || !rtspUrl || !sdp) {
        return res.status(400).json({ error: 'Missing parameters' });
    }

    try {
        const stream = cameraStreamManager.getStream(deviceId, rtspUrl);
        const answerSdp = await stream.handleOffer(sdp);
        res.json({ sdp: answerSdp });
    } catch (e) {
        console.error('WebRTC Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/devices/:id/command', async (req, res) => {
    const { id } = req.params;
    const { command, value } = req.body;
    
    // Handle Sonos Devices explicitly (inserted via /api/devices merge)
    if (id.startsWith('sonos:')) {
        const uuid = id.replace('sonos:', '');
        try {
            if (command === 'play' || command === 'turn_on') await sonosManager.play(uuid);
            else if (command === 'pause' || command === 'turn_off') await sonosManager.pause(uuid);
            else if (command === 'next') await sonosManager.next(uuid);
            else if (command === 'previous') await sonosManager.previous(uuid);
            else if (command === 'set_volume') await sonosManager.setVolume(uuid, value);
            else console.warn(`Unknown Sonos command: ${command}`);

            return res.json({ ok: true });
        } catch (e) {
            console.error('Sonos Control Error:', e);
            return res.status(500).json({ ok: false, message: e.message });
        }
    }

    // console.log(`Received command for ${id}: ${command} = ${value}`);

    // Fire and forget for faster UI response
    deviceManager.controlDevice(id, command, value).catch(e => console.error('Control error:', e));
    
    res.json({ ok: true });
});

// --- AI / NLP ---
app.post('/api/ai/command', async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ ok: false, message: 'Text required' });
    
    try {
        const result = await aiManager.processCommand(text);
        res.json(result);
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// --- Presence ---
app.get('/api/presence', (req, res) => {
    res.json(presenceManager.getPresenceStatus());
});

app.post('/api/presence/user', (req, res) => {
    const { userId, name, deviceId } = req.body;
    presenceManager.addPerson(userId, name, deviceId);
    res.json({ ok: true });
});

app.post('/api/presence/location', (req, res) => {
    let { userId, latitude, longitude, timestamp } = req.body;
    if (!userId || !latitude || !longitude) {
        return res.status(400).json({ ok: false, message: 'Missing required fields' });
    }

    // Resolve Cloud UUID to Local ID if needed
    if (userId.length > 10 && isNaN(userId)) {
         const username = req.headers['x-delova-username'];
         if (username) {
             for (const [uid, person] of presenceManager.people.entries()) {
                 if (person.name && person.name.toLowerCase() === username.toLowerCase()) {
                     console.log(`[Presence] Resolved Cloud UUID ${userId} to Local User ${person.name} (${uid})`);
                     userId = uid;
                     break;
                 }
             }
         }
    }

    presenceManager.updateUserLocation(userId, latitude, longitude, timestamp);
    res.json({ ok: true });
});

app.post('/api/presence/home-location', (req, res) => {
    const { latitude, longitude, radius } = req.body;
    if (!latitude || !longitude) {
        return res.status(400).json({ ok: false, message: 'Missing required fields' });
    }
    presenceManager.setHomeLocation(latitude, longitude, radius);
    res.json({ ok: true });
});

// --- Energy ---
app.get('/api/energy', (req, res) => {
    res.json(energyManager.data);
});

// --- Scene & Mode API ---
app.get('/api/scenes', (req, res) => {
    res.json(sceneManager.getScenes());
});

app.get('/api/mode', (req, res) => {
    res.json({ mode: sceneManager.getMode() });
});

app.post('/api/mode/set', (req, res) => {
    const { mode } = req.body;
    if (!mode) return res.status(400).json({ ok: false, message: 'Mode required' });
    sceneManager.setMode(mode);
    res.json({ ok: true, mode });
});

app.post('/api/scenes/:name', async (req, res) => {
    const { name } = req.params;
    try {
        // First try the new SceneManager
        await sceneManager.activateScene(name);
        
        // Fallback or additional logic if deviceManager also handles scenes legacy style
        // const result = await deviceManager.activateScene(name);
        
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

app.post('/api/devices/:id/refresh', async (req, res) => {
    const { id } = req.params;
    await deviceManager.refreshDevice(id);
    res.json({ ok: true });
});

app.put('/api/devices/:id', async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!name) return res.status(400).json({ ok: false, message: 'Name required' });
    
    const device = deviceManager.getDevice(id);
    if (device) {
        device.name = name;
        deviceManager.emit('device-updated', device);
        res.json({ ok: true, device });
    } else {
        res.status(404).json({ ok: false, message: 'Device not found' });
    }
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
        const result = await deviceManager.submitAppleTvPairingPin(pin);
        res.json({ ok: true, ...result });
    } catch (err) {
        res.status(500).json({ ok: false, message: err.message });
    }
});

app.post('/api/pair-ssh', async (req, res) => {
    const { ip, type, username, password } = req.body;
    if (!ip || !username || !password) return res.status(400).json({ ok: false, message: 'Missing fields' });

    try {
        const result = await deviceManager.pairDevice(ip, type, { username, password });
        
        if (result.ok) {
             // Ensure device is in the list
             const existing = Array.from(deviceManager.devices.values()).find(d => d.ip === ip);
             if (!existing) {
                 deviceManager.addDevice({
                    id: `ssh-${ip.replace(/\./g, '-')}`,
                    name: `${type.charAt(0).toUpperCase() + type.slice(1)} (${ip})`,
                    type: type,
                    ip: ip,
                    protocol: 'ssh',
                    deviceId: `ssh-${ip}`,
                    paired: true,
                    state: { on: true }
                });
             }
        }
        
        res.json(result);
    } catch (err) {
        console.error('SSH Pair Error:', err);
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
            // Determine Content-Type based on extension
            const ext = path.extname(filePath).toLowerCase();
            let contentType = 'application/octet-stream';
            
            const mimeTypes = {
                '.pdf': 'application/pdf',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.mp4': 'video/mp4',
                '.mkv': 'video/x-matroska',
                '.avi': 'video/x-msvideo',
                '.mov': 'video/quicktime',
                '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav',
                '.flac': 'audio/flac',
                '.txt': 'text/plain'
            };

            if (mimeTypes[ext]) {
                contentType = mimeTypes[ext];
            }

            res.setHeader('Content-Type', contentType);
            
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

// --- Automation API ---
// (Moved to lower section to avoid duplicates)


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

// Broadcast helper
const broadcast = (data) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// Listen for pairing requests from DeviceManager
deviceManager.on('pairing-required', (data) => {
    console.log(`[Server] Broadcasting pairing request for ${data.ip}`);
    broadcast({ type: 'pairing-required', ...data });
});

// Listen for device updates and broadcast them
deviceManager.on('device-updated', (device) => {
    // console.log(`[Server] Broadcasting update for ${device.name}`);
    broadcast({ type: 'device-update', device });
});

app.post('/api/device/pair', (req, res) => {
    const { ip, pin } = req.body;
    if (!ip || !pin) return res.status(400).json({ error: 'IP and PIN required' });
    
    const success = deviceManager.submitAndroidTvPairingPin(ip, pin);
    if (success) {
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'Device process not found' });
    }
});

app.post('/api/device/credentials', express.json(), (req, res) => {
    const { ip, username, password, type } = req.body;
    
    if (!ip || !username || !password) {
        return res.status(400).json({ error: 'IP, username, and password are required' });
    }

    // Currently only supporting camera credentials via this generic endpoint
    // Can be expanded for other types later
    if (type === 'camera' || !type) { // Default to camera if type not specified for backward compatibility or ease
        const success = deviceManager.saveCameraCredentials(ip, username, password);
        if (success) {
            res.json({ success: true });
        } else {
            res.status(500).json({ error: 'Failed to save credentials' });
        }
    } else {
        res.status(400).json({ error: 'Unsupported device type' });
    }
});

// --- Energy API ---
app.get('/api/energy/data', (req, res) => {
    res.json(energyManager.getData());
});

app.get('/api/energy/config', (req, res) => {
    res.json(energyManager.getConfig());
});

app.post('/api/energy/config', express.json(), (req, res) => {
    energyManager.setConfig(req.body);
    res.json({ success: true });
});

// --- KNX API ---
app.get('/api/knx/config', (req, res) => {
    res.json(knxManager.getConfig());
});

app.post('/api/knx/config', express.json(), (req, res) => {
    knxManager.setConfig(req.body);
    res.json({ success: true });
});

// --- Automations API ---
app.get('/api/automations', (req, res) => {
    res.json(automationManager.getAutomations());
});

app.post('/api/automations', express.json(), (req, res) => {
    try {
        const automation = automationManager.addAutomation(req.body);
        res.json({ ok: true, automation });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

app.put('/api/automations/:id', express.json(), (req, res) => {
    try {
        const automation = automationManager.updateAutomation(req.params.id, req.body);
        res.json({ ok: true, automation });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

app.delete('/api/automations/:id', (req, res) => {
    try {
        automationManager.deleteAutomation(req.params.id);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ ok: false, message: e.message });
    }
});

// --- MQTT API ---
app.get('/api/mqtt/config', (req, res) => {
    res.json(mqttManager.getConfig());
});

app.post('/api/mqtt/config', express.json(), (req, res) => {
    mqttManager.setConfig(req.body);
    res.json({ success: true });
});

const handleUpgrade = (request, socket, head) => {
    const parsedUrl = url.parse(request.url, true);
    const pathname = parsedUrl.pathname;
    
    if (pathname === '/ws') {
        // Generic WebSocket (Dashboard Updates)
        // Check if this is actually a camera request disguised as /ws (legacy check)
        if (parsedUrl.query.deviceId && parsedUrl.query.rtspUrl) {
             // Redirect to camera handler logic manually
             wss.handleUpgrade(request, socket, head, (ws) => {
                const stream = cameraStreamManager.getStream(parsedUrl.query.deviceId, parsedUrl.query.rtspUrl);
                stream.addClient(ws);
            });
            return;
        }

        wss.handleUpgrade(request, socket, head, (ws) => {
            console.log('[WebSocket] Client connected to /ws');
            wss.emit('connection', ws, request); // Ensure the 'connection' event is emitted for the generic handler
        });
    } else if (pathname === '/stream') {
        // Dedicated Camera Stream Path
        wss.handleUpgrade(request, socket, head, (ws) => {
            const query = parsedUrl.query;
            const deviceId = query.deviceId;
            let rtspUrl = query.rtspUrl;
            
            if (deviceId && rtspUrl) {
                // Check for credential overrides
                try {
                    // Extract IP from RTSP URL
                    // Format: rtsp://user:pass@ip:port/path or rtsp://ip:port/path
                    // We use the global URL class to parse the RTSP string
                    const urlObj = new URL(rtspUrl);
                    const ip = urlObj.hostname;
                    
                    if (deviceManager.cameraCredentials && deviceManager.cameraCredentials[ip]) {
                        const creds = deviceManager.cameraCredentials[ip];
                        if (creds.username && creds.password) {
                            urlObj.username = creds.username;
                            urlObj.password = creds.password;
                            rtspUrl = urlObj.toString();
                            console.log(`[Stream] Using overridden credentials for camera ${ip}`);
                        }
                    }
                } catch (e) {
                    console.error('[Stream] Error parsing RTSP URL for credentials:', e);
                }

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

// --- UDP Discovery Listener ---
const udpServer = dgram.createSocket('udp4');

udpServer.on('error', (err) => {
  console.error(`[UDP Discovery] Server error:\n${err.stack}`);
  udpServer.close();
});

// --- Cloud Setup API ---
app.post('/api/setup/link-cloud', async (req, res) => {
    const { cloudUrl, username, password, hubName, email } = req.body;
    try {
        // 1. Link Hub to Cloud
        await cloudClient.linkHub(cloudUrl, username, password, hubName, email);

        // 2. Create Local User (if not exists)
        // This ensures the user created/used for Cloud is also the Local Admin
        const pool = await db.getPool();
        
        // Check if user exists
        const check = await pool.request()
            .input('username', db.sql.NVarChar(255), username)
            .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
            .query("SELECT Id FROM Users WHERE Username = @username AND HubID = @hubId");
            
        if (check.recordset.length === 0) {
            console.log(`[Setup] Creating local admin user '${username}' from Cloud Setup...`);
            const hashedPassword = await bcrypt.hash(password, 10);
            
            const insertResult = await pool.request()
                .input('username', db.sql.NVarChar(255), username)
                .input('passwordHash', db.sql.NVarChar(255), hashedPassword)
                .input('role', db.sql.NVarChar(50), 'Admin') // First user is Admin
                .input('hubId', db.sql.NVarChar(255), hubConfig.hubId)
                .query("INSERT INTO Users (Username, PasswordHash, Role, HubID, CreatedAt) VALUES (@username, @passwordHash, @role, @hubId, GETDATE()); SELECT SCOPE_IDENTITY() AS Id;");
            
            const newUserId = insertResult.recordset[0].Id;
            
            // Add to Presence
            presenceManager.addPerson(newUserId, username, 'mobile-app');
        } else {
            console.log(`[Setup] Local user '${username}' already exists. Skipping creation.`);
        }

        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

udpServer.on('message', (msg, rinfo) => {
  const message = msg.toString();
  console.log(`[UDP Discovery] Packet received from ${rinfo.address}:${rinfo.port} - Content: ${message}`);
  
  if (message.includes('DELOVAHOME_DISCOVER')) {
    console.log(`[UDP Discovery] Valid discovery request from ${rinfo.address}:${rinfo.port}`);
    
    const response = JSON.stringify({
      type: 'delovahome',
      name: hubConfig.name || 'DelovaHome Hub',
      id: hubConfig.hubId || 'hub-1',
      version: hubConfig.version || '1.0.0',
      port: port
    });

    udpServer.send(response, rinfo.port, rinfo.address, (err) => {
      if (err) console.error('[UDP Discovery] Error sending response:', err);
      else console.log(`[UDP Discovery] Sent response to ${rinfo.address}:${rinfo.port}`);
    });
  }
});

udpServer.bind(8888, () => {
    console.log('[UDP Discovery] Listening on 0.0.0.0:8888');
});
// ------------------------------

(async () => {
  try {
    await db.testConnection();
    console.log('Database connection: OK');
    
    // Initialize Managers
    initHubConfigFromDB();
    sceneManager.init(); // Init Scenes & Modes
    automationManager.init();
    if (hubConfig.timezone) {
        automationManager.setTimezone(hubConfig.timezone);
    }

    // Start PS5 Discovery
    ps5Manager.discover().then(devices => {
        console.log(`[PS5] Initial discovery found ${devices.length} devices.`);
    });

    // Start Hue Manager
    hueManager.start();

    // Start MQTT Broker
    try {
        await mqttBroker.startBroker();
    } catch (e) {
        console.error('Failed to start internal MQTT broker:', e);
    }

    // Start MQTT Client
    mqttManager.on('error', (err) => {
        // Prevent crash on connection refused if broker is down
        console.error('[MQTT Client] Connection error (handled):', err.message);
    });
    mqttManager.connect();
    
    // Start Energy Simulation
    energyManager.on('update', (data) => {
        // Broadcast energy data to all connected clients
        const msg = JSON.stringify({ type: 'energy-update', data });
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(msg);
            }
        });
    });

    // Start Cloud Client
    // Sync Hub ID with Cloud Config if available to ensure Spotify callbacks route correctly
    if (cloudClient.loadConfig()) {
        if (cloudClient.config.hubId && cloudClient.config.hubId !== hubConfig.hubId) {
            console.log(`[Hub] Syncing Hub ID with Cloud Config: ${hubConfig.hubId} -> ${cloudClient.config.hubId}`);
            hubConfig.hubId = cloudClient.config.hubId;
            try {
                fs.writeFileSync(HUB_CONFIG_PATH, JSON.stringify(hubConfig, null, 2));
            } catch (e) {
                console.error('[Hub] Failed to save synced config:', e);
            }
        }
    }
    cloudClient.connect();

    // Start Discovery Service (mDNS)
    discoveryService.start();

  } catch (err) {
    console.error('Database connection: FAILED');
    console.error(err.message || err);
    console.error('\nCommon causes: SQL Server not running, TCP/IP disabled, wrong host/port, firewall, or SQL auth disabled.');
  }
})();

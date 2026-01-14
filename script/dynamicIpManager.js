const fetch = require('node-fetch');
const db = require('./db');
const fs = require('fs');
const path = require('path');

let currentIp = process.env.DB_SERVER || '0.0.0.0';

/**
 * Fetches the current public IP address.
 */
async function getPublicIp() {
    try {
        // Using ipify as a reliable source
        const res = await fetch('https://api.ipify.org?format=json');
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        return data.ip;
    } catch (e) {
        console.error('[DynamicIP] Failed to fetch public IP:', e.message);
        return null;
    }
}

/**
 * Checks if the public IP has changed and updates the configuration.
 */
async function checkAndUpdateIp() {
    const newIp = await getPublicIp();
    
    // If we got a valid IP and it's different from what we know
    if (newIp && newIp !== currentIp) {
        console.log(`[DynamicIP] IP Change detected: ${currentIp} -> ${newIp}`);
        
        // 1. Update in-memory DB config
        console.log(`[DynamicIP] Updating DB config server...`);
        db.config.server = newIp;
        process.env.DB_SERVER = newIp;
        
        // 2. Reset DB connection pool to force reconnection with new IP
        await db.resetPool();
        
        // 3. Update .env file for persistence across restarts
        updateEnvFile(newIp);
        
        // 4. Update Cloud Client if loaded
        try {
            // If cloudClient is used, we might need to notify it or let it rely on process.env
            // cloudClient.js reads process.env.DB_SERVER if configured, so next reconnect should pick it up
        } catch (e) { console.error(e); }

        currentIp = newIp;
        return true;
    }
    return false;
}

/**
 * Updates the .env file with the new IP address.
 */
function updateEnvFile(newIp) {
    try {
        const envPath = path.join(__dirname, '../.env');
        if (fs.existsSync(envPath)) {
            let content = fs.readFileSync(envPath, 'utf8');
            
            if (content.match(/^DB_SERVER=/m)) {
                content = content.replace(/^DB_SERVER=.*/m, `DB_SERVER=${newIp}`);
            } else {
                content += `\nDB_SERVER=${newIp}`;
            }
            
            fs.writeFileSync(envPath, content);
            console.log(`[DynamicIP] Updated .env file with new IP: ${newIp}`);
        }
    } catch (e) {
        console.error('[DynamicIP] Failed to update .env:', e);
    }
}

/**
 * Starts the IP monitoring service.
 * @param {number} intervalMs Check interval in milliseconds (default 5 min)
 */
function start(intervalMs = 300000) {
    if (process.env.DISABLE_DYNAMIC_IP === 'true') return;
    
    console.log('[DynamicIP] Starting Public IP Monitor...');
    
    // Initial check (non-blocking)
    checkAndUpdateIp().catch(err => console.error('[DynamicIP] Initial check failed:', err));
    
    // Scheduled checks
    setInterval(() => {
        checkAndUpdateIp().catch(err => console.error('[DynamicIP] Scheduled check failed:', err));
    }, intervalMs);
}

module.exports = { start, checkAndUpdateIp, getPublicIp };

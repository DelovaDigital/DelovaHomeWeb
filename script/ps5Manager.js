const { Discovery } = require('playactor/dist/discovery');
const { Device } = require('playactor/dist/device');
const { PendingDevice } = require('playactor/dist/device/pending');
const { StandardDiscoveryNetworkFactory } = require('playactor/dist/discovery/standard');
const { CredentialManager } = require('playactor/dist/credentials');
const { OauthCredentialRequester } = require('playactor/dist/credentials/oauth/requester');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class WebOauthStrategy extends EventEmitter {
    constructor() {
        super();
        this.resolveLogin = null;
    }

    async performLogin(url) {
        console.log('[PS5] Auth URL generated:', url);
        this.emit('authUrl', url);
        
        return new Promise((resolve, reject) => {
            this.resolveLogin = resolve;
            // Timeout after 5 minutes
            setTimeout(() => {
                if (this.resolveLogin) {
                    reject(new Error('Auth timeout'));
                    this.resolveLogin = null;
                }
            }, 300000);
        });
    }

    submitCode(redirectUrl) {
        if (this.resolveLogin) {
            this.resolveLogin(redirectUrl);
            this.resolveLogin = null;
            return true;
        }
        return false;
    }
}

class PS5Manager extends EventEmitter {
    constructor() {
        super();
        this.discovery = new Discovery();
        this.devices = [];
        this.resolvePin = null;
        
        // Connection queue to prevent "Remote already in use" errors
        this.connectionQueue = Promise.resolve();
        this.activeConnections = new Map();
        
        this.oauthStrategy = new WebOauthStrategy();
        this.oauthStrategy.on('authUrl', (url) => this.emit('authUrl', url));

        const io = {
            logError: (...args) => console.error('[PS5] IO Error:', ...args),
            logInfo: (...args) => console.log('[PS5] IO Info:', ...args),
            logResult: (...args) => console.log('[PS5] IO Result:', ...args),
            prompt: async (text) => {
                console.log('[PS5] Prompt requested:', text);
                if (text.toLowerCase().includes('pin')) {
                    console.log('[PS5] PIN required detected');
                    this.emit('pin-required');
                    return new Promise((resolve, reject) => {
                        this.resolvePin = resolve;
                        // Timeout after 2 minutes
                        setTimeout(() => {
                            if (this.resolvePin) {
                                reject(new Error('PIN timeout'));
                                this.resolvePin = null;
                            }
                        }, 120000);
                    });
                }
                return '';
            }
        };

        this.credentialManager = new CredentialManager(
            new OauthCredentialRequester(io, this.oauthStrategy)
        );
    }

    submitPin(pin) {
        if (this.resolvePin) {
            this.resolvePin(pin);
            this.resolvePin = null;
            return true;
        }
        return false;
    }

    /**
     * Queue a PS5 operation to prevent simultaneous connections
     * @param {Function} operation - Async function to execute
     * @returns {Promise} - Result of the operation
     */
    async queueOperation(operation) {
        // Chain the new operation after the current queue
        const result = this.connectionQueue.then(operation).catch(err => {
            console.error('[PS5] Queued operation error:', err);
            throw err;
        });
        
        // Update queue to wait for this operation
        this.connectionQueue = result.catch(() => {}); // Catch to prevent queue blocking on error
        
        return result;
    }

    /**
     * Execute PS5 operation with retry logic
     * @param {Function} operation - Async function to execute
     * @param {number} maxRetries - Maximum retry attempts
     * @returns {Promise} - Result of the operation
     */
    async withRetry(operation, maxRetries = 3) {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await operation();
            } catch (err) {
                const isLastAttempt = attempt === maxRetries - 1;
                const isInUseError = err.message && err.message.includes('already in use');
                
                if (isInUseError && !isLastAttempt) {
                    const delay = Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s
                    console.log(`[PS5] Remote in use, retrying in ${delay}ms... (attempt ${attempt + 1}/${maxRetries})`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    if (err.message && (err.message.includes('Registration error') || err.message.includes('403'))) {
                        console.error('[PS5] Registration invalid. Please re-pair the PS5.');
                        throw new Error('PS5 Registration invalid. Please re-pair your device.');
                    }
                    throw err;
                }
            }
        }
    }

    /**
     * Safely close a connection with error handling
     */
    async safeClose(conn, deviceId) {
        if (!conn) return;
        
        try {
            await conn.close();
            this.activeConnections.delete(deviceId);
            console.log(`[PS5] Connection closed for ${deviceId}`);
        } catch (err) {
            console.error(`[PS5] Error closing connection for ${deviceId}:`, err);
            // Still remove from active connections even if close fails
            this.activeConnections.delete(deviceId);
        }
    }

    async discover() {
        try {
            console.log('[PS5] Starting discovery...');
            const discoveredDevices = [];
            // Set a shorter timeout for UI responsiveness, e.g., 3 seconds
            // The iterator will finish when the timeout is reached
            const iterator = this.discovery.discover({}, { timeoutMillis: 3000 });
            
            for await (const device of iterator) {
                if (device.type === 'PS5') {
                    discoveredDevices.push(device);
                }
            }
            
            this.devices = discoveredDevices;
            
            // If no devices found, try fallback or log
            if (this.devices.length === 0) {
                console.log('[PS5] No PS5 devices found via standard discovery.');
            } else {
                console.log(`[PS5] Discovered ${this.devices.length} PS5 devices.`);
            }
            
            return this.devices;
        } catch (err) {
            console.error('[PS5] Discovery error:', err);
            return [];
        }
    }

    async getDevices() {
        if (this.devices.length === 0) {
            await this.discover();
        }
        return this.devices.map(d => ({
            id: d.id,
            name: d.name,
            status: d.status, // 'STANDBY', 'AWAKE'
            address: d.address.address,
            type: d.type
        }));
    }

    async pair(deviceId) {
        return this.queueOperation(async () => {
            return this.withRetry(async () => {
                try {
                    console.log(`[PS5] Starting pairing for ${deviceId}...`);
                    
                    // Create a PendingDevice that uses our custom credential manager
                    const device = new PendingDevice(
                        `Device ${deviceId}`,
                        d => d.id === deviceId,
                        {},
                        { timeoutMillis: 30000 }, // Increased timeout for reliability
                        StandardDiscoveryNetworkFactory,
                        this.credentialManager
                    );

                    // Opening connection triggers authentication if needed
                    const conn = await device.openConnection();
                    this.activeConnections.set(deviceId, conn);
                    console.log(`[PS5] Pairing complete for ${deviceId}`);
                    await this.safeClose(conn, deviceId);
                    
                    return { success: true };
                } catch (err) {
                    console.error('[PS5] Pairing error:', err);
                    return { success: false, error: err.message };
                }
            });
        });
    }

    submitAuthCode(code) {
        return this.oauthStrategy.submitCode(code);
    }

    async wake(deviceId) {
        return this.queueOperation(async () => {
            return this.withRetry(async () => {
                try {
                    console.log(`[PS5] Waking ${deviceId}...`);
                    
                    const device = new PendingDevice(
                        `Device ${deviceId}`,
                        d => d.id === deviceId,
                        {},
                        { timeoutMillis: 60000 }, // Give it 60s to wake up and respond
                        StandardDiscoveryNetworkFactory,
                        this.credentialManager
                    );

                    await device.wake();
                    return { success: true, status: 'AWAKE' };
                } catch (err) {
                    console.error('[PS5] Wake error:', err);
                    return { success: false, error: err.message };
                }
            });
        });
    }

    async standby(deviceId) {
        return this.queueOperation(async () => {
            return this.withRetry(async () => {
                let conn;
                try {
                    console.log(`[PS5] Putting ${deviceId} to standby...`);
                    
                    const device = new PendingDevice(
                        `Device ${deviceId}`,
                        d => d.id === deviceId,
                        {},
                        { timeoutMillis: 10000 },
                        StandardDiscoveryNetworkFactory,
                        this.credentialManager
                    );
        
                    conn = await device.openConnection();
                    this.activeConnections.set(deviceId, conn);
                    await conn.standby();
                    await this.safeClose(conn, deviceId);
                    return { success: true, status: 'STANDBY' };
                } catch (err) {
                    console.error('[PS5] Standby error:', err);
                    if (conn) await this.safeClose(conn, deviceId);
                    return { success: false, error: err.message };
                }
            });
        });
    }

    async sendCommand(deviceId, command) {
        return this.queueOperation(async () => {
            return this.withRetry(async () => {
                let conn;
                try {
                    console.log(`[PS5] Sending command ${command} to ${deviceId}...`);
                    
                    const device = new PendingDevice(
                        `Device ${deviceId}`,
                        d => d.id === deviceId,
                        {},
                        { timeoutMillis: 10000 },
                        StandardDiscoveryNetworkFactory,
                        this.credentialManager
                    );
        
                    conn = await device.openConnection();
                    this.activeConnections.set(deviceId, conn);
                    
                    // Verify connection supports remote control
                    if (typeof conn.sendKeys !== 'function') {
                        console.error('[PS5] Connection established but missing sendKeys. Connection type:', conn.constructor.name);
                        await this.safeClose(conn, deviceId);
                        throw new Error('Connection does not support remote control. Please re-pair your PS5.');
                    }

                    let key = null;
                    // Map common commands to Playactor keys
                    switch (command.toLowerCase()) {
                        case 'up': key = 'Up'; break;
                        case 'down': key = 'Down'; break;
                        case 'left': key = 'Left'; break;
                        case 'right': key = 'Right'; break;
                        case 'enter': key = 'Enter'; break;
                        case 'back': key = 'Back'; break;
                        case 'home': key = 'Home'; break;
                        case 'options': key = 'Options'; break;
                    }
                    
                    if (key) {
                        await conn.sendKeys([key]);
                    } else {
                        console.warn(`[PS5] Unknown command: ${command}`);
                    }
                    
                    await this.safeClose(conn, deviceId);
                    return { success: true };
                } catch (err) {
                    console.error('[PS5] Command error:', err);
                    if (conn) await this.safeClose(conn, deviceId);
                    return { success: false, error: err.message };
                }
            });
        });
    }

    async startTitle(deviceId, titleId) {
        return this.queueOperation(async () => {
            return this.withRetry(async () => {
                let conn;
                try {
                    console.log(`[PS5] Starting title ${titleId} on ${deviceId}...`);
                    
                    const device = new PendingDevice(
                        `Device ${deviceId}`,
                        d => d.id === deviceId,
                        {},
                        { timeoutMillis: 10000 },
                        StandardDiscoveryNetworkFactory,
                        this.credentialManager
                    );
        
                    conn = await device.openConnection();
                    this.activeConnections.set(deviceId, conn);
                    
                    // Try to use startTitleId if available (Second Screen)
                    if (typeof conn.startTitleId === 'function') {
                        await conn.startTitleId(titleId);
                    } 
                    // Fallback for Remote Play connection (PS5 default in playactor)
                    // Remote Play connection doesn't support startTitleId directly,
                    // but we can try to send the 'Enter' key if the user is navigating manually,
                    // OR we can try to use a workaround if available.
                    // However, playactor v0.4.1 doesn't support Second Screen for PS5 at all.
                    // So we can't launch titles directly.
                    else {
                        console.warn('[PS5] Connection is Remote Play type. startTitleId not supported.');
                        // Attempt to use a workaround or just fail gracefully
                        throw new Error('Launching games is not supported on PS5 with this library version (Remote Play only).');
                    }
                    
                    await this.safeClose(conn, deviceId);
                    return { success: true };
                } catch (err) {
                    console.error('[PS5] Start title error:', err);
                    if (conn) await this.safeClose(conn, deviceId);
                    return { success: false, error: err.message };
                }
            });
        });
    }
}

const ps5Manager = new PS5Manager();
module.exports = ps5Manager;

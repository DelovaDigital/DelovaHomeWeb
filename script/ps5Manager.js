const { Discovery } = require('playactor/dist/discovery');
const { Device } = require('playactor/dist/device');
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
        
        this.oauthStrategy = new WebOauthStrategy();
        this.oauthStrategy.on('authUrl', (url) => this.emit('authUrl', url));

        const io = {
            logError: console.error,
            logInfo: console.log,
            logResult: console.log,
            prompt: async () => ''
        };

        this.credentialManager = new CredentialManager(
            new OauthCredentialRequester(io, this.oauthStrategy)
        );
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
        try {
            const device = this.devices.find(d => d.id === deviceId);
            if (!device) throw new Error('Device not found');

            console.log(`[PS5] Starting pairing for ${device.name}...`);
            // This will trigger performLogin if credentials don't exist
            await this.credentialManager.getForDevice(device);
            console.log(`[PS5] Pairing complete for ${device.name}`);
            return { success: true };
        } catch (err) {
            console.error('[PS5] Pairing error:', err);
            return { success: false, error: err.message };
        }
    }

    submitAuthCode(code) {
        return this.oauthStrategy.submitCode(code);
    }

    async wake(deviceId) {
        try {
            // Find device
            const device = this.devices.find(d => d.id === deviceId);
            if (!device) {
                // Try to rediscover
                await this.discover();
            }
            
            // Re-find
            const target = this.devices.find(d => d.id === deviceId);
            if (!target) throw new Error('Device not found');

            console.log(`[PS5] Waking ${target.name}...`);
            // Connect and wake
            // Note: This requires the device to be authenticated previously via CLI
            const conn = await target.openConnection();
            await conn.wake();
            await conn.close();
            return { success: true, status: 'AWAKE' };
        } catch (err) {
            console.error('[PS5] Wake error:', err);
            return { success: false, error: err.message };
        }
    }

    async standby(deviceId) {
        try {
             // Find device
             const device = this.devices.find(d => d.id === deviceId);
             if (!device) {
                 await this.discover();
             }
             
             const target = this.devices.find(d => d.id === deviceId);
             if (!target) throw new Error('Device not found');
 
             console.log(`[PS5] Putting ${target.name} to standby...`);
             const conn = await target.openConnection();
             await conn.standby();
             await conn.close();
             return { success: true, status: 'STANDBY' };
        } catch (err) {
            console.error('[PS5] Standby error:', err);
            return { success: false, error: err.message };
        }
    }
}

const ps5Manager = new PS5Manager();
module.exports = ps5Manager;

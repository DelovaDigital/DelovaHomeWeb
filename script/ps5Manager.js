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
            console.log(`[PS5] Starting pairing for ${deviceId}...`);
            
            // Create a PendingDevice that uses our custom credential manager
            const device = new PendingDevice(
                `Device ${deviceId}`,
                d => d.id === deviceId,
                {},
                { timeoutMillis: 5000 },
                StandardDiscoveryNetworkFactory,
                this.credentialManager
            );

            // Opening connection triggers authentication if needed
            const conn = await device.openConnection();
            console.log(`[PS5] Pairing complete for ${deviceId}`);
            await conn.close();
            
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
            console.log(`[PS5] Waking ${deviceId}...`);
            
            const device = new PendingDevice(
                `Device ${deviceId}`,
                d => d.id === deviceId,
                {},
                { timeoutMillis: 5000 },
                StandardDiscoveryNetworkFactory,
                this.credentialManager
            );

            await device.wake();
            return { success: true, status: 'AWAKE' };
        } catch (err) {
            console.error('[PS5] Wake error:', err);
            return { success: false, error: err.message };
        }
    }

    async standby(deviceId) {
        try {
             console.log(`[PS5] Putting ${deviceId} to standby...`);
             
             const device = new PendingDevice(
                `Device ${deviceId}`,
                d => d.id === deviceId,
                {},
                { timeoutMillis: 5000 },
                StandardDiscoveryNetworkFactory,
                this.credentialManager
            );
 
             const conn = await device.openConnection();
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

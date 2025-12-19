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
                { timeoutMillis: 30000 }, // Increased timeout for reliability
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
    }

    async standby(deviceId) {
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
 
             const conn = await device.openConnection();
             await conn.standby();
             await conn.close();
             return { success: true, status: 'STANDBY' };
        } catch (err) {
            console.error('[PS5] Standby error:', err);
            return { success: false, error: err.message };
        }
    }

    async sendCommand(deviceId, command) {
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
 
             const conn = await device.openConnection();
             
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
             
             await conn.close();
             return { success: true };
        } catch (err) {
            console.error('[PS5] Command error:', err);
            return { success: false, error: err.message };
        }
    }
}

const ps5Manager = new PS5Manager();
module.exports = ps5Manager;

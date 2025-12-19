const { Discovery } = require('playactor/dist/discovery');
const { Device } = require('playactor/dist/device');
const fs = require('fs');
const path = require('path');

// Path to store credentials/config if needed, though playactor handles its own config usually.
// Playactor stores config in ~/.config/playactor/config.json by default.

class PS5Manager {
    constructor() {
        this.discovery = new Discovery();
        this.devices = [];
    }

    async discover() {
        try {
            // Discover devices on the network
            const devices = await this.discovery.discover();
            // Filter for PS5s (type 'PS5')
            this.devices = devices.filter(d => d.type === 'PS5');
            console.log(`[PS5] Discovered ${this.devices.length} PS5 devices.`);
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

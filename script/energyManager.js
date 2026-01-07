const EventEmitter = require('events');
const mqttManager = require('./mqttManager');
const deviceManager = require('./deviceManager');

class EnergyManager extends EventEmitter {
    constructor() {
        super();
        this.config = {
            isConfigured: true, // Enable by default for device tracking
            solarCapacity: 4000, // Watts
            gridLimit: 5000,     // Watts
            costPerKwh: 0.25,    // Currency
            mqttTopics: {
                solar: 'energy/solar/power',
                grid: 'energy/grid/power',
                usage: 'energy/home/usage'
            },
            optimization: {
                enabled: true,
                exportThreshold: -2000, // If exporting > 2000W, turn stuff ON
                importLimit: 4500,     // If importing > 4500W, turn stuff OFF
                priorities: {
                    // deviceId: priority (1=critical, 10=disposable)
                    'washing_machine': 5,
                    'dishwasher': 5,
                    'ev_charger': 6,
                    'pool_pump': 8,
                    'air_conditioner': 7,
                    'heater_bedroom': 3
                }
            }
        };
        this.data = {
            solar: {
                currentPower: 0, // Watts
                dailyEnergy: 0,  // kWh
                totalEnergy: 0,  // kWh
                status: 'offline'
            },
            grid: {
                currentPower: 0, // Watts (positive = import, negative = export)
                dailyImport: 0,
                dailyExport: 0
            },
            home: {
                currentUsage: 0 // Watts
            },
            devices: {} // Individual device usage
        };
        
        this.usingRealData = false;
        
        // Listen to device updates for direct energy monitoring (Shelly, etc)
        deviceManager.on('device-updated', (device) => {
            if (device.state && device.state.power !== undefined) {
                this.data.devices[device.name] = { power: device.state.power };
                this.calculateTotalUsage();
                this.checkStandby(device);
            }
        });

        this.standbyConfig = {
            'TV_Plug': { threshold: 20, timeout: 10 * 60 * 1000 },
            'PC_Monitor': { threshold: 10, timeout: 5 * 60 * 1000 },
            'Coffee_Machine': { threshold: 5, timeout: 30 * 60 * 1000 }
        };
        this.standbyState = new Map();

        if (this.config.isConfigured) {
            this.setupMqtt();
        }
    }

    checkStandby(device) {
        // Use device name or ID as key
        const rule = this.standbyConfig[device.name] || this.standbyConfig[device.id];
        if (!rule) return;

        const power = device.state.power;
        const now = Date.now();
        const key = device.id;

        if (power < rule.threshold && power > 0) { // < threshold but not 0 (already off)
            if (!this.standbyState.has(key)) {
                console.log(`[Energy] ${device.name} entered standby zone (${power}W < ${rule.threshold}W). Timer started.`);
                this.standbyState.set(key, now);
            } else {
                const startTime = this.standbyState.get(key);
                if (now - startTime > rule.timeout) {
                    console.log(`[Energy] ${device.name} in standby for too long. Turning OFF.`);
                    deviceManager.controlDevice(device.id, 'turn_off');
                    this.standbyState.delete(key);
                }
            }
        } else {
            if (this.standbyState.has(key)) {
                // Reset timer if power spikes back up OR device turns off (0W)
                console.log(`[Energy] ${device.name} standby timer reset (Power: ${power}W).`);
                this.standbyState.delete(key);
            }
        }
    }

    calculateTotalUsage() {
        let totalDeviceUsage = 0;
        for (const key in this.data.devices) {
            totalDeviceUsage += (this.data.devices[key].power || 0);
        }
        // If we don't have a main meter, use the sum of devices
        if (!this.usingRealData) {
            this.data.home.currentUsage = totalDeviceUsage;
            this.emit('update', this.data);
        }
    }

    setupMqtt() {
        if (!this.config.isConfigured) return;
        
        mqttManager.on('connected', () => {
            console.log('[Energy] MQTT Connected, subscribing to energy topics...');
            if (this.config.mqttTopics.solar) mqttManager.subscribe(this.config.mqttTopics.solar);
            if (this.config.mqttTopics.grid) mqttManager.subscribe(this.config.mqttTopics.grid);
            if (this.config.mqttTopics.usage) mqttManager.subscribe(this.config.mqttTopics.usage);
            
            // Subscribe to device reports
            mqttManager.subscribe('energy/devices/#');
        });

        mqttManager.on('message', (topic, message) => {
            // Handle device reports
            if (topic.startsWith('energy/devices/')) {
                try {
                    const payload = JSON.parse(message);
                    const deviceName = payload.name || topic.split('/').pop();
                    this.data.devices[deviceName] = payload;
                    this.emit('update', this.data);
                    return;
                } catch (e) {
                    console.error('[Energy] Failed to parse device report:', e);
                }
            }

            // If we receive any message on energy topics, switch to real data mode
            if (Object.values(this.config.mqttTopics).includes(topic)) {
                this.usingRealData = true;
            }

            let value = parseFloat(message);
            if (isNaN(value)) {
                // Try parsing JSON if payload is object
                try {
                    const json = JSON.parse(message);
                    if (json.power !== undefined) value = parseFloat(json.power);
                    else if (json.value !== undefined) value = parseFloat(json.value);
                } catch(e) {}
            }

            if (isNaN(value)) return;

            if (topic === this.config.mqttTopics.solar) {
                this.updateData({ solar: value });
            } else if (topic === this.config.mqttTopics.grid) {
                // Some meters give positive for import, negative for export.
                // Others give separate topics. We assume net power here.
                this.data.grid.currentPower = value;
                this.emit('update', this.data);
            } else if (topic === this.config.mqttTopics.usage) {
                this.updateData({ usage: value });
            }
        });
    }

    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        console.log('[Energy] Config updated:', this.config);
        
        if (this.config.isConfigured) {
            this.setupMqtt();
            // Re-subscribe if topics changed
            if (mqttManager.connected) {
                if (this.config.mqttTopics.solar) mqttManager.subscribe(this.config.mqttTopics.solar);
                if (this.config.mqttTopics.grid) mqttManager.subscribe(this.config.mqttTopics.grid);
                if (this.config.mqttTopics.usage) mqttManager.subscribe(this.config.mqttTopics.usage);
            }
        }
    }

    getData() {
        if (!this.config.isConfigured) return null;
        return this.data;
    }

    getConfig() {
        return this.config;
    }

    startSimulation() {
        setInterval(() => {
            if (this.usingRealData) return; // Stop simulation if we have real data

            // Simulate solar generation (bell curve-ish based on time of day)
            const hour = new Date().getHours();
            let solarGen = 0;
            if (hour > 6 && hour < 20) {
                // Peak at 13:00
                const peak = 13;
                const dist = Math.abs(hour - peak);
                // Use configured capacity
                const maxGen = this.config.solarCapacity || 3000;
                solarGen = Math.max(0, maxGen - (dist * (maxGen / 6))) + (Math.random() * 200 - 100);
            }
            
            // Simulate home usage
            const homeUsage = 500 + (Math.random() * 1000); // 500W - 1500W base load

            this.updateData({
                solar: Math.max(0, Math.round(solarGen)),
                usage: Math.round(homeUsage)
            });

        }, 5000); // Update every 5 seconds
    }

    updateData(inputs) {
        // Update Solar
        if (inputs.solar !== undefined) {
            this.data.solar.currentPower = inputs.solar;
            this.data.solar.status = inputs.solar > 0 ? 'producing' : 'idle';
            // Simple integration for daily energy (very rough approximation for simulation)
            this.data.solar.dailyEnergy += (inputs.solar / 1000) * (5/3600); 
        }

        // Update Home Usage
        if (inputs.usage !== undefined) {
            this.data.home.currentUsage = inputs.usage;
        }

        // Calculate Grid
        // Grid = Usage - Solar
        // If Usage > Solar, we import (positive)
        // If Solar > Usage, we export (negative)
        this.data.grid.currentPower = this.data.home.currentUsage - this.data.solar.currentPower;
        
        // --- SMART GRID OPTIMIZATION ---
        if (this.config.optimization && this.config.optimization.enabled) {
            this.runOptimization(this.data.grid.currentPower);
        }

        this.emit('update', this.data);
    }

    async runOptimization(gridPower) {
        // Debounce: Don't switch too often. (Simple implementation: check last switch time)
        const now = Date.now();
        if (this.lastOptimization && (now - this.lastOptimization < 30000)) return; // 30s debounce

        const { exportThreshold, importLimit, priorities } = this.config.optimization;

        // SCENARIO 1: HIGH CONSUMPTION (Peak Shaving) - Prevent tripping breaker
        if (gridPower > importLimit) {
            console.log(`[Energy] ⚠️ IMPORT PEAK DETECTED (${gridPower}W). Shedding load...`);
            await this.shedLoad(priorities);
            this.lastOptimization = now;
        }

        // SCENARIO 2: HIGH PRODUCTION (Self Consumption) - Use free energy
        else if (gridPower < exportThreshold) {
            // gridPower is negative when exporting. e.g. -2500 < -2000
            console.log(`[Energy] ☀️ EXCESS SOLAR DETECTED (${Math.abs(gridPower)}W). Boosting load...`);
            await this.boostLoad(priorities);
            this.lastOptimization = now;
        }
    }

    async shedLoad(priorities) {
        // Find devices that are ON and have low priority (high number = low priority)
        // Sort by priority DESC (8 -> 7 -> 6...)
        const candidates = Object.keys(priorities).sort((a,b) => priorities[b] - priorities[a]);
        
        for (const deviceId of candidates) {
            const device = deviceManager.getDevice(deviceId);
            if (device && device.state && device.state.on) {
                console.log(`[Energy] Turning OFF ${device.name} to save energy.`);
                await deviceManager.controlDevice(deviceId, 'turn_off');
                return; // Turn off one at a time to see effect
            }
        }
    }

    async boostLoad(priorities) {
        // Find devices that are OFF and can be useful (middle priority)
        // Sort by priority ASC (5 -> 6 -> 7...)
        const candidates = Object.keys(priorities).sort((a,b) => priorities[a] - priorities[b]);
        
        for (const deviceId of candidates) {
            const device = deviceManager.getDevice(deviceId);
            if (device && device.state && !device.state.on) {
                 console.log(`[Energy] Turning ON ${device.name} to use excess solar.`);
                 await deviceManager.controlDevice(deviceId, 'turn_on');
                 return; // Turn on one at a time
            }
        }
    }
}

module.exports = new EnergyManager();

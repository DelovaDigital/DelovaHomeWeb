const EventEmitter = require('events');
const mqttManager = require('./mqttManager');

class EnergyManager extends EventEmitter {
    constructor() {
        super();
        this.config = {
            isConfigured: false, // Default to false, requires setup
            solarCapacity: 4000, // Watts
            gridLimit: 5000,     // Watts
            costPerKwh: 0.25,    // Currency
            mqttTopics: {
                solar: 'energy/solar/power',
                grid: 'energy/grid/power',
                usage: 'energy/home/usage'
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
            }
        };
        
        this.usingRealData = false;
        // this.setupMqtt(); // Only setup if configured
        if (this.config.isConfigured) {
            this.setupMqtt();
        }
        
        // Start simulation as fallback ONLY if configured and no real data
        // this.startSimulation(); 
    }

    setupMqtt() {
        if (!this.config.isConfigured) return;
        
        mqttManager.on('connected', () => {
            console.log('[Energy] MQTT Connected, subscribing to energy topics...');
            if (this.config.mqttTopics.solar) mqttManager.subscribe(this.config.mqttTopics.solar);
            if (this.config.mqttTopics.grid) mqttManager.subscribe(this.config.mqttTopics.grid);
            if (this.config.mqttTopics.usage) mqttManager.subscribe(this.config.mqttTopics.usage);
        });

        mqttManager.on('message', (topic, message) => {
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

        this.emit('update', this.data);
    }

    getData() {
        return this.data;
    }
}

module.exports = new EnergyManager();

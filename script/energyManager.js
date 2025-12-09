const EventEmitter = require('events');

class EnergyManager extends EventEmitter {
    constructor() {
        super();
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
        
        // Mock simulation for now (since we don't have real hardware connected yet)
        this.startSimulation();
    }

    startSimulation() {
        setInterval(() => {
            // Simulate solar generation (bell curve-ish based on time of day)
            const hour = new Date().getHours();
            let solarGen = 0;
            if (hour > 6 && hour < 20) {
                // Peak at 13:00
                const peak = 13;
                const dist = Math.abs(hour - peak);
                solarGen = Math.max(0, 3000 - (dist * 500)) + (Math.random() * 200 - 100);
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

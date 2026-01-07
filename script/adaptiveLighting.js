const deviceManager = require('./deviceManager');

class AdaptiveLighting {
    constructor() {
        this.interval = null;
        this.enabled = true;
    }

    start() {
        console.log('[AdaptiveLighting] Started.');
        // Run every 2 minutes
        this.interval = setInterval(() => this.updateLights(), 2 * 60 * 1000);
        this.updateLights(); // Run immediately
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
    }

    getTargetColorTemp() {
        const hour = new Date().getHours();
        
        // Schedule (Kelvin)
        // 06-09: Energize (5000K)
        // 09-17: Concentrate/Daylight (4000K-4500K)
        // 17-20: Relax (2700K)
        // 20-23: Read/Dim (2200K)
        // 23-06: Nightlight (2000K)

        if (hour >= 6 && hour < 9) return 5000;
        if (hour >= 9 && hour < 17) return 4000;
        if (hour >= 17 && hour < 20) return 2700;
        if (hour >= 20 && hour < 23) return 2200;
        return 2000; // Night
    }

    updateLights() {
        if (!this.enabled) return;
        
        const targetK = this.getTargetColorTemp();
        const mired = Math.round(1000000 / targetK); // Convert K to Mired (Hue uses Mired 153-500)

        // Iterate all devices
        deviceManager.devices.forEach((device) => {
            // Only adjust if light is ON and supports Color Temp
            if (device.type === 'light' && device.state && device.state.on) {
                // Check capability (if we tracked it) or just try
                // Hue typically supports 'ct' or 'color_temp'
                
                // Avoid overriding manual changes? 
                // Simple logic: Force update. Advanced: check last update time.
                
                // console.log(`[Adaptive] Setting ${device.name} to ${targetK}K (${mired} mired)`);
                
                // We assume deviceManager handles the conversion or passes raw
                // We'll normalize to 'set_color_temp' command
                deviceManager.controlDevice(device.id, 'set_color_temp', mired);
            }
        });
    }
}

module.exports = new AdaptiveLighting();

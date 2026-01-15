const EventEmitter = require('events');

class Simulator extends EventEmitter {
    constructor(deviceManager, notificationManager) {
        super();
        this.deviceManager = deviceManager;
        this.notificationManager = notificationManager;
        this.intervals = [];
    }

    start() {
        console.log('[Simulator] Started. Simulating environment...');
        
        // Simulate Temp fluctuations
        this.addInterval(() => {
             // Mock access to device list - simulator needs access to deviceManager's internal list
            if (this.deviceManager.getAllDevices) {
                const tempSensors = this.deviceManager.getAllDevices().filter(d => 
                    d.type === 'sensor' && (d.name.toLowerCase().includes('temp') || d.id.includes('temp'))
                );
                
                tempSensors.forEach(s => {
                    // Slight fluctuation of +/- 0.1 degree
                    let current = parseFloat(s.state) || 20.0;
                    current += (Math.random() - 0.5) * 0.2;
                    // Clamp plausible range
                    if (current < 15) current = 15;
                    if (current > 30) current = 30;
                    
                    this.deviceManager.updateDeviceState(s.id, current.toFixed(1));
                });
            }
        }, 60000); // Every minute
    }

    stop() {
        this.intervals.forEach(i => clearInterval(i));
        this.intervals = [];
    }

    addInterval(fn, ms) {
        this.intervals.push(setInterval(fn, ms));
    }

    triggerMotion(roomId) {
        console.log(`[Simulator] Motion in ${roomId || 'Unknown Room'}`);
        // Send a notification
        this.notificationManager.send(
            'Motion Detected', 
            `Motion detected in ${roomId || 'Unknown Room'}`, 
            'warning'
        );
        
        // Also if there is a 'motion_sensor' in that room, set state to 'on' then 'off'
        // This requires finding a device. For now we just notify.
    }
    
    triggerDoorbell() {
        console.log(`[Simulator] Doorbell pressed`);
        this.notificationManager.send(
            'Doorbell', 
            'Someone is at the front door!', 
            'alert', // High priority
            'all'
        );
        // Play sound via Sonos if available
        if (global.sonosManager && global.sonosManager.playClip) {
             // global.sonosManager.playClip('doorbell.mp3'); 
        }
    }
    
    triggerLeak() {
        console.log(`[Simulator] Water Leak Detected`);
         this.notificationManager.send(
            'Water Leak', 
            'Water leak detected near Washing Machine!', 
            'critical', 
            'all'
        );
    }
}

module.exports = Simulator;

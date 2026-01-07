const EventEmitter = require('events');
const deviceManager = require('./deviceManager');
const sceneManager = require('./sceneManager');
const presenceManager = require('./presenceManager');

class LogicEngine extends EventEmitter {
    constructor() {
        super();
        this.templateSensors = new Map();
        this.virtualDevices = new Map();
        
        // Polling loop for template sensors
        this.interval = setInterval(() => this.evaluateSensors(), 5000);
        
        // Init default templates
        this.initDefaultTemplates();
    }

    initDefaultTemplates() {
        // Example: "Is it dark and someone is home?"
        this.addTemplateSensor('is_dark_and_occupied', () => {
             const hour = new Date().getHours();
             const isDark = (hour >= 20 || hour < 7); // Simplistic
             const isOccupied = (presenceManager.getHomeState() === 'home');
             return isDark && isOccupied;
        });

        // Example: "High Energy Usage Alert"
        this.addTemplateSensor('high_energy_alert', () => {
            // Need access to EnergyManager data usually, or device states
            // This is a placeholder for context-aware logic
            return false; 
        });
    }

    addTemplateSensor(id, evaluatorFn) {
        this.templateSensors.set(id, {
            id,
            value: null,
            evaluator: evaluatorFn,
            lastUpdate: 0
        });
        console.log(`[Logic] Added Template Sensor: ${id}`);
    }

    evaluateSensors() {
        for (const [id, sensor] of this.templateSensors) {
            try {
                const newValue = sensor.evaluator();
                if (newValue !== sensor.value) {
                    console.log(`[Logic] Template Sensor ${id} changed: ${sensor.value} -> ${newValue}`);
                    sensor.value = newValue;
                    sensor.lastUpdate = Date.now();
                    this.emit('sensor_update', { id, value: newValue });
                    
                    // Also emit as a virtual device update so automations can pick it up
                    deviceManager.emit('device-updated', {
                        id: `sensor_${id}`,
                        name: `Virtual: ${id}`,
                        type: 'sensor',
                        state: { value: newValue } // Generic state
                    });
                }
            } catch (e) {
                console.error(`[Logic] Error evaluating ${id}:`, e.message);
            }
        }
    }

    // --- Complex Decision Structure (Flow-like) ---
    
    // Check if a set of conditions matches
    checkConditions(conditions) {
        if (!conditions || conditions.length === 0) return true;

        return conditions.every(cond => {
            if (cond.type === 'time') {
                const now = new Date();
                const hour = now.getHours();
                if (cond.operator === 'between') {
                    return hour >= cond.start && hour < cond.end;
                }
            } else if (cond.type === 'state') {
                const device = deviceManager.devices.get(cond.deviceId);
                if (!device) return false;
                
                const val = device.state[cond.property];
                if (cond.operator === 'equals') return val == cond.value;
                if (cond.operator === 'not_equals') return val != cond.value;
                if (cond.operator === '>'){ return val > cond.value; }
                if (cond.operator === '<'){ return val < cond.value; }
            } else if (cond.type === 'template') {
                const sensor = this.templateSensors.get(cond.sensorId);
                return sensor && sensor.value === cond.value;
            }
            return false;
        });
    }
}

module.exports = new LogicEngine();

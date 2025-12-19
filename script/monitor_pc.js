const os = require('os');
const mqtt = require('mqtt');

// Configuration
const CONFIG = {
    hubUrl: process.env.HUB_URL || 'mqtt://192.168.0.114:1883', // Replace with your Hub IP
    deviceName: os.hostname(),
    updateInterval: 5000 // 5 seconds
};

const client = mqtt.connect(CONFIG.hubUrl);

client.on('connect', () => {
    console.log(`Connected to Hub at ${CONFIG.hubUrl}`);
    
    setInterval(() => {
        reportMetrics();
    }, CONFIG.updateInterval);
});

client.on('error', (err) => {
    console.error('MQTT Error:', err.message);
});

function reportMetrics() {
    // 1. CPU Usage (Load Average as proxy for energy on Linux/Mac)
    const cpus = os.cpus();
    const load = os.loadavg()[0]; // 1 minute load average
    
    // Estimate power usage (Very rough approximation)
    // Idle power + (Max Power - Idle Power) * (Load / Cores)
    // Example: Laptop Idle 10W, Max 45W.
    const IDLE_POWER = 10;
    const MAX_POWER = 65;
    const utilization = Math.min(load / cpus.length, 1.0);
    const estimatedPower = IDLE_POWER + ((MAX_POWER - IDLE_POWER) * utilization);

    const payload = {
        name: CONFIG.deviceName,
        type: 'server',
        power: parseFloat(estimatedPower.toFixed(2)),
        cpu_load: load,
        memory_free: os.freemem(),
        platform: os.platform()
    };

    // Publish to a topic the Hub listens to
    // energy/devices/<hostname>
    client.publish(`energy/devices/${CONFIG.deviceName}`, JSON.stringify(payload));
    
    // Also publish to total usage topic if you want it aggregated immediately
    // But better to let the Hub aggregate it.
}

console.log(`Starting Energy Monitor for ${CONFIG.deviceName}...`);

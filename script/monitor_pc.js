const os = require('os');
const mqtt = require('mqtt');

/**
 * DelovaHome PC Energy Monitor
 * 
 * Setup Instructions:
 * 1. Install Node.js on the target machine.
 * 2. Create a folder and place this script inside.
 * 3. Run `npm install mqtt` in that folder.
 * 4. Run `node monitor_pc.js` (or use PM2/Service to keep it running).
 * 5. Set HUB_URL environment variable if your Hub is not at the default IP.
 */

// Configuration
const CONFIG = {
    // Replace with your Hub IP, or set environment variable
    hubUrl: process.env.HUB_URL || 'mqtt://192.168.0.216:1883', 
    deviceName: os.hostname(),
    updateInterval: 5000 // 5 seconds
};

console.log('Connecting to Hub at', CONFIG.hubUrl);
const client = mqtt.connect(CONFIG.hubUrl);

client.on('connect', () => {
    console.log(`Connected to Hub as ${CONFIG.deviceName}`);
    // Start loop
    loop();
});

client.on('error', (err) => {
    console.error('MQTT Error:', err.message);
});

async function loop() {
    while (true) {
        await reportMetrics();
        // Wait for updateInterval BEFORE next loop
        await new Promise(r => setTimeout(r, CONFIG.updateInterval));
    }
}

function getCpuUsage() {
    return new Promise((resolve) => {
        const start = os.cpus();
        setTimeout(() => {
            const end = os.cpus();
            
            let idle = 0;
            let total = 0;
            
            for(let i = 0; i < start.length; i++) {
                const startCpu = start[i].times;
                const endCpu = end[i].times;
                
                for(let type in startCpu) {
                    const diff = endCpu[type] - startCpu[type];
                    total += diff;
                    if(type === 'idle') idle += diff;
                }
            }
            
            const usage = 100 - Math.round((idle / total) * 100);
            resolve(Math.max(0, usage));
        }, 1000);
    });
}

async function reportMetrics() {
    try {
        // 1. CPU Usage
        const cpuPercent = await getCpuUsage();
        const load = os.loadavg()[0]; // 1 minute load average
        
        // Memory
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;

        // Estimate power usage (Very rough approximation)
        let IDLE_POWER = 10;
        let MAX_POWER = 65;
        
        if (os.arch() === 'x64') { // Desktop/Laptop
            IDLE_POWER = 20;
            MAX_POWER = 150;
        } else if (os.arch() === 'arm64' || os.arch() === 'arm') { // Pi/Mobile
            IDLE_POWER = 4;
            MAX_POWER = 10;
        }

        const utilization = Math.min(cpuPercent / 100, 1.0);
        const estimatedPower = IDLE_POWER + ((MAX_POWER - IDLE_POWER) * utilization);

        const payload = {
            name: CONFIG.deviceName,
            type: 'computer',
            power: parseFloat(estimatedPower.toFixed(2)),
            power_source: 'estimated',
            cpu_load: cpuPercent, // Percentage (0-100)
            load_avg: load,
            memory_used: usedMem,
            memory_total: totalMem,
            platform: os.platform() + ' ' + os.release()
        };

        // Publish to a topic the Hub listens to: energy/devices/<hostname>
        client.publish(`energy/devices/${CONFIG.deviceName}`, JSON.stringify(payload));
        console.log(`Reported: CPU ${cpuPercent}% | RAM ${Math.round(usedMem/1024/1024)}MB | Power ${estimatedPower.toFixed(1)}W`);
        
    } catch (e) {
        console.error('Error reporting metrics:', e);
    }
}

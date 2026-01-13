const os = require('os');
const mqttManager = require('./mqttManager');

let isStarted = false;
let updateInterval = null;

function start() {
    if (isStarted) return;
    isStarted = true;

    console.log('[SystemMonitor] Starting local system monitoring...');

    // Update every 5 seconds
    updateInterval = setInterval(async () => {
        try {
            if (!mqttManager.connected) return;

            const cpuPercent = await getCpuUsage();
            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            
            // Load avg for reference (1 min)
            const loadAvg = os.loadavg()[0];

            // Estimate power
            // Assume server is Pi or small PC
            // Raspberry Pi 4: Idle ~3-4W, Max ~7-8W
            // Generic PC: Idle ~40W, Max 150W+
            // We use a simple heuristic based on architecture
            let idlePower = 4;
            let maxPower = 8;
            
            if (os.arch() === 'x64') {
                idlePower = 30;
                maxPower = 120;
            }

            const utilization = Math.min(cpuPercent / 100, 1.0);
            const estimatedPower = idlePower + ((maxPower - idlePower) * utilization);

            // Use 'DelovaHome' as the device name for the server
            // Or use os.hostname() if it matches what the user expects
            // User query mentions "DelovaHome is also in the device list"
            const deviceName = 'DelovaHome';

            const payload = {
                name: deviceName,
                type: 'server',
                power: parseFloat(estimatedPower.toFixed(2)),
                power_source: 'estimated',
                cpu_load: cpuPercent, // Sending percentage as cpu_load for compatibility with deviceManager expects (mapped to device.state.cpu)
                load_avg: loadAvg,
                memory_used: usedMem,
                memory_total: totalMem,
                platform: os.platform() + ' ' + os.release(),
                battery_level: 100, // It's a server
                charging: true
            };

            mqttManager.publish(`energy/devices/${deviceName}`, JSON.stringify(payload));
        
        } catch (e) {
            console.error('[SystemMonitor] Error collecting stats:', e);
        }
    }, 5000);
}

function stop() {
    if (updateInterval) clearInterval(updateInterval);
    isStarted = false;
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

module.exports = { start, stop };

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
            const deviceName = 'DelovaHome';

            // Retrieve Network Info to match Discovery
            const nets = os.networkInterfaces();
            let mac = '';
            let ip = '';
            
            for (const name of Object.keys(nets)) {
                for (const net of nets[name]) {
                    // Skip internal (i.e. 127.0.0.1) and non-IPv4
                    if (net.family === 'IPv4' && !net.internal) {
                        ip = net.address;
                        mac = net.mac;
                        break;
                    }
                }
                if (mac) break; // Use first found
            }

            const payload = {
                name: deviceName,
                type: 'server',
                ip: ip,   // Add IP
                mac: mac, // Add MAC
                power: parseFloat(estimatedPower.toFixed(2)),
                power_source: 'estimated',
                cpu_load: cpuPercent, 
                load_avg: loadAvg,
                memory_used: usedMem,
                memory_total: totalMem,
                platform: os.platform() + ' ' + os.release(),
                battery_level: 100,
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

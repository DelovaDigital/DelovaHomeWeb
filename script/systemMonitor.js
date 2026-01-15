const os = require('os');
const { exec } = require('child_process');
const mqttManager = require('./mqttManager');

let isStarted = false;
let updateInterval = null;
let healthStatus = {
    status: 'ok', // ok, warning, critical
    issues: []
};

function start() {
    if (isStarted) return;
    isStarted = true;

    console.log('[SystemMonitor] Starting local system monitoring...');

    // Function to run update
    const update = async () => {
        try {
            if (!mqttManager.connected) return;

            const cpuPercent = await getCpuUsage();
            const diskUsage = await getDiskUsage();

            const totalMem = os.totalmem();
            const freeMem = os.freemem();
            const usedMem = totalMem - freeMem;
            
            // Health Checks
            const issues = [];
            if (cpuPercent > 90) issues.push('High CPU Usage');
            if (diskUsage && diskUsage > 90) issues.push('Low Disk Space');
            if (freeMem / totalMem < 0.1) issues.push('Low Memory');
            
            healthStatus.status = issues.length > 0 ? (issues.length > 2 ? 'critical' : 'warning') : 'ok';
            healthStatus.issues = issues;

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
                disk_usage: diskUsage,
                health: healthStatus,
                platform: os.platform() + ' ' + os.release(),
                battery_level: 100,
                charging: true
            };

            mqttManager.publish(`energy/devices/${deviceName}`, JSON.stringify(payload));
            // console.log(`[SystemMonitor] Reported: Power ${estimatedPower.toFixed(1)}W, CPU ${cpuPercent}%`);
        
        } catch (e) {
            console.error('[SystemMonitor] Error collecting stats:', e);
        }
    };

    // Run immediately then interval
    // We delay the first run slightly to ensure MQTT is ready
    setTimeout(update, 2000);
    updateInterval = setInterval(update, 5000);
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

function getDiskUsage() {
    return new Promise((resolve) => {
        if (process.platform === 'win32') {
            // Windows: Use wmic
            exec('wmic logicaldisk where "DeviceID=\'C:\'" get FreeSpace,Size', (err, stdout) => {
                if (err) {
                    resolve(null);
                    return;
                }
                const lines = stdout.trim().split('\n');
                if (lines.length < 2) { 
                    resolve(null); 
                    return; 
                }
                const parts = lines[1].trim().split(/\s+/);
                if (parts.length >= 2) {
                    const free = parseInt(parts[0]);
                    const size = parseInt(parts[1]);
                    if (!isNaN(free) && !isNaN(size) && size > 0) {
                        const used = size - free;
                        resolve(Math.round((used / size) * 100));
                        return;
                    }
                }
                resolve(null);
            });
        } else {
            // Linux/Mac: Use df -k /
             exec('df -k /', (err, stdout) => {
                if (err) {
                    resolve(null);
                    return;
                }
                const lines = stdout.trim().split('\n');
                if (lines.length < 2) {
                    resolve(null);
                    return;
                }
                const parts = lines[1].replace(/\s+/g, ' ').split(' ');
                // Filesystem 1K-blocks Used Available Use% Mounted on
                // usually parts[4] is Use% (e.g., "15%")
                const useStr = parts[4]; 
                if (useStr && useStr.endsWith('%')) {
                    resolve(parseInt(useStr.replace('%', '')));
                } else {
                    resolve(null);
                }
             });
        }
    });
}

module.exports = { start, stop };

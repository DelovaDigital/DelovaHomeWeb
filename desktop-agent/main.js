const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const mqtt = require('mqtt');
const si = require('systeminformation');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const AutoLaunch = require('auto-launch');

// Logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

const store = new Store();
let mainWindow;
let tray;
let client;
let intervalId;
let appAutoLauncher = new AutoLaunch({
  name: 'DelovaHome Agent',
  path: app.getPath('exe'),
});

// Check auto launch
appAutoLauncher.isEnabled().then((isEnabled) => {
  if (!isEnabled) appAutoLauncher.enable();
}).catch(function(err){
  // handle error
  console.log('Auto-launch error:', err);
});

// Update Config
autoUpdater.autoDownload = false;

// Default Config
const DEFAULT_CONFIG = {
    hubUrl: 'mqtt://192.168.0.216:1883',
    deviceName: si.osInfo().hostname || 'Desktop-PC',
    updateInterval: 5000
};

function createWindow() {
    if (mainWindow) {
        mainWindow.show();
        return;
    }

    mainWindow = new BrowserWindow({
        width: 600,
        height: 500,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true
    });

    mainWindow.loadFile('index.html');

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
        mainWindow.webContents.send('init-config', {
            hubUrl: store.get('hubUrl', DEFAULT_CONFIG.hubUrl),
            deviceName: store.get('deviceName', DEFAULT_CONFIG.deviceName)
        });
    });
}

function createTray() {
    // try {
    //     tray = new Tray(path.join(__dirname, 'icon.png'));
    // } catch (e) {
    //     // Fallback or empty, but Electron requires an image for Tray usually.
    //     // We will use a system default or create an empty native image if possible, 
    //     // but for simplicity we rely on electron-builder to bundle the app icon.
    //     // In dev mode without an icon, this might fail on some OS.
    //     // For now, let's just use string path and hope user adds icon.png or accepts error.
    // }
    
    // Safer approach: Check if file exists
    const fs = require('fs');
    const iconPath = path.join(__dirname, 'icon.png');
    
    if (fs.existsSync(iconPath)) {
        tray = new Tray(iconPath);
    } else {
        // Create a simple empty tray if no icon (might be invisible on Windows/Mac)
        // Better to just not crash.
        // On macOS, a Tray without image throws.
        // We will skip Tray creation if no icon is found to avoid crash,
        // but then user can't open settings easily once hidden.
        // Let's create the window immediately if no icon.
        console.warn('No icon.png found. Tray disabled. Window will be shown.');
        createWindow();
        return;
    }

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Open Settings', click: createWindow },
        { label: 'Quit', click: () => {
            app.isQuiting = true;
            app.quit();
        }}
    ]);
    tray.setToolTip('DelovaHome Agent');
    tray.setContextMenu(contextMenu);
    
    tray.on('double-click', createWindow);
}

function startMonitoring() {
    if (client) {
        client.end();
        clearInterval(intervalId);
    }

    const hubUrl = store.get('hubUrl', DEFAULT_CONFIG.hubUrl);
    const deviceName = store.get('deviceName', DEFAULT_CONFIG.deviceName);

    console.log(`Connecting to ${hubUrl}...`);
    client = mqtt.connect(hubUrl);

    client.on('connect', () => {
        console.log('MQTT Connected');
        if (mainWindow) mainWindow.webContents.send('status', 'Connected');
        
        // Initial Discovery Announcement
        announceDevice(deviceName);
        
        // Subscribe to commands
        const cmdTopic = `energy/devices/${deviceName}/command`;
        client.subscribe(cmdTopic);
        console.log(`Subscribed to ${cmdTopic}`);

        intervalId = setInterval(() => reportMetrics(deviceName), 5000);
        reportMetrics(deviceName); // Immediate
    });
    
    client.on('message', (topic, message) => {
        try {
            const msgStr = message.toString();
            console.log(`Received command on ${topic}: ${msgStr}`);
            
            if (topic.endsWith('/command')) {
                handleCommand(msgStr);
            }
        } catch (e) {
            console.error('Command processing error:', e);
        }
    });

    client.on('error', (err) => {
        console.error('MQTT Error:', err.message);
        if (mainWindow) mainWindow.webContents.send('status', `Error: ${err.message}`);
    });
}

async function handleCommand(cmd) {
    const exec = require('child_process').exec;
    console.log(`Executing command: ${cmd}`);

    if (cmd === 'turn_off' || cmd === 'shutdown') {
        if (process.platform === 'win32') {
            exec('shutdown /s /t 0');
        } else if (process.platform === 'darwin' || process.platform === 'linux') {
            exec('shutdown -h now'); // Might require sudo/permissions
        }
    } else if (cmd === 'reboot' || cmd === 'restart') {
        if (process.platform === 'win32') {
            exec('shutdown /r /t 0');
        } else {
            exec('shutdown -r now');
        }
    } else if (cmd === 'sleep') {
        if (process.platform === 'win32') {
            exec('rundll32.exe powrprof.dll,SetSuspendState 0,1,0');
        } else if (process.platform === 'darwin') {
            exec('pmset sleepnow');
        }
    }
}

function announceDevice(deviceName) {
    if (!client) return;
    const payload = {
        id: `pc-${deviceName.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
        name: deviceName,
        type: 'computer',
        ip: getLocalIp(),
        capabilities: ['energy-monitor']
    };
    // Publish discovery message so Hub finds it automatically
    // The Hub might need to listen to a specific topic for agents
    // For now, we rely on the energy topic or send to 'delovahome/discovery'
}

async function reportMetrics(deviceName) {
    if (!client || !client.connected) return;

    try {
        const cpuLoad = await si.currentLoad();
        const mem = await si.mem();
        const battery = await si.battery();
        const graphics = await si.graphics();
        
        // Estimate Power
        // Very rough, but better than loadavg alone
        // Desktop CPU TDP (approx) * load + GPU * load + Screen + Base
        
        let estimatedPower = 20; // Base estimate
        if (battery.hasBattery && !battery.acConnected) {
            // If running on battery, we might get discharge rate?
            // si.battery() gives current power usage in newer versions??
            // usually just percent.
        }
        
        // Simple CPU scaling logic
        // Assume 65W Max CPU
        estimatedPower += (65 * (cpuLoad.currentLoad / 100));

        // GPU load?
        if (graphics.controllers && graphics.controllers.length > 0) {
             // Hard to get GPU load cross platform without native modules
        }

        const payload = {
            name: deviceName,
            type: 'computer',
            ip: getLocalIp(), // Include IP for linking
            mac: getMacAddress(), // Include MAC for stricter linking
            power: parseFloat(estimatedPower.toFixed(2)),
            cpu_load: parseFloat(cpuLoad.currentLoad.toFixed(1)),
            memory_used: mem.used,
            memory_total: mem.total,
            platform: process.platform,
            battery_level: battery.hasBattery ? battery.percent : null,
            charging: battery.acConnected
        };

        client.publish(`energy/devices/${deviceName}`, JSON.stringify(payload));
        
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('metrics', payload);
        }

    } catch (e) {
        console.error('Metrics Error:', e);
    }
}

function getLocalIp() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                return net.address;
            }
        }
    }
    return '127.0.0.1';
}

function getMacAddress() {
    const { networkInterfaces } = require('os');
    const nets = networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal && net.mac && net.mac !== '00:00:00:00:00:00') {
                return net.mac;
            }
        }
    }
    return null;
}

app.whenReady().then(() => {
    // Check for updates immediately
    autoUpdater.checkForUpdatesAndNotify();

    // Check for updates every hour
    setInterval(() => {
        autoUpdater.checkForUpdatesAndNotify();
    }, 60 * 60 * 1000);

    createTray();
    
    // Hide dock icon on macOS to be truly background
    if (process.platform === 'darwin') {
        app.dock.hide();
    }
    
    startMonitoring();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Update Events
autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: 'A new version of DelovaHome Agent is available. Do you want to download it now?',
        buttons: ['Yes', 'No']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.downloadUpdate();
        }
    });
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded. Restart now to install?',
        buttons: ['Restart', 'Later']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

app.on('window-all-closed', () => {
    // Don't quit! We want background mode.
    // If user explicitly quits via tray -> app.quit() is called there.
});

ipcMain.on('save-config', (event, config) => {
    store.set('hubUrl', config.hubUrl);
    store.set('deviceName', config.deviceName);
    startMonitoring(); // Restart with new config
});

ipcMain.on('check-for-updates', () => {
    log.info('Manual update check initiated');
    autoUpdater.checkForUpdates();
});

ipcMain.on('open-dashboard', () => {
    const hubUrl = store.get('hubUrl', DEFAULT_CONFIG.hubUrl);
    // Convert mqtt://192.168.x.x:1883 to http://192.168.x.x:3000
    try {
        const urlObj = new URL(hubUrl);
        const dashboardUrl = `http://${urlObj.hostname}:3000`; // Assuming port 3000
        shell.openExternal(dashboardUrl);
    } catch (e) {
        console.error('Invalid Hub URL:', e);
    }
});

autoUpdater.on('update-not-available', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-message', 'OmniHome Agent is up to date.');
    }
});

autoUpdater.on('error', (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-message', 'Update Check Failed: ' + (err.message || err));
    }
});

ipcMain.on('open-settings', () => {
    createWindow();
});

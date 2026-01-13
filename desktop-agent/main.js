const { app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const mqtt = require('mqtt');
const si = require('systeminformation');
const Store = require('electron-store');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const AutoLaunch = require('auto-launch');
const { Bonjour } = require('bonjour-service');

// Logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

const store = new Store();
let mainWindow;
let settingsWindow;
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
    hubUrl: '', // Auto-discovery will fill this
    dashboardUrl: '', // Explicit dashboard URL valid override
    deviceName: si.osInfo().hostname || 'Desktop-PC',
    updateInterval: 5000
};

// Discovery
const bonjour = new Bonjour();
let discoveryTimeout;

function startDiscovery() {
    console.log('Starting Hub Discovery...');
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('status', 'Searching for Hub...');
    }
    
    // Look for 'delovahome' service
    bonjour.find({ type: 'delovahome' }, (service) => {
        console.log('Found DelovaHome Hub:', service);
        
        // MQTT IP
        let ip = null;
        if (service.addresses && service.addresses.length > 0) {
            ip = service.addresses.find(addr => addr.includes('.')) || service.addresses[0];
        } else if (service.referer && service.referer.address) {
            ip = service.referer.address;
        }

        // Web Port (from txt record or default)
        let webPort = 3000;
        if (service.txt && service.txt.web_port) {
             webPort = service.txt.web_port;
        } else if (service.port) {
            // Note: service.port is usually MQTT (1883) or HTTP (3000) depending on what advertised it
            // DelovaHome advertisement in server.js uses type 'delovahome' and passes `port`.
            // In server.js we saw `bonjour.publish({ ... type: 'delovahome', port: port ...` where port is http port (3000).
            webPort = service.port;
        }

        if (ip) {
            const foundMqttUrl = `mqtt://${ip}:1883`; // Assuming standard MQTT port if using server.js advertisement
            // Wait, server.js advertises the HTTP port. We can infer MQTT is on 1883 usually.
            // But actually server.js uses `port` (3000) in advertisement.
            
            // NOTE: If the discovered service IS the http server, we should use its IP for mqtt too.
            
            const foundHttpUrl = `http://${ip}:${webPort}`;
            
            const currentUrl = store.get('hubUrl');
            
            if (!currentUrl || currentUrl === '' || currentUrl.includes('192.168.0.216')) {
                store.set('hubUrl', foundMqttUrl);
                store.set('dashboardUrl', foundHttpUrl);
                
                console.log('Auto-configured:', foundMqttUrl, foundHttpUrl);
                
                if (settingsWindow && !settingsWindow.isDestroyed()) {
                    settingsWindow.webContents.send('init-config', {
                        hubUrl: foundMqttUrl,
                        deviceName: store.get('deviceName', DEFAULT_CONFIG.deviceName)
                    });
                    settingsWindow.webContents.send('status', 'Hub Found! Connecting...');
                }

                // Connect immediately
                startMonitoring();
                loadDashboard();
            }
        }
    });
    
    // ... http fallback ...
}

function getHubHttpUrl() {
    // 1. Explicit overwrite
    const explicit = store.get('dashboardUrl');
    if (explicit) return explicit;
    
    // 2. Infer from MQTT
    const hubUrl = store.get('hubUrl', DEFAULT_CONFIG.hubUrl);
    try {
        const urlObj = new URL(hubUrl);
        return `http://${urlObj.hostname}:3000`;
    } catch (e) {
        return null;
    }
}

    // Also look for generic HTTP just in case, filtered by name
    bonjour.find({ type: 'http' }, (service) => {
        if (service.name && service.name.toLowerCase().includes('delovahome')) {
            // Same logic
             let ip = null;
            if (service.addresses && service.addresses.length > 0) {
                ip = service.addresses.find(addr => addr.includes('.')) || service.addresses[0];
            }
            if (ip) {
                 const foundUrl = `mqtt://${ip}:1883`;
                 const currentUrl = store.get('hubUrl');
                 if (!currentUrl || currentUrl === '') {
                     store.set('hubUrl', foundUrl);
                     store.set('hubHttpPort', service.port); // Save HTTP port too for dashboard?
                     startMonitoring();
                     loadDashboard();
                 }
            }
        }
    });


function createMenu() {
    const template = [
        {
            label: 'DelovaHome',
            submenu: [
                { label: 'Go to Dashboard', accelerator: 'CmdOrCtrl+D', click: loadDashboard },
                { label: 'Preferences...', accelerator: 'CmdOrCtrl+,', click: openSettingsWindow },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        { role: 'editMenu' },
        { 
            label: 'View',
            submenu: [
                { role: 'reload' },
                { role: 'forceReload' },
                { role: 'toggleDevTools' },
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        { role: 'windowMenu' }
    ];
    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

function getHubHttpUrl() {
    const hubUrl = store.get('hubUrl', DEFAULT_CONFIG.hubUrl);
    try {
        // Extract IP from mqtt://192.168.x.x:1883
        const urlObj = new URL(hubUrl);
        // Assume Web Dashboard is on port 3000 (standard for OmniHome)
        return `http://${urlObj.hostname}:3000`;
    } catch (e) {
        return null;
    }
}

function loadDashboard() {
    if (!mainWindow) return;
    const url = getHubHttpUrl();
    if (url) {
        console.log('Loading Dashboard:', url);
        mainWindow.loadURL(url).catch(err => {
            console.error('Failed to load dashboard:', err);
            mainWindow.loadFile('settings.html'); // Fallback to settings if connection fails
        });
    } else {
        mainWindow.loadFile('settings.html');
    }
}

function openSettingsWindow() {
    if (settingsWindow) {
        settingsWindow.focus();
        return;
    }

    settingsWindow = new BrowserWindow({
        width: 500,
        height: 600,
        title: 'DelovaHome Agent Settings',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        autoHideMenuBar: true
    });

    settingsWindow.loadFile('settings.html');

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });

    settingsWindow.once('ready-to-show', () => {
        settingsWindow.show();
        settingsWindow.webContents.send('init-config', {
            hubUrl: store.get('hubUrl', DEFAULT_CONFIG.hubUrl),
            deviceName: store.get('deviceName', DEFAULT_CONFIG.deviceName)
        });
    });
}

function createWindow() {
    if (mainWindow) {
        mainWindow.show();
        return;
    }

    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: 'DelovaHome',
        webPreferences: {
            nodeIntegration: false, // Security for remote content
            contextIsolation: true,  // Security
            preload: path.join(__dirname, 'preload.js') // Optional future use
        },
        show: false
    });

    createMenu();
    loadDashboard();

    mainWindow.on('close', (event) => {
        if (!app.isQuiting) {
            event.preventDefault();
            mainWindow.hide();
        }
        return false;
    });

    mainWindow.once('ready-to-show', () => {
        mainWindow.show();
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
    
    tray.on('double-click', () => {
        if (mainWindow) mainWindow.show();
    });
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
        if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('status', 'Connected');
        
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
        if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.webContents.send('status', `Error: ${err.message}`);
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
        
        if (settingsWindow && !settingsWindow.isDestroyed()) {
            settingsWindow.webContents.send('metrics', payload);
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
    
    // Auto-Discovery on startup
    const savedUrl = store.get('hubUrl');
    if (!savedUrl) {
         startDiscovery();
    } else {
        startMonitoring();
    }

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

app.on('before-quit', () => {
    // Handle Command+Q (macOS) or explicit quit via Dock
    app.isQuiting = true;
});

ipcMain.on('save-config', (event, config) => {
    store.set('hubUrl', config.hubUrl);
    store.set('deviceName', config.deviceName);
    startMonitoring(); // Restart with new config
    loadDashboard(); // Reload Dashboard in main window
});

ipcMain.on('start-scan', () => {
    startDiscovery();
});

ipcMain.on('check-for-updates', () => {
    log.info('Manual update check initiated');
    autoUpdater.checkForUpdates();
});

ipcMain.on('open-dashboard', () => {
    loadDashboard();
    if (mainWindow) mainWindow.show();
});

autoUpdater.on('update-not-available', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update-message', 'OmniHome Agent is up to date.');
    }
});

autoUpdater.on('error', (err) => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.webContents.send('update-message', 'Update Check Failed: ' + (err.message || err));
    }
});

ipcMain.on('open-settings', () => {
    openSettingsWindow();
});

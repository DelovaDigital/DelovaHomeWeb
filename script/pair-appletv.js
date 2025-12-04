const { AppleTV } = require('node-appletv-x');
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const net = require('net');

const CREDENTIALS_FILE = path.join(__dirname, '../appletv-credentials.json');
const MANUAL_IP = '192.168.0.68';
const MANUAL_ID = 'C60D71CC6793';

// Ports to check
const COMMON_PORTS = [3689, 5000, 7000, 7100];
const DYNAMIC_RANGE_START = 49152;
const DYNAMIC_RANGE_END = 49160; // Scan a few

async function checkPort(host, port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(500);
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
        socket.on('error', () => { socket.destroy(); resolve(false); });
        socket.connect(port, host);
    });
}

async function tryConnect(device, port) {
    console.log(`Attempting handshake on port ${port}...`);
    device.port = port;
    
    return new Promise(async (resolve, reject) => {
        // Handle device-level errors to prevent crashes
        const errorHandler = (err) => {
            // console.log('Device error:', err.message);
        };
        device.on('error', errorHandler);
        
        // Add debug listener
        const debugHandler = (msg) => {
            console.log(`[DEBUG ${port}] ${msg}`);
        };
        device.on('debug', debugHandler);

        const timeout = setTimeout(() => {
            device.removeListener('error', errorHandler);
            device.removeListener('debug', debugHandler);
            device.closeConnection();
            reject(new Error('Handshake timed out'));
        }, 10000); // Increased to 10 seconds

        try {
            await device.openConnection();
            clearTimeout(timeout);
            device.removeListener('error', errorHandler);
            device.removeListener('debug', debugHandler);
            resolve();
        } catch (e) {
            clearTimeout(timeout);
            device.removeListener('error', errorHandler);
            device.removeListener('debug', debugHandler);
            reject(e);
        }
    });
}

async function pairAppleTV() {
    console.log(`Scanning ${MANUAL_IP} for open ports...`);
    const openPorts = [];

    // Check common
    for (const port of COMMON_PORTS) {
        if (await checkPort(MANUAL_IP, port)) openPorts.push(port);
    }
    // Check dynamic
    for (let port = DYNAMIC_RANGE_START; port <= DYNAMIC_RANGE_END; port++) {
        if (await checkPort(MANUAL_IP, port)) openPorts.push(port);
    }

    console.log(`Found open ports: ${openPorts.join(', ')}`);

    if (openPorts.length === 0) {
        console.log("No open ports found. Is the device on?");
        process.exit(1);
    }

    // Mock device
    const mockService = {
        name: 'Apple TV van Alessio',
        txt: { UniqueIdentifier: MANUAL_ID, Name: 'Apple TV van Alessio' },
        addresses: [MANUAL_IP],
        port: openPorts[0]
    };
    const device = new AppleTV(mockService);
    device.uid = MANUAL_ID;
    device.address = MANUAL_IP;

    let connectedPort = null;

    for (const port of openPorts) {
        try {
            await tryConnect(device, port);
            console.log(`\nSUCCESS: Connected to Apple TV on port ${port}!`);
            connectedPort = port;
            break;
        } catch (e) {
            console.log(`Failed handshake on port ${port}: ${e.message}`);
            // Ensure connection is closed before trying next
            device.closeConnection();
        }
    }

    if (!connectedPort) {
        console.error("\nCould not establish MRP handshake on any open port.");
        process.exit(1);
    }

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    console.log("Initiating pairing... Please check your Apple TV for the 4-digit PIN.");
    try {
        const callback = await device.pair();

        rl.question('Enter the 4-digit PIN: ', async (pin) => {
            try {
                await callback(pin);
                const credentials = device.credentials.toString();
                
                // Read existing credentials if any
                let allCredentials = {};
                if (fs.existsSync(CREDENTIALS_FILE)) {
                    try {
                        allCredentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE));
                    } catch (e) {}
                }

                // Save by Unique ID
                allCredentials[device.uid] = credentials;
                
                fs.writeFileSync(CREDENTIALS_FILE, JSON.stringify(allCredentials, null, 2));
                
                console.log("\n--- PAIRING SUCCESSFUL ---");
                console.log(`Credentials saved to ${CREDENTIALS_FILE}`);
                console.log("You can now restart the server to enable control.");
            } catch (err) {
                console.error("Pairing failed:", err);
            } finally {
                rl.close();
                device.closeConnection();
                process.exit(0);
            }
        });
    } catch (err) {
        console.error("Pairing initiation failed:", err);
        rl.close();
        device.closeConnection();
        process.exit(1);
    }
}

pairAppleTV();

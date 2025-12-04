const net = require('net');

const HOST = '192.168.0.68';
const START_PORT = 49150;
const END_PORT = 49200;
const TIMEOUT = 1000;

const otherPorts = [3689, 5000, 7000, 7100];

async function checkPort(port) {
    return new Promise((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(TIMEOUT);
        
        socket.on('connect', () => {
            socket.destroy();
            resolve(true);
        });
        
        socket.on('timeout', () => {
            socket.destroy();
            resolve(false);
        });
        
        socket.on('error', (err) => {
            socket.destroy();
            resolve(false);
        });
        
        socket.connect(port, HOST);
    });
}

async function scan() {
    console.log(`Scanning ${HOST} for open ports...`);
    
    // Check specific ports first
    for (const port of otherPorts) {
        const isOpen = await checkPort(port);
        if (isOpen) console.log(`Port ${port} is OPEN`);
    }

    // Check range
    for (let port = START_PORT; port <= END_PORT; port++) {
        const isOpen = await checkPort(port);
        if (isOpen) console.log(`Port ${port} is OPEN`);
    }
    console.log('Scan complete.');
}

scan();

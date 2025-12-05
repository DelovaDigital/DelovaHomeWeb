const { spawn } = require('child_process');
const EventEmitter = require('events');

class CameraStream extends EventEmitter {
    constructor(url) {
        super();
        this.url = url;
        this.clients = new Set();
        this.process = null;
        this.start();
    }

    start() {
        if (this.process) return;

        const args = [
            '-rtsp_transport', 'tcp',
            '-i', this.url,
            '-f', 'mpegts',
            '-codec:v', 'mpeg1video',
            '-codec:a', 'mp2',
            '-stats',
            '-r', '25',
            '-q:v', '3',
            '-vf', 'scale=1280:-1',
            '-b:v', '2000k',
            '-bufsize', '4000k',
            '-maxrate', '2000k',
            '-ar', '44100',
            '-ac', '1',
            '-b:a', '128k',
            '-'
        ];

        console.log(`[CameraStream] Spawning ffmpeg for ${this.url}`);
        this.process = spawn('ffmpeg', args);

        this.process.stdout.on('data', (data) => {
            this.broadcast(data);
        });

        this.process.stderr.on('data', (data) => {
            // console.log(`[ffmpeg] ${data}`); // Optional: verbose logging
        });

        this.process.on('close', (code) => {
            console.log(`[CameraStream] ffmpeg exited with code ${code}`);
            this.process = null;
            // Auto-restart if we still have clients
            if (this.clients.size > 0) {
                setTimeout(() => this.start(), 2000);
            }
        });
    }

    stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
    }

    addClient(ws) {
        this.clients.add(ws);
        console.log(`[CameraStream] Client connected. Total: ${this.clients.size}`);
        
        // Send magic bytes for JSMpeg
        const STREAM_MAGIC_BYTES = "jsmp";
        if (ws.readyState === 1) {
             ws.send(Buffer.from(STREAM_MAGIC_BYTES), { binary: true });
        }

        ws.on('close', () => {
            this.clients.delete(ws);
            console.log(`[CameraStream] Client disconnected. Total: ${this.clients.size}`);
            if (this.clients.size === 0) {
                this.stop();
            }
        });
    }

    broadcast(data) {
        for (const client of this.clients) {
            if (client.readyState === 1) {
                try {
                    client.send(data, { binary: true });
                } catch (e) {
                    console.error('[CameraStream] Error sending to client:', e);
                }
            }
        }
    }
}

class CameraStreamManager {
    constructor() {
        this.streams = new Map(); // deviceId -> CameraStream
    }

    getStream(deviceId, rtspUrl) {
        if (!this.streams.has(deviceId)) {
            this.streams.set(deviceId, new CameraStream(rtspUrl));
        }
        return this.streams.get(deviceId);
    }

    stopStream(deviceId) {
        if (this.streams.has(deviceId)) {
            this.streams.get(deviceId).stop();
            this.streams.delete(deviceId);
        }
    }
}

module.exports = new CameraStreamManager();

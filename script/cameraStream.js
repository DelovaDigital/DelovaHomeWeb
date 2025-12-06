const { spawn } = require('child_process');
const EventEmitter = require('events');

/**
 * CameraStream: één RTSP → MPEG1 → WebSocket pipeline
 */
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
            '-loglevel', 'quiet',

            '-rtsp_transport', 'tcp',
            '-i', this.url,

            // Stabiliteit
            '-fflags', 'discardcorrupt',
            '-flags', 'low_delay',
            '-thread_queue_size', '512',

            // Output voor JSMpeg
            '-f', 'mpegts',
            '-codec:v', 'mpeg1video',
            '-q:v', '6',
            '-r', '25',
            '-g', '25',

            '-vf', 'scale=1280:-1',

            '-an',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',

            '-' // Output naar stdout
        ];

        console.log(`[CameraStream] Starting ffmpeg for ${this.url}`);
        this.process = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

        // MPEG-TS packets alignen op 188 bytes (essentieel voor smooth stream)
        const PACKET_SIZE = 188;

        this.process.stdout.on('data', (chunk) => {
            let offset = 0;

            while (offset + PACKET_SIZE <= chunk.length) {
                const packet = chunk.slice(offset, offset + PACKET_SIZE);
                this.broadcast(packet);
                offset += PACKET_SIZE;
            }
        });

        this.process.stderr.on('data', (data) => {
            console.log(`[ffmpeg] ${data}`);
        });

        this.process.on('close', (code) => {
            console.log(`[CameraStream] ffmpeg exited with code ${code}`);
            this.process = null;

            if (this.clients.size > 0) {
                setTimeout(() => this.start(), 2000);
            }
        });
    }

    stop() {
        if (this.process) {
            console.log(`[CameraStream] Stopping ffmpeg for ${this.url}`);
            this.process.kill('SIGKILL');
            this.process = null;
        }
    }

    addClient(ws) {
        this.clients.add(ws);
        console.log(`[CameraStream] Client connected. Total: ${this.clients.size}`);

        // JSMpeg magic bytes
        if (ws.readyState === 1) {
            ws.send(Buffer.from("jsmp"), { binary: true });
        }

        ws.on('close', () => {
            this.clients.delete(ws);
            console.log(`[CameraStream] Client disconnected. Total: ${this.clients.size}`);

            if (this.clients.size === 0) {
                this.stop();
            }
        });
    }

    broadcast(packet) {
        for (const client of this.clients) {
            if (client.readyState === 1) {
                try {
                    client.send(packet, { binary: true });
                } catch (err) {
                    console.error(`[CameraStream] Error sending packet:`, err);
                }
            }
        }
    }
}

/**
 * CameraStreamManager: beheert meerdere streams
 */
class CameraStreamManager {
    constructor() {
        this.streams = new Map();
    }

    getStream(deviceId, rtspUrl) {
        if (!this.streams.has(deviceId)) {
            console.log(`[CameraStreamManager] Creating new stream for ${deviceId}`);
            this.streams.set(deviceId, new CameraStream(rtspUrl));
        }
        return this.streams.get(deviceId);
    }

    stopStream(deviceId) {
        if (this.streams.has(deviceId)) {
            console.log(`[CameraStreamManager] Stopping stream ${deviceId}`);
            this.streams.get(deviceId).stop();
            this.streams.delete(deviceId);
        }
    }
}

module.exports = new CameraStreamManager();

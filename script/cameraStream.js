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
            '-loglevel', 'warning',
            '-rtsp_transport', 'tcp',
            '-fflags', 'nobuffer',
            '-flags', 'low_delay',
            '-analyzeduration', '2000000', // Increased to 2M to fix "not enough frames"
            '-probesize', '1000000',
            '-i', this.url,
            '-f', 'mpegts',
            '-codec:v', 'mpeg1video',
            '-an',
            '-stats',
            '-r', '25',
            '-g', '30', // Keyframe every 1.2 seconds
            '-vf', 'scale=1280:-1', // 720p (Higher resolution)
            '-b:v', '2500k', // Higher bitrate for quality
            '-bufsize', '6000k', // Larger buffer for ffmpeg
            '-maxrate', '4500k',
            '-muxdelay', '0', // Back to 0 for low latency
            '-flush_packets', '1', // Flush immediately
            '-tune', 'zerolatency',
            '-'
        ];

        console.log(`[CameraStream] Spawning ffmpeg for ${this.url}`);
        this.process = spawn('ffmpeg', args);

        this.process.stdout.on('data', (data) => {
            this.broadcast(data);
        });

        this.process.stderr.on('data', (data) => {
            console.log(`[ffmpeg] ${data}`); // Optional: verbose logging
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

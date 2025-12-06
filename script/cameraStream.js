const { spawn } = require('child_process');
const EventEmitter = require('events');

class CameraStream extends EventEmitter {
    constructor(url) {
        super();
        this.url = url;
        this.clients = new Set();
        this.process = null;
        this.restartTimeout = null;

        this.start();
    }

    start() {
        if (this.process) return;

        console.log(`[CameraStream] Starting ffmpeg for ${this.url}`);

        const args = [
            '-loglevel', 'quiet',

            // Reconnect like VLC (fixes crash code 234)
            '-rtsp_transport', 'tcp',
            '-stimeout', '5000000',
            '-rw_timeout', '5000000',
            '-reconnect', '1',
            '-reconnect_streamed', '1',
            '-reconnect_delay_max', '2',

            // Ignore errors (don't exit on bad frames)
            '-err_detect', 'ignore_err',

            // Input URL
            '-i', this.url,

            // More stable timestamping
            '-fflags', '+genpts+discardcorrupt',
            '-use_wallclock_as_timestamps', '1',

            '-flags', 'low_delay',
            '-thread_queue_size', '1024',

            // Output for JSMpeg
            '-f', 'mpegts',
            '-codec:v', 'mpeg1video',
            '-q:v', '6',
            '-r', '25',
            '-g', '25',
            '-vf', 'scale=1280:-1',

            '-an',
            '-preset', 'ultrafast',
            '-tune', 'zerolatency',

            '-' // stdout
        ];

        this.process = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

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
            console.log(`[ffmpeg] ${data.toString()}`);
        });

        this.process.on('close', (code) => {
            console.log(`[CameraStream] ffmpeg exited with code ${code}`);
            this.process = null;

            if (this.clients.size > 0) {
                console.log(`[CameraStream] Restarting stream in 2s (clients still connected)`);
                this.restartTimeout = setTimeout(() => this.start(), 2000);
            }
        });
    }

    stop() {
        if (this.process) {
            console.log(`[CameraStream] Stopping ffmpeg for ${this.url}`);
            this.process.kill('SIGKILL');
            this.process = null;
        }
        if (this.restartTimeout) {
            clearTimeout(this.restartTimeout);
            this.restartTimeout = null;
        }
    }

    addClient(ws) {
        this.clients.add(ws);
        console.log(`[CameraStream] Client connected. Total: ${this.clients.size}`);

        // Send JSMpeg magic bytes
        if (ws.readyState === 1) {
            ws.send(Buffer.from("jsmp"), { binary: true });
        }

        ws.on('close', () => {
            this.clients.delete(ws);
            console.log(`[CameraStream] Client disconnected. Total: ${this.clients.size}`);

            // Stop ffmpeg when no clients remain
            if (this.clients.size === 0) {
                this.stop();
            }
        });

        // Start ffmpeg if stopped
        if (!this.process) {
            this.start();
        }
    }

    broadcast(packet) {
        for (const client of this.clients) {
            if (client.readyState === 1) {
                try {
                    client.send(packet, { binary: true });
                } catch (e) {
                    console.error('[CameraStream] Error sending packet:', e);
                }
            }
        }
    }
}

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

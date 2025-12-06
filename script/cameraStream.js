const { spawn } = require("child_process");
const EventEmitter = require("events");

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
            "-rtsp_transport", "tcp",
            "-i", this.url,

            // Stabiliteit zoals VLC
            "-fflags", "+genpts",
            "-probesize", "2M",
            "-analyzeduration", "2M",

            // OUTPUT: MPEG-TS (browser friendly)
            "-f", "mpegts",
            "-codec:v", "mpeg1video",
            "-q:v", "4",
            "-r", "25",
            "-g", "25",

            "-an",
            "-"
        ];

        this.process = spawn("ffmpeg", args);

        this.process.stdout.on("data", (data) => {
            this.broadcast(data);
        });

        this.process.stderr.on("data", (d) => {
            // Uncomment om te debuggen:
            // console.log(`[ffmpeg] ${d}`);
        });

        this.process.on("close", (code) => {
            console.log(`[CameraStream] ffmpeg exited with code ${code}`);

            this.process = null;

            if (this.clients.size > 0) {
                console.log("[CameraStream] Restarting stream in 2s (clients still connected)");
                this.restartTimeout = setTimeout(() => this.start(), 2000);
            }
        });
    }

    stop() {
        console.log(`[CameraStream] Stopping ffmpeg for ${this.url}`);
        if (this.restartTimeout) clearTimeout(this.restartTimeout);
        if (this.process) this.process.kill();
        this.process = null;
    }

    addClient(ws) {
        this.clients.add(ws);
        console.log(`[CameraStream] Client connected. Total: ${this.clients.size}`);

        // jsmpeg header
        const STREAM_MAGIC_BYTES = "jsmp";
        if (ws.readyState === 1) {
            ws.send(Buffer.from(STREAM_MAGIC_BYTES), { binary: true });
        }

        ws.on("close", () => {
            this.clients.delete(ws);
            console.log(`[CameraStream] Client disconnected. Total: ${this.clients.size}`);

            if (this.clients.size === 0) this.stop();
        });
    }

    broadcast(data) {
        for (const client of this.clients) {
            if (client.readyState === 1) {
                client.send(data, { binary: true });
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

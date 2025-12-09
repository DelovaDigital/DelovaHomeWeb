const { spawn } = require("child_process");
const EventEmitter = require("events");

class JSMpegStream extends EventEmitter {
    constructor(rtspUrl) {
        super();
        this.url = rtspUrl;
        this.ffmpeg = null;
        this.clients = new Set();
    }

    addClient(ws) {
        this.clients.add(ws);
        console.log(`[JSMpeg] Client connected. Total: ${this.clients.size}`);
        
        if (this.clients.size === 1) {
            this.startFFmpeg();
        }

        ws.on('close', () => {
            this.clients.delete(ws);
            console.log(`[JSMpeg] Client disconnected. Total: ${this.clients.size}`);
            if (this.clients.size === 0) {
                this.stop();
            }
        });
    }

    startFFmpeg() {
        if (this.ffmpeg) return;

        const args = [
            "-rtsp_transport", "tcp",
            "-i", this.url,
            "-f", "mpegts",
            "-codec:v", "mpeg1video",
            "-s", "1280x720", // Revert to 720p for compatibility
            "-b:v", "1000k",  // Moderate bitrate
            "-r", "15",       // Low framerate to save CPU
            "-bf", "0",
            "-codec:a", "mp2",
            "-ar", "44100",
            "-ac", "1",
            "-b:a", "128k",
            "-"
        ];

        console.log(`[JSMpeg] Starting ffmpeg: ffmpeg ${args.join(" ")}`);
        this.ffmpeg = spawn("ffmpeg", args);

        this.ffmpeg.stdout.on('data', (data) => {
            this.clients.forEach((ws) => {
                if (ws.readyState === 1) { // WebSocket.OPEN
                    ws.send(data);
                }
            });
        });

        this.ffmpeg.stderr.on('data', (data) => {
            console.log(`[ffmpeg] ${data}`); // Enabled for debugging
        });

        this.ffmpeg.on('close', (code) => {
            console.log(`[JSMpeg] ffmpeg exited with code ${code}`);
            this.ffmpeg = null;
        });
    }

    stop() {
        if (this.ffmpeg) {
            this.ffmpeg.kill();
            this.ffmpeg = null;
        }
        this.clients.forEach(ws => ws.close());
        this.clients.clear();
    }
}

class CameraStreamManager {
    constructor() {
        this.streams = new Map();
    }

    getStream(deviceId, rtspUrl) {
        if (!this.streams.has(deviceId)) {
            this.streams.set(deviceId, new JSMpegStream(rtspUrl));
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

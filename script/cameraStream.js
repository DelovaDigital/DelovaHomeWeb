const { spawn } = require("child_process");
const EventEmitter = require("events");
const fs = require('fs');
const path = require('path');

const RECORDINGS_DIR = path.join(__dirname, '../recordings');
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR);

class JSMpegStream extends EventEmitter {
    constructor(rtspUrl, deviceId) {
        super();
        this.url = rtspUrl;
        this.deviceId = deviceId;
        this.ffmpeg = null;
        this.recordingProcess = null;
        this.clients = new Set();
        this.isRecording = false;
    }

    addClient(ws) {
        this.clients.add(ws);
        // console.log(`[JSMpeg] Client connected. Total: ${this.clients.size}`);
        
        if (this.clients.size === 1) {
            this.startFFmpeg();
        }

        ws.on('close', () => {
            this.clients.delete(ws);
            // console.log(`[JSMpeg] Client disconnected. Total: ${this.clients.size}`);
            if (this.clients.size === 0) {
                this.stop();
            }
        });
    }

    startFFmpeg() {
        if (this.ffmpeg) return;

        const args = [
            "-fflags", "nobuffer",
            "-rtsp_transport", "tcp",
            "-i", this.url,
            "-f", "mpegts",
            "-codec:v", "mpeg1video",
            "-s", "1280x720",
            "-b:v", "1000k",
            "-r", "25",
            "-bf", "0",
            "-an", // Disable audio for stability
            "-"
        ];

        console.log(`[JSMpeg] Starting ffmpeg for ${this.deviceId}`);
        this.ffmpeg = spawn("ffmpeg", args);

        this.ffmpeg.stdout.on('data', (data) => {
            this.clients.forEach((ws) => {
                if (ws.readyState === 1) { // WebSocket.OPEN
                    ws.send(data);
                }
            });
        });

        this.ffmpeg.stderr.on('data', (data) => {
           // console.log(`[ffmpeg] ${data}`); // Enabled for debugging
        });

        this.ffmpeg.on('close', (code) => {
            console.log(`[JSMpeg] ffmpeg exited with code ${code}`);
            this.ffmpeg = null;
        });
    }

    startRecording() {
        if (this.isRecording) return;
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = `recording_${this.deviceId}_${timestamp}.mp4`;
        const filepath = path.join(RECORDINGS_DIR, filename);
        
        console.log(`[Camera] Starting recording to ${filepath}`);

        // Spawn a separate compatible recording process
        // We copy the stream to mp4
        const args = [
            "-rtsp_transport", "tcp",
            "-i", this.url,
            "-c:v", "copy",
            "-c:a", "aac", // If source has audio
            "-t", "300", // Auto-stop after 5 mins safety
            filepath
        ];

        this.recordingProcess = spawn("ffmpeg", args);
        this.isRecording = true;
        this.emit('recording-started', { filename, filepath });

        this.recordingProcess.on('close', (code) => {
            console.log(`[Camera] Recording finished: ${filename}`);
            this.isRecording = false;
            this.recordingProcess = null;
            this.emit('recording-stopped', { filename });
        });
        
        return filename;
    }

    stopRecording() {
        if (this.recordingProcess) {
            this.recordingProcess.kill('SIGINT'); // Graceful stop
            this.recordingProcess = null;
            this.isRecording = false;
        }
    }

    stop() {
        if (this.ffmpeg) {
            this.ffmpeg.kill();
            this.ffmpeg = null;
        }
        // Don't kill recording if it's running detached
        this.clients.forEach(ws => ws.close());
        this.clients.clear();
    }
}

class CameraStreamManager {
    constructor() {
        this.streams = new Map();
    }

    getStream(deviceId, rtspUrl) {
        let stream = this.streams.get(deviceId);
        if (!stream) {
            stream = new JSMpegStream(rtspUrl, deviceId);
            this.streams.set(deviceId, stream);
        } else {
            // Update URL in case credentials changed
            if (stream.url !== rtspUrl) {
                console.log(`[CameraStreamManager] Updating URL for device ${deviceId}`);
                stream.url = rtspUrl;
                // If the URL changed, the old stream is likely invalid or using old creds.
                // We should restart it.
                if (stream.ffmpeg) {
                    console.log(`[CameraStreamManager] Restarting stream for ${deviceId} due to URL change`);
                    stream.ffmpeg.kill();
                    stream.ffmpeg = null;
                    // We don't call stop() because that closes all clients. 
                    // We just kill ffmpeg so it restarts on next need, 
                    // OR we should restart it immediately if there are clients?
                    if (stream.clients.size > 0) {
                        stream.startFFmpeg();
                    }
                }
            }
        }
        return stream;
    }

    stopStream(deviceId) {
        if (this.streams.has(deviceId)) {
            this.streams.get(deviceId).stop();
            this.streams.delete(deviceId);
        }
    }
}

module.exports = new CameraStreamManager();

const { SonosManager } = require('@svrooij/sonos');

class SonosManagerModule {
    constructor() {
        this.manager = new SonosManager();
        this.devices = [];
        this._initialize();
    }

    async _initialize() {
        try {
            console.log('Starting Sonos discovery...');
            
            // Listen for device events
            this.manager.on('DeviceAvailable', (device) => {
                console.log(`Found Sonos device: ${device.Name} (${device.uuid})`);
                const existing = this.devices.find(d => d.uuid === device.uuid);
                if (!existing) {
                    this.devices.push({
                        uuid: device.uuid,
                        name: device.Name,
                        // Store the internal device object for direct control
                        _device: device 
                    });
                }
            });

            // Initialize will start discovery
            await this.manager.Initialize(); 
            console.log('Sonos discovery initialized and running in the background.');

        } catch (err) {
            console.error('CRITICAL: Error during Sonos initialization:', err);
        }
    }

    getDiscoveredDevices() {
        // Return a clean list of devices without the internal _device object
        return this.devices.map(d => ({ uuid: d.uuid, name: d.name }));
    }

    async _getDevice(uuid) {
        const deviceContainer = this.devices.find(d => d.uuid === uuid);
        if (!deviceContainer) {
            // Fallback: try to get from manager directly if it appeared after initial load
            const device = this.manager.Devices.find(d => d.uuid === uuid);
            if (!device) {
                throw new Error(`Sonos device with UUID ${uuid} not found.`);
            }
            return device;
        }
        return deviceContainer._device;
    }

    async play(uuid, uri, metadata) {
        const device = await this._getDevice(uuid);
        // To play a stream, you often need to set the AVTransportURI first
        if (uri) {
            await device.AVTransportService.SetAVTransportURI({
              InstanceID: 0,
              CurrentURI: uri,
              CurrentURIMetaData: metadata || ''
            });
        }
        return device.Play();
    }

    async pause(uuid) {
        const device = await this._getDevice(uuid);
        return device.Pause();
    }

    async next(uuid) {
        const device = await this._getDevice(uuid);
        return device.Next();
    }

    async previous(uuid) {
        const device = await this._getDevice(uuid);
        return device.Previous();
    }

    async setVolume(uuid, volume) {
        const device = await this._getDevice(uuid);
        // The volume is 0-100
        return device.RenderingControlService.SetVolume({
            InstanceID: 0,
            Channel: 'Master',
            DesiredVolume: volume
        });
    }
    
    async getPlaybackState(uuid) {
        const device = await this._getDevice(uuid);
        
        try {
            const transportState = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });
            const mediaInfo = await device.AVTransportService.GetMediaInfo({ InstanceID: 0 });
            const positionInfo = await device.AVTransportService.GetPositionInfo({ InstanceID: 0 });

            // The metadata is often an XML string that needs parsing.
            // For now, we'll return the raw metadata. A more robust solution would parse this.
            return {
                status: transportState.CurrentTransportState, // e.g., 'PLAYING', 'PAUSED_PLAYBACK', 'STOPPED'
                track: {
                    title: mediaInfo.CurrentURIMetaData?.Title,
                    artist: mediaInfo.CurrentURIMetaData?.Creator,
                    album: mediaInfo.CurrentURIMetaData?.Album,
                    duration: positionInfo.TrackDuration,
                    uri: mediaInfo.CurrentURI,
                    metadata: mediaInfo.CurrentURIMetaData
                },
                position: positionInfo.RelTime,
            };
        } catch(e) {
            console.error(`Error getting playback state for Sonos device ${uuid}:`, e);
            return { status: 'UNKNOWN' };
        }
    }
}

// Create a singleton instance
const sonosManager = new SonosManagerModule();
module.exports = sonosManager;

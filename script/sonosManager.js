const { SonosManager } = require('@svrooij/sonos');

console.log("--- SONOS MANAGER MODULE RELOADED v2 ---");

class SonosManagerModule {
    constructor() {
        this.manager = new SonosManager();
        this.isInitialized = false;
        this._initialize();
    }

    async _initialize() {
        try {
            console.log('Initializing Sonos discovery...');
            // Reduce discovery time to 3 seconds to unblock UI faster.
            try {
                await this.manager.InitializeWithDiscovery(3); 
                this.isInitialized = true;
                console.log(`Sonos discovery complete. Found ${this.manager.Devices.length} devices.`);
            } catch (discoveryErr) {
                if (discoveryErr.message && discoveryErr.message.includes('No players found')) {
                    console.log('Sonos discovery: No players found (this is normal if no Sonos devices are on the network).');
                    this.isInitialized = true; // Mark as initialized even if empty, so we don't block usage
                } else {
                    throw discoveryErr;
                }
            }
            
        } catch (err) {
            console.error('Error during Sonos initialization:', err.message);
        }
    }

    getDiscoveredDevices() {
        // Return whatever we have, initialized or not.
        try {
            return (this.manager.Devices || []).map(d => ({ uuid: d.uuid, name: d.Name }));
        } catch (e) {
            return [];
        }
    }

    async _getDevice(uuid) {
        if (!this.isInitialized) {
            throw new Error('Sonos manager not initialized.');
        }
        const device = this.manager.Devices.find(d => d.uuid === uuid);
        if (!device) {
            throw new Error(`Sonos device with UUID ${uuid} not found.`);
        }
        return device;
    }

    async play(uuid, uri, metadata) {
        let device = await this._getDevice(uuid);

        // Check if device is a follower (grouped) and not the coordinator.
        // Controlling a follower often results in UPnP Error 800.
        // We check 'coordinator' property which the library sets if grouped.
        if (device.coordinator && device.coordinator.uuid !== device.uuid) {
            console.log(`[Sonos] Device ${device.uuid} is a follower. Redirecting command to coordinator ${device.coordinator.uuid}`);
            device = device.coordinator;
        }
        
        // To play a stream, you often need to set the AVTransportURI first
        if (uri) {
            console.log(`[Sonos] Play request for URI: ${uri}`);
            
            // Special handling for Spotify URIs using the library's native helper
            if (uri.startsWith('spotify:')) {
                console.log('[Sonos] Spotify URI detected. Using library helper to add to Queue.');
                
                // 1. Clear Queue to play this content exclusively
                try { await device.QueueService.RemoveAllTracks({ InstanceID: 0 }); } catch (e) {}

                // 2. Add to Queue using library helper (handles metadata and formatting automatically)
                // Note: AddUriToQueue(uri, positionInQueue, enqueueAsNext)
                await device.AddUriToQueue(uri, 1, true);

                // 3. Set Transport to Queue
                const queueUri = `x-rincon-queue:${device.uuid}#0`;
                await device.AVTransportService.SetAVTransportURI({
                   InstanceID: 0,
                   CurrentURI: queueUri,
                   CurrentURIMetaData: ''
                });
                
                return device.Play();
            }

            // Standard playback for other URIs
            let sonosUri = uri;
            let sonosMeta = metadata || '';
            
            console.log(`[Sonos] Setting AVTransport URI: ${sonosUri}`);
            try {
                await device.AVTransportService.SetAVTransportURI({
                    InstanceID: 0,
                    CurrentURI: sonosUri,
                    CurrentURIMetaData: sonosMeta
                });
            } catch (e) {
                 // Fallback for failed SetAVTransportURI (e.g. some streams or containers)
                 // Try adding to queue if it's not a generic playback error
                 const isPlaybackError = e.message && (
                    e.message.includes('Illegal MIME-Type') || 
                    e.message.includes('Invalid args') ||
                    (e.UpnpErrorCode === 714) || 
                    (e.UpnpErrorCode === 402)
                );

                if (isPlaybackError) {
                    console.warn('[Sonos] Direct playback failed, trying Queue...');
                    await device.AddUriToQueue(uri);
                    const queueUri = `x-rincon-queue:${device.uuid}#0`;
                    await device.AVTransportService.SetAVTransportURI({
                        InstanceID: 0,
                        CurrentURI: queueUri,
                        CurrentURIMetaData: ''
                    });
                } else {
                    throw e;
                }
            }
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
            // For now, we'll return what the library gives us.
            const trackData = mediaInfo.CurrentURIMetaData || {};

            return {
                status: transportState.CurrentTransportState, // e.g., 'PLAYING', 'PAUSED_PLAYBACK', 'STOPPED'
                track: {
                    title: trackData.Title,
                    artist: trackData.Creator,
                    album: trackData.Album,
                    duration: positionInfo.TrackDuration,
                    uri: mediaInfo.CurrentURI,
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
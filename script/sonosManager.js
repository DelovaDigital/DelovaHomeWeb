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
            // Special handling for Spotify URIs on Sonos
            if (uri.startsWith('spotify:')) {
                console.log('[Sonos] Spotify URI detected. Switch to "Smart Favorites" strategy.');
                
                // STRATEGY: Look for this item in Sonos Favorites first.
                // This bypasses the complex metadata security checks because Sonos trusts its own favorites.
                try {
                    console.log('[Sonos] Searching for playlist in Sonos Favorites...');
                    const favorites = await device.GetFavorites();
                    
                    // Allow fuzzy matching on the ID (e.g., spotify:playlist:123...)
                    // The Favorite URI usually looks like: x-rincon-cpcontainer:1006206cspotify%3aplaylist%3a...
                    const spotifyId = uri.split(':').pop(); // Get the last part (ID)
                    
                    const match = favorites.find(fav => {
                         // Check decoded URI for the ID
                         return (fav.uri && decodeURIComponent(fav.uri).includes(spotifyId));
                    });

                    if (match) {
                        console.log(`[Sonos] ✅ Found matching Favorite: "${match.title}"`);
                        
                        try { await device.QueueService.RemoveAllTracks({ InstanceID: 0 }); } catch (e) {}

                        await device.QueueService.AddURI({
                            InstanceID: 0,
                            EnqueuedURI: match.uri,
                            EnqueuedURIMetaData: match.metaData,
                            DesiredFirstTrackNumberEnqueued: 0,
                            EnqueueAsNext: true
                        });
                        
                        await device.AVTransportService.SetAVTransportURI({
                           InstanceID: 0,
                           CurrentURI: `x-rincon-queue:${device.uuid}#0`,
                           CurrentURIMetaData: ''
                        });
                        
                        return device.Play();
                    } else {
                        console.log('[Sonos] Playlist not found in favorites. Trying brute-force AddURI strategy...');
                    }
                } catch (favError) {
                    console.error('[Sonos] Favorites lookup checked but failed or empty. Proceeding to fallback.');
                }

                // FALLBACK: Brute-force the Service Index (sn) and Flags
                // We typically see sn=1, 3, 7. Flags are usually 8300 or 10860.
                const attempts = [
                     { sn: 3, flags: 8300 }, // Seen in user logs
                     { sn: 7, flags: 8300 }, // Library default
                     { sn: 1, flags: 8300 }, // Common
                     { sn: 3, flags: 10860 },
                     { sn: 7, flags: 10860 }
                ];

                const encodedSpotifyUri = encodeURIComponent(uri);
                let lastError = null;

                for (const attempt of attempts) {
                    try {
                        console.log(`[Sonos] Attempting AddURI with sn=${attempt.sn} flags=${attempt.flags}...`);
                        
                        const sonosServiceUri = `x-rincon-cpcontainer:1006206c${encodedSpotifyUri}?sid=9&flags=${attempt.flags}&sn=${attempt.sn}`;
                        // Use Anonymous ID
                        const sonosMeta = `<DIDL-Lite xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:upnp="urn:schemas-upnp-org:metadata-1-0/upnp/" xmlns:r="urn:schemas-rinconnetworks-com:metadata-1-0/" xmlns="urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/"><item id="1006206c${encodedSpotifyUri}" parentID="1006206c" restricted="true"><dc:title>Spotify Playlist</dc:title><upnp:class>object.container.playlistContainer</upnp:class><desc id="cdudn" nameSpace="urn:schemas-rinconnetworks-com:metadata-1-0/">SA_RINCON65535_X_#Svc65535-0-Token</desc></item></DIDL-Lite>`;

                        await device.QueueService.AddURI({
                             InstanceID: 0,
                             EnqueuedURI: sonosServiceUri,
                             EnqueuedURIMetaData: sonosMeta,
                             DesiredFirstTrackNumberEnqueued: 0,
                             EnqueueAsNext: true
                        });
                        
                        console.log(`[Sonos] ✅ Success using sn=${attempt.sn} flags=${attempt.flags}!`);
                        
                        // Set Transport to Queue and Play
                         await device.AVTransportService.SetAVTransportURI({
                           InstanceID: 0,
                           CurrentURI: `x-rincon-queue:${device.uuid}#0`,
                           CurrentURIMetaData: ''
                        });
                        return device.Play();
                        
                    } catch (e) {
                        console.log(`[Sonos] Failed with sn=${attempt.sn}: ${e.message}`);
                        lastError = e;
                        if (!e.message.includes('Invalid args') && !e.message.includes('402')) {
                            // If it's NOT an invalid args error (e.g. network error), stop trying.
                            // But 402/714 IS what we are trying to fix by changing parameters.
                        }
                    }
                }
                
                // If all failed
                console.error('[Sonos] All AddURI attempts failed.');
                throw lastError || new Error('Failed to play Spotify URI on Sonos');
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
            
            let volume = 0;
            try {
                const volInfo = await device.RenderingControlService.GetVolume({ InstanceID: 0, Channel: 'Master' });
                volume = parseInt(volInfo.CurrentVolume, 10);
            } catch (e) { /* ignore volume error */ }

            // The metadata is often an XML string that needs parsing.
            // For now, we'll return what the library gives us.
            const trackData = mediaInfo.CurrentURIMetaData || {};

            return {
                status: transportState.CurrentTransportState, // e.g., 'PLAYING', 'PAUSED_PLAYBACK', 'STOPPED'
                volume: volume,
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
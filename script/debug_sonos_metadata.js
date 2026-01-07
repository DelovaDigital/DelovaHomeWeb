const { SonosManager } = require('@svrooij/sonos');

/**
 * This script helps you find the correct Account ID and Service Index (sn) for Spotify.
 * 
 * INSTRUCTIONS:
 * 1. Open the official Sonos App on your phone/desktop.
 * 2. Start playing a Spotify Playlist on one of your Sonos speakers.
 * 3. Run this script: `node script/debug_sonos_metadata.js`
 * 4. Look for the 'sn' parameter in the URIs and the content of the <desc> tag in the metadata.
 */

async function main() {
  console.log('Initializing Sonos Discovery...');
  const manager = new SonosManager();
  
  // Discover for up to 5 seconds
  await manager.InitializeWithDiscovery(5);

  if (manager.Devices.length === 0) {
    console.error('No Sonos devices found on the network.');
    process.exit(1);
  }

  console.log(`Found ${manager.Devices.length} devices.`);

  // Iterate over all devices to find one that is playing
  for (const device of manager.Devices) {
    try {
      const state = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });
      if (state.CurrentTransportState === 'PLAYING' || state.CurrentTransportState === 'PAUSED_PLAYBACK') {
        console.log(`\nAnalyzing device: ${device.Name} (${device.uuid})`);
        
        // Get Media Info (Queue/Container Info)
        const mediaInfo = await device.AVTransportService.GetMediaInfo({ InstanceID: 0 });
        console.log('---------------------------------------------------');
        console.log('CURRENT MEDIA (Container/Queue):');
        console.log('URI:', mediaInfo.CurrentURI);
        console.log('Metadata:', mediaInfo.CurrentURIMetaData);
        
        // Get Tracking Info (Specific Song)
        const posInfo = await device.AVTransportService.GetPositionInfo({ InstanceID: 0 });
        console.log('---------------------------------------------------');
        console.log('CURRENT TRACK:');
        console.log('Track URI:', posInfo.TrackURI);
        console.log('Track Metadata:', posInfo.TrackMetaData);
        console.log('---------------------------------------------------');
        
        console.log('\nLook closely at the Metadata XML above for <desc>SA_RINCON...</desc>');
        console.log('And look at the URI for ?sn=X');
        return; // Found one, exit
      }
    } catch (e) {
      // Ignore errors (device might be offline or busy)
    }
  }

  console.log('No devices correspond to PLAYING state. Please start music via Sonos App first.');
}

main().catch(console.error);

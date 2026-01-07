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
  
  // BYPASS MANAGER: The manager crashes on complex group parsing.
  // We will simply search for *ONE* device using the lower-level Discovery,
  // then inspect that device directly.
  try {
      const { SonosDeviceDiscovery, SonosDevice } = require('@svrooij/sonos');
      const discovery = new SonosDeviceDiscovery();
      
      console.log('Searching for a Sonos device (5s timeout)...');
      const deviceData = await discovery.SearchOne(5);
      
      console.log(`Found device at IP: ${deviceData.host}`);
      const device = new SonosDevice(deviceData.host);
      
      // Load basic data
      await device.LoadDeviceData();
      console.log(`Connected to: ${device.Name} (${device.uuid})`);
      
      console.log('\n--- Inspecting Playback State ---');
      const mediaInfo = await device.AVTransportService.GetMediaInfo({ InstanceID: 0 });
      const transportInfo = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });

      console.log(`Transport State: ${transportInfo.CurrentTransportState}`);
      console.log('---------------------------------------------------');
      console.log('Current URI:', mediaInfo.CurrentURI);
      console.log('---------------------------------------------------');
      console.log('Current Metadata:', mediaInfo.CurrentURIMetaData);
      console.log('---------------------------------------------------');

      if (mediaInfo.CurrentURI && (mediaInfo.CurrentURI.includes('spotify') || mediaInfo.CurrentURI.includes('rincon-cpcontainer'))) {
        console.log('\n>>> ANALYSIS <<<');
        const snMatch = mediaInfo.CurrentURI.match(/sn=(\d+)/);
        const descMatch = mediaInfo.CurrentURIMetaData.match(/<desc[^>]*>(.*?)<\/desc>/); // Can be self-closing or empty

        if (snMatch) {
            console.log(`✅ FOUND Service Account Index (sn): ${snMatch[1]}`);
        } else {
            console.log('❌ Could not find "sn" parameter in URI.');
        }

        if (descMatch) {
            console.log(`✅ FOUND Metadata Account ID (<desc>): "${descMatch[1]}"`);
        } else {
             console.log('❌ Could not find standard <desc> tag. Check raw metadata above for account ID.');
        }
      } else {
        console.log('\n⚠️  Devices is not playing Spotify. Please start a Spotify playlist in the Sonos app and run this script again.');
      }

  } catch (err) {
      console.error('Error:', err);
  }
}

main();

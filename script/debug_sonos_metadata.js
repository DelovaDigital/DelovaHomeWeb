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
  const manager = new SonosManager();
  console.log('Initializing Sonos Manager (5s timeout)...');
  
  try {
    // Attempt discovery
    await manager.InitializeWithDiscovery(5);
  } catch (e) {
     console.log('Discovery finished with potential warnings.');
  }

  if (manager.Devices.length === 0) {
    console.log('No devices found. Ensure they are powered on.');
    return;
  }

  console.log(`Found ${manager.Devices.length} devices.`);
  
  let foundPlaying = false;

  for (const device of manager.Devices) {
    try {
      const transportInfo = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });
      
      if (transportInfo.CurrentTransportState === 'PLAYING' || transportInfo.CurrentTransportState === 'PAUSED_PLAYBACK') {
        console.log(`\nChecking active device: ${device.Name} (${device.host})`);
        
        const mediaInfo = await device.AVTransportService.GetMediaInfo({ InstanceID: 0 });
        console.log('---------------------------------------------------');
        console.log('Current URI:', mediaInfo.CurrentURI);
        console.log('Metadata:', mediaInfo.CurrentURIMetaData);
        console.log('---------------------------------------------------');

        if (mediaInfo.CurrentURI && (mediaInfo.CurrentURI.includes('spotify') || mediaInfo.CurrentURI.includes('rincon-cpcontainer'))) {
            foundPlaying = true;
            console.log('\n>>> ANALYSIS SUCCESSFUL <<<');
            
            const snMatch = mediaInfo.CurrentURI.match(/sn=(\d+)/);
            if (snMatch) {
                console.log(`✅ FOUND Service Account Index (sn): ${snMatch[1]}`);
            } else {
                console.log('❌ Could not find "sn" parameter in URI.');
            }

            // Look for <desc>SA_RINCON...</desc>
            const descMatch = mediaInfo.CurrentURIMetaData ? mediaInfo.CurrentURIMetaData.match(/<desc[^>]*>(.*?)<\/desc>/) : null;
            if (descMatch) {
                console.log(`✅ FOUND Metadata Account ID (<desc>): "${descMatch[1]}"`);
                console.log(`   -> You can now update your code with this Account ID.`);
            } else {
                 console.log('❌ Could not find standard <desc> tag.');
            }
        }
      }
    } catch (err) {
       // Ignore errors on devices that don't respond
    }
  }

  if (!foundPlaying) {
    console.log('\n❌ No devices found playing Spotify. Please start playback in the Sonos App first.');
  }
}

main();

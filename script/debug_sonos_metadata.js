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
  console.log('Initializing Sonos Discovery (Low-level method)...');

  try {
      // 1. Use pure SSDP discovery instead of the Manager, to avoid "No Devices" errors
      const { SonosDeviceDiscovery, SonosDevice } = require('@svrooij/sonos');
      const discovery = new SonosDeviceDiscovery();
      
      console.log('Searching for devices (5s)...');
      // Search for *all* devices we can find in time, not just one.
      // Search() returns a promise that resolves with the first found device, 
      // but we probably want to try to capture a few or just use the first one 
      // and look up the topology.
      
      const firstDeviceData = await discovery.SearchOne(5);
      
      console.log(`Found a device: ${firstDeviceData.host}`);
      const entryDevice = new SonosDevice(firstDeviceData.host);
      await entryDevice.LoadDeviceData();
      console.log(`Connected to: ${entryDevice.Name} (${entryDevice.uuid})`);

      // 2. Get network topology from this device
      console.log('Fetching full network topology...');
      const groups = await entryDevice.GetAllGroups();
      
      let foundPlaying = false;

      // 3. Check every COORDINATOR in the network
      for (const group of groups) {
          const coordinatorUUID = group.Coordinator;
          const coordinatorMember = group.ZoneGroupMember.find(m => m.UUID === coordinatorUUID);
          
          if (!coordinatorMember) continue;

          // Extract IP
          const match = coordinatorMember.Location.match(/\/\/([^:]+):/);
          const ip = match ? match[1] : null;

          if (!ip) continue;

          const device = new SonosDevice(ip);
          // Try to get name (might need LoadDeviceData, but let's try skipping for speed if we just want transport)
          // We can use the name from the group info
          const name = coordinatorMember.ZoneName;

          console.log(`Checking Group: ${name} (${ip})...`);

          try {
            const transport = await device.AVTransportService.GetTransportInfo({ InstanceID: 0 });
            
            if (transport.CurrentTransportState === 'PLAYING' || transport.CurrentTransportState === 'PAUSED_PLAYBACK') {
                console.log(`\n✅ Device ${name} IS PLAYING!`);
                
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

                    const descMatch = mediaInfo.CurrentURIMetaData ? mediaInfo.CurrentURIMetaData.match(/<desc[^>]*>(.*?)<\/desc>/) : null;
                    if (descMatch) {
                        console.log(`✅ FOUND Metadata Account ID (<desc>): "${descMatch[1]}"`);
                        console.log(`   -> Copy this value (e.g., SA_RINCON...) for your settings!`);
                    } else {
                        console.log('❌ Could not find standard <desc> tag.');
                    }
                } else {
                    console.log(`(Playing something else: ${mediaInfo.CurrentURI ? mediaInfo.CurrentURI.substring(0, 40) : 'null'}...)`);
                }
            } else {
                console.log(`   (State: ${transport.CurrentTransportState})`);
            }
          } catch (e) {
              console.log(`   (Failed to contact: ${e.message})`);
          }
      }

      if (!foundPlaying) {
          console.log('\n❌ No devices found playing Spotify (checked all groups). Please start playback in the Sonos App first.');
      }

  } catch (err) {
      console.error('Fatal Error:', err);
  }
}

main();

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
      
      console.log('Searching for any Sonos device to fetch network topology (5s timeout)...');
      const entryDeviceData = await discovery.SearchOne(5);
      
      console.log(`Found entry point: ${entryDeviceData.host}`);
      const entryDevice = new SonosDevice(entryDeviceData.host);
      await entryDevice.LoadDeviceData();
      console.log(`Connected to entry device: ${entryDevice.Name}`);

      // 2. Get full topology from this device to find the real COORDINATOR
      console.log('Fetching Sonos Topology to find active Group Coordinator...');
      const groups = await entryDevice.GetAllGroups();
      
      let playingCoordinator = null;

      for (const group of groups) {
          // Find the coordinator for this group
          const coordinatorMember = group.ZoneGroupMember.find(m => m.UUID === group.Coordinator);
          if (!coordinatorMember) continue;

          // Extract IP from Location URL (http://192.168.1.xxx:1400/xml/device_description.xml)
          // Some models use different ports, but regex should capture the IP.
          const match = coordinatorMember.Location.match(/\/\/([^:]+):/);
          const ip = match ? match[1] : null;

          if (ip) {
              const coord = new SonosDevice(ip);
               // We need to check if IT is playing.
               // Just getting TransportState is quick.
              try {
                const state = await coord.AVTransportService.GetTransportInfo({ InstanceID: 0 });
                if (state.CurrentTransportState === 'PLAYING' || state.CurrentTransportState === 'PAUSED_PLAYBACK') {
                   console.log(`\n>>> FOUND ACTIVE COORDINATOR: ${coordinatorMember.ZoneName} (${ip}) <<<`);
                   playingCoordinator = coord;
                   break;
                }
              } catch (e) { /* Warning: device might be offline */ }
          }
      }

      if (!playingCoordinator) {
          // If no coordinator is found playing, maybe the entry device itself is the one we want to check (fallback)
          // But likely we just didn't find any playing device.
          console.log('\n⚠️ No PLAYING Group Coordinator found. Using entry device as fallback.');
          playingCoordinator = entryDevice; 
      }

      const device = playingCoordinator;
      await device.LoadDeviceData(); // Ensure name is loaded
      console.log(`\n--- Inspecting Playback State on ${device.Name} (${device.host}) ---`);
      
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

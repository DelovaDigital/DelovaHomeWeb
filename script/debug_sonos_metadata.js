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
      try {
        await entryDevice.LoadDeviceData();
        console.log(`Connected to: ${entryDevice.Name} (${entryDevice.uuid})`);
      } catch (e) {
        console.log(`Warning: Could not load full device data for ${firstDeviceData.host} (${e.message}). continuing...`);
        entryDevice.Name = "Unknown Device";
      }

      // Helper function to check a device
      const checkDevice = async (deviceHost, deviceName) => {
        try {
            const d = new SonosDevice(deviceHost);
            const transport = await d.AVTransportService.GetTransportInfo({ InstanceID: 0 });
            if (transport.CurrentTransportState === 'PLAYING' || transport.CurrentTransportState === 'PAUSED_PLAYBACK') {
                console.log(`\n✅ Device ${deviceName || deviceHost} IS PLAYING!`);
                
                const mediaInfo = await d.AVTransportService.GetMediaInfo({ InstanceID: 0 });
                const positionInfo = await d.AVTransportService.GetPositionInfo({ InstanceID: 0 });

                console.log('---------------------------------------------------');
                console.log('Media URI:', mediaInfo.CurrentURI);
                console.log('Track URI:', positionInfo.TrackURI);
                console.log('Track Metadata:', positionInfo.TrackMetaData);
                console.log('---------------------------------------------------');

                const fullText = (mediaInfo.CurrentURI || '') + (mediaInfo.CurrentURIMetaData || '') + (positionInfo.TrackURI || '') + (positionInfo.TrackMetaData || '');
                
                if (fullText.toLowerCase().includes('spotify')) {
                    console.log('\n>>> ANALYSIS SUCCESSFUL <<<');
                    
                    const snMatch = fullText.match(/sn=(\d+)/);
                    if (snMatch) console.log(`✅ FOUND Service Account Index (sn): ${snMatch[1]}`);
                    
                    const descMatch = fullText.match(/<desc[^>]*>(.*?)<\/desc>/);
                    if (descMatch) {
                        console.log(`✅ FOUND Metadata Account ID (<desc>): "${descMatch[1]}"`);
                        console.log(`\n!!! COPY THE VALUES ABOVE !!!\n`);
                        return true; 
                    } else {
                         console.log('❌ Could not find <desc> tag in Track Metadata either. Please check the log above manually.');
                         // Verify manually
                         if (positionInfo.TrackMetaData && positionInfo.TrackMetaData.includes('SA_RINCON')) {
                             console.log('Wait, I see SA_RINCON in the text, but regex failed. Please copy it manually.');
                         }
                         return true; // Stop searching anyway to let user see logs
                    }
                }
            }
        } catch (e) { /* ignore */ }
        return false;
      };

      // 1. Check the entry point first
      if (await checkDevice(entryDevice.host, entryDevice.Name)) return;

      // 2. If not playing, use ZoneGroupTopology to find others
      console.log('Fetching ZoneGroupTopology to find other devices...');
      const topologyData = await entryDevice.ZoneGroupTopologyService.GetZoneGroupState();
      const zoneGroupStateXML = topologyData.ZoneGroupState;

      // Simple Regex to extract all Locations (IPs)
      // Location="http://192.168.1.102:1400/xml/device_description.xml"
      const ipRegex = /Location="http:\/\/([^:]+):/g;
      let match;
      const ips = new Set();
      
      while ((match = ipRegex.exec(zoneGroupStateXML)) !== null) {
          if (match[1] !== entryDevice.host) ips.add(match[1]);
      }

      console.log(`Found ${ips.size} other devices in topology.`);
      
      for (const ip of ips) {
          console.log(`Checking ${ip}...`);
          if (await checkDevice(ip, `IP ${ip}`)) return;
      }

      console.log('\n❌ No devices found playing Spotify. Please start playback in the Sonos App first.');

  } catch (err) {
      console.error('Fatal Error:', err);
  }
}

main();

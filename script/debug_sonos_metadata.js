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

      // Helper function to check a device (using RAW SOAP to avoid parsing)
      const fetch = require('node-fetch');
      const { parse } = require('fast-xml-parser');

      const checkDeviceRaw = async (ip, name) => {
        console.log(`\nChecking ${name} (${ip}) using RAW SOAP...`);
        try {
            const soapBody = `<?xml version="1.0" encoding="utf-8"?>
            <s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/" s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
                <s:Body>
                    <u:GetPositionInfo xmlns:u="urn:schemas-upnp-org:service:AVTransport:1">
                        <InstanceID>0</InstanceID>
                    </u:GetPositionInfo>
                </s:Body>
            </s:Envelope>`;

            const response = await fetch(`http://${ip}:1400/MediaRenderer/AVTransport/Control`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'text/xml; charset="utf-8"',
                    'SOAPAction': '"urn:schemas-upnp-org:service:AVTransport:1#GetPositionInfo"'
                },
                body: soapBody
            });

            if (!response.ok) return false;
            
            const text = await response.text();
            
            // Extract TrackMetaData using simple regex to avoid full XML parsing issues
            const trackMetaMatch = text.match(/<TrackMetaData>([\s\S]*?)<\/TrackMetaData>/);
            if (!trackMetaMatch) return false;

            const rawMetadata = trackMetaMatch[1]
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&amp;/g, '&');
            
            console.log('--- RAW METADATA START ---');
            console.log(rawMetadata);
            console.log('--- RAW METADATA END ---');

            if (rawMetadata.includes('spotify') || rawMetadata.includes('Didl')) {
                const snMatch = rawMetadata.match(/sn=(\d+)/);
                if (snMatch) console.log(`✅ FOUND sn=${snMatch[1]}`);

                const descMatch = rawMetadata.match(/<desc[^>]*>(.*?)<\/desc>/);
                if (descMatch) {
                    console.log(`✅ FOUND Account ID (desc): ${descMatch[1]}`);
                    console.log('\nPlease paste this ID to the chat!');
                    return true;
                } else {
                     // Check common patterns
                     const idMatch = rawMetadata.match(/SA_RINCON[^<"]+/);
                     if (idMatch) {
                         console.log(`✅ FOUND Account ID (regex): ${idMatch[0]}`);
                         console.log('\nPlease paste this ID to the chat!');
                         return true;
                     }
                }
            }
        } catch (e) {
            console.error(`Error checking ${ip}:`, e.message);
        }
        return false;
      };

      // 1. Check the entry point first
      if (await checkDeviceRaw(entryDevice.host, entryDevice.Name)) return;

      // 2. If not playing, use ZoneGroupTopology to find others
      console.log('Fetching ZoneGroupTopology to find other devices...');
      const topologyData = await entryDevice.ZoneGroupTopologyService.GetZoneGroupState();
      const zoneGroupStateXML = topologyData.ZoneGroupState;

      // Simple Regex to extract all Locations (IPs)
      const ipRegex = /Location="http:\/\/([^:]+):/g;
      let match;
      const ips = new Set();
      
      while ((match = ipRegex.exec(zoneGroupStateXML)) !== null) {
          if (match[1] !== entryDevice.host) ips.add(match[1]);
      }

      console.log(`Found ${ips.size} other devices to check.`);
      
      for (const ip of ips) {
          if (await checkDeviceRaw(ip, `IP ${ip}`)) return;
      }

      console.log('\n❌ No devices found playing Spotify. Please start playback in the Sonos App first.');

  } catch (err) {
      console.error('Fatal Error:', err);
  }
}

main();

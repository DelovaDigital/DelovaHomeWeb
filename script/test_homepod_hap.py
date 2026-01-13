import asyncio
import sys
import logging
from pyatv import scan
from pyatv.const import Protocol

# Enable debug logging for pyatv.scan to see mDNS records if possible
# logging.basicConfig(level=logging.DEBUG)

TARGET_IP = "192.168.0.89"

async def main():
    print(f"Scanning for {TARGET_IP}...")
    # Scan specifically for the target IP
    atvs = await scan(loop=asyncio.get_event_loop(), hosts=[TARGET_IP])
    
    if not atvs:
        print("Device not found via pyatv scan.")
        return

    for dev in atvs:
        print(f"Device: {dev.name} ({dev.address})")
        found_hap = False
        for service in dev.services:
            print(f"  - Protocol: {service.protocol}, Port: {service.port}, Properties: {service.properties}")
            if service.protocol == Protocol.HAP:
                found_hap = True
        
        if not found_hap:
            print("  [!] HAP Protocol not detected by pyatv scan.")
        else:
            print("  [*] HAP Protocol detected!")

if __name__ == '__main__':
    asyncio.run(main())

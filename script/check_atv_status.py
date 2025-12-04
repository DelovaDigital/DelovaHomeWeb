import asyncio
import sys
from pyatv import scan
from pyatv.const import Protocol

async def main():
    print("Scanning for Apple TVs...")
    atvs = await scan(loop=asyncio.get_event_loop())

    target_ip = "192.168.0.68"
    target_atv = None

    for atv in atvs:
        if str(atv.address) == target_ip:
            target_atv = atv
            break
    
    if not target_atv:
        print(f"Could not find Apple TV at {target_ip}")
        return

    print(f"Found Apple TV: {target_atv.name}")
    print("-" * 40)
    
    pairing_enabled = False
    for service in target_atv.services:
        print(f"Protocol: {service.protocol}")
        print(f"  Port: {service.port}")
        print(f"  Pairing Allowed: {service.pairing}")
        if service.pairing.name != 'Disabled':
            pairing_enabled = True
        print("-" * 20)

    if not pairing_enabled:
        print("\nCRITICAL ISSUE DETECTED:")
        print("The Apple TV is reporting that PAIRING IS DISABLED for all protocols.")
        print("This typically means the Apple TV is configured to restrict access.")
        print("\nSOLUTION:")
        print("1. On your Apple TV, go to Settings -> AirPlay and HomeKit.")
        print("2. Check 'Allow Access'.")
        print("3. Change it to 'Anyone on the Same Network' or 'Everyone'.")
        print("4. If it is set to 'Only People Sharing This Home', external scripts cannot pair.")
        print("\nPlease change this setting and try running the pairing script again.")
    else:
        print("\nPairing seems to be enabled. You can try the pairing script again.")

if __name__ == '__main__':
    asyncio.run(main())

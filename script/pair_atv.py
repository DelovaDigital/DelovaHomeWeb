import asyncio
import sys
import json
import os
import traceback
from pyatv import scan, pair
from pyatv.const import Protocol
from pyatv.conf import ManualService

CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), '../appletv-credentials.json')

async def main():
    print("Scanning for Apple TVs using pyatv...")
    
    # Scan for devices
    print(f"Scanning host 192.168.0.68...")
    atvs = await scan(loop=asyncio.get_event_loop(), hosts=["192.168.0.68"])

    if not atvs:
        print("No Apple TVs found.")
        return

    print(f"Found {len(atvs)} device(s):")
    for i, atv in enumerate(atvs):
        print(f"{i + 1}: {atv.name} ({atv.address})")

    # Auto-select 192.168.0.68
    index = -1
    for i, atv in enumerate(atvs):
        if str(atv.address) == "192.168.0.68":
            index = i
            break
    
    if index == -1:
        selection = input("Select device number to pair (default 1): ")
        try:
            index = int(selection) - 1
        except ValueError:
            index = 0

    if index < 0 or index >= len(atvs):
        print("Invalid selection.")
        return

    conf = atvs[index]
    print(f"Connecting to {conf.name}...")
    
    print("Available services:")
    for s in conf.services:
        print(f" - {s.protocol} port {s.port}")

    protocol = None
    
    # Check for MRP
    if Protocol.MRP in [s.protocol for s in conf.services]:
        print("Using advertised MRP protocol.")
        protocol = Protocol.MRP
    # Check for Companion
    elif Protocol.Companion in [s.protocol for s in conf.services]:
        print("MRP not found, using Companion protocol.")
        protocol = Protocol.Companion
    # Check for AirPlay
    elif Protocol.AirPlay in [s.protocol for s in conf.services]:
        print("MRP/Companion not found, using AirPlay protocol.")
        protocol = Protocol.AirPlay
    else:
        print("No suitable control protocol found.")
        # Try manual injection as last resort?
        print("Attempting manual MRP injection on port 49152...")
        conf.add_service(ManualService("mrp", Protocol.MRP, 49152, {}))
        protocol = Protocol.MRP

    try:
        pairing_handler = await pair(conf, protocol, loop=asyncio.get_event_loop())

        print(f"Initiating pairing with {protocol}...")
        await pairing_handler.begin()

        pin = input("Enter the 4-digit PIN: ")
        
        pairing_handler.pin(pin)
        await pairing_handler.finish()
        
        print("Pairing successful!")
        
        # Get credentials
        credentials = {
            str(conf.identifier): {
                "protocol": str(protocol).split('.')[-1].lower(), 
                "credentials": pairing_handler.service.credentials,
                "port": pairing_handler.service.port
            }
        }
        
        # Load existing
        if os.path.exists(CREDENTIALS_FILE):
            try:
                with open(CREDENTIALS_FILE, 'r') as f:
                    existing = json.load(f)
                    existing.update(credentials)
                    credentials = existing
            except:
                pass

        with open(CREDENTIALS_FILE, 'w') as f:
            json.dump(credentials, f, indent=2)
            
        print(f"Credentials saved to {CREDENTIALS_FILE}")
        await pairing_handler.close()

    except Exception as e:
        print(f"Pairing failed: {e}")
        traceback.print_exc()
        if 'pairing_handler' in locals():
            await pairing_handler.close()

if __name__ == '__main__':
    asyncio.run(main())

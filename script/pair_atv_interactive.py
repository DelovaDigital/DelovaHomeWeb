import asyncio
import sys
import json
import argparse
from pyatv import scan, pair
from pyatv.const import Protocol

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("ip", help="IP address of the Apple TV")
    args = parser.parse_args()

    # print(f"Scanning host {args.ip}...", file=sys.stderr)
    atvs = await scan(loop=asyncio.get_event_loop(), hosts=[args.ip])

    if not atvs:
        print("ERROR: Device not found", file=sys.stdout)
        sys.exit(1)

    conf = atvs[0]
    
    # Determine available protocols
    available_protocols = [s.protocol for s in conf.services]
    
    # Order of preference
    preference = [Protocol.MRP, Protocol.AirPlay, Protocol.Companion]
    protocols_to_try = [p for p in preference if p in available_protocols]

    if not protocols_to_try:
        print("ERROR: No suitable protocol found", file=sys.stdout)
        sys.exit(1)

    pairing_handler = None
    active_protocol = None

    # Try to start pairing with each protocol
    for protocol in protocols_to_try:
        try:
            print(f"DEBUG: Trying protocol {protocol}...", file=sys.stdout)
            pairing_handler = await pair(conf, protocol, loop=asyncio.get_event_loop())
            await pairing_handler.begin()
            active_protocol = protocol
            break # Successfully started pairing
        except Exception as e:
            print(f"DEBUG: Protocol {protocol} failed: {e}", file=sys.stdout)
            if pairing_handler:
                await pairing_handler.close()
            pairing_handler = None

    if not pairing_handler:
        print(f"ERROR: Could not start pairing. Protocols tried: {protocols_to_try}", file=sys.stdout)
        sys.exit(1)

    try:
        print("WAITING_FOR_PIN", file=sys.stdout)
        print("NOTE: Check your device screen for a PIN. If 'Require Password' is set on the device, enter that password here.", file=sys.stdout)
        sys.stdout.flush()

        pin = sys.stdin.readline().strip()
        
        if not pin:
            print("ERROR: No PIN provided", file=sys.stdout)
            await pairing_handler.close()
            sys.exit(1)

        pairing_handler.pin(pin)
        await pairing_handler.finish()
        
        # Get credentials
        credentials = {
            str(conf.identifier): {
                "protocol": str(active_protocol).split('.')[-1].lower(), 
                "credentials": pairing_handler.service.credentials,
                "port": pairing_handler.service.port,
                "name": conf.name,
                "ip": args.ip
            }
        }
        
        print("PAIRING_SUCCESS", file=sys.stdout)
        print(json.dumps(credentials), file=sys.stdout)
        
        await pairing_handler.close()

    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stdout)
        if pairing_handler:
            await pairing_handler.close()
        sys.exit(1)

if __name__ == '__main__':
    asyncio.run(main())

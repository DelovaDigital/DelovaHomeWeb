import asyncio
import sys
from pyatv import scan
from pyatv.const import Protocol

async def main():
    print("Scanning for devices...")
    atvs = await scan(loop=asyncio.get_event_loop())

    for atv in atvs:
        print(f"Device: {atv.name} ({atv.address})")
        for service in atv.services:
            print(f"  - Protocol: {service.protocol}, Port: {service.port}")

if __name__ == '__main__':
    asyncio.run(main())

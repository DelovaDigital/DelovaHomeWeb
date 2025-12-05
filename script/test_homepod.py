import asyncio
import sys
from pyatv import connect
from pyatv.const import Protocol

async def main():
    print(f"Protocols: {list(Protocol)}")
    print("Scanning for all devices...")
    from pyatv import scan
    atvs = await scan(loop=asyncio.get_event_loop())
    
    for atv in atvs:
        print(f"Device: {atv.name} - {atv.address}")
        for s in atv.services:
            print(f"  - {s.protocol} port {s.port}")

if __name__ == '__main__':
    asyncio.run(main())

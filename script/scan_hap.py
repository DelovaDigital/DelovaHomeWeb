import asyncio
import logging
from aiohomekit.controller import Controller
from zeroconf.asyncio import AsyncZeroconf, AsyncServiceBrowser

# logging.basicConfig(level=logging.DEBUG)

def on_service_state_change(zeroconf, service_type, name, state_change):
    # Dummy handler
    pass

async def main():
    try:
        aio_zeroconf = AsyncZeroconf()
        
        # Start browsing for HomeKit services
        browser = AsyncServiceBrowser(
             aio_zeroconf.zeroconf, 
             ["_hap._tcp.local.", "_hap._udp.local."], 
             handlers=[on_service_state_change]
        )
        
        # Give browser time to spin up
        await asyncio.sleep(2)
        
        controller = Controller(async_zeroconf_instance=aio_zeroconf)
        await controller.async_start()
        
        print(f"Controller properties: {dir(controller)}")
        print("Scanning for HomeKit devices...")
        # await asyncio.sleep(5) # Not needed if async_discover waits discovery
        
        found = False
        try:
            async for discovery in controller.async_discover():
                found = True
                print(f"Discovery: {discovery!r}")
                print(f"Attributes: {dir(discovery)}")
                print("-" * 20)
                # Break after finding some, or let it run for a bit?
                # For scanning script, we just want to list what's there
                # Maybe collect them for 5 seconds
        except asyncio.TimeoutError:
             pass
        
        if not found:
             print("No HomeKit devices found (yet).")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if 'controller' in locals():
            await controller.async_stop()
        if 'aio_zeroconf' in locals():
            await aio_zeroconf.async_close()

if __name__ == '__main__':
    asyncio.run(main())

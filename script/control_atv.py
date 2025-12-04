import asyncio
import sys
import json
import os
import argparse
from pyatv import connect
from pyatv.const import Protocol

CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), '../appletv-credentials.json')
TARGET_IP = "192.168.0.68"

async def main():
    parser = argparse.ArgumentParser(description='Control Apple TV')
    parser.add_argument('command', help='Command to execute (up, down, left, right, select, menu, play, pause, etc.)')
    parser.add_argument('value', nargs='?', help='Value for commands like set_volume')
    args = parser.parse_args()

    if not os.path.exists(CREDENTIALS_FILE):
        print("Error: Credentials file not found. Please run pair_atv.py first.")
        sys.exit(1)

    with open(CREDENTIALS_FILE, 'r') as f:
        creds_data = json.load(f)

    # Find the first device in credentials (or match by IP if we stored it, but we stored by ID)
    # We'll just take the first one for now since we only have one.
    device_id = list(creds_data.keys())[0]
    device_conf = creds_data[device_id]
    
    # Construct the configuration manually or scan? 
    # Scanning is slow. It's better to connect directly if we have IP and port.
    # However, pyatv.connect() usually takes a configuration object or scan result.
    # We can try to scan specifically for this IP to get the conf object quickly.
    
    from pyatv import scan
    atvs = await scan(loop=asyncio.get_event_loop(), hosts=[TARGET_IP])
    
    if not atvs:
        print(f"Error: Could not find Apple TV at {TARGET_IP}")
        sys.exit(1)
        
    conf = atvs[0]
    
    # Inject credentials into the configuration
    protocol_str = device_conf.get('protocol')
    if protocol_str == 'companion':
        conf.set_credentials(Protocol.Companion, device_conf['credentials'])
    elif protocol_str == 'mrp':
        conf.set_credentials(Protocol.MRP, device_conf['credentials'])
    elif protocol_str == 'airplay':
        conf.set_credentials(Protocol.AirPlay, device_conf['credentials'])

    atv = None
    try:
        atv = await connect(conf, loop=asyncio.get_event_loop())
    except Exception as e:
        print(f"Error connecting: {e}")
        sys.exit(1)

    try:
        cmd = args.command.lower()
        
        if cmd == 'turn_on':
            await atv.power.turn_on()
        elif cmd == 'turn_off':
            await atv.power.turn_off()
        elif cmd == 'play':
            await atv.remote_control.play()
        elif cmd == 'pause':
            await atv.remote_control.pause()
        elif cmd == 'stop':
            await atv.remote_control.stop()
        elif cmd == 'next':
            await atv.remote_control.next()
        elif cmd == 'previous':
            await atv.remote_control.previous()
        elif cmd == 'select':
            await atv.remote_control.select()
        elif cmd == 'menu':
            await atv.remote_control.menu()
        elif cmd == 'top_menu':
            await atv.remote_control.top_menu()
        elif cmd == 'up':
            await atv.remote_control.up()
        elif cmd == 'down':
            await atv.remote_control.down()
        elif cmd == 'left':
            await atv.remote_control.left()
        elif cmd == 'right':
            await atv.remote_control.right()
        elif cmd == 'volume_up':
            await atv.audio.volume_up()
        elif cmd == 'volume_down':
            await atv.audio.volume_down()
        elif cmd == 'set_volume':
            # Apple TV doesn't support absolute volume setting via MRP usually, 
            # but we can try to emulate it or just ignore it if not supported.
            # However, pyatv might support set_volume if the protocol allows.
            # MRP usually only supports relative volume (up/down).
            # AirPlay protocol might support set_volume.
            try:
                vol = float(args.value)
                await atv.audio.set_volume(vol)
            except Exception as e:
                print(f"set_volume not supported or failed: {e}")
        else:
            print(f"Unknown command: {cmd}")
            
    except Exception as e:
        print(f"Error executing command: {e}")
    finally:
        if atv:
            atv.close()

if __name__ == '__main__':
    asyncio.run(main())

if __name__ == '__main__':
    asyncio.run(main())

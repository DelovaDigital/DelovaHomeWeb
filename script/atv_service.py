import asyncio
import sys
import json
import os
import argparse
import warnings

# Suppress urllib3/ssl warnings
warnings.filterwarnings("ignore", category=UserWarning, module='urllib3')

from pyatv import connect
from pyatv.const import Protocol, PowerState, DeviceState

CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), '../appletv-credentials.json')

async def main():
    parser = argparse.ArgumentParser(description='Persistent Apple TV Control Service')
    parser.add_argument('ip', help='IP address of the Apple TV to control')
    args = parser.parse_args()

    if not os.path.exists(CREDENTIALS_FILE):
        print(json.dumps({"error": "Credentials file not found"}))
        sys.exit(1)

    with open(CREDENTIALS_FILE, 'r') as f:
        creds_data = json.load(f)

    # Find credentials for this IP
    device_conf = None
    for d_id, d_conf in creds_data.items():
        if d_conf.get('ip') == args.ip:
            device_conf = d_conf
            break
            
    if not device_conf:
        # Fallback: check if any credential matches this IP even if not explicitly stored as such?
        # Or just fail.
        print(json.dumps({"error": f"No credentials found for IP {args.ip}"}))
        sys.exit(1)
    
    # Scan for device
    from pyatv import scan
    print(json.dumps({"status": "scanning", "message": f"Scanning for {args.ip}..."}), flush=True)
    
    atvs = await scan(loop=asyncio.get_event_loop(), hosts=[args.ip])
    
    if not atvs:
        print(json.dumps({"error": f"Could not find Apple TV at {args.ip}"}), flush=True)
        sys.exit(1)
        
    conf = atvs[0]
    
    # Inject credentials
    protocol_str = device_conf.get('protocol')
    if protocol_str == 'companion':
        conf.set_credentials(Protocol.Companion, device_conf['credentials'])
    elif protocol_str == 'mrp':
        conf.set_credentials(Protocol.MRP, device_conf['credentials'])
    elif protocol_str == 'airplay':
        conf.set_credentials(Protocol.AirPlay, device_conf['credentials'])
    
    print(json.dumps({"status": "connecting", "message": "Connecting..."}), flush=True)
    
    atv = None
    try:
        atv = await connect(conf, loop=asyncio.get_event_loop())
        print(json.dumps({"status": "connected", "message": "Connected successfully"}), flush=True)
    except Exception as e:
        print(json.dumps({"error": f"Connection failed: {str(e)}"}), flush=True)
        sys.exit(1)

    # Main loop
    reader = asyncio.StreamReader()
    protocol = asyncio.StreamReaderProtocol(reader)
    await asyncio.get_event_loop().connect_read_pipe(lambda: protocol, sys.stdin)

    while True:
        try:
            line = await reader.readline()
            if not line:
                break
            
            line = line.decode().strip()
            if not line:
                continue
                
            try:
                req = json.loads(line)
            except json.JSONDecodeError:
                print(json.dumps({"error": "Invalid JSON input"}), flush=True)
                continue
                
            cmd = req.get('command')
            val = req.get('value')
            
            # Execute command
            try:
                if cmd == 'turn_on':
                    await atv.power.turn_on()
                elif cmd == 'turn_off':
                    try:
                        await atv.power.turn_off()
                    except Exception:
                        # Fallback to stop for AirPlay targets that don't support power off
                        try:
                            await atv.remote_control.stop()
                        except: pass
                        print(json.dumps({"status": "success", "command": cmd, "note": "fallback_stop"}), flush=True)
                        continue
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
                    if val is not None:
                        await atv.audio.set_volume(float(val))
                elif cmd == 'status':
                    # Fetch status
                    try:
                        playing = await atv.metadata.playing()
                    except Exception as e:
                        playing = None
                        
                    vol = 0
                    try:
                        vol = atv.audio.volume
                        if vol is None: vol = 0
                    except: pass
                    
                    # Handle Power State
                    is_on = True
                    try:
                        if hasattr(atv.power, 'power_state'):
                            # Debug power state
                            # print(f"DEBUG: PowerState is {atv.power.power_state}", file=sys.stderr)
                            is_on = atv.power.power_state == PowerState.On
                    except:
                        # If power state fetch fails, assume ON if we are connected
                        is_on = True

                    # Handle Playing State
                    p_state_str = 'stopped'
                    if playing:
                        try:
                            # device_state is an Enum
                            p_state_str = playing.device_state.name.lower()
                            
                            # If we are playing or paused, we are definitely ON
                            if playing.device_state in [DeviceState.Playing, DeviceState.Paused, DeviceState.Buffering]:
                                is_on = True
                        except:
                            p_state_str = 'stopped'

                    # Safely get app name
                    app_name = ''
                    if playing and hasattr(playing, 'app') and playing.app:
                        app_name = playing.app.name

                    output = {
                        'on': is_on, 
                        'volume': vol,
                        'playing_state': p_state_str,
                        'title': playing.title if playing else '',
                        'artist': playing.artist if playing else '',
                        'album': playing.album if playing else '',
                        'app': app_name
                    }
                    print(json.dumps({"type": "status", "data": output}), flush=True)
                    continue # Skip success message for status

                print(json.dumps({"status": "success", "command": cmd}), flush=True)

            except Exception as e:
                # Fallback logic for play/pause on Mac
                if cmd == 'play' or cmd == 'pause':
                    try:
                        await atv.remote_control.play_pause()
                        print(json.dumps({"status": "success", "command": cmd, "note": "fallback_toggle"}), flush=True)
                    except Exception as e2:
                        print(json.dumps({"error": str(e2)}), flush=True)
                else:
                    print(json.dumps({"error": str(e)}), flush=True)

        except Exception as e:
            print(json.dumps({"error": f"Loop error: {str(e)}"}), flush=True)
            break

    if atv:
        atv.close()

if __name__ == '__main__':
    asyncio.run(main())

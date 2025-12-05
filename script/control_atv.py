import asyncio
import sys
import json
import os
import argparse
import warnings

# Suppress urllib3/ssl warnings
warnings.filterwarnings("ignore", category=UserWarning, module='urllib3')

from pyatv import connect
from pyatv.const import Protocol

CREDENTIALS_FILE = os.path.join(os.path.dirname(__file__), '../appletv-credentials.json')
TARGET_IP = "192.168.0.68"

async def main():
    parser = argparse.ArgumentParser(description='Control Apple TV')
    parser.add_argument('command', help='Command to execute (up, down, left, right, select, menu, play, pause, etc.)')
    parser.add_argument('value', nargs='?', help='Value for commands like set_volume')
    parser.add_argument('--ip', help='Specific IP address of the Apple TV to control')
    args = parser.parse_args()

    if not os.path.exists(CREDENTIALS_FILE):
        print("Error: Credentials file not found. Please run pair_atv.py first.")
        sys.exit(1)

    with open(CREDENTIALS_FILE, 'r') as f:
        creds_data = json.load(f)

    # Determine target IP
    target_ip = args.ip if args.ip else TARGET_IP
    
    # Find credentials for this IP (or fallback to first if not found/specified)
    device_conf = None
    
    # First try to find by IP in the credentials values
    for d_id, d_conf in creds_data.items():
        if d_conf.get('ip') == target_ip:
            device_conf = d_conf
            break
            
    # If not found by IP, and no IP was specified, just take the first one
    if not device_conf and not args.ip:
        device_id = list(creds_data.keys())[0]
        device_conf = creds_data[device_id]
        target_ip = device_conf.get('ip', target_ip)
    
    # If still no config (e.g. IP specified but not in creds), we might fail to connect if auth is needed
    # But we'll try to scan for it anyway.
    
    from pyatv import scan
    atvs = await scan(loop=asyncio.get_event_loop(), hosts=[target_ip])
    
    if not atvs:
        # Try scanning without host filter if specific IP failed? No, that's too slow.
        print(json.dumps({'error': f"Could not find Apple TV at {target_ip}"}))
        sys.exit(1)
        
    conf = atvs[0]
    
    # Inject credentials if we have them
    if device_conf:
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
            try:
                await atv.power.turn_on()
            except Exception:
                # Fallback sequence to wake up
                try:
                    await atv.remote_control.top_menu()
                except Exception:
                    try:
                        await atv.remote_control.menu()
                    except Exception:
                        try:
                            await atv.remote_control.play()
                        except Exception:
                             print("Warning: Could not wake up device (turn_on/menu/play failed). Hint: Power control requires MRP pairing. Please re-pair your Apple TV.")

        elif cmd == 'turn_off':
            try:
                await atv.power.turn_off()
            except Exception:
                try:
                    await atv.remote_control.stop()
                except Exception:
                    pass
                print("Warning: turn_off not supported by this protocol. Hint: Power control requires MRP pairing. Please re-pair your Apple TV.")
        elif cmd == 'play':
            try:
                await atv.remote_control.play()
                print(f"Command '{cmd}' executed successfully.")
            except Exception:
                # Try play_pause as fallback
                try:
                    await atv.remote_control.play_pause()
                    print(f"Command '{cmd}' (via play_pause) executed successfully.")
                except Exception:
                    print("Error executing command: play is not supported")
                    sys.exit(1)

        elif cmd == 'pause':
            try:
                await atv.remote_control.pause()
                print(f"Command '{cmd}' executed successfully.")
            except Exception:
                # Try play_pause as fallback
                try:
                    await atv.remote_control.play_pause()
                    print(f"Command '{cmd}' (via play_pause) executed successfully.")
                except Exception:
                    print("Error executing command: pause is not supported")
                    sys.exit(1)
                    
        elif cmd == 'stop':
            try:
                await atv.remote_control.stop()
                print(f"Command '{cmd}' executed successfully.")
            except Exception:
                print("Error executing command: stop is not supported")
                sys.exit(1)
        elif cmd == 'next':
            try:
                await atv.remote_control.next()
                print(f"Command '{cmd}' executed successfully.")
            except Exception:
                print("Error executing command: next is not supported")
                sys.exit(1)
        elif cmd == 'previous':
            try:
                await atv.remote_control.previous()
                print(f"Command '{cmd}' executed successfully.")
            except Exception:
                print("Error executing command: previous is not supported")
                sys.exit(1)
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
            if args.value:
                vol = float(args.value)
                await atv.audio.set_volume(vol)
            else:
                print("Error: Value required for set_volume")

        elif cmd == 'get_state':
            try:
                playing = await atv.metadata.playing()
                try:
                    app = await atv.metadata.app()
                except:
                    app = None
                
                # Map DeviceState to string
                # DeviceState: Idle=0, Loading=1, Paused=2, Playing=3, Seeking=4, Stopped=5
                state_str = 'unknown'
                if playing.device_state == 0: state_str = 'idle'
                elif playing.device_state == 1: state_str = 'loading'
                elif playing.device_state == 2: state_str = 'paused'
                elif playing.device_state == 3: state_str = 'playing'
                elif playing.device_state == 4: state_str = 'seeking'
                elif playing.device_state == 5: state_str = 'stopped'

                output = {
                    'title': playing.title,
                    'artist': playing.artist,
                    'album': playing.album,
                    'total_time': playing.total_time,
                    'position': playing.position,
                    'app': app.name if app else None,
                    'state': state_str,
                    'raw_state': str(playing.device_state)
                }
                print(json.dumps(output))
            except Exception as e:
                print(json.dumps({'error': str(e)}))

        elif cmd == 'status':
            is_on = False
            volume = 0
            try:
                # Try to get power state, handle if interface missing or enum mismatch
                p_state = atv.power.power_state
                # Check if it's "on" (handling Enum or string)
                is_on = str(p_state).lower().endswith('on')
            except:
                # If we are connected, assume it's on (e.g. AirPlay speaker)
                is_on = True
            
            try:
                volume = atv.audio.volume
            except:
                pass

            info = {
                "on": is_on,
                "volume": volume
            }
            try:
                playing = await atv.metadata.playing()
                info["playing_state"] = str(playing.device_state).split('.')[-1].lower()
                info["title"] = playing.title
                info["artist"] = playing.artist
                info["album"] = playing.album
                info["app"] = playing.app.name if playing.app else None
            except:
                pass
            
            print(json.dumps(info))
        else:
            print(f"Unknown command: {cmd}")
            sys.exit(1)

        # Success messages are now handled inside individual blocks for critical commands
        if cmd not in ['status', 'get_state', 'play', 'pause', 'stop', 'next', 'previous']:
             print(f"Command '{cmd}' executed successfully.")

    except Exception as e:
        print(f"Error executing command: {e}")
        sys.exit(1)
    finally:
        if atv:
            # print(f"DEBUG: atv type: {type(atv)}")
            # print(f"DEBUG: atv.close type: {type(atv.close)}")
            try:
                # Check if close is a coroutine function or just a method
                if asyncio.iscoroutinefunction(atv.close):
                    await atv.close()
                else:
                    atv.close()
            except Exception as e:
                # print(f"Error closing: {e}")
                pass

if __name__ == '__main__':
    asyncio.run(main())

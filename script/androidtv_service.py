
import asyncio
import json
import sys
import os

# Startup diagnostics to help debug environment issues when spawned by Node
print(json.dumps({
    'startup': True,
    'executable': sys.executable,
    'python_version': sys.version.split('\n')[0],
    'argv': sys.argv
}))

try:
    from androidtvremote2 import AndroidTVRemote
    from androidtvremote2.certificate_generator import generate_selfsigned_cert
    try:
        # Print module path for clarity
        import androidtvremote2 as _atr_mod
        print(json.dumps({ 'androidtvremote2': getattr(_atr_mod, '__file__', 'built-in or package without __file__') }))
    except Exception:
        pass
except ImportError as e:
    print(json.dumps({ 'error': 'missing_dependency', 'module': 'androidtvremote2', 'message': str(e) }))
    sys.exit(2)

# The path to the configuration file
CERT_FILE = os.path.join(os.path.dirname(__file__), '../androidtv-cert.pem')
KEY_FILE = os.path.join(os.path.dirname(__file__), '../androidtv-key.pem')

def ensure_certificates():
    if not os.path.exists(CERT_FILE) or not os.path.exists(KEY_FILE):
        # print(json.dumps({"status": "debug", "message": "Generating new certificates..."}), flush=True)
        cert_pem, key_pem = generate_selfsigned_cert("DelovaHome")
        with open(CERT_FILE, 'wb') as f:
            f.write(cert_pem)
        with open(KEY_FILE, 'wb') as f:
            f.write(key_pem)
    return CERT_FILE, KEY_FILE

class AndroidTVManager:
    def __init__(self, ip):
        self.ip = ip
        self.remote = None
        self.cert_path, self.key_path = ensure_certificates()

    async def connect(self):
        """Connect to the Android TV."""
        print(json.dumps({"status": "debug", "message": f"Connecting to {self.ip}..."}), flush=True)
        
        self.remote = AndroidTVRemote(
            client_name="DelovaHome",
            certfile=self.cert_path,
            keyfile=self.key_path,
            host=self.ip
        )
        
        try:
            # Add timeout to connection attempt
            await asyncio.wait_for(self.remote.async_connect(), timeout=10.0)
            print(json.dumps({"status": "connected"}), flush=True)
        except asyncio.TimeoutError:
            print(json.dumps({"status": "failed", "error": "Connection timed out"}), flush=True)
        except Exception as e:
            error_msg = str(e)
            if "Need to pair" in error_msg or "InvalidAuth" in error_msg or "SSLError" in error_msg:
                print(json.dumps({"status": "pairing_required"}), flush=True)
                await self.pair()
            else:
                print(json.dumps({"status": "failed", "error": str(e)}), flush=True)


    async def pair(self):
        """Pair with the Android TV."""
        try:
            await self.remote.async_start_pairing()
            print(json.dumps({"status": "waiting_for_pin"}), flush=True)
            
            # We need to wait for the PIN from stdin
            # The main loop will call handle_pin_input when it receives a PIN
            # But we need to pause here until we get it.
            # We can use an asyncio.Future for this.
            self.pin_future = asyncio.get_running_loop().create_future()
            
            pin = await self.pin_future
            
            await self.remote.async_finish_pairing(pin)
            print(json.dumps({"status": "paired"}), flush=True)
            
        except Exception as e:
            print(json.dumps({"status": "pairing_failed", "error": str(e)}), flush=True)

    async def handle_pin_input(self, pin):
        """Handle PIN input from stdin."""
        if hasattr(self, 'pin_future') and not self.pin_future.done():
            self.pin_future.set_result(pin)


    async def handle_pin_input(self, pin):
        """Handle PIN input from stdin."""
        handler = self.remote.get_pairing_handler()
        if handler:
            handler.send_pin(pin)

    async def handle_command(self, line):
        """Handle a command from stdin."""
        try:
            data = json.loads(line)
            command = data.get('command')
            value = data.get('value') # for future use

            if command:
                key_to_send = command.upper()
                # You can add more complex command mapping here if needed
                await self.remote.send_key(key_to_send)
                print(json.dumps({"status": "ok", "command": command}), flush=True)

        except json.JSONDecodeError:
            print(json.dumps({"status": "error", "message": "Invalid JSON"}), flush=True)
        except Exception as e:
            print(json.dumps({"status": "error", "message": str(e)}), flush=True)


async def main():
    if len(sys.argv) < 2:
        print(json.dumps({"status": "error", "message": "IP address argument is required"}), flush=True)
        sys.exit(1)

    ip = sys.argv[1]
    print(json.dumps({"status": "debug", "message": f"Starting Android TV Service for {ip}"}), flush=True)
    manager = AndroidTVManager(ip)
    
    # Run the connection logic in a separate task
    connect_task = asyncio.create_task(manager.connect())

    # Listen for commands from stdin
    loop = asyncio.get_running_loop()
    print(json.dumps({"status": "debug", "message": "Entering stdin loop"}), flush=True)
    while True:
        try:
            line = await loop.run_in_executor(None, sys.stdin.readline)
            if not line:
                print(json.dumps({"status": "debug", "message": "Stdin closed"}), flush=True)
                break
            
            print(json.dumps({"status": "debug", "message": f"Received line: {line.strip()}"}), flush=True)

            # Check if this is a PIN for pairing
            try:
                data = json.loads(line)
                if data.get('type') == 'pin':
                    await manager.handle_pin_input(data.get('pin'))
                    continue
            except (json.JSONDecodeError, AttributeError):
                # Not a pin command, treat as regular command
                pass

            await manager.handle_command(line)
        except Exception as e:
            print(json.dumps({"status": "error", "message": f"Loop error: {e}"}), flush=True)

    # Wait for connection task if it's still running (unlikely if we break loop)
    if not connect_task.done():
        connect_task.cancel()
        try:
            await connect_task
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass



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
CONFIG_FILE = os.path.join(os.path.dirname(__file__), '../androidtv-credentials.json')

class AndroidTVManager:
    def __init__(self, ip):
        self.ip = ip
        self.remote = None
        self.config = self.load_config()

    def load_config(self):
        """Load the configuration from a file."""
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, 'r') as f:
                return json.load(f)
        return {}

    def save_config(self):
        """Save the configuration to a file."""
        with open(CONFIG_FILE, 'w') as f:
            json.dump(self.config, f, indent=4)

    async def connect(self):
        """Connect to the Android TV."""
        print(json.dumps({"status": "debug", "message": f"Connecting to {self.ip}..."}), flush=True)
        self.remote = AndroidTVRemote(self.ip)
        
        # Check if we have credentials for this IP
        if self.ip in self.config:
            self.remote.set_remote_config(self.config[self.ip])

        try:
            # Add timeout to connection attempt
            is_connected = await asyncio.wait_for(self.remote.async_connect(), timeout=10.0)
            if is_connected:
                if not self.remote.is_paired():
                    # Not paired, start the pairing process
                    print(json.dumps({"status": "pairing_required"}), flush=True)
                    await self.pair()
                else:
                     print(json.dumps({"status": "connected"}), flush=True)
            else:
                print(json.dumps({"status": "failed", "error": "Failed to connect (returned false)"}), flush=True)
        except asyncio.TimeoutError:
            print(json.dumps({"status": "failed", "error": "Connection timed out"}), flush=True)
        except Exception as e:
            print(json.dumps({"status": "failed", "error": str(e)}), flush=True)


    async def pair(self):
        """Pair with the Android TV."""
        handler = self.remote.get_pairing_handler()

        @handler.on_secret
        def on_secret():
            print(json.dumps({"status": "waiting_for_pin"}), flush=True)

        @handler.on_pin
        async def on_pin(pin):
            # This is called when the PIN is shown on the TV
            # The python-prompt-toolkit would be used in a CLI, but here we expect it from stdin
            pass

        @handler.on_paired
        async def on_paired():
            # Save the new config
            self.config[self.ip] = self.remote.get_remote_config()
            self.save_config()
            print(json.dumps({"status": "paired"}), flush=True)

        @handler.on_error
        async def on_error(error):
            print(json.dumps({"status": "pairing_failed", "error": str(error)}), flush=True)
            
        await handler.async_pair()

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


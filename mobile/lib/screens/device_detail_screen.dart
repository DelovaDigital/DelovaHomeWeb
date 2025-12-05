import 'package:flutter/material.dart';
import '../models/device.dart';
import '../services/api_service.dart';

class DeviceDetailScreen extends StatefulWidget {
  final Device device;
  final VoidCallback onRefresh;

  const DeviceDetailScreen({
    super.key,
    required this.device,
    required this.onRefresh,
  });

  @override
  State<DeviceDetailScreen> createState() => _DeviceDetailScreenState();
}

class _DeviceDetailScreenState extends State<DeviceDetailScreen> {
  final ApiService _apiService = ApiService();
  late double _currentBrightness;
  late double _currentVolume;

  @override
  void initState() {
    super.initState();
    _currentBrightness = widget.device.status.brightness;
    _currentVolume = widget.device.status.volume;
  }

  Future<void> _sendCommand(String command, [Map<String, dynamic>? args]) async {
    await _apiService.sendCommand(widget.device.id, command, args);
    widget.onRefresh();
  }

  @override
  Widget build(BuildContext context) {
    final isLight = widget.device.type.toLowerCase() == 'light' || widget.device.type.toLowerCase().contains('bulb');
    final isTv = widget.device.type.toLowerCase() == 'tv';
    final isSpeaker = widget.device.type.toLowerCase() == 'speaker' || isTv;
    final isThermostat = widget.device.type.toLowerCase() == 'thermostat' || widget.device.type.toLowerCase() == 'ac' || widget.device.type.toLowerCase() == 'climate';
    final isLock = widget.device.type.toLowerCase() == 'lock' || widget.device.type.toLowerCase() == 'security';
    final isCover = widget.device.type.toLowerCase() == 'cover' || widget.device.type.toLowerCase() == 'blind' || widget.device.type.toLowerCase() == 'curtain';
    final isVacuum = widget.device.type.toLowerCase() == 'vacuum' || widget.device.type.toLowerCase() == 'robot';
    final isSensor = widget.device.type.toLowerCase() == 'sensor';
    
    final isPoweredOn = widget.device.status.isOn;

    return Scaffold(
      backgroundColor: Colors.grey[900],
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.keyboard_arrow_down, size: 32),
          onPressed: () => Navigator.of(context).pop(),
        ),
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              const SizedBox(height: 20),
              // Hero Icon
              Hero(
                tag: 'device_icon_${widget.device.id}',
                child: Icon(
                  _getDeviceIcon(widget.device.type),
                  size: 120,
                  color: isPoweredOn ? Colors.amber : Colors.grey[700],
                ),
              ),
              const SizedBox(height: 30),
              // Hero Title
              Hero(
                tag: 'device_name_${widget.device.id}',
                child: Material(
                  color: Colors.transparent,
                  child: Text(
                    widget.device.name,
                    style: const TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: Colors.white,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                widget.device.type.toUpperCase(),
                style: TextStyle(color: Colors.grey[500], letterSpacing: 1.5),
              ),
              const SizedBox(height: 40),

              // Big Power Button (Hide for sensors or always-on devices)
              if (!isSensor && !isLock)
              GestureDetector(
                onTap: () => _sendCommand('toggle'),
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 300),
                  width: 80,
                  height: 80,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isPoweredOn ? Colors.white : Colors.grey[800],
                    boxShadow: isPoweredOn
                        ? [
                            BoxShadow(
                              color: Colors.white.withOpacity(0.3),
                              blurRadius: 20,
                              spreadRadius: 5,
                            )
                          ]
                        : [],
                  ),
                  child: Icon(
                    Icons.power_settings_new,
                    size: 40,
                    color: isPoweredOn ? Colors.black : Colors.white,
                  ),
                ),
              ),
              
              // Lock Control
              if (isLock)
                GestureDetector(
                  onTap: () => _sendCommand(widget.device.status.isLocked == true ? 'unlock' : 'lock'),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 300),
                    width: 100,
                    height: 100,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: widget.device.status.isLocked == true ? Colors.red : Colors.green,
                      boxShadow: [
                        BoxShadow(
                          color: (widget.device.status.isLocked == true ? Colors.red : Colors.green).withOpacity(0.4),
                          blurRadius: 20,
                          spreadRadius: 5,
                        )
                      ],
                    ),
                    child: Icon(
                      widget.device.status.isLocked == true ? Icons.lock : Icons.lock_open,
                      size: 50,
                      color: Colors.white,
                    ),
                  ),
                ),

              const SizedBox(height: 40),

              // --- Thermostat Controls ---
              if (isThermostat) ...[
                Text(
                  "${widget.device.status.targetTemperature ?? 21}°C",
                  style: const TextStyle(fontSize: 48, fontWeight: FontWeight.bold, color: Colors.white),
                ),
                const Text("Target Temperature", style: TextStyle(color: Colors.grey)),
                const SizedBox(height: 20),
                Slider(
                  value: (widget.device.status.targetTemperature ?? 21).clamp(10, 30),
                  min: 10,
                  max: 30,
                  divisions: 40,
                  activeColor: Colors.orange,
                  onChanged: (val) {
                    // Optimistic update could go here
                  },
                  onChangeEnd: (val) => _sendCommand('set_temperature', {'value': val}),
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _modeButton('Heat', Icons.local_fire_department, Colors.red),
                    _modeButton('Cool', Icons.ac_unit, Colors.blue),
                    _modeButton('Auto', Icons.hdr_auto, Colors.green),
                    _modeButton('Off', Icons.power_off, Colors.grey),
                  ],
                ),
              ],

              // --- Cover Controls ---
              if (isCover) ...[
                const Text("Position", style: TextStyle(color: Colors.grey)),
                Slider(
                  value: (widget.device.status.position ?? 0).toDouble().clamp(0, 100),
                  min: 0,
                  max: 100,
                  activeColor: Colors.blue,
                  onChanged: (val) {},
                  onChangeEnd: (val) => _sendCommand('set_position', {'value': val.toInt()}),
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    ElevatedButton.icon(
                      icon: const Icon(Icons.arrow_upward),
                      label: const Text("Open"),
                      onPressed: () => _sendCommand('open'),
                    ),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.stop),
                      label: const Text("Stop"),
                      onPressed: () => _sendCommand('stop'),
                      style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
                    ),
                    ElevatedButton.icon(
                      icon: const Icon(Icons.arrow_downward),
                      label: const Text("Close"),
                      onPressed: () => _sendCommand('close'),
                    ),
                  ],
                ),
              ],

              // --- Vacuum Controls ---
              if (isVacuum) ...[
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _actionButton("Start", Icons.play_arrow, () => _sendCommand('start')),
                    _actionButton("Pause", Icons.pause, () => _sendCommand('pause')),
                    _actionButton("Dock", Icons.home, () => _sendCommand('dock')),
                  ],
                ),
              ],

              // --- Sensor Display ---
              if (isSensor) ...[
                if (widget.device.status.temperature != null)
                  _sensorTile("Temperature", "${widget.device.status.temperature}°C", Icons.thermostat),
                if (widget.device.status.humidity != null)
                  _sensorTile("Humidity", "${widget.device.status.humidity}%", Icons.water_drop),
                if (widget.device.status.battery != null)
                  _sensorTile("Battery", "${widget.device.status.battery}%", Icons.battery_std),
              ],

              // --- Light Controls ---
              if (isLight && isPoweredOn) ...[
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Brightness', style: TextStyle(color: Colors.white70)),
                ),
                Slider(
                  value: _currentBrightness.clamp(0, 100),
                  min: 0,
                  max: 100,
                  activeColor: Colors.amber,
                  onChanged: (val) {
                    setState(() => _currentBrightness = val);
                  },
                  onChangeEnd: (val) => _sendCommand('set_brightness', {'value': val.toInt()}),
                ),
                const SizedBox(height: 20),
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Color', style: TextStyle(color: Colors.white70)),
                ),
                const SizedBox(height: 10),
                _buildColorPalette(),
              ],

              // --- Media/Volume Controls ---
              if (isSpeaker && isPoweredOn) ...[
                const Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Volume', style: TextStyle(color: Colors.white70)),
                ),
                Slider(
                  value: _currentVolume.clamp(0, 100),
                  min: 0,
                  max: 100,
                  activeColor: Colors.blueAccent,
                  onChanged: (val) {
                    setState(() => _currentVolume = val);
                  },
                  onChangeEnd: (val) => _sendCommand('set_volume', {'value': val.toInt()}),
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _mediaButton(Icons.skip_previous, () => _sendCommand('previous')),
                    _mediaButton(Icons.play_arrow, () => _sendCommand('play'), size: 64),
                    _mediaButton(Icons.pause, () => _sendCommand('pause'), size: 64),
                    _mediaButton(Icons.skip_next, () => _sendCommand('next')),
                  ],
                ),
              ],

              // --- TV Remote Controls ---
              if (isTv && isPoweredOn) ...[
                const SizedBox(height: 30),
                const Divider(color: Colors.grey),
                const SizedBox(height: 20),
                _buildRemoteControl(),
              ],
              
              const SizedBox(height: 50),
            ],
          ),
        ),
      ),
    );
  }

  Widget _modeButton(String label, IconData icon, Color color) {
    final isSelected = widget.device.status.mode?.toLowerCase() == label.toLowerCase();
    return Column(
      children: [
        IconButton(
          icon: Icon(icon),
          color: isSelected ? color : Colors.grey,
          iconSize: 32,
          onPressed: () => _sendCommand('set_mode', {'value': label.toLowerCase()}),
        ),
        Text(label, style: TextStyle(color: isSelected ? color : Colors.grey, fontSize: 12)),
      ],
    );
  }

  Widget _actionButton(String label, IconData icon, VoidCallback onTap) {
    return Column(
      children: [
        Container(
          decoration: BoxDecoration(
            color: Colors.grey[800],
            shape: BoxShape.circle,
          ),
          child: IconButton(
            icon: Icon(icon, color: Colors.white),
            iconSize: 32,
            onPressed: onTap,
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: const TextStyle(color: Colors.white70)),
      ],
    );
  }

  Widget _sensorTile(String label, String value, IconData icon) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.grey[800],
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        children: [
          Icon(icon, color: Colors.blueAccent, size: 32),
          const SizedBox(width: 16),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(label, style: const TextStyle(color: Colors.grey)),
              Text(value, style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold)),
            ],
          ),
        ],
      ),
    );
  }

  Widget _mediaButton(IconData icon, VoidCallback onTap, {double size = 48}) {
    return IconButton(
      icon: Icon(icon, color: Colors.white),
      iconSize: size,
      onPressed: onTap,
    );
  }

  Widget _buildColorPalette() {
    final colors = [
      Colors.white,
      Colors.red,
      Colors.green,
      Colors.blue,
      Colors.purple,
      Colors.orange,
      Colors.teal,
    ];

    return SizedBox(
      height: 60,
      child: ListView.builder(
        scrollDirection: Axis.horizontal,
        itemCount: colors.length,
        itemBuilder: (context, index) {
          return GestureDetector(
            onTap: () {
              // Convert color to hex or RGB and send
              // For now, just sending a dummy 'set_color' command
              // You'd need to implement color conversion logic here
              final color = colors[index];
              _sendCommand('set_color', {'r': color.red, 'g': color.green, 'b': color.blue});
            },
            child: Container(
              margin: const EdgeInsets.only(right: 16),
              width: 50,
              height: 50,
              decoration: BoxDecoration(
                color: colors[index],
                shape: BoxShape.circle,
                border: Border.all(color: Colors.white24, width: 2),
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _buildRemoteControl() {
    return Column(
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: [
            _remoteBtn(Icons.arrow_back, 'back'),
            _remoteBtn(Icons.home, 'home'),
            _remoteBtn(Icons.menu, 'menu'),
          ],
        ),
        const SizedBox(height: 20),
        Container(
          width: 220,
          height: 220,
          decoration: BoxDecoration(
            color: Colors.grey[800],
            shape: BoxShape.circle,
          ),
          child: Stack(
            children: [
              Align(
                alignment: Alignment.topCenter,
                child: _dpadBtn(Icons.keyboard_arrow_up, 'up'),
              ),
              Align(
                alignment: Alignment.bottomCenter,
                child: _dpadBtn(Icons.keyboard_arrow_down, 'down'),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: _dpadBtn(Icons.keyboard_arrow_left, 'left'),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: _dpadBtn(Icons.keyboard_arrow_right, 'right'),
              ),
              Align(
                alignment: Alignment.center,
                child: GestureDetector(
                  onTap: () => _sendCommand('select'),
                  child: Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: Colors.grey[700],
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withOpacity(0.3),
                          blurRadius: 5,
                          offset: const Offset(0, 2),
                        )
                      ],
                    ),
                    child: const Icon(Icons.circle, color: Colors.white),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _remoteBtn(IconData icon, String cmd) {
    return IconButton(
      icon: Icon(icon, color: Colors.white),
      iconSize: 32,
      onPressed: () => _sendCommand(cmd),
    );
  }

  Widget _dpadBtn(IconData icon, String cmd) {
    return IconButton(
      icon: Icon(icon, color: Colors.white),
      iconSize: 48,
      onPressed: () => _sendCommand(cmd),
    );
  }

  IconData _getDeviceIcon(String type) {
    switch (type.toLowerCase()) {
      case 'light':
      case 'bulb':
        return Icons.lightbulb;
      case 'switch':
      case 'outlet':
      case 'plug':
        return Icons.power;
      case 'tv':
        return Icons.tv;
      case 'speaker':
        return Icons.speaker;
      case 'camera':
        return Icons.videocam;
      case 'printer':
        return Icons.print;
      case 'thermostat':
      case 'ac':
      case 'climate':
        return Icons.thermostat;
      case 'lock':
      case 'security':
        return Icons.lock;
      case 'cover':
      case 'blind':
      case 'curtain':
        return Icons.curtains;
      case 'vacuum':
      case 'robot':
        return Icons.cleaning_services;
      case 'sensor':
        return Icons.sensors;
      case 'fan':
        return Icons.mode_fan_off;
      default:
        return Icons.devices;
    }
  }
}

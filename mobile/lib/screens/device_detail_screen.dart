import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'dart:convert';
import 'dart:io';
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
  WebViewController? _webViewController;

  @override
  void initState() {
    super.initState();
    _currentBrightness = widget.device.status.brightness;
    _currentVolume = widget.device.status.volume;
    
    if (widget.device.type.toLowerCase() == 'camera') {
      _checkAndInitCamera();
    }
  }

  Future<void> _checkAndInitCamera() async {
    final prefs = await SharedPreferences.getInstance();
    final user = prefs.getString('cam_user_${widget.device.id}');
    final pass = prefs.getString('cam_pass_${widget.device.id}');

    if (user == null || pass == null) {
      // Wait for build to finish before showing dialog
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _showCredentialsDialog();
      });
    } else {
      _initCamera(user, pass);
    }
  }

  void _showCredentialsDialog() {
    final userController = TextEditingController();
    final passController = TextEditingController();
    
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Camera Credentials'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Please enter the username and password for this camera.'),
            const SizedBox(height: 10),
            TextField(
              controller: userController,
              decoration: const InputDecoration(labelText: 'Username', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: passController,
              decoration: const InputDecoration(labelText: 'Password', border: OutlineInputBorder()),
              obscureText: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              final navigator = Navigator.of(context);
              final prefs = await SharedPreferences.getInstance();
              await prefs.setString('cam_user_${widget.device.id}', userController.text);
              await prefs.setString('cam_pass_${widget.device.id}', passController.text);
              if (mounted) {
                navigator.pop();
                _initCamera(userController.text, passController.text);
              }
            },
            child: const Text('Save'),
          ),
        ],
      ),
    );
  }

  Future<void> _initCamera(String user, String pass) async {
    final baseUrl = await _apiService.getBaseUrl();
    final uri = Uri.parse(baseUrl);
    final scheme = uri.scheme == 'https' ? 'wss' : 'ws';
    
    // Construct RTSP URL with credentials
    // Defaulting to /stream1, but this might need to be configurable
    final rtspUrl = 'rtsp://$user:$pass@${widget.device.ip}:554/stream1';
    
    final wsUrl = '$scheme://${uri.host}:${uri.port}/api/camera/stream/ws?deviceId=${widget.device.id}&rtspUrl=${Uri.encodeComponent(rtspUrl)}';
    
    // Fetch JSMpeg script content to avoid SSL/CORS issues in WebView
    String jsmpegContent = '';
    try {
      final client = HttpClient()
        ..badCertificateCallback = (cert, host, port) => true;
      final request = await client.getUrl(Uri.parse('$baseUrl/script/jsmpeg.min.js'));
      final response = await request.close();
      if (response.statusCode == 200) {
        jsmpegContent = await response.transform(utf8.decoder).join();
      } else {
        debugPrint('Failed to load jsmpeg.min.js: ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Error fetching jsmpeg.min.js: $e');
    }

    // Trigger the stream start on the backend (pre-warm)
    try {
      await _apiService.sendCommand(widget.device.id, 'start_stream', {'value': {'rtspUrl': rtspUrl}});
    } catch (e) {
      debugPrint('Error starting stream: $e');
    }

    final html = '''
      <!DOCTYPE html>
      <html>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body { margin: 0; background: #000; display: flex; justify-content: center; align-items: center; height: 100vh; overflow: hidden; }
          canvas { width: 100%; height: 100%; object-fit: contain; }
        </style>
        <script>
          $jsmpegContent
        </script>
      </head>
      <body>
        <canvas id="video-canvas"></canvas>
        <script>
          if (typeof JSMpeg === 'undefined') {
             document.body.innerHTML = '<h3 style="color:white">Failed to load Player</h3>';
          } else {
             var canvas = document.getElementById('video-canvas');
             var url = '$wsUrl';
             var player = new JSMpeg.Player(url, {canvas: canvas, autoplay: true, audio: false, loop: true});
          }
        </script>
      </body>
      </html>
    ''';

    _webViewController = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0x00000000))
      ..loadHtmlString(html);
      
    if (mounted) setState(() {});
  }

  Future<void> _sendCommand(String command, [Map<String, dynamic>? args]) async {
    await _apiService.sendCommand(widget.device.id, command, args);
    widget.onRefresh();
  }

  Future<void> _showSpotifyDevicesDialog() async {
    showDialog(
      context: context,
      builder: (context) => const Center(child: CircularProgressIndicator()),
    );

    try {
      final devices = await _apiService.getSpotifyDevices();
      if (mounted) {
        Navigator.pop(context); // Close loading
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            backgroundColor: Colors.grey[900],
            title: const Text('Select Spotify Device', style: TextStyle(color: Colors.white)),
            content: SizedBox(
              width: double.maxFinite,
              child: ListView.builder(
                shrinkWrap: true,
                itemCount: devices.length,
                itemBuilder: (context, index) {
                  final d = devices[index];
                  final isActive = d['is_active'] == true;
                  return ListTile(
                    leading: Icon(
                      d['type'] == 'Computer' ? Icons.computer : 
                      d['type'] == 'Smartphone' ? Icons.smartphone : Icons.speaker,
                      color: isActive ? Colors.green : Colors.grey,
                    ),
                    title: Text(d['name'], style: TextStyle(color: isActive ? Colors.green : Colors.white)),
                    subtitle: Text(d['type'], style: const TextStyle(color: Colors.grey)),
                    onTap: () async {
                      Navigator.pop(context);
                      await _apiService.transferSpotifyPlayback(d['id']);
                      widget.onRefresh();
                    },
                  );
                },
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancel'),
              ),
            ],
          ),
        );
      }
    } catch (e) {
      if (mounted) {
        Navigator.pop(context); // Close loading
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
      }
    }
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
    final isCamera = widget.device.type.toLowerCase() == 'camera';
    final isPrinter = widget.device.type.toLowerCase() == 'printer';
    
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
              if (!isSensor && !isLock && !isCamera && !isPrinter)
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
                              color: Colors.white.withValues(alpha: 0.3),
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
                          color: (widget.device.status.isLocked == true ? Colors.red : Colors.green).withValues(alpha: 0.4),
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

              // --- Camera Controls ---
              if (isCamera) ...[
                Container(
                  height: 250,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: Colors.grey[800]!),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: _webViewController != null
                        ? WebViewWidget(controller: _webViewController!)
                        : const Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                CircularProgressIndicator(color: Colors.amber),
                                SizedBox(height: 16),
                                Text("Connecting to stream...", style: TextStyle(color: Colors.grey)),
                              ],
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 30),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _actionButton("Snapshot", Icons.camera_alt, () => _sendCommand('snapshot')),
                    _actionButton("Record", Icons.fiber_manual_record, () => _sendCommand('record')),
                    _actionButton("Home", Icons.home, () => _sendCommand('ptz_home')),
                  ],
                ),
              ],

              // --- Printer Controls ---
              if (isPrinter) ...[
                if (widget.device.status.printerStatus != null)
                  Text(
                    "Status: ${widget.device.status.printerStatus}",
                    style: const TextStyle(color: Colors.white, fontSize: 18),
                  ),
                const SizedBox(height: 20),
                if (widget.device.status.inks != null)
                  ...widget.device.status.inks!.map((ink) {
                    final colorCode = ink['color'] as String;
                    final level = ink['level'] as int;
                    Color color;
                    switch (colorCode.toUpperCase()) {
                      case 'C': color = Colors.cyan; break;
                      case 'M': color = const Color(0xFFFF00FF); break;
                      case 'Y': color = Colors.yellow; break;
                      case 'K': color = Colors.black; break;
                      default: color = Colors.grey;
                    }
                    
                    return Padding(
                      padding: const EdgeInsets.symmetric(vertical: 8.0),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text("$colorCode ($level%)", style: const TextStyle(color: Colors.grey)),
                          const SizedBox(height: 5),
                          ClipRRect(
                            borderRadius: BorderRadius.circular(4),
                            child: LinearProgressIndicator(
                              value: level / 100.0,
                              backgroundColor: Colors.grey[800],
                              valueColor: AlwaysStoppedAnimation<Color>(color),
                              minHeight: 10,
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
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
                // Media Info Panel
                if (widget.device.status.title != null && widget.device.status.title!.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(bottom: 30),
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.05),
                      borderRadius: BorderRadius.circular(20),
                    ),
                    child: Column(
                      children: [
                        // Album Art Placeholder
                        Container(
                          width: 150,
                          height: 150,
                          decoration: BoxDecoration(
                            color: Colors.grey[800],
                            borderRadius: BorderRadius.circular(12),
                            boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 10, spreadRadius: 2)],
                          ),
                          child: Icon(
                            widget.device.status.app?.toLowerCase().contains('spotify') == true 
                                ? Icons.music_note // In a real app, use Spotify logo asset
                                : Icons.music_note, 
                            size: 80, 
                            color: widget.device.status.app?.toLowerCase().contains('spotify') == true 
                                ? Colors.green 
                                : Colors.grey[600]
                          ),
                        ),
                        const SizedBox(height: 20),
                        Text(
                          widget.device.status.title!,
                          style: const TextStyle(color: Colors.white, fontSize: 20, fontWeight: FontWeight.bold),
                          textAlign: TextAlign.center,
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        if (widget.device.status.artist != null)
                          Text(
                            widget.device.status.artist!,
                            style: const TextStyle(color: Colors.grey, fontSize: 16),
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        if (widget.device.status.album != null)
                          Text(
                            widget.device.status.album!,
                            style: TextStyle(color: Colors.grey[600], fontSize: 14),
                            textAlign: TextAlign.center,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                          ),
                        if (widget.device.status.app != null)
                          Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.apps, size: 16, color: Colors.grey[500]),
                                const SizedBox(width: 5),
                                Text(
                                  widget.device.status.app!,
                                  style: TextStyle(color: Colors.grey[500], fontSize: 12),
                                ),
                              ],
                            ),
                          ),
                      ],
                    ),
                  ),

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
                const SizedBox(height: 20),
                Center(
                  child: TextButton.icon(
                    icon: const Icon(Icons.speaker_group, color: Colors.green),
                    label: const Text('Select Spotify Device', style: TextStyle(color: Colors.green)),
                    onPressed: _showSpotifyDevicesDialog,
                  ),
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
              _sendCommand('set_color', {
                'value': {
                  'r': (color.r * 255).round(), 
                  'g': (color.g * 255).round(), 
                  'b': (color.b * 255).round()
                }
              });
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
                          color: Colors.black.withValues(alpha: 0.3),
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

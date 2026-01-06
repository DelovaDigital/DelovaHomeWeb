import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../models/device.dart';
import '../services/api_service.dart';
import '../widgets/gradient_background.dart';
import '../utils/app_translations.dart';
import 'nas_browser_screen.dart';

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
  int _colorTemp = 300; // Default mireds
  WebViewController? _webViewController;
  String _lang = 'nl';

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _currentBrightness = widget.device.status.brightness;
    _currentVolume = widget.device.status.volume;
    
    if (widget.device.type.toLowerCase() == 'camera') {
      _checkAndInitCamera();
    }
  }

  Future<void> _loadLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) {
      setState(() {
        _lang = prefs.getString('language') ?? 'nl';
      });
    }
  }

  String t(String key) => AppTranslations.get(key, lang: _lang);

  Future<void> _showInputDialog() async {
    // Prefer device-provided inputs (e.g., Denon) if available, else fallback to common inputs
    final List<Map<String, String>> options = [];
    final inputs = widget.device.inputs;
    if (inputs != null) {
      for (final inp in inputs) {
        if (inp is Map) {
          options.add({'label': (inp['name'] ?? inp['label'] ?? inp['id']).toString(), 'value': (inp['id'] ?? inp['value'] ?? inp['name']).toString()});
        } else if (inp is String) {
          options.add({'label': inp, 'value': inp.toLowerCase()});
        }
      }
    }

    if (options.isEmpty) {
      options.addAll([
        {'label': 'HDMI 1', 'value': 'hdmi1'},
        {'label': 'HDMI 2', 'value': 'hdmi2'},
        {'label': 'HDMI 3', 'value': 'hdmi3'},
        {'label': 'HDMI 4', 'value': 'hdmi4'},
        {'label': 'TV Tuner', 'value': 'tv'},
        {'label': 'Game', 'value': 'game'},
        {'label': 'ARC', 'value': 'arc'},
        {'label': 'USB', 'value': 'usb'},
      ]);
    }

    final choice = await showDialog<String>(
      context: context,
      builder: (context) => SimpleDialog(
        title: Text(t('select_input')),
        children: options.map((opt) => SimpleDialogOption(
          onPressed: () => Navigator.pop(context, opt['value'] as String),
          child: Text(opt['label'] as String),
        )).toList(),
      ),
    );

    if (choice != null && choice.isNotEmpty) {
      try {
        await _sendCommand('set_input', {'value': choice});
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(t('input_change_requested'))));
      } catch (e) {
        if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('${t('error')}: $e')));
      }
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
        title: Text(t('cam_credentials')),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(t('enter_cam_creds')),
            const SizedBox(height: 10),
            TextField(
              controller: userController,
              decoration: InputDecoration(labelText: t('username'), border: const OutlineInputBorder()),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: passController,
              decoration: InputDecoration(labelText: t('password'), border: const OutlineInputBorder()),
              obscureText: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(t('cancel')),
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
            child: Text(t('save')),
          ),
        ],
      ),
    );
  }

  Future<void> _initCamera(String user, String pass) async {
    final baseUrl = await _apiService.getBaseUrl();
    
    // Construct RTSP URL with credentials
    // Defaulting to /stream1, but this might need to be configurable
    final encodedUser = Uri.encodeComponent(user);
    final encodedPass = Uri.encodeComponent(pass);
    final rtspUrl = 'rtsp://$encodedUser:$encodedPass@${widget.device.ip}:554/stream1';
    
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
          video { width: 100%; height: 100%; object-fit: contain; }
        </style>
      </head>
      <body>
        <video id="v" autoplay muted playsinline></video>
        <script>
          var video = document.getElementById('v');
          var deviceId = '${widget.device.id}';
          var rtspUrl = '$rtspUrl';
          var baseUrl = '$baseUrl';
          
          var pc = new RTCPeerConnection({
              iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
          });

          pc.addTransceiver('video', { direction: 'recvonly' });

          pc.ontrack = function(event) {
              video.srcObject = event.streams[0];
          };

          pc.createOffer().then(function(offer) {
              return pc.setLocalDescription(offer);
          }).then(function() {
              return fetch(baseUrl + '/api/camera/webrtc/offer', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                      deviceId: deviceId,
                      rtspUrl: rtspUrl,
                      sdp: pc.localDescription.sdp
                  })
              });
          }).then(function(res) { return res.json(); })
          .then(function(data) {
              return pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
          })
          .catch(function(e) { console.error('WebRTC Error:', e); });
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
        
        final isDark = Theme.of(context).brightness == Brightness.dark;
        final dialogBg = isDark ? Colors.grey[900] : Colors.white;
        final textColor = isDark ? Colors.white : Colors.black87;
        final subTextColor = isDark ? Colors.grey : Colors.black54;

        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            backgroundColor: dialogBg,
            title: Text('Select Spotify Device', style: TextStyle(color: textColor)),
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
                      color: isActive ? Colors.green : subTextColor,
                    ),
                    title: Text(d['name'], style: TextStyle(color: isActive ? Colors.green : textColor)),
                    subtitle: Text(d['type'], style: TextStyle(color: subTextColor)),
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
                child: Text(t('cancel')),
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

  Widget _buildSlider(double value, double min, double max, Function(double) onChanged, Function(double) onChangeEnd, {IconData? icon, Color? activeColor}) {
    return Container(
      height: 60,
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(20),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 16),
      child: Row(
        children: [
          if (icon != null) ...[Icon(icon, color: Theme.of(context).colorScheme.onSurfaceVariant), const SizedBox(width: 12)],
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 6,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 10),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 20),
                activeTrackColor: activeColor ?? Theme.of(context).colorScheme.primary,
                inactiveTrackColor: Theme.of(context).colorScheme.onSurfaceVariant.withValues(alpha: 0.2),
                thumbColor: Colors.white,
              ),
              child: Slider(
                value: value.clamp(min, max),
                min: min,
                max: max,
                onChanged: onChanged,
                onChangeEnd: onChangeEnd,
              ),
            ),
          ),
        ],
      ),
    );
  }



  Widget _buildLightControls() {
    return Column(
      children: [
        const SizedBox(height: 20),
        
        // Brightness Slider
        _buildSlider(
          _currentBrightness, 0, 100,
          (v) => setState(() => _currentBrightness = v),
          (v) => _sendCommand('set_brightness', {'value': v.toInt()}),
          icon: Icons.brightness_6,
          activeColor: Colors.amber,
        ),
        
        const SizedBox(height: 20),
        
        // Color Temp or Color
        if (widget.device.type.toLowerCase().contains('hue')) ...[
          _buildSlider(
             _colorTemp.toDouble(), 153, 500,
             (v) => setState(() => _colorTemp = v.toInt()),
             (v) => _sendCommand('set_color_temp', {'value': v.toInt()}),
             icon: Icons.thermostat,
             activeColor: Colors.orangeAccent,
          ),
          const SizedBox(height: 20),
        ],

        // Color Palette
        if (widget.device.type.toLowerCase() == 'hue' || widget.device.type.toLowerCase().contains('light'))
          SizedBox(
            height: 60,
            child: ListView(
              scrollDirection: Axis.horizontal,
              children: [
                _colorButton(Colors.white),
                _colorButton(Colors.red),
                _colorButton(Colors.orange),
                _colorButton(Colors.amber),
                _colorButton(Colors.yellow),
                _colorButton(Colors.green),
                _colorButton(Colors.teal),
                _colorButton(Colors.blue),
                _colorButton(Colors.indigo),
                _colorButton(Colors.purple),
                _colorButton(Colors.pink),
              ],
            ),
          ),
      ],
    );
  }

  Widget _colorButton(Color color) {
    return GestureDetector(
      onTap: () {
        _sendCommand('set_color', {
            'value': {
              'r': (color.r * 255).round(),
              'g': (color.g * 255).round(),
              'b': (color.b * 255).round()
            }
        });
      },
      child: Container(
        margin: const EdgeInsets.only(right: 12),
        width: 50,
        height: 50,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          border: Border.all(color: Colors.white24, width: 2),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;

    final isLight = widget.device.type.toLowerCase() == 'light' || widget.device.type.toLowerCase().contains('bulb');
    final isTv = widget.device.type.toLowerCase() == 'tv' || widget.device.type.toLowerCase() == 'receiver';
    // isPc is calculated in _buildBody, removing unused variable here
    final isSpeaker = widget.device.type.toLowerCase() == 'speaker' || isTv;
    final isThermostat = widget.device.type.toLowerCase() == 'thermostat' || widget.device.type.toLowerCase() == 'ac' || widget.device.type.toLowerCase() == 'climate';
    final isLock = widget.device.type.toLowerCase() == 'lock' || widget.device.type.toLowerCase() == 'security';
    final isCover = widget.device.type.toLowerCase() == 'cover' || widget.device.type.toLowerCase() == 'blind' || widget.device.type.toLowerCase() == 'curtain';
    final isVacuum = widget.device.type.toLowerCase() == 'vacuum' || widget.device.type.toLowerCase() == 'robot';

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(widget.device.name, style: TextStyle(color: textColor)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(color: textColor),
        actions: [
          if (widget.device.type.toLowerCase() == 'camera')
            IconButton(
              icon: const Icon(Icons.lock_reset),
              tooltip: 'Reset Credentials',
              onPressed: _showCredentialsDialog,
            ),
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: widget.onRefresh,
          ),
        ],
      ),
      body: GradientBackground(
        child: SafeArea(
          child: _buildBody(isLight, isTv, isSpeaker, isThermostat, isLock, isCover, isVacuum),
        ),
      ),
    );
  }

  Widget _buildBody(bool isLight, bool isTv, bool isSpeaker, bool isThermostat, bool isLock, bool isCover, bool isVacuum) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white54 : Colors.black54;
    final iconColor = isDark ? Colors.white24 : Colors.black26;

    final isSensor = widget.device.type.toLowerCase() == 'sensor';
    final isCamera = widget.device.type.toLowerCase() == 'camera';
    final isPrinter = widget.device.type.toLowerCase() == 'printer';
    final isPs5 = widget.device.type.toLowerCase() == 'ps5' || widget.device.type.toLowerCase() == 'console' || widget.device.type.toLowerCase() == 'game' || widget.device.name.toLowerCase().contains('ps5');
    // Determine if this device should be treated like a PC/game console for Wake actions
    final isPc = widget.device.type.toLowerCase().contains('pc') || (widget.device.name.toLowerCase().contains('ps5') && !isPs5) || widget.device.type.toLowerCase().contains('game');
    final isWindows = widget.device.type.toLowerCase().contains('windows') || (widget.device.model?.toLowerCase().contains('windows') ?? false) || (isPc && widget.device.name.toLowerCase().contains('win'));
    final isNas = widget.device.type.toLowerCase() == 'nas' || widget.device.sharesFolders;
    
    final isPoweredOn = widget.device.status.isOn;

    return SingleChildScrollView(
        child: SizedBox(
          width: double.infinity,
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
                  color: isPoweredOn ? Colors.cyanAccent : iconColor,
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
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color: textColor,
                    ),
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
              const SizedBox(height: 10),
              Text(
                widget.device.type.toUpperCase(),
                style: TextStyle(color: subTextColor, letterSpacing: 1.5),
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
                    color: isPoweredOn ? Colors.white : (isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05)),
                    boxShadow: isPoweredOn
                        ? [
                            BoxShadow(
                              color: Colors.cyanAccent.withValues(alpha: 0.5),
                              blurRadius: 20,
                              spreadRadius: 5,
                            )
                          ]
                        : [],
                    border: Border.all(color: isDark ? Colors.white.withValues(alpha: 0.2) : Colors.black.withValues(alpha: 0.1)),
                  ),
                  child: Icon(
                    Icons.power_settings_new,
                    size: 40,
                    color: isPoweredOn ? Colors.cyan : (isDark ? Colors.white : Colors.black54),
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

              // --- PC / NAS Controls ---
              if (isPc || isNas) ...[
                 Row(
                   mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                   children: [
                     if (isWindows)
                       _actionButton("Remote Desktop", Icons.desktop_windows, () async {
                          final url = Uri.parse('https://remotedesktop.google.com/access/');
                          if (await canLaunchUrl(url)) {
                            await launchUrl(url, mode: LaunchMode.externalApplication);
                          }
                       }),
                     
                     if (isPc && widget.device.wolConfigured)
                       _actionButton("Wake on LAN", Icons.power, () async {
                          await _sendCommand('wake');
                          if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Wake requested')));
                       }),

                     if (isNas || widget.device.sharesFolders)
                       _actionButton("Browse Files", Icons.folder, () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => NasBrowserScreen(
                                nasId: widget.device.id,
                                nasName: widget.device.name,
                              ),
                            ),
                          );
                       }),
                   ],
                 ),
                 const SizedBox(height: 40),
              ],

              // --- Thermostat Controls ---
              if (isThermostat) ...[
                Text(
                  "${widget.device.status.targetTemperature ?? 21}°C",
                  style: TextStyle(fontSize: 48, fontWeight: FontWeight.bold, color: textColor),
                ),
                Text("Target Temperature", style: TextStyle(color: subTextColor)),
                const SizedBox(height: 20),
                Slider(
                  value: (widget.device.status.targetTemperature ?? 21).clamp(10, 30),
                  min: 10,
                  max: 30,
                  divisions: 40,
                  activeColor: Colors.cyanAccent,
                  onChanged: (val) {
                    // Optimistic update could go here
                  },
                  onChangeEnd: (val) => _sendCommand('set_temperature', {'value': val}),
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _modeButton('Heat', Icons.local_fire_department, Colors.redAccent),
                    _modeButton('Cool', Icons.ac_unit, Colors.cyanAccent),
                    _modeButton('Auto', Icons.hdr_auto, Colors.greenAccent),
                    _modeButton('Off', Icons.power_off, subTextColor),
                  ],
                ),
              ],

              // --- Cover Controls ---
              if (isCover) ...[
                Text("Position", style: TextStyle(color: subTextColor)),
                Slider(
                  value: (widget.device.status.position ?? 0).toDouble().clamp(0, 100),
                  min: 0,
                  max: 100,
                  activeColor: Colors.cyanAccent,
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
                    border: Border.all(color: Colors.white.withValues(alpha: 0.2)),
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(12),
                    child: _webViewController != null
                        ? WebViewWidget(controller: _webViewController!)
                        : const Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                CircularProgressIndicator(color: Colors.cyanAccent),
                                SizedBox(height: 16),
                                Text("Connecting to stream...", style: TextStyle(color: Colors.white70)),
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
                const SizedBox(height: 30),
                _buildCameraControls(),
              ],

              // --- PS5 Controls ---
              if (isPs5) ...[
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _actionButton("Wake", Icons.power, () async {
                       try {
                         await _apiService.wakePs5(widget.device.id);
                         if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Wake command sent')));
                       } catch (e) {
                         if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                       }
                    }),
                    _actionButton("Standby", Icons.power_off, () async {
                       try {
                         await _apiService.standbyPs5(widget.device.id);
                         if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Standby command sent')));
                       } catch (e) {
                         if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                       }
                    }),
                  ],
                ),
                const SizedBox(height: 30),
                Container(
                  padding: const EdgeInsets.all(20),
                  decoration: BoxDecoration(
                    color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: Column(
                    children: [
                      IconButton(icon: Icon(Icons.keyboard_arrow_up, size: 40, color: textColor), onPressed: () => _sendCommand('up')),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(icon: Icon(Icons.keyboard_arrow_left, size: 40, color: textColor), onPressed: () => _sendCommand('left')),
                          const SizedBox(width: 20),
                          IconButton(icon: Icon(Icons.circle_outlined, size: 40, color: textColor), onPressed: () => _sendCommand('enter')),
                          const SizedBox(width: 20),
                          IconButton(icon: Icon(Icons.keyboard_arrow_right, size: 40, color: textColor), onPressed: () => _sendCommand('right')),
                        ],
                      ),
                      IconButton(icon: Icon(Icons.keyboard_arrow_down, size: 40, color: textColor), onPressed: () => _sendCommand('down')),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _actionButton("Back", Icons.arrow_back, () => _sendCommand('back')),
                    _actionButton("Home", Icons.home, () => _sendCommand('home')),
                  ],
                ),
                const SizedBox(height: 20),
                Text(
                  "Note: Storage and Downloads viewing is not supported by the current library.",
                  style: TextStyle(color: subTextColor, fontSize: 12),
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 20),
              ],

              // --- Printer Controls ---
              if (isPrinter) ...[
                if (widget.device.status.printerStatus != null)
                  Text(
                    "Status: ${widget.device.status.printerStatus}",
                    style: TextStyle(color: textColor, fontSize: 18),
                  ),
                const SizedBox(height: 20),
                if (widget.device.status.inks != null)
                  ...widget.device.status.inks!.map((ink) {
                    // Support tri-color components when present
                    if (ink['components'] != null && ink['components'] is Map) {
                      final comps = Map<String, dynamic>.from(ink['components'] as Map);
                      final c = (comps['C'] ?? 0) as int;
                      final m = (comps['M'] ?? 0) as int;
                      final y = (comps['Y'] ?? 0) as int;
                      final k = (comps['K'] != null) ? (comps['K'] as int) : null;

                      return Padding(
                        padding: const EdgeInsets.symmetric(vertical: 8.0),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text("${ink['label'] ?? ink['color'] ?? 'Tri-color'}", style: const TextStyle(color: Colors.grey)),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                _triBar('C', c, Colors.cyan),
                                const SizedBox(width: 8),
                                _triBar('M', m, const Color(0xFFFF00FF)),
                                const SizedBox(width: 8),
                                _triBar('Y', y, Colors.yellow),
                                if (k != null) ...[
                                  const SizedBox(width: 8),
                                  _triBar('K', k, Colors.black),
                                ]
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              '${['C:$c%', 'M:$m%', 'Y:$y%']..removeWhere((s) => s.endsWith(':0%'))..join(' • ')}${k != null ? ' • K:$k%' : ''}',
                              style: const TextStyle(color: Colors.grey, fontSize: 12),
                            ),
                            const SizedBox(height: 8),
                            Row(
                              children: [
                                ElevatedButton.icon(
                                  onPressed: () async {
                                    final confirm = await showDialog<bool>(
                                      context: context,
                                      builder: (ctx) => AlertDialog(
                                        title: const Text('Replace Cartridge'),
                                        content: const Text('Markeer deze cartridge als vervangen?'),
                                        actions: [
                                          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Nee')),
                                          ElevatedButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('Ja')),
                                        ],
                                      ),
                                    );
                                    if (confirm == true) {
                                      await _sendCommand('replace_cartridge', {'value': {'label': ink['label'] ?? ink['color']}});
                                      if (mounted) {
                                        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Cartridge gemarkeerd als vervangen')));
                                        widget.onRefresh();
                                      }
                                    }
                                  },
                                  icon: const Icon(Icons.refresh),
                                  label: const Text('Replace Cartridge'),
                                ),
                              ],
                            ),
                          ],
                        ),
                      );
                    }

                    // Fallback single-color cartridge rendering
                    final colorCode = (ink['color'] ?? '') as String;
                    final level = (ink['level'] ?? 0) as int;
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
                          Text("${ink['label'] ?? colorCode} ($level%)", style: const TextStyle(color: Colors.grey)),
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
                _buildLightControls(),
              ],

              // --- Media/Volume Controls ---
              if (isSpeaker && isPoweredOn) ...[
                // Media Info Panel
                if (widget.device.status.title != null && widget.device.status.title!.isNotEmpty)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(20),
                      child: Column(
                        children: [
                          // Album Art Placeholder
                          Container(
                            width: 150,
                            height: 150,
                            decoration: BoxDecoration(
                              color: isDark ? Colors.black26 : Colors.black12,
                              borderRadius: BorderRadius.circular(12),
                              boxShadow: [BoxShadow(color: isDark ? Colors.black26 : Colors.black12, blurRadius: 10, spreadRadius: 2)],
                            ),
                            child: Icon(
                              widget.device.status.app?.toLowerCase().contains('spotify') == true 
                                  ? Icons.music_note // In a real app, use Spotify logo asset
                                  : Icons.music_note, 
                              size: 80, 
                              color: widget.device.status.app?.toLowerCase().contains('spotify') == true 
                                  ? Colors.greenAccent 
                                  : iconColor
                            ),
                          ),
                          const SizedBox(height: 20),
                          Text(
                            widget.device.status.title!,
                            style: TextStyle(color: textColor, fontSize: 20, fontWeight: FontWeight.bold),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                          if (widget.device.status.artist != null)
                            Text(
                              widget.device.status.artist!,
                              style: TextStyle(color: subTextColor, fontSize: 16),
                              textAlign: TextAlign.center,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                            ),
                          if (widget.device.status.album != null)
                            Text(
                              widget.device.status.album!,
                              style: TextStyle(color: subTextColor, fontSize: 14),
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
                                  Icon(Icons.apps, size: 16, color: subTextColor),
                                  const SizedBox(width: 5),
                                  Text(
                                    widget.device.status.app!,
                                    style: TextStyle(color: subTextColor, fontSize: 12),
                                  ),
                                ],
                              ),
                            ),
                        ],
                      ),
                    ),
                  ),
                
                const SizedBox(height: 20),

                Align(
                  alignment: Alignment.centerLeft,
                  child: Text('Volume', style: TextStyle(color: subTextColor)),
                ),
                Slider(
                  value: _currentVolume.clamp(0, 100),
                  min: 0,
                  max: 100,
                  activeColor: Colors.cyanAccent,
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
                const SizedBox(height: 20),
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    ElevatedButton.icon(
                      onPressed: () => _showInputDialog(),
                      icon: const Icon(Icons.input),
                      label: const Text('Switch Input'),
                    ),
                    if (isPc) ElevatedButton.icon(
                      onPressed: () async {
                        await _sendCommand('wake');
                        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Wake requested')));
                      },
                      icon: const Icon(Icons.power),
                      label: const Text('Wake Device'),
                    ),
                  ],
                ),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final bgColor = isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05);
    final borderColor = isDark ? Colors.white.withValues(alpha: 0.2) : Colors.black.withValues(alpha: 0.1);

    return Column(
      children: [
        Container(
          decoration: BoxDecoration(
            color: bgColor,
            shape: BoxShape.circle,
            border: Border.all(color: borderColor),
          ),
          child: IconButton(
            icon: Icon(icon, color: textColor),
            iconSize: 32,
            onPressed: onTap,
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: TextStyle(color: subTextColor)),
      ],
    );
  }

  Widget _triBar(String label, int level, Color color) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final bgColor = isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05);
    final borderColor = isDark ? Colors.white.withValues(alpha: 0.2) : Colors.black.withValues(alpha: 0.1);

    final barHeight = 60.0;
    final fill = (level.clamp(0, 100)) / 100.0;
    return Column(
      children: [
        Container(
          width: 18,
          height: barHeight,
          decoration: BoxDecoration(
            color: bgColor,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: borderColor),
          ),
          child: Align(
            alignment: Alignment.bottomCenter,
            child: Container(
              width: 18,
              height: barHeight * fill,
              decoration: BoxDecoration(
                color: color,
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
        ),
        const SizedBox(height: 6),
        Text(label, style: TextStyle(color: subTextColor, fontSize: 12)),
      ],
    );
  }

  Widget _sensorTile(String label, String value, IconData icon) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final iconColor = isDark ? Colors.cyanAccent : Colors.blueAccent;

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Card(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              Icon(icon, color: iconColor, size: 32),
              const SizedBox(width: 16),
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: TextStyle(color: subTextColor)),
                  Text(value, style: TextStyle(color: textColor, fontSize: 20, fontWeight: FontWeight.bold)),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _mediaButton(IconData icon, VoidCallback onTap, {double size = 48}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final iconColor = isDark ? Colors.white : Colors.black87;

    return IconButton(
      icon: Icon(icon, color: iconColor),
      iconSize: size,
      onPressed: onTap,
    );
  }



  Widget _buildRemoteControl() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final iconColor = isDark ? Colors.white : Colors.black87;
    final bgColor = isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05);
    final borderColor = isDark ? Colors.white.withValues(alpha: 0.2) : Colors.black.withValues(alpha: 0.1);
    final centerBtnColor = isDark ? Colors.white.withValues(alpha: 0.2) : Colors.black.withValues(alpha: 0.1);

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
            color: bgColor,
            shape: BoxShape.circle,
            border: Border.all(color: borderColor),
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
                      color: centerBtnColor,
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.3),
                          blurRadius: 5,
                          offset: const Offset(0, 2),
                        )
                      ],
                    ),
                    child: Icon(Icons.circle, color: iconColor),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final iconColor = isDark ? Colors.white : Colors.black87;
    return IconButton(
      icon: Icon(icon, color: iconColor),
      iconSize: 32,
      onPressed: () => _sendCommand(cmd),
    );
  }

  Widget _dpadBtn(IconData icon, String cmd) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final iconColor = isDark ? Colors.white : Colors.black87;
    return IconButton(
      icon: Icon(icon, color: iconColor),
      iconSize: 48,
      onPressed: () => _sendCommand(cmd),
    );
  }

  Widget _buildCameraControls() {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final bgColor = isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05);
    final borderColor = isDark ? Colors.white.withValues(alpha: 0.2) : Colors.black.withValues(alpha: 0.1);

    return Column(
      children: [
        Text("Camera Control", style: TextStyle(color: subTextColor)),
        const SizedBox(height: 20),
        Container(
          width: 220,
          height: 220,
          decoration: BoxDecoration(
            color: bgColor,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.5),
                blurRadius: 10,
                spreadRadius: 2,
              )
            ],
            border: Border.all(color: borderColor),
          ),
          child: Stack(
            children: [
              Align(
                alignment: Alignment.topCenter,
                child: _dpadBtn(Icons.keyboard_arrow_up, 'nudge_up'),
              ),
              Align(
                alignment: Alignment.bottomCenter,
                child: _dpadBtn(Icons.keyboard_arrow_down, 'nudge_down'),
              ),
              Align(
                alignment: Alignment.centerLeft,
                child: _dpadBtn(Icons.keyboard_arrow_left, 'nudge_left'),
              ),
              Align(
                alignment: Alignment.centerRight,
                child: _dpadBtn(Icons.keyboard_arrow_right, 'nudge_right'),
              ),
              Align(
                alignment: Alignment.center,
                child: GestureDetector(
                  onTap: () => _sendCommand('stop'),
                  child: Container(
                    width: 80,
                    height: 80,
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.2),
                      shape: BoxShape.circle,
                      boxShadow: [
                        BoxShadow(
                          color: Colors.black.withValues(alpha: 0.3),
                          blurRadius: 5,
                          offset: const Offset(0, 2),
                        )
                      ],
                    ),
                    child: const Icon(Icons.stop, color: Colors.redAccent, size: 40),
                  ),
                ),
              ),
            ],
          ),
        ),
      ],
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

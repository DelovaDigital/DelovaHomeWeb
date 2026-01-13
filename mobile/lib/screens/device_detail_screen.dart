import 'package:flutter/material.dart';
import 'dart:ui';
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
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

    final choice = await showModalBottomSheet<String>(
      context: context,
      backgroundColor: Colors.transparent,
      builder: (context) => Container(
        decoration: BoxDecoration(
           color: isDark ? const Color(0xFF1E1E1E) : Colors.white,
           borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        padding: const EdgeInsets.symmetric(vertical: 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 40, height: 4, 
              decoration: BoxDecoration(color: Colors.grey.withOpacity(0.3), borderRadius: BorderRadius.circular(2)),
            ),
            const SizedBox(height: 16),
            Text(t('select_input'), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
            const SizedBox(height: 16),
            Flexible(
              child: SingleChildScrollView(
                child: Column(
                  children: options.map((opt) => ListTile(
                    leading: const Icon(Icons.input),
                    title: Text(opt['label'] as String),
                    onTap: () => Navigator.pop(context, opt['value'] as String),
                  )).toList(),
                ),
              ),
            ),
            const SizedBox(height: 20),
          ],
        ),
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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Container(
      height: 70,
      padding: const EdgeInsets.symmetric(horizontal: 20),
      decoration: BoxDecoration(
        color: isDark ? Colors.white.withOpacity(0.05) : Colors.black.withOpacity(0.05),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(color: isDark ? Colors.white12 : Colors.black12),
      ),
      child: Row(
        children: [
          if (icon != null) ...[
            Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                 color: (activeColor ?? Colors.grey).withOpacity(0.2),
                 shape: BoxShape.circle,
              ),
              child: Icon(icon, color: activeColor ?? (isDark ? Colors.white : Colors.black), size: 20),
            ),
            const SizedBox(width: 16)
          ],
          Expanded(
            child: SliderTheme(
              data: SliderTheme.of(context).copyWith(
                trackHeight: 12,
                thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 14, elevation: 4),
                overlayShape: const RoundSliderOverlayShape(overlayRadius: 24),
                activeTrackColor: activeColor ?? Theme.of(context).colorScheme.primary,
                inactiveTrackColor: (isDark ? Colors.white : Colors.black).withOpacity(0.1),
                thumbColor: Colors.white,
                trackShape: const RoundedRectSliderTrackShape(),
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
        GlassContainer(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text("Brightness", style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
              const SizedBox(height: 16),
              _buildSlider(
                _currentBrightness, 0, 100,
                (v) => setState(() => _currentBrightness = v),
                (v) => _sendCommand('set_brightness', {'value': v.toInt()}),
                icon: Icons.brightness_6,
                activeColor: Colors.amber,
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        
        if (widget.device.type.toLowerCase().contains('hue')) ...[
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                 const Text("Temperature", style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                 const SizedBox(height: 16),
                 _buildSlider(
                    _colorTemp.toDouble(), 153, 500,
                    (v) => setState(() => _colorTemp = v.toInt()),
                    (v) => _sendCommand('set_color_temp', {'value': v.toInt()}),
                    icon: Icons.thermostat,
                    activeColor: Colors.orangeAccent,
                 ),
              ],
            ),
          ),
          const SizedBox(height: 20),
        ],

        if (widget.device.type.toLowerCase() == 'hue' || widget.device.type.toLowerCase().contains('light'))
          GlassContainer(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text("Color", style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                const SizedBox(height: 16),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _colorButton(Colors.white),
                      _colorButton(Colors.red),
                      _colorButton(Colors.orange),
                      _colorButton(Colors.amber),
                      _colorButton(Colors.yellow),
                      _colorButton(Colors.green),
                      _colorButton(Colors.teal),
                      _colorButton(Colors.lightBlue),
                      _colorButton(Colors.blue),
                      _colorButton(Colors.indigo),
                      _colorButton(Colors.purple),
                      _colorButton(Colors.pink),
                    ],
                  ),
                ),
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
              'r': (color.red),
              'g': (color.green),
              'b': (color.blue)
            }
        });
      },
      child: Container(
        margin: const EdgeInsets.only(right: 16),
        width: 48,
        height: 48,
        decoration: BoxDecoration(
          color: color,
          shape: BoxShape.circle,
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.4),
              blurRadius: 8,
              offset: const Offset(0, 2),
            )
          ],
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
    final isSpeaker = widget.device.type.toLowerCase() == 'speaker' || isTv;
    final isThermostat = widget.device.type.toLowerCase() == 'thermostat' || widget.device.type.toLowerCase() == 'ac' || widget.device.type.toLowerCase() == 'climate';
    final isLock = widget.device.type.toLowerCase() == 'lock' || widget.device.type.toLowerCase() == 'security';
    final isCover = widget.device.type.toLowerCase() == 'cover' || widget.device.type.toLowerCase() == 'blind' || widget.device.type.toLowerCase() == 'curtain';
    final isVacuum = widget.device.type.toLowerCase() == 'vacuum' || widget.device.type.toLowerCase() == 'robot';

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(widget.device.name, style: TextStyle(color: textColor, fontWeight: FontWeight.w600)),
        centerTitle: true,
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: isDark ? Colors.black26 : Colors.white54,
              shape: BoxShape.circle,
            ),
            child: Icon(Icons.arrow_back, color: textColor, size: 20),
          ),
          onPressed: () => Navigator.pop(context),
        ),
        actions: [
          if (widget.device.type.toLowerCase() == 'camera')
            IconButton(
              icon: Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: isDark ? Colors.black26 : Colors.white54,
                  shape: BoxShape.circle,
                ),
                child: Icon(Icons.lock_reset, color: textColor, size: 20),
              ),
              onPressed: _showCredentialsDialog,
            ),
          IconButton(
            icon: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                color: isDark ? Colors.black26 : Colors.white54,
                shape: BoxShape.circle,
              ),
              child: Icon(Icons.refresh, color: textColor, size: 20),
            ),
            onPressed: widget.onRefresh,
          ),
          const SizedBox(width: 8),
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
    
    final isSensor = widget.device.type.toLowerCase() == 'sensor';
    final isCamera = widget.device.type.toLowerCase() == 'camera';
    final isPrinter = widget.device.type.toLowerCase() == 'printer';
    final isPs5 = widget.device.type.toLowerCase() == 'ps5' || widget.device.type.toLowerCase() == 'console' || widget.device.type.toLowerCase() == 'game' || widget.device.name.toLowerCase().contains('ps5');
    final isPc = widget.device.type.toLowerCase().contains('pc') || (widget.device.name.toLowerCase().contains('ps5') && !isPs5) || widget.device.type.toLowerCase().contains('game');
    final isWindows = widget.device.type.toLowerCase().contains('windows') || (widget.device.model?.toLowerCase().contains('windows') ?? false) || (isPc && widget.device.name.toLowerCase().contains('win'));
    final isNas = widget.device.type.toLowerCase() == 'nas' || widget.device.sharesFolders;
    
    final isPoweredOn = widget.device.status.isOn;

    return SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
             // Header Card
             GlassContainer(
               padding: const EdgeInsets.all(24),
               child: Row(
                 children: [
                   Hero(
                     tag: 'device_icon_${widget.device.id}',
                     child: Container(
                       padding: const EdgeInsets.all(16),
                       decoration: BoxDecoration(
                         color: isPoweredOn ? Colors.cyan.withOpacity(0.2) : Colors.grey.withOpacity(0.1),
                         shape: BoxShape.circle,
                       ),
                       child: Icon(
                         _getDeviceIcon(widget.device.type),
                         size: 48,
                         color: isPoweredOn ? Colors.cyanAccent : (isDark ? Colors.white54 : Colors.black54),
                       ),
                     ),
                   ),
                   const SizedBox(width: 20),
                   Expanded(
                     child: Column(
                       crossAxisAlignment: CrossAxisAlignment.start,
                       children: [
                         Hero(
                           tag: 'device_name_${widget.device.id}',
                           child: Material(
                             color: Colors.transparent,
                             child: Text(
                               widget.device.name,
                               style: const TextStyle(
                                 fontSize: 22,
                                 fontWeight: FontWeight.bold,
                               ),
                               maxLines: 2,
                               overflow: TextOverflow.ellipsis,
                             ),
                           ),
                         ),
                         const SizedBox(height: 4),
                         Text(
                           widget.device.type.toUpperCase(),
                           style: TextStyle(
                             color: isDark ? Colors.white60 : Colors.black54,
                             fontSize: 12,
                             letterSpacing: 1.0,
                             fontWeight: FontWeight.w600,
                           ),
                         ),
                         if (widget.device.status.currentPower != null) ...[
                           const SizedBox(height: 8),
                           Container(
                              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                              decoration: BoxDecoration(
                                color: Colors.orange.withOpacity(0.15),
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  const Icon(Icons.bolt, color: Colors.orange, size: 14),
                                  const SizedBox(width: 4),
                                  Text(
                                    "${widget.device.status.currentPower} W",
                                    style: const TextStyle(color: Colors.orange, fontSize: 12, fontWeight: FontWeight.bold),
                                  ),
                                ],
                              )
                           )
                         ]
                       ],
                     ),
                   ),
                   if (!isSensor && !isLock && !isCamera && !isPrinter && widget.device.status.value == null)
                     GestureDetector(
                      onTap: () => _sendCommand('toggle'),
                      child: Container(
                        width: 60,
                        height: 60,
                        decoration: BoxDecoration(
                          shape: BoxShape.circle,
                          color: isPoweredOn ? Colors.cyan : Colors.transparent,
                          border: Border.all(
                            color: isPoweredOn ? Colors.cyan : (isDark ? Colors.white24 : Colors.black26),
                            width: 2,
                          ),
                          boxShadow: isPoweredOn ? [
                            BoxShadow(color: Colors.cyan.withOpacity(0.4), blurRadius: 12, spreadRadius: 2)
                          ] : [],
                        ),
                        child: Icon(
                          Icons.power_settings_new,
                          color: isPoweredOn ? Colors.white : (isDark ? Colors.white60 : Colors.black54),
                          size: 30,
                        ),
                      ),
                     ),
                 ],
               ),
             ),
             
             const SizedBox(height: 24),

              // --- LOGIC ENGINE / SENSOR VALUE ---
              if (widget.device.status.value != null)
                GlassContainer(
                   padding: const EdgeInsets.symmetric(vertical: 20),
                   child: Center(
                     child: Text(
                        "${widget.device.status.value}",
                        style: const TextStyle(
                          fontSize: 32, 
                          fontWeight: FontWeight.bold, 
                        ),
                      ),
                   ),
                ),

              if (isLock) ...[
                 Center(
                   child: GestureDetector(
                    onTap: () => _sendCommand(widget.device.status.isLocked == true ? 'unlock' : 'lock'),
                    child: AnimatedContainer(
                      duration: const Duration(milliseconds: 300),
                      width: 160,
                      height: 160,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        color: widget.device.status.isLocked == true ? Colors.red.withOpacity(0.1) : Colors.green.withOpacity(0.1),
                        border: Border.all(
                          color: widget.device.status.isLocked == true ? Colors.red : Colors.green,
                          width: 4,
                        ),
                        boxShadow: [
                          BoxShadow(
                            color: (widget.device.status.isLocked == true ? Colors.red : Colors.green).withOpacity(0.2),
                            blurRadius: 30,
                            spreadRadius: 5,
                          )
                        ],
                      ),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            widget.device.status.isLocked == true ? Icons.lock : Icons.lock_open,
                            size: 60,
                            color: widget.device.status.isLocked == true ? Colors.red : Colors.green,
                          ),
                          const SizedBox(height: 10),
                          Text(
                            widget.device.status.isLocked == true ? "LOCKED" : "UNLOCKED",
                            style: TextStyle(
                               fontWeight: FontWeight.bold,
                               color: widget.device.status.isLocked == true ? Colors.red : Colors.green,
                               letterSpacing: 1.5,
                            )
                          )
                        ],
                      ),
                    ),
                  ),
                 ),
                 const SizedBox(height: 30),
              ],

              // --- PC / NAS Controls ---
              if (isPc || isNas) ...[
                 Row(
                   children: [
                     if (isWindows)
                       Expanded(child: _actionButton("Remote Desktop", Icons.desktop_windows, () async {
                          final url = Uri.parse('https://remotedesktop.google.com/access/');
                          if (await canLaunchUrl(url)) {
                            await launchUrl(url, mode: LaunchMode.externalApplication);
                          }
                       })),
                     if (isWindows && (isPc || isNas)) const SizedBox(width: 16),
                     
                     if (isPc && widget.device.wolConfigured)
                       Expanded(child: _actionButton("Wake on LAN", Icons.power, () async {
                          await _sendCommand('wake');
                          if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Wake requested')));
                       })),
                     if ((isPc || isWindows) && (isNas || widget.device.sharesFolders)) const SizedBox(width: 16),

                     if (isNas || widget.device.sharesFolders)
                       Expanded(child: _actionButton("Browse Files", Icons.folder, () {
                          Navigator.push(
                            context,
                            MaterialPageRoute(
                              builder: (context) => NasBrowserScreen(
                                nasId: widget.device.id,
                                nasName: widget.device.name,
                              ),
                            ),
                          );
                       })),
                   ],
                 ),
                 const SizedBox(height: 24),
              ],

              // --- Thermostat Controls ---
              if (isThermostat) ...[
                GlassContainer(
                  child: Column(
                    children: [
                      Text(
                        "${widget.device.status.targetTemperature ?? 21}°C",
                        style: const TextStyle(fontSize: 56, fontWeight: FontWeight.bold),
                      ),
                      Text("Target Temperature", style: TextStyle(color: isDark ? Colors.white54 : Colors.black54)),
                      const SizedBox(height: 20),
                      SliderTheme(
                        data: SliderTheme.of(context).copyWith(
                           trackHeight: 20,
                           thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 16),
                           activeTrackColor: Colors.cyanAccent,
                           inactiveTrackColor: Colors.grey.withOpacity(0.2),
                        ),
                        child: Slider(
                          value: (widget.device.status.targetTemperature ?? 21).clamp(10, 30),
                          min: 10,
                          max: 30,
                          divisions: 40,
                          onChanged: (val) {
                            // Optimistic
                          },
                          onChangeEnd: (val) => _sendCommand('set_temperature', {'value': val}),
                        ),
                      ),
                      const SizedBox(height: 24),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                        children: [
                          _modeButton('Heat', Icons.local_fire_department, Colors.redAccent),
                          _modeButton('Cool', Icons.ac_unit, Colors.cyanAccent),
                          _modeButton('Auto', Icons.hdr_auto, Colors.greenAccent),
                          _modeButton('Off', Icons.power_off, isDark ? Colors.white54 : Colors.black54),
                        ],
                      ),
                    ],
                  ),
                ),
              ],

              // --- Cover Controls ---
              if (isCover) ...[
                GlassContainer(
                   child: Column(
                     children: [
                        Text("Position ${widget.device.status.position ?? 0}%", style: TextStyle(color: isDark ? Colors.white54 : Colors.black54)),
                        const SizedBox(height: 10),
                        _buildSlider(
                          (widget.device.status.position ?? 0).toDouble().clamp(0, 100),
                           0, 100,
                           (val) {},
                           (val) => _sendCommand('set_position', {'value': val.toInt()}),
                           icon: Icons.curtains,
                           activeColor: Colors.cyanAccent
                        ),
                        const SizedBox(height: 24),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            _actionButton("Open", Icons.arrow_upward, () => _sendCommand('open')),
                            _actionButton("Stop", Icons.stop, () => _sendCommand('stop'), color: Colors.redAccent),
                            _actionButton("Close", Icons.arrow_downward, () => _sendCommand('close')),
                          ],
                        ),
                     ],
                   )
                ),
              ],

              // --- Vacuum Controls ---
              if (isVacuum) ...[
                GlassContainer(
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _actionButton("Start", Icons.play_arrow, () => _sendCommand('start')),
                      _actionButton("Pause", Icons.pause, () => _sendCommand('pause')),
                      _actionButton("Dock", Icons.home, () => _sendCommand('dock')),
                    ],
                  ),
                ),
              ],

              // --- Camera Controls ---
              if (isCamera) ...[
                Container(
                  height: 260,
                  width: double.infinity,
                  decoration: BoxDecoration(
                    color: Colors.black,
                    borderRadius: BorderRadius.circular(24),
                    border: Border.all(color: Colors.white24),
                    boxShadow: const [BoxShadow(color: Colors.black26, blurRadius: 10, offset: Offset(0, 4))],
                  ),
                  child: ClipRRect(
                    borderRadius: BorderRadius.circular(24),
                    child: _webViewController != null
                        ? WebViewWidget(controller: _webViewController!)
                        : const Center(
                            child: Column(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                CircularProgressIndicator(color: Colors.cyanAccent),
                                SizedBox(height: 16),
                                Text("Connecting...", style: TextStyle(color: Colors.white70)),
                              ],
                            ),
                          ),
                  ),
                ),
                const SizedBox(height: 20),
                GlassContainer(
                   padding: const EdgeInsets.symmetric(vertical: 16),
                   child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                    children: [
                      _actionButton("Snapshot", Icons.camera_alt, () => _sendCommand('snapshot')),
                      _actionButton("Record", Icons.fiber_manual_record, () => _sendCommand('record'), color: Colors.redAccent),
                      _actionButton("Home", Icons.home, () => _sendCommand('ptz_home')),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                _buildCameraControls(),
              ],

              // --- PS5 Controls ---
              if (isPs5) ...[
                GlassContainer(padding: const EdgeInsets.all(16), child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    Expanded(child: _actionButton("Wake", Icons.power, () async {
                       try {
                         await _apiService.wakePs5(widget.device.id);
                         if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Wake command sent')));
                       } catch (e) {
                         if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                       }
                    })),
                    const SizedBox(width: 20),
                    Expanded(child: _actionButton("Standby", Icons.power_off, () async {
                       try {
                         await _apiService.standbyPs5(widget.device.id);
                         if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Standby command sent')));
                       } catch (e) {
                         if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('Error: $e')));
                       }
                    })),
                  ],
                )),
                const SizedBox(height: 20),
                GlassContainer(
                  child: Column(
                    children: [
                      IconButton(icon: Icon(Icons.keyboard_arrow_up, size: 40, color: isDark ? Colors.white : Colors.black), onPressed: () => _sendCommand('up')),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          IconButton(icon: Icon(Icons.keyboard_arrow_left, size: 40, color: isDark ? Colors.white : Colors.black), onPressed: () => _sendCommand('left')),
                          const SizedBox(width: 40),
                          IconButton(icon: Icon(Icons.circle_outlined, size: 40, color: isDark ? Colors.white : Colors.black), onPressed: () => _sendCommand('enter')),
                          const SizedBox(width: 40),
                          IconButton(icon: Icon(Icons.keyboard_arrow_right, size: 40, color: isDark ? Colors.white : Colors.black), onPressed: () => _sendCommand('right')),
                        ],
                      ),
                      IconButton(icon: Icon(Icons.keyboard_arrow_down, size: 40, color: isDark ? Colors.white : Colors.black), onPressed: () => _sendCommand('down')),
                    ],
                  ),
                ),
                const SizedBox(height: 20),
                GlassContainer(child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _actionButton("Back", Icons.arrow_back, () => _sendCommand('back')),
                    _actionButton("Home", Icons.home, () => _sendCommand('home')),
                  ],
                )),
                const SizedBox(height: 20),
              ],

              // --- Printer Controls ---
              if (isPrinter) ...[
                if (widget.device.status.printerStatus != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 20),
                    child: GlassContainer(child: Center(
                      child: Text(
                        "Status: ${widget.device.status.printerStatus}",
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold),
                      ),
                    )),
                  ),
                  
                if (widget.device.status.inks != null)
                  GlassContainer(
                    child: Column(
                      children: [
                         ...widget.device.status.inks!.map((ink) {
                            return Padding(
                              padding: const EdgeInsets.only(bottom: 16.0),
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text("${ink['label'] ?? ink['color'] ?? 'Ink'} (${ink['level'] ?? 0}%)", style: const TextStyle(fontWeight: FontWeight.w500)),
                                  const SizedBox(height: 8),
                                  ClipRRect(
                                    borderRadius: BorderRadius.circular(8),
                                    child: LinearProgressIndicator(
                                      value: (ink['level'] ?? 0) / 100.0,
                                      backgroundColor: isDark ? Colors.grey[800] : Colors.grey[300],
                                      valueColor: AlwaysStoppedAnimation<Color>(
                                        _getInkColor(ink['color']?.toString() ?? '')
                                      ),
                                      minHeight: 12,
                                    ),
                                  ),
                                  // Simplified logic for brevity in replace
                                ],
                              ),
                            );
                         })
                      ],
                    ),
                  ),
              ],

              // --- Sensor Display ---
              if (isSensor) ...[
                Wrap(
                  spacing: 16,
                  runSpacing: 16,
                  children: [
                    if (widget.device.status.temperature != null)
                      _sensorTile("Temperature", "${widget.device.status.temperature}°C", Icons.thermostat),
                    if (widget.device.status.humidity != null)
                      _sensorTile("Humidity", "${widget.device.status.humidity}%", Icons.water_drop),
                    if (widget.device.status.battery != null)
                      _sensorTile("Battery", "${widget.device.status.battery}%", Icons.battery_std),
                  ],
                ),
              ],

              // --- Light Controls ---
              if (isLight && isPoweredOn) ...[
                _buildLightControls(),
              ],

              // --- Media/Volume Controls ---
              if (isSpeaker && isPoweredOn) ...[
                GlassContainer(
                   padding: const EdgeInsets.all(24),
                   child: Column(
                     children: [
                        // Album Art
                        Container(
                          width: 180,
                          height: 180,
                          decoration: BoxDecoration(
                            color: isDark ? Colors.black26 : Colors.black12,
                            borderRadius: BorderRadius.circular(20),
                            boxShadow: [BoxShadow(color: Colors.black12, blurRadius: 15, spreadRadius: 2)],
                            image: widget.device.status.app != null ? null : null, // Could add placeholder image logic
                          ),
                          child: Icon(
                            Icons.music_note, 
                            size: 80, 
                            color: widget.device.status.app?.toLowerCase().contains('spotify') == true 
                                ? Colors.greenAccent 
                                : isDark ? Colors.white24 : Colors.black26
                          ),
                        ),
                        const SizedBox(height: 24),
                        Text(
                            widget.device.status.title ?? "No Media Playing",
                            style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold),
                            textAlign: TextAlign.center,
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 8),
                        if (widget.device.status.artist != null)
                           Text(
                              widget.device.status.artist!,
                              style: TextStyle(color: isDark ? Colors.white60 : Colors.black54, fontSize: 16),
                              textAlign: TextAlign.center,
                              maxLines: 1,
                           ),
                        const SizedBox(height: 30),
                        // Progress / Volume
                         _buildSlider(
                           _currentVolume.clamp(0, 100), 0, 100,
                           (v) => setState(() => _currentVolume = v),
                           (v) => _sendCommand('set_volume', {'value': v.toInt()}),
                           icon: Icons.volume_up,
                           activeColor: Colors.cyanAccent
                         ),
                        const SizedBox(height: 30),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                             _mediaButton(Icons.skip_previous, () => _sendCommand('previous')),
                             Container(
                               decoration: BoxDecoration(color: Colors.cyanAccent.withOpacity(0.2), shape: BoxShape.circle),
                               child: _mediaButton(Icons.play_arrow, () => _sendCommand('play'), size: 40, color: Colors.cyanAccent),
                             ),
                             _mediaButton(Icons.pause, () => _sendCommand('pause')),
                             _mediaButton(Icons.skip_next, () => _sendCommand('next')),
                          ],
                        )
                     ],
                   ),
                ),
                const SizedBox(height: 20),
                Center(
                  child: GlassContainer(child: TextButton.icon(
                    icon: const Icon(Icons.speaker_group, color: Colors.green),
                    label: const Text('Select Spotify Device', style: TextStyle(color: Colors.green, fontWeight: FontWeight.bold)),
                    onPressed: _showSpotifyDevicesDialog,
                  )),
                ),
              ],

              // --- TV Remote Controls ---
              if (isTv && isPoweredOn) ...[
                GlassContainer(child: _buildRemoteControl()),
                const SizedBox(height: 16),
                GlassContainer(child: Row(
                  mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                  children: [
                    _actionButton('Source', Icons.input, () => _showInputDialog()),
                    _actionButton('Wake', Icons.power, () async {
                        await _sendCommand('wake'); 
                        if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Wake requested')));
                    }),
                  ],
                )),
              ],
              
              const SizedBox(height: 50),
            ],
        ),
    );
  }

  Color _getInkColor(String colorCode) {
    switch (colorCode.toUpperCase()) {
      case 'C': return Colors.cyan;
      case 'M': return const Color(0xFFFF00FF);
      case 'Y': return Colors.yellow;
      case 'K': return Colors.black;
      default: return Colors.grey;
    }
  }

  Widget _modeButton(String label, IconData icon, Color color) {
    final isSelected = widget.device.status.mode?.toLowerCase() == label.toLowerCase();
    return Column(
      children: [
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: isSelected ? color.withOpacity(0.2) : Colors.transparent,
            shape: BoxShape.circle,
            border: Border.all(color: isSelected ? color : Colors.grey.withOpacity(0.5))
          ),
          child: InkWell(
            onTap: () => _sendCommand('set_mode', {'value': label.toLowerCase()}),
             child: Icon(icon, color: isSelected ? color : Colors.grey, size: 28),
          ),
        ),
        const SizedBox(height: 8),
        Text(label, style: TextStyle(color: isSelected ? color : Colors.grey, fontSize: 12, fontWeight: FontWeight.w600)),
      ],
    );
  }

  Widget _actionButton(String label, IconData icon, VoidCallback onTap, {Color? color}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    return InkWell(
      onTap: onTap,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              color: (color ?? (isDark ? Colors.white : Colors.black)).withOpacity(0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Icon(icon, color: color ?? (isDark ? Colors.white : Colors.black87), size: 26),
          ),
          const SizedBox(height: 8),
          Text(label, style: TextStyle(color: isDark ? Colors.white70 : Colors.black54, fontSize: 12, fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }

  Widget _sensorTile(String label, String value, IconData icon) {
    return Container(
      width: 100, // Fixed width for grid look
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).brightness == Brightness.dark ? Colors.white.withOpacity(0.1) : Colors.black.withOpacity(0.05),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Column(
        children: [
          Icon(icon, color: Colors.cyanAccent, size: 28),
          const SizedBox(height: 8),
          Text(value, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          Text(label, style: const TextStyle(fontSize: 10, color: Colors.grey), textAlign: TextAlign.center),
        ],
      ),
    );
  }

  Widget _mediaButton(IconData icon, VoidCallback onTap, {double size = 32, Color? color}) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return IconButton(
      icon: Icon(icon, color: color ?? (isDark ? Colors.white : Colors.black87)),
      iconSize: size,
      onPressed: onTap,
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
        Stack(
          alignment: Alignment.center,
          children: [
             // D-Pad Background
             Container(
               width: 200, height: 200,
               decoration: BoxDecoration(
                 shape: BoxShape.circle,
                 color: (Theme.of(context).brightness == Brightness.dark ? Colors.white : Colors.black).withOpacity(0.05),
               ),
             ),
             Positioned(top: 10, child: _dpadBtn(Icons.keyboard_arrow_up, 'up')),
             Positioned(bottom: 10, child: _dpadBtn(Icons.keyboard_arrow_down, 'down')),
             Positioned(left: 10, child: _dpadBtn(Icons.keyboard_arrow_left, 'left')),
             Positioned(right: 10, child: _dpadBtn(Icons.keyboard_arrow_right, 'right')),
             GestureDetector(
                onTap: () => _sendCommand('select'),
                child: Container(
                  width: 60, height: 60,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: Colors.cyanAccent.withOpacity(0.3),
                    boxShadow: [BoxShadow(color: Colors.cyanAccent.withOpacity(0.2), blurRadius: 10)]
                  ),
                  child: const Center(child: Text("OK", style: TextStyle(fontWeight: FontWeight.bold))),
                ),
             )
          ],
        ),
      ],
    );
  }

  Widget _remoteBtn(IconData icon, String cmd) {
    return _actionButton("", icon, () => _sendCommand(cmd));
  }

  Widget _dpadBtn(IconData icon, String cmd) {
    return IconButton(
      icon: Icon(icon),
      iconSize: 40,
      onPressed: () => _sendCommand(cmd),
    );
  }

  Widget _buildCameraControls() {
    return GlassContainer(
      child: Column(
        children: [
          const Text("PTZ Control", style: TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 20),
          Stack(
            alignment: Alignment.center,
            children: [
               Container(width: 180, height: 180, decoration: BoxDecoration(shape: BoxShape.circle, color: Colors.black.withOpacity(0.3))),
               Positioned(top: 0, child: _dpadBtn(Icons.keyboard_arrow_up, 'nudge_up')),
               Positioned(bottom: 0, child: _dpadBtn(Icons.keyboard_arrow_down, 'nudge_down')),
               Positioned(left: 0, child: _dpadBtn(Icons.keyboard_arrow_left, 'nudge_left')),
               Positioned(right: 0, child: _dpadBtn(Icons.keyboard_arrow_right, 'nudge_right')),
               IconButton(icon: const Icon(Icons.stop_circle, color: Colors.redAccent, size: 40), onPressed: () => _sendCommand('stop'))
            ],
          )
        ],
      )
    );
  }

  IconData _getDeviceIcon(String type) {
    switch (type.toLowerCase()) {
      case 'light': case 'bulb': return Icons.lightbulb;
      case 'switch': case 'outlet': case 'plug': return Icons.power;
      case 'tv': return Icons.tv;
      case 'speaker': return Icons.speaker;
      case 'camera': return Icons.videocam;
      case 'printer': return Icons.print;
      case 'thermostat': case 'ac': case 'climate': return Icons.thermostat;
      case 'lock': case 'security': return Icons.lock;
      case 'cover': case 'blind': case 'curtain': return Icons.curtains;
      case 'vacuum': case 'robot': return Icons.cleaning_services;
      case 'sensor': return Icons.sensors;
      case 'fan': return Icons.mode_fan_off;
      default: return Icons.devices;
    }
  }
}

class GlassContainer extends StatelessWidget {
  final Widget child;
  final EdgeInsetsGeometry? padding;
  final double? width;
  final double? height;

  const GlassContainer({super.key, required this.child, this.padding, this.width, this.height});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return ClipRRect(
      borderRadius: BorderRadius.circular(24),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
        child: Container(
          width: width,
          height: height,
          padding: padding ?? const EdgeInsets.all(16.0),
          decoration: BoxDecoration(
            color: (isDark ? Colors.white : Colors.black).withOpacity(0.07),
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: (isDark ? Colors.white : Colors.black).withOpacity(0.1),
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}
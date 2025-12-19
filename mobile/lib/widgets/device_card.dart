import 'package:flutter/material.dart';
import '../models/device.dart';
import '../services/api_service.dart';
import '../screens/device_detail_screen.dart';

class DeviceCard extends StatelessWidget {
  final Device device;
  final VoidCallback onRefresh;
  final ApiService apiService = ApiService();

  DeviceCard({super.key, required this.device, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final isPoweredOn = device.status.isOn;
    final isLight = device.type.toLowerCase() == 'light' || device.type.toLowerCase().contains('bulb');
    final isMedia = !isLight;
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    final subTextColor = Theme.of(context).textTheme.bodyMedium?.color ?? Colors.black54;
    final iconColorOff = isDark ? Colors.white54 : Colors.black45;
    final accentColor = isDark ? Colors.cyanAccent : Colors.blueAccent;

    return GestureDetector(
      behavior: HitTestBehavior.opaque,
      onTap: () {
        Navigator.of(context).push(
          MaterialPageRoute(
            builder: (context) => DeviceDetailScreen(
              device: device,
              onRefresh: onRefresh,
            ),
          ),
        );
      },
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Icon + Name
                Expanded(
                  child: Row(
                    children: [
                      Hero(
                        tag: 'device_icon_${device.id}',
                        child: Icon(
                          _getDeviceIcon(device.type),
                          size: 40,
                          color: isPoweredOn ? accentColor : iconColorOff,
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Hero(
                              tag: 'device_name_${device.id}',
                              child: Material(
                                color: Colors.transparent,
                                child: Text(
                                  device.name,
                                  style: Theme.of(context).textTheme.titleLarge?.copyWith(
                                    fontWeight: FontWeight.bold,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ),
                            Text(
                              device.type,
                              style: TextStyle(color: subTextColor),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                // Quick Power Button
                IconButton(
                  icon: Icon(
                    Icons.power_settings_new,
                    color: isPoweredOn ? accentColor : iconColorOff.withValues(alpha: 0.3),
                    size: 32,
                  ),
                  onPressed: () async {
                    await apiService.sendCommand(device.id, 'toggle');
                    onRefresh();
                  },
                ),
              ],
            ),
            
            // Quick Status Info (if on)
            if (isPoweredOn) ...[
              const SizedBox(height: 12),
              Divider(color: (isDark ? Colors.white : Colors.black).withValues(alpha: 0.1)),
              if (isMedia && device.status.title != null && device.status.title!.isNotEmpty)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 8.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        device.status.title!,
                        style: const TextStyle(fontWeight: FontWeight.bold, color: Colors.white),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      if (device.status.artist != null && device.status.artist!.isNotEmpty)
                        Text(
                          device.status.artist!,
                          style: const TextStyle(color: Colors.white70, fontSize: 12),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                    ],
                  ),
                ),
              
              // Hint to tap
              const Center(
                child: Text(
                  "Tap for controls",
                  style: TextStyle(color: Colors.white30, fontSize: 12),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  IconData _getDeviceIcon(String type) {
    switch (type.toLowerCase()) {
      case 'light':
      case 'bulb':
      case 'dali':
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
      case 'ps5':
      case 'console':
      case 'game':
      case 'playstation':
        return Icons.gamepad;
      default:
        return Icons.devices;
    }
  }
}

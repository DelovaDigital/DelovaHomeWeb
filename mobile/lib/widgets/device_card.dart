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
        padding: const EdgeInsets.all(12.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Icon
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: isPoweredOn ? accentColor.withValues(alpha: 0.2) : Colors.white.withValues(alpha: 0.05),
                    shape: BoxShape.circle,
                  ),
                  child: Hero(
                    tag: 'device_icon_${device.id}',
                    child: Icon(
                      _getDeviceIcon(device.type),
                      size: 24,
                      color: isPoweredOn ? accentColor : Colors.white70,
                    ),
                  ),
                ),
                // Power Button
                SizedBox(
                  width: 32,
                  height: 32,
                  child: IconButton(
                    padding: EdgeInsets.zero,
                    icon: Icon(
                      Icons.power_settings_new,
                      color: isPoweredOn ? accentColor : Colors.white30,
                      size: 20,
                    ),
                    onPressed: () async {
                      String cmd = 'toggle';
                      final type = device.type.toLowerCase();
                      
                      // WoL Logic for PC/NAS/RPi
                      if (!isPoweredOn && (
                          type == 'pc' || type == 'computer' || type == 'workstation' ||
                          type == 'nas' || type == 'server' ||
                          type == 'rpi' || type == 'raspberry' || type == 'raspberrypi'
                      )) {
                        cmd = 'wake';
                      }
                      // PS5 Logic
                      else if (type == 'ps5' || type == 'console') {
                        cmd = isPoweredOn ? 'standby' : 'wake';
                      }

                      await apiService.sendCommand(device.id, cmd);
                      onRefresh();
                    },
                  ),
                ),
              ],
            ),
            
            const Spacer(),

            // Name & Status
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Hero(
                  tag: 'device_name_${device.id}',
                  child: Material(
                    color: Colors.transparent,
                    child: Text(
                      device.name,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.bold,
                        color: Colors.white,
                      ),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  isPoweredOn 
                    ? (device.status.title ?? 'On') 
                    : 'Off',
                  style: TextStyle(
                    color: isPoweredOn ? Colors.white70 : Colors.white38,
                    fontSize: 12,
                  ),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ],
            ),
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
      case 'pc':
      case 'computer':
      case 'desktop':
      case 'workstation':
      case 'mac':
      case 'macbook':
      case 'imac':
      case 'windows':
        return Icons.computer;
      case 'nas':
      case 'server':
      case 'synology':
      case 'qnap':
        return Icons.dns;
      case 'rpi':
      case 'raspberry':
      case 'raspberrypi':
      case 'pi':
        return Icons.memory;
      default:
        return Icons.devices;
    }
  }
}

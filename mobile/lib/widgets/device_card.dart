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
    final isDark = Theme.of(context).brightness == Brightness.dark;
    
    final accentColor = isDark ? Colors.cyanAccent : Colors.blueAccent;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final iconBgColor = isDark ? Colors.white.withValues(alpha: 0.05) : Colors.grey.withValues(alpha: 0.1);
    final iconColor = isDark ? Colors.white70 : Colors.black54;

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
                    color: isPoweredOn ? accentColor.withValues(alpha: 0.2) : iconBgColor,
                    shape: BoxShape.circle,
                  ),
                  child: Hero(
                    tag: 'device_icon_${device.id}',
                    child: Icon(
                      _getDeviceIcon(device.type),
                      size: 24,
                      color: isPoweredOn ? accentColor : iconColor,
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
                      color: isPoweredOn ? accentColor : iconColor.withValues(alpha: 0.5),
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
            
            const SizedBox(height: 12),

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
                        color: textColor,
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
                    color: isPoweredOn ? subTextColor : subTextColor.withValues(alpha: 0.6),
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
    final t = type.toLowerCase();
    final name = device.name.toLowerCase();
    final model = device.model?.toLowerCase() ?? '';

    if (t == 'light' || t.contains('bulb') || t == 'hue' || t == 'dali') return Icons.lightbulb;
    if (t == 'switch' || t.contains('outlet') || t == 'shelly' || t == 'plug') return Icons.power;
    if (t == 'tv' || t == 'television') {
      if (name.contains('apple') || name.contains('atv') || model.contains('apple') || model.contains('tv')) return Icons.apple;
      return Icons.tv;
    }
    if (t == 'speaker' || t == 'sonos') {
      if (name.contains('homepod') || model.contains('homepod')) return Icons.speaker;
      if (name.contains('apple') || name.contains('atv') || name.contains('mac') || model.contains('apple') || model.contains('mac')) return Icons.apple;
      return Icons.speaker;
    }
    if (t == 'camera') return Icons.videocam;
    if (t == 'printer') return Icons.print;
    if (t == 'thermostat' || t == 'ac' || t == 'climate') return Icons.thermostat;
    if (t == 'lock' || t == 'security') return Icons.lock;
    if (t == 'cover' || t == 'blind' || t == 'curtain') return Icons.curtains;
    if (t == 'vacuum' || t == 'robot') return Icons.cleaning_services;
    if (t == 'sensor') return Icons.sensors;
    if (t == 'fan') return Icons.mode_fan_off;
    
    if (t == 'ps5' || t == 'console' || t == 'game' || t == 'playstation' || t == 'xbox') {
      if (name.contains('ps5') || name.contains('playstation') || t == 'ps5' || model.contains('ps5')) return Icons.gamepad;
      if (name.contains('xbox') || t == 'xbox' || model.contains('xbox')) return Icons.gamepad;
      return Icons.gamepad;
    }

    if (t == 'nas' || t == 'server' || t == 'synology' || t == 'qnap') return Icons.dns;
    
    if (t == 'pc' || t == 'computer' || t == 'desktop' || t == 'workstation' || t == 'mac' || t == 'macbook' || t == 'imac' || t == 'windows') {
       if (t == 'mac' || name.contains('mac') || name.contains('apple') || model.contains('mac') || model.contains('apple')) return Icons.laptop_mac;
       if (name.contains('windows') || name.contains('pc') || model.contains('windows')) return Icons.desktop_windows;
       return Icons.computer;
    }

    if (t == 'rpi' || t == 'raspberry' || t == 'raspberrypi' || t == 'pi') return Icons.memory;
    
    return Icons.devices;
  }
}

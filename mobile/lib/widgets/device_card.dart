import 'package:flutter/material.dart';
import '../models/device.dart';
import '../services/api_service.dart';

class DeviceCard extends StatelessWidget {
  final Device device;
  final VoidCallback onRefresh;
  final ApiService apiService = ApiService();

  DeviceCard({super.key, required this.device, required this.onRefresh});

  @override
  Widget build(BuildContext context) {
    final isPoweredOn = device.status.isOn;
    final isLight = device.type.toLowerCase() == 'light' || device.type.toLowerCase().contains('bulb');
    final isMedia = !isLight; // Assume everything else is media for now

    return Card(
      margin: const EdgeInsets.all(8.0),
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        device.name,
                        style: Theme.of(context).textTheme.titleLarge,
                        overflow: TextOverflow.ellipsis,
                      ),
                      Text(
                        device.type,
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(color: Colors.grey),
                      ),
                    ],
                  ),
                ),
                IconButton(
                  icon: Icon(
                    Icons.power_settings_new,
                    color: isPoweredOn ? Colors.green : Colors.red,
                    size: 32,
                  ),
                  onPressed: () async {
                    await apiService.sendCommand(device.id, 'toggle');
                    onRefresh();
                  },
                ),
              ],
            ),
            if (isPoweredOn) ...[
              const Divider(),
              
              // Media Info
              if (isMedia && device.status.title != null) ...[
                Text(
                  device.status.title!,
                  style: const TextStyle(fontWeight: FontWeight.bold),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                if (device.status.artist != null) 
                  Text(
                    device.status.artist!,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                const SizedBox(height: 8),
              ],

              // Media Controls
              if (isMedia)
                Row(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconButton(
                      icon: const Icon(Icons.skip_previous),
                      onPressed: () async {
                        await apiService.sendCommand(device.id, 'previous');
                        onRefresh();
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.play_arrow),
                      onPressed: () async {
                        await apiService.sendCommand(device.id, 'play');
                        onRefresh();
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.pause),
                      onPressed: () async {
                        await apiService.sendCommand(device.id, 'pause');
                        onRefresh();
                      },
                    ),
                    IconButton(
                      icon: const Icon(Icons.skip_next),
                      onPressed: () async {
                        await apiService.sendCommand(device.id, 'next');
                        onRefresh();
                      },
                    ),
                  ],
                ),

              // Volume Control
              if (isMedia)
                Row(
                  children: [
                    const Icon(Icons.volume_down),
                    Expanded(
                      child: Slider(
                        value: device.status.volume.clamp(0, 100),
                        min: 0,
                        max: 100,
                        onChanged: (value) {}, // Optimistic update?
                        onChangeEnd: (value) async {
                          await apiService.sendCommand(device.id, 'set_volume', {'value': value.toInt()});
                          onRefresh();
                        },
                      ),
                    ),
                    const Icon(Icons.volume_up),
                  ],
                ),

              // Brightness Control
              if (isLight)
                Row(
                  children: [
                    const Icon(Icons.brightness_low),
                    Expanded(
                      child: Slider(
                        value: device.status.brightness.clamp(0, 100),
                        min: 0,
                        max: 100,
                        activeColor: Colors.orange,
                        onChanged: (value) {},
                        onChangeEnd: (value) async {
                          await apiService.sendCommand(device.id, 'set_brightness', {'value': value.toInt()});
                          onRefresh();
                        },
                      ),
                    ),
                    const Icon(Icons.brightness_high),
                  ],
                ),
            ],
          ],
        ),
      ),
    );
  }
}

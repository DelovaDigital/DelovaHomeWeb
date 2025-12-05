import 'package:flutter/material.dart';
import '../models/device.dart';
import '../widgets/device_card.dart';

class RoomDetailScreen extends StatelessWidget {
  final String roomName;
  final List<Device> devices;
  final VoidCallback onRefresh;

  const RoomDetailScreen({
    super.key,
    required this.roomName,
    required this.devices,
    required this.onRefresh,
  });

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text(roomName, style: const TextStyle(color: Colors.white)),
        backgroundColor: Colors.transparent,
        iconTheme: const IconThemeData(color: Colors.white),
      ),
      body: devices.isEmpty
          ? const Center(child: Text("No devices in this room", style: TextStyle(color: Colors.grey)))
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                childAspectRatio: 0.85,
                crossAxisSpacing: 16,
                mainAxisSpacing: 16,
              ),
              itemCount: devices.length,
              itemBuilder: (context, index) {
                return DeviceCard(
                  device: devices[index],
                  onRefresh: onRefresh,
                );
              },
            ),
    );
  }
}

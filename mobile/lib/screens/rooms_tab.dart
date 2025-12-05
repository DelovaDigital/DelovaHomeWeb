import 'dart:async';
import 'package:flutter/material.dart';
import '../models/device.dart';
import '../services/api_service.dart';
import '../widgets/device_card.dart';

class RoomsTab extends StatefulWidget {
  const RoomsTab({super.key});

  @override
  State<RoomsTab> createState() => _RoomsTabState();
}

class _RoomsTabState extends State<RoomsTab> {
  final ApiService _apiService = ApiService();
  Map<String, List<Device>> _rooms = {};
  bool _isLoading = true;
  String? _error;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    _fetchDevices();
    _timer = Timer.periodic(const Duration(seconds: 5), (timer) {
      _fetchDevices(silent: true);
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _fetchDevices({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _isLoading = true;
        _error = null;
      });
    }

    try {
      final devices = await _apiService.getDevices();
      final Map<String, List<Device>> grouped = {};
      
      for (var device in devices) {
        final room = device.room ?? 'Unassigned';
        if (!grouped.containsKey(room)) {
          grouped[room] = [];
        }
        grouped[room]!.add(device);
      }

      if (mounted) {
        setState(() {
          _rooms = grouped;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          if (!silent) _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Error: $_error'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => _fetchDevices(),
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    return RefreshIndicator(
      onRefresh: () => _fetchDevices(),
      child: ListView.builder(
        itemCount: _rooms.length,
        itemBuilder: (context, index) {
          final roomName = _rooms.keys.elementAt(index);
          final devices = _rooms[roomName]!;
          
          return ExpansionTile(
            title: Text(roomName, style: const TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
            initiallyExpanded: true,
            children: devices.map((device) => DeviceCard(
              device: device,
              onRefresh: () => _fetchDevices(silent: true),
            )).toList(),
          );
        },
      ),
    );
  }
}

import 'package:flutter/material.dart';

class EnergyWidget extends StatelessWidget {
  final Map<String, dynamic> data;

  const EnergyWidget({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    final grid = data['grid'] ?? {};
    final solar = data['solar'] ?? {};
    final home = data['home'] ?? {};

    final gridPower = (grid['currentPower'] ?? 0).toDouble();
    final solarPower = (solar['currentPower'] ?? 0).toDouble();
    final usage = (home['currentUsage'] ?? (gridPower + solarPower)).toDouble();

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 12.0),
          child: Row(
            children: [
              Icon(Icons.bolt, color: Colors.yellowAccent, size: 16),
              SizedBox(width: 8),
              Text('Energy Monitor', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceAround,
          children: [
            _buildItem(Icons.home, '${usage.round()} W', 'Usage', Colors.white),
            _buildItem(Icons.wb_sunny, '${solarPower.round()} W', 'Solar', Colors.greenAccent),
            _buildItem(
              Icons.electrical_services, 
              '${gridPower.abs().round()} W', 
              gridPower > 0 ? 'Import' : 'Export', 
              gridPower > 0 ? Colors.redAccent : Colors.greenAccent
            ),
          ],
        ),
      ],
    );
  }

  Widget _buildItem(IconData icon, String value, String label, Color color) {
    return Column(
      children: [
        Icon(icon, color: color.withValues(alpha: 0.8), size: 24),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 16)),
        Text(label, style: const TextStyle(color: Colors.white54, fontSize: 10)),
      ],
    );
  }
}

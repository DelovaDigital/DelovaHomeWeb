import 'package:flutter/material.dart';

class PresenceWidget extends StatelessWidget {
  final Map<String, dynamic> data;

  const PresenceWidget({super.key, required this.data});

  @override
  Widget build(BuildContext context) {
    final people = data['people'] as List<dynamic>? ?? [];

    if (people.isEmpty) {
      return const Center(child: Text('No presence data', style: TextStyle(color: Colors.white54)));
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.only(bottom: 8.0),
          child: Row(
            children: [
              Icon(Icons.people, color: Colors.white70, size: 16),
              SizedBox(width: 8),
              Text('Presence', style: TextStyle(color: Colors.white70, fontWeight: FontWeight.bold)),
            ],
          ),
        ),
        ...people.map((p) {
          final isHome = p['isHome'] == true;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 4.0),
            child: Row(
              children: [
                Container(
                  width: 10,
                  height: 10,
                  decoration: BoxDecoration(
                    color: isHome ? Colors.greenAccent : Colors.redAccent,
                    shape: BoxShape.circle,
                    boxShadow: isHome ? [BoxShadow(color: Colors.greenAccent.withValues(alpha: 0.5), blurRadius: 4)] : [],
                  ),
                ),
                const SizedBox(width: 10),
                Text(p['name'] ?? 'Unknown', style: const TextStyle(color: Colors.white)),
                const Spacer(),
                Text(
                  isHome ? 'Home' : 'Away',
                  style: TextStyle(color: Colors.white.withValues(alpha: 0.6), fontSize: 12),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }
}

import 'package:flutter/material.dart';

class GradientBackground extends StatelessWidget {
  final Widget child;

  const GradientBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            Color(0xFF1A237E), // Deep Indigo
            Color(0xFF0D47A1), // Blue
            Color(0xFF006064), // Cyan
          ],
        ),
      ),
      child: SafeArea(child: child),
    );
  }
}

import 'package:flutter/material.dart';

class GradientBackground extends StatelessWidget {
  final Widget child;

  const GradientBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isDark
              ? [
                  const Color(0xFF1A237E), // Deep Indigo
                  const Color(0xFF000000), // Black
                ]
              : [
                  const Color(0xFFBFE3D7), // Mint
                  const Color(0xFF76B5C5), // Blue-ish
                ],
        ),
      ),
      child: SafeArea(child: child),
    );
  }
}

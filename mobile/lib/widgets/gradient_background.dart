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
                  const Color(0xFF1A1F38), // Deep Blue/Grey
                  const Color(0xFF121212), // Black
                  const Color(0xFF0F2027), // Dark Cyan tint
                ]
              : [
                  const Color(0xFFF0F4FF), // Light Blue tint
                  const Color(0xFFFFFFFF), // White
                  const Color(0xFFE6F0F2), // Cyan tint
                ],
          stops: const [0.0, 0.5, 1.0],
        ),
      ),
      child: child,
    );
  }
}

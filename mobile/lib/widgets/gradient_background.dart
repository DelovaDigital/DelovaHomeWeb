import 'package:flutter/material.dart';

class GradientBackground extends StatelessWidget {
  final Widget child;

  const GradientBackground({super.key, required this.child});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    // Solid colors matching the new design
    final bgColor = isDark ? const Color(0xFF121212) : const Color(0xFFF5F5F7);

    return Container(
      color: bgColor,
      child: child,
    );
  }
}

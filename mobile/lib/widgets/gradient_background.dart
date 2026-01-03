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
                  const Color(0xFF0F172A), // Slate 900
                  const Color(0xFF1E293B), // Slate 800 (slightly lighter for gradient effect)
                ]
              : [
                  const Color(0xFFF5F7FA),
                  const Color(0xFFC3CFE2),
                ],
        ),
      ),
      child: child,
    );
  }
}

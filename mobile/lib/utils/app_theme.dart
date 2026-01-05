// ignore_for_file: deprecated_member_use

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

class AppTheme {
  // --- Colors ---
  static const _lightSeed = Color(0xFF2563EB); // Modern Blue
  static const _darkSeed = Color(0xFF818CF8); // Indigo/Purple tint

  // --- Gradients (Optional Usage) ---
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFF2563EB), Color(0xFF4F46E5)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );

  // --- Light Theme ---
  static ThemeData get light {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: _lightSeed,
      brightness: Brightness.light,
      surface: const Color(0xFFF8FAFC), // Slate 50
      onSurface: const Color(0xFF0F172A), // Slate 900
      surfaceContainerLow: const Color(0xFFFFFFFF),
      primary: const Color(0xFF2563EB),
      secondary: const Color(0xFF475569),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFFF1F5F9), // Slate 100
      
      // Typography
      textTheme: GoogleFonts.interTextTheme().apply(
        bodyColor: const Color(0xFF0F172A),
        displayColor: const Color(0xFF0F172A),
      ),
      
      // Component Themes
      cardTheme: CardThemeData(
        elevation: 0,
        color: Colors.white,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
          side: BorderSide(color: Colors.grey.withValues(alpha: 0.1), width: 1),
        ),
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        clipBehavior: Clip.antiAlias,
      ),
      
      appBarTheme: AppBarTheme(
        backgroundColor: const Color(0xFFF1F5F9),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 24,
          fontWeight: FontWeight.w600,
          color: const Color(0xFF0F172A),
        ),
        iconTheme: const IconThemeData(color: Color(0xFF0F172A)),
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: Colors.white,
        elevation: 0,
        height: 72,
        indicatorColor: _lightSeed.withValues(alpha: 0.1),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: _lightSeed);
          }
          return const IconThemeData(color: Color(0xFF64748B));
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
           return GoogleFonts.inter(
             fontSize: 12,
             fontWeight: states.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
             color: states.contains(WidgetState.selected) ? _lightSeed : const Color(0xFF64748B),
           );
        }),
      ),

      dividerTheme: DividerThemeData(
        color: Colors.grey.withValues(alpha: 0.15),
        thickness: 1,
      ),
      
      iconTheme: const IconThemeData(color: Color(0xFF64748B)),
    );
  }

  // --- Dark Theme ---
  static ThemeData get dark {
    final colorScheme = ColorScheme.fromSeed(
      seedColor: _darkSeed,
      brightness: Brightness.dark,
      surface: const Color(0xFF0F172A), // Slate 900
      onSurface: const Color(0xFFF8FAFC), // Slate 50
      surfaceContainerLow: const Color(0xFF1E293B), // Slate 800
      primary: const Color(0xFF818CF8),
      secondary: const Color(0xFF94A3B8),
    );

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      colorScheme: colorScheme,
      scaffoldBackgroundColor: const Color(0xFF020617), // Slate 950
      
      // Typography
      textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme).apply(
        bodyColor: const Color(0xFFF8FAFC),
        displayColor: const Color(0xFFF8FAFC),
      ),
      
      // Component Themes
      cardTheme: CardThemeData(
        elevation: 0,
        color: const Color(0xFF1E293B), // Slate 800
        shape: RoundedRectangleBorder(
           borderRadius: BorderRadius.circular(20),
           side: BorderSide(color: Colors.white.withValues(alpha: 0.05), width: 1),
        ),
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        clipBehavior: Clip.antiAlias,
      ),
      
      appBarTheme: AppBarTheme(
        backgroundColor: const Color(0xFF020617),
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 24,
          fontWeight: FontWeight.w600,
          color: const Color(0xFFF8FAFC),
        ),
        iconTheme: const IconThemeData(color: Color(0xFFF8FAFC)),
      ),

      navigationBarTheme: NavigationBarThemeData(
        backgroundColor: const Color(0xFF0F172A),
        elevation: 0,
        height: 72,
        indicatorColor: _darkSeed.withValues(alpha: 0.2),
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        iconTheme: WidgetStateProperty.resolveWith((states) {
          if (states.contains(WidgetState.selected)) {
            return const IconThemeData(color: Color(0xFFC7D2FE));
          }
          return const IconThemeData(color: Color(0xFF94A3B8));
        }),
        labelTextStyle: WidgetStateProperty.resolveWith((states) {
           return GoogleFonts.inter(
             fontSize: 12,
             fontWeight: states.contains(WidgetState.selected) ? FontWeight.w600 : FontWeight.w500,
             color: states.contains(WidgetState.selected) ? const Color(0xFFC7D2FE) : const Color(0xFF94A3B8),
           );
        }),
      ),

      dividerTheme: DividerThemeData(
        color: Colors.white.withValues(alpha: 0.1),
        thickness: 1,
      ),
      
      iconTheme: const IconThemeData(color: Color(0xFF94A3B8)),
    );
  }
}

import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'screens/hub_discovery_screen.dart';
import 'package:intl/date_symbol_data_local.dart';

class MyHttpOverrides extends HttpOverrides {
  @override
  HttpClient createHttpClient(SecurityContext? context) {
    return super.createHttpClient(context)
      ..badCertificateCallback = (X509Certificate cert, String host, int port) => true;
  }
}

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  HttpOverrides.global = MyHttpOverrides();
  // Initialize date formatting for Dutch locale used in the app
  await initializeDateFormatting('nl');
  runApp(const DelovaHome());
}

class DelovaHome extends StatefulWidget {
  const DelovaHome({super.key});

  static DelovaHomeState? of(BuildContext context) => context.findAncestorStateOfType<DelovaHomeState>();

  @override
  State<DelovaHome> createState() => DelovaHomeState();
}

class DelovaHomeState extends State<DelovaHome> {
  ThemeMode _themeMode = ThemeMode.system;

  @override
  void initState() {
    super.initState();
    _loadThemeMode();
  }

  Future<void> _loadThemeMode() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      final t = prefs.getString('theme_mode') ?? 'system';
      setState(() {
        if (t == 'dark') {
          _themeMode = ThemeMode.dark;
        } else if (t == 'light') {
          _themeMode = ThemeMode.light;
        } else {
          _themeMode = ThemeMode.system;
        }
      });
    } catch (e) {
      // ignore
    }
  }

  Future<void> setThemeMode(ThemeMode mode) async {
    final prefs = await SharedPreferences.getInstance();
    final key = mode == ThemeMode.dark ? 'dark' : mode == ThemeMode.light ? 'light' : 'system';
    await prefs.setString('theme_mode', key);
    setState(() => _themeMode = mode);
  }

  ThemeMode get themeModeValue => _themeMode;

  void cycleTheme() {
    setState(() {
      if (_themeMode == ThemeMode.system) {
        _themeMode = ThemeMode.dark;
      } else if (_themeMode == ThemeMode.dark) {
        _themeMode = ThemeMode.light;
      } else {
        _themeMode = ThemeMode.system;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Delova Home',
      theme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.light,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF3B82F6), // Blue
          brightness: Brightness.light,
          surface: const Color(0xFFF8FAFC),
        ),
        scaffoldBackgroundColor: const Color(0xFFF1F5F9),
        cardTheme: CardThemeData(
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          color: Colors.white,
        ),
        textTheme: const TextTheme(
          bodyLarge: TextStyle(color: Color(0xFF1E293B), fontFamily: 'Inter'),
          bodyMedium: TextStyle(color: Color(0xFF1E293B), fontFamily: 'Inter'),
          titleLarge: TextStyle(color: Color(0xFF1E293B), fontFamily: 'Inter', fontWeight: FontWeight.bold),
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        brightness: Brightness.dark,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF6366F1), // Indigo
          brightness: Brightness.dark,
          surface: const Color(0xFF1E293B),
        ),
        scaffoldBackgroundColor: const Color(0xFF0F172A),
        cardTheme: CardThemeData(
          elevation: 0,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
          color: const Color(0xFF1E293B).withValues(alpha: 0.7),
        ),
        textTheme: const TextTheme(
          bodyLarge: TextStyle(color: Color(0xFFF8FAFC), fontFamily: 'Inter'),
          bodyMedium: TextStyle(color: Color(0xFFF8FAFC), fontFamily: 'Inter'),
          titleLarge: TextStyle(color: Color(0xFFF8FAFC), fontFamily: 'Inter', fontWeight: FontWeight.bold),
        ),
      ),
      themeMode: _themeMode,
      locale: const Locale('nl'),
      home: const HubDiscoveryScreen(),
    );
  }
}

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
        primarySwatch: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.light,
      ),
      darkTheme: ThemeData(
        primarySwatch: Colors.blue,
        useMaterial3: true,
        brightness: Brightness.dark,
      ),
      themeMode: _themeMode,
      locale: const Locale('nl'),
      home: const HubDiscoveryScreen(),
    );
  }
}

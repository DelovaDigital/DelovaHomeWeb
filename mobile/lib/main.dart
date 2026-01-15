import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:firebase_core/firebase_core.dart';
import 'screens/hub_discovery_screen.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'utils/app_theme.dart';
import 'services/notification_service.dart';

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
  
  try {
     // You MUST add google-services.json (Android) and GoogleService-Info.plist (iOS) 
     // for this to work, otherwise app will crash on start.
     await Firebase.initializeApp();
     // Start notification listener
     await NotificationService().initialize();
  } catch(e) {
     debugPrint('Firebase init failed (missing config?): $e');
  }

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
      theme: AppTheme.light,
      darkTheme: AppTheme.dark,
      themeMode: _themeMode,
      locale: const Locale('nl'),
      home: const HubDiscoveryScreen(),
    );
  }
}

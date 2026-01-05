import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';
import '../widgets/device_card.dart';
import '../widgets/gradient_background.dart';
import '../utils/app_translations.dart';

class RoomDetailScreen extends StatefulWidget {
  final String roomName;
  final List<Device> devices;
  final VoidCallback onRefresh;

  const RoomDetailScreen({
    super.key,
    required this.roomName,
    required this.devices,
    required this.onRefresh,
  });

  @override
  State<RoomDetailScreen> createState() => _RoomDetailScreenState();
}

class _RoomDetailScreenState extends State<RoomDetailScreen> {
  String _lang = 'nl';

  @override
  void initState() {
    super.initState();
    _loadLanguage();
  }

  Future<void> _loadLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    if (mounted) {
      setState(() {
        _lang = prefs.getString('language') ?? 'nl';
      });
    }
  }

  String t(String key) => AppTranslations.get(key, lang: _lang);

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: Text(widget.roomName, style: TextStyle(color: textColor, fontWeight: FontWeight.bold)),
        backgroundColor: Colors.transparent,
        elevation: 0,
        iconTheme: IconThemeData(color: textColor),
        centerTitle: true,
      ),
      body: GradientBackground(
        child: SafeArea(
          child: widget.devices.isEmpty
              ? Center(child: Text(t('no_devices_room'), style: TextStyle(color: subTextColor)))
              : GridView.builder(
                  padding: const EdgeInsets.all(16),
                  gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                    crossAxisCount: 2,
                    childAspectRatio: 0.85,
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                  ),
                  itemCount: widget.devices.length,
                  itemBuilder: (context, index) {
                    return DeviceCard(
                        device: widget.devices[index],
                        onRefresh: widget.onRefresh,
                      );
                  },
                ),
        ),
      ),
    );
  }
}

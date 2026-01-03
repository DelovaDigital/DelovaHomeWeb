import 'package:delovahome/main.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../services/api_service.dart';
import '../widgets/glass_card.dart';
import '../utils/app_translations.dart';
import 'hub_discovery_screen.dart';
import 'manage_users_screen.dart';
import 'settings/knx_settings_screen.dart';
import 'settings/energy_settings_screen.dart';
import 'settings/presence_settings_screen.dart';
import 'nas_browser_screen.dart';

class SettingsTab extends StatefulWidget {
  const SettingsTab({super.key});

  @override
  State<SettingsTab> createState() => _SettingsTabState();
}

class _SettingsTabState extends State<SettingsTab> {
  final _apiService = ApiService();
  bool _isCheckingUpdate = false;
  
  String _hubIp = 'Unknown';
  String _hubVersion = 'Unknown';
  String _appVersion = 'Unknown';
  List<dynamic> _nasDevices = [];
  String _lang = 'nl';

  @override
  void initState() {
    super.initState();
    _loadInfo();
  }

  Future<void> _loadInfo() async {
    final prefs = await SharedPreferences.getInstance();
    final packageInfo = await PackageInfo.fromPlatform();
    
    setState(() {
      _hubIp = prefs.getString('hub_ip') ?? 'Unknown';
      _appVersion = packageInfo.version;
      _lang = prefs.getString('language') ?? 'nl';
    });

    // Fetch Hub Info from API
    try {
      final info = await _apiService.getSystemInfo();
      if (mounted) {
        setState(() {
          _hubVersion = info['version'] ?? 'Unknown';
        });
      }
    } catch (e) {
      debugPrint('Error fetching hub info: $e');
    }

    // Fetch NAS Devices
    try {
      final nas = await _apiService.getNasDevices();
      if (mounted) {
        setState(() {
          _nasDevices = nas;
        });
      }
    } catch (e) {
      debugPrint('Error fetching NAS devices: $e');
    }
  }

  String t(String key) => AppTranslations.get(key, lang: _lang);

  Future<void> _setLanguage(String lang) async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('language', lang);
    
    if (!mounted) return;

    setState(() {
      _lang = lang;
    });
    
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (context) => const DelovaHome()),
      (route) => false,
    );
  }

  Future<void> _disconnect() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('hub_ip');
    await prefs.remove('hub_port');
    await prefs.remove('hub_id');
    
    if (mounted) {
      Navigator.of(context).pushReplacement(
        MaterialPageRoute(builder: (context) => const HubDiscoveryScreen()),
      );
    }
  }

  Future<void> _checkUpdate() async {
    setState(() => _isCheckingUpdate = true);
    try {
      final result = await _apiService.checkUpdate();
      if (mounted) {
        setState(() => _isCheckingUpdate = false);
        if (result['updateAvailable'] == true) {
          _showUpdateDialog(result['version']);
        } else {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(t('system_up_to_date'))),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        setState(() => _isCheckingUpdate = false);
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('${t('error')}: $e')),
        );
      }
    }
  }

  void _showUpdateDialog(String newVersion) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(t('update_available')),
        content: Text('${t('new_version_available')}: $newVersion'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(t('cancel')),
          ),
          ElevatedButton(
            onPressed: () async {
              Navigator.pop(context);
              try {
                await _apiService.updateSystem();
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(t('update_started'))),
                  );
                }
              } catch (e) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text('${t('error')}: $e')),
                  );
                }
              }
            },
            child: Text(t('update')),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white60 : Colors.black54;
    final cardColor = isDark ? const Color(0xFF1E1E1E) : Colors.white;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(20, 60, 20, 100),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.only(bottom: 20, left: 5),
              child: Text(
                t('settings'),
                style: TextStyle(
                  fontSize: 34,
                  fontWeight: FontWeight.bold,
                  color: textColor,
                ),
              ),
            ),

            // Hub Info Card
            Container(
              decoration: BoxDecoration(
                color: cardColor,
                borderRadius: BorderRadius.circular(20),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withOpacity(0.05),
                    blurRadius: 10,
                    offset: const Offset(0, 4),
                  ),
                ],
              ),
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                    Row(
                      children: [
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color: Colors.blueAccent.withOpacity(0.1),
                            shape: BoxShape.circle,
                          ),
                          child: const Icon(Icons.hub, color: Colors.blueAccent, size: 30),
                        ),
                        const SizedBox(width: 15),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Delova Hub',
                                style: TextStyle(
                                  fontSize: 18,
                                  fontWeight: FontWeight.bold,
                                  color: textColor,
                                ),
                              ),
                              Text(
                                '$_hubIp • v$_hubVersion',
                                style: TextStyle(color: subTextColor),
                              ),
                            ],
                          ),
                        ),
                        if (_isCheckingUpdate)
                          const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        else
                          IconButton(
                            icon: const Icon(Icons.system_update),
                            color: textColor,
                            onPressed: _checkUpdate,
                            tooltip: t('check_updates'),
                          ),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            
            const SizedBox(height: 25),

            // General Settings
            _buildSectionHeader(t('general'), textColor),
            _buildSettingsCard(
              context,
              [
                _buildSettingTile(
                  icon: Icons.language,
                  title: t('language'),
                  subtitle: _lang == 'nl' ? 'Nederlands' : 'English',
                  onTap: () {
                    showModalBottomSheet(
                      context: context,
                      backgroundColor: Colors.transparent,
                      builder: (context) => Container(
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1E293B) : Colors.white,
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            ListTile(
                              title: const Text('Nederlands'),
                              trailing: _lang == 'nl' ? const Icon(Icons.check, color: Colors.blue) : null,
                              onTap: () => _setLanguage('nl'),
                            ),
                            ListTile(
                              title: const Text('English'),
                              trailing: _lang == 'en' ? const Icon(Icons.check, color: Colors.blue) : null,
                              onTap: () => _setLanguage('en'),
                            ),
                            const SizedBox(height: 20),
                          ],
                        ),
                      ),
                    );
                  },
                  textColor: textColor,
                ),
                _buildSettingTile(
                  icon: Icons.dark_mode,
                  title: t('theme'),
                  subtitle: DelovaHome.of(context)?.themeModeValue == ThemeMode.system 
                      ? t('system') 
                      : DelovaHome.of(context)?.themeModeValue == ThemeMode.dark ? t('dark') : t('light'),
                  onTap: () {
                    DelovaHome.of(context)?.cycleTheme();
                  },
                  textColor: textColor,
                ),
              ],
              cardColor,
            ),

            const SizedBox(height: 25),

            // Integrations
            _buildSectionHeader(t('integrations'), textColor),
            _buildSettingsCard(
              context,
              [
                _buildSettingTile(
                  icon: Icons.location_on,
                  title: t('presence'),
                  subtitle: t('configure_presence'),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const PresenceSettingsScreen())),
                  textColor: textColor,
                ),
                _buildSettingTile(
                  icon: Icons.router,
                  title: 'KNX',
                  subtitle: t('configure_knx'),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const KnxSettingsScreen())),
                  textColor: textColor,
                ),
                _buildSettingTile(
                  icon: Icons.bolt,
                  title: t('energy'),
                  subtitle: t('configure_energy'),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const EnergySettingsScreen())),
                  textColor: textColor,
                ),
                _buildSettingTile(
                  icon: Icons.storage,
                  title: 'NAS',
                  subtitle: '${_nasDevices.length} ${t('devices')}',
                  onTap: () {
                    if (_nasDevices.isEmpty) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('No NAS devices found')),
                      );
                      return;
                    }
                    
                    if (_nasDevices.length == 1) {
                      final nas = _nasDevices.first;
                      Navigator.push(context, MaterialPageRoute(builder: (_) => NasBrowserScreen(
                        nasId: nas['id'] ?? 'unknown',
                        nasName: nas['name'] ?? 'NAS',
                      )));
                      return;
                    }

                    showModalBottomSheet(
                      context: context,
                      backgroundColor: Colors.transparent,
                      builder: (context) => Container(
                        decoration: BoxDecoration(
                          color: isDark ? const Color(0xFF1E293B) : Colors.white,
                          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                        ),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Padding(
                              padding: EdgeInsets.all(16.0),
                              child: Text('Select NAS', style: TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                            ),
                            ..._nasDevices.map((nas) => ListTile(
                              leading: const Icon(Icons.storage),
                              title: Text(nas['name'] ?? 'NAS'),
                              onTap: () {
                                Navigator.pop(context);
                                Navigator.push(context, MaterialPageRoute(builder: (_) => NasBrowserScreen(
                                  nasId: nas['id'] ?? 'unknown',
                                  nasName: nas['name'] ?? 'NAS',
                                )));
                              },
                            )),
                            const SizedBox(height: 20),
                          ],
                        ),
                      ),
                    );
                  },
                  textColor: textColor,
                ),
              ],
              cardColor,
            ),

            const SizedBox(height: 25),

            // Management
            _buildSectionHeader(t('management'), textColor),
            _buildSettingsCard(
              context,
              [
                _buildSettingTile(
                  icon: Icons.people,
                  title: t('users'),
                  subtitle: t('manage_users'),
                  onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const ManageUsersScreen())),
                  textColor: textColor,
                ),
                _buildSettingTile(
                  icon: Icons.logout,
                  title: t('disconnect'),
                  subtitle: t('disconnect_hub'),
                  onTap: _disconnect,
                  textColor: Colors.redAccent,
                  iconColor: Colors.redAccent,
                ),
              ],
              cardColor,
            ),

            const SizedBox(height: 30),
            
            Center(
              child: Text(
                'Delova Home App v$_appVersion',
                style: TextStyle(color: subTextColor, fontSize: 12),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, Color color) {
    return Padding(
      padding: const EdgeInsets.only(left: 15, bottom: 10),
      child: Text(
        title.toUpperCase(),
        style: TextStyle(
          color: color.withOpacity(0.6),
          fontSize: 13,
          fontWeight: FontWeight.bold,
          letterSpacing: 1.2,
        ),
      ),
    );
  }

  Widget _buildSettingsCard(BuildContext context, List<Widget> children, Color color) {
    return Container(
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(16),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.05),
            blurRadius: 10,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        children: [
          for (int i = 0; i < children.length; i++) ...[
            children[i],
            if (i < children.length - 1)
              Divider(height: 1, indent: 60, color: Colors.grey.withOpacity(0.1)),
          ],
        ],
      ),
    );
  }

  Widget _buildSettingTile({
    required IconData icon,
    required String title,
    String? subtitle,
    required VoidCallback onTap,
    Color? textColor,
    Color? iconColor,
  }) {
    return ListTile(
      leading: Container(
        padding: const EdgeInsets.all(8),
        decoration: BoxDecoration(
          color: (iconColor ?? Colors.blue).withOpacity(0.1),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: iconColor ?? Colors.blue, size: 22),
      ),
      title: Text(
        title,
        style: TextStyle(
          color: textColor,
          fontWeight: FontWeight.w600,
          fontSize: 16,
        ),
      ),
      subtitle: subtitle != null ? Text(subtitle, style: TextStyle(color: textColor?.withOpacity(0.6), fontSize: 13)) : null,
      trailing: Icon(Icons.chevron_right, color: textColor?.withOpacity(0.3)),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
    );
  }
}

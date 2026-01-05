import 'package:delovahome/main.dart';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:package_info_plus/package_info_plus.dart';
import '../services/api_service.dart';
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

    if (!mounted) return;

    setState(() {
      _hubIp = prefs.getString('hub_ip') ?? 'Unknown';
      _appVersion = packageInfo.version;
      _lang = prefs.getString('language') ?? 'nl';
    });

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
      builder: (dialogContext) => AlertDialog(
        title: Text(t('update_available')),
        content: Text('${t('new_version_available')}: $newVersion'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(dialogContext),
            child: Text(t('cancel')),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(dialogContext);
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
    final theme = Theme.of(context);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          SliverAppBar.large(
            title: Text(t('settings')),
            centerTitle: false,
          ),
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: Column(
                children: [
                  _buildHubInfoCard(theme),
                  const SizedBox(height: 24),
                  _buildSectionHeader(t('general'), theme),
                  const SizedBox(height: 8),
                  Card(
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        _buildSettingTile(
                          icon: Icons.language,
                          title: t('language'),
                          subtitle: _lang == 'nl' ? 'Nederlands' : 'English',
                          onTap: _showLanguageSelector,
                          theme: theme,
                        ),
                        Divider(height: 1, indent: 56, color: theme.colorScheme.outlineVariant),
                        _buildSettingTile(
                          icon: Icons.dark_mode,
                          title: t('theme'),
                          subtitle: _getThemeModeString(context),
                          onTap: () {
                            DelovaHome.of(context)?.cycleTheme();
                          },
                          theme: theme,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  _buildSectionHeader(t('integrations'), theme),
                  const SizedBox(height: 8),
                  Card(
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        _buildSettingTile(
                          icon: Icons.location_on,
                          title: t('presence'),
                          subtitle: t('configure_presence'),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => const PresenceSettingsScreen()),
                          ),
                          theme: theme,
                        ),
                        Divider(height: 1, indent: 56, color: theme.colorScheme.outlineVariant),
                        _buildSettingTile(
                          icon: Icons.router,
                          title: 'KNX',
                          subtitle: t('configure_knx'),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => const KnxSettingsScreen()),
                          ),
                          theme: theme,
                        ),
                        Divider(height: 1, indent: 56, color: theme.colorScheme.outlineVariant),
                        _buildSettingTile(
                          icon: Icons.bolt,
                          title: t('energy'),
                          subtitle: t('configure_energy'),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => const EnergySettingsScreen()),
                          ),
                          theme: theme,
                        ),
                        Divider(height: 1, indent: 56, color: theme.colorScheme.outlineVariant),
                        _buildSettingTile(
                          icon: Icons.storage,
                          title: 'NAS',
                          subtitle: '${_nasDevices.length} ${t('devices')}',
                          onTap: _handleNasTap,
                          theme: theme,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),
                  _buildSectionHeader(t('management'), theme),
                  const SizedBox(height: 8),
                  Card(
                    clipBehavior: Clip.antiAlias,
                    child: Column(
                      children: [
                        _buildSettingTile(
                          icon: Icons.people,
                          title: t('users'),
                          subtitle: t('manage_users'),
                          onTap: () => Navigator.push(
                            context,
                            MaterialPageRoute(builder: (_) => const ManageUsersScreen()),
                          ),
                          theme: theme,
                        ),
                        Divider(height: 1, indent: 56, color: theme.colorScheme.outlineVariant),
                        _buildSettingTile(
                          icon: Icons.logout,
                          title: t('disconnect'),
                          subtitle: t('disconnect_hub'),
                          onTap: _disconnect,
                          theme: theme,
                          isDestructive: true,
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 32),
                  Text(
                    'Delova Home App v$_appVersion',
                    style: theme.textTheme.labelSmall?.copyWith(
                      color: theme.colorScheme.outline,
                    ),
                  ),
                  const SizedBox(height: 100), // Bottom padding
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildHubInfoCard(ThemeData theme) {
    return Card(
      elevation: 2,
      child: Padding(
        padding: const EdgeInsets.all(16.0),
        child: Row(
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.hub,
                color: theme.colorScheme.onPrimaryContainer,
                size: 24,
              ),
            ),
            const SizedBox(width: 16),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Delova Hub',
                    style: theme.textTheme.titleMedium?.copyWith(
                      fontWeight: FontWeight.bold,
                    ),
                  ),
                  Text(
                    '$_hubIp • v$_hubVersion',
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                ],
              ),
            ),
            if (_isCheckingUpdate)
              const SizedBox(
                width: 24,
                height: 24,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            else
              IconButton.filledTonal(
                icon: const Icon(Icons.system_update),
                onPressed: _checkUpdate,
                tooltip: t('check_updates'),
              ),
          ],
        ),
      ),
    );
  }

  Widget _buildSectionHeader(String title, ThemeData theme) {
    return Align(
      alignment: Alignment.centerLeft,
      child: Padding(
        padding: const EdgeInsets.only(left: 16, bottom: 4),
        child: Text(
          title,
          style: theme.textTheme.labelLarge?.copyWith(
            color: theme.colorScheme.primary,
            fontWeight: FontWeight.bold,
          ),
        ),
      ),
    );
  }

  Widget _buildSettingTile({
    required IconData icon,
    required String title,
    String? subtitle,
    required VoidCallback onTap,
    required ThemeData theme,
    bool isDestructive = false,
  }) {
    final color = isDestructive ? theme.colorScheme.error : theme.colorScheme.onSurface;
    final iconColor = isDestructive ? theme.colorScheme.error : theme.colorScheme.primary;

    return ListTile(
      leading: Icon(icon, color: iconColor),
      title: Text(
        title,
        style: theme.textTheme.bodyLarge?.copyWith(
          color: color,
          fontWeight: FontWeight.w500,
        ),
      ),
      subtitle: subtitle != null
          ? Text(
              subtitle,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            )
          : null,
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }

  String _getThemeModeString(BuildContext context) {
    final mode = DelovaHome.of(context)?.themeModeValue;
    if (mode == ThemeMode.system) return t('system');
    if (mode == ThemeMode.dark) return t('dark');
    return t('light');
  }

  void _showLanguageSelector() {
    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('Nederlands'),
              trailing: _lang == 'nl' ? const Icon(Icons.check) : null,
              onTap: () => _setLanguage('nl'),
            ),
            ListTile(
              title: const Text('English'),
              trailing: _lang == 'en' ? const Icon(Icons.check) : null,
              onTap: () => _setLanguage('en'),
            ),
          ],
        ),
      ),
    );
  }

  void _handleNasTap() {
    if (_nasDevices.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No NAS devices found')),
      );
      return;
    }

    if (_nasDevices.length == 1) {
      final nas = _nasDevices.first;
      Navigator.push(
        context,
        MaterialPageRoute(
          builder: (_) => NasBrowserScreen(
            nasId: nas['id'] ?? 'unknown',
            nasName: nas['name'] ?? 'NAS',
          ),
        ),
      );
      return;
    }

    showModalBottomSheet(
      context: context,
      showDragHandle: true,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Padding(
              padding: const EdgeInsets.all(16.0),
              child: Text(
                'Select NAS',
                style: Theme.of(context).textTheme.titleLarge,
              ),
            ),
            ..._nasDevices.map(
              (nas) => ListTile(
                leading: const Icon(Icons.storage),
                title: Text(nas['name'] ?? 'NAS'),
                onTap: () {
                  Navigator.pop(context);
                  Navigator.push(
                    context,
                    MaterialPageRoute(
                      builder: (_) => NasBrowserScreen(
                        nasId: nas['id'] ?? 'unknown',
                        nasName: nas['name'] ?? 'NAS',
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}

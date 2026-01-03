import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../services/api_service.dart';
import '../utils/app_translations.dart';
import '../widgets/gradient_background.dart';
import '../widgets/glass_card.dart';

class ManageUsersScreen extends StatefulWidget {
  const ManageUsersScreen({super.key});

  @override
  State<ManageUsersScreen> createState() => _ManageUsersScreenState();
}

class _ManageUsersScreenState extends State<ManageUsersScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _users = [];
  bool _isLoading = true;
  String _lang = 'nl';

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _loadUsers();
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

  Future<void> _loadUsers() async {
    setState(() => _isLoading = true);
    try {
      final baseUrl = await _apiService.getBaseUrl();
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => true;
      final request = await client.getUrl(Uri.parse('$baseUrl/api/users'));
      final response = await request.close();
      
      if (response.statusCode == 200) {
        final body = await response.transform(utf8.decoder).join();
        final data = jsonDecode(body);
        if (data['ok'] == true) {
          setState(() {
            _users = data['users'];
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading users: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _addUser() async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final dialogBgColor = isDark ? const Color(0xFF1A237E) : Colors.white;
    final borderColor = isDark ? Colors.white30 : Colors.black26;

    final usernameController = TextEditingController();
    final passwordController = TextEditingController();
    final confirmController = TextEditingController();

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: dialogBgColor,
        title: Text(t('add_user'), style: TextStyle(color: textColor)),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: usernameController,
              style: TextStyle(color: textColor),
              decoration: InputDecoration(
                labelText: t('username'),
                labelStyle: TextStyle(color: subTextColor),
                enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: borderColor)),
              ),
            ),
            TextField(
              controller: passwordController,
              style: TextStyle(color: textColor),
              decoration: InputDecoration(
                labelText: t('password'),
                labelStyle: TextStyle(color: subTextColor),
                enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: borderColor)),
              ),
              obscureText: true,
            ),
            TextField(
              controller: confirmController,
              style: TextStyle(color: textColor),
              decoration: InputDecoration(
                labelText: t('confirm_password'),
                labelStyle: TextStyle(color: subTextColor),
                enabledBorder: UnderlineInputBorder(borderSide: BorderSide(color: borderColor)),
              ),
              obscureText: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text(t('cancel'), style: TextStyle(color: subTextColor)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.cyan),
            onPressed: () async {
              if (usernameController.text.isEmpty || passwordController.text.isEmpty) return;
              if (passwordController.text != confirmController.text) {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(t('passwords_do_not_match'))),
                  );
                }
                return;
              }

              if (mounted) {
                Navigator.pop(context);
              }
              await _performAddUser(usernameController.text, passwordController.text);
            },
            child: Text(t('add'), style: const TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );
  }

  Future<void> _performAddUser(String username, String password) async {
    try {
      final baseUrl = await _apiService.getBaseUrl();
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => true;
      
      final request = await client.postUrl(Uri.parse('$baseUrl/api/register'));
      request.headers.set('Content-Type', 'application/json');
      request.add(utf8.encode(jsonEncode({
        'username': username,
        'password': password,
      })));
      
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      final data = jsonDecode(body);

      if (data['ok'] == true) {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(t('user_added'))),
          );
        }
        _loadUsers();
      } else {
        if (mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text(data['message'] ?? 'Failed to add user')),
          );
        }
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error: $e')),
        );
      }
    }
  }

  Future<void> _deleteUser(int userId) async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final dialogBgColor = isDark ? const Color(0xFF1A237E) : Colors.white;

    final confirm = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: dialogBgColor,
        title: Text(t('manage_users'), style: TextStyle(color: textColor)),
        content: Text(t('delete_user_confirm'), style: TextStyle(color: subTextColor)),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: Text(t('cancel'), style: TextStyle(color: subTextColor)),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: Colors.red),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Delete', style: TextStyle(color: Colors.white)),
          ),
        ],
      ),
    );

    if (confirm == true) {
      try {
        final baseUrl = await _apiService.getBaseUrl();
        final client = HttpClient();
        client.badCertificateCallback = (cert, host, port) => true;
        
        final request = await client.deleteUrl(Uri.parse('$baseUrl/api/users/$userId'));
        final response = await request.close();
        
        if (response.statusCode == 200) {
          if (mounted) {
            ScaffoldMessenger.of(context).showSnackBar(
              SnackBar(content: Text(t('user_deleted'))),
            );
            _loadUsers();
          }
        }
      } catch (e) {
        debugPrint('Error deleting user: $e');
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white70 : Colors.black54;
    final iconColor = isDark ? Colors.white : Colors.black87;
    final iconBgColor = isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05);

    return Scaffold(
      body: GradientBackground(
        child: Column(
          children: [
            AppBar(
              backgroundColor: Colors.transparent,
              elevation: 0,
              title: Text(t('manage_users'), style: TextStyle(color: textColor)),
              leading: IconButton(
                icon: Icon(Icons.arrow_back, color: textColor),
                onPressed: () => Navigator.pop(context),
              ),
            ),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator(color: Colors.cyan))
                  : ListView.builder(
                      padding: const EdgeInsets.all(16),
                      itemCount: _users.length,
                      itemBuilder: (context, index) {
                        final user = _users[index];
                        return Padding(
                          padding: const EdgeInsets.only(bottom: 12),
                          child: GlassCard(
                            child: ListTile(
                              leading: Container(
                                padding: const EdgeInsets.all(8),
                                decoration: BoxDecoration(
                                  color: iconBgColor,
                                  shape: BoxShape.circle,
                                ),
                                child: Icon(Icons.person, color: iconColor),
                              ),
                              title: Text(
                                user['Username'],
                                style: TextStyle(color: textColor, fontWeight: FontWeight.bold),
                              ),
                              subtitle: Text(
                                user['Role'] ?? 'User',
                                style: TextStyle(color: subTextColor),
                              ),
                              trailing: IconButton(
                                icon: const Icon(Icons.delete, color: Colors.redAccent),
                                onPressed: () => _deleteUser(user['Id']),
                              ),
                            ),
                          ),
                        );
                      },
                    ),
            ),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton(
        backgroundColor: Colors.cyan,
        onPressed: _addUser,
        child: const Icon(Icons.add, color: Colors.white),
      ),
    );
  }
}

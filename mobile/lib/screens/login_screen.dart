import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../utils/app_translations.dart';
import 'main_screen.dart';
import 'register_screen.dart';
import 'hub_login_screen.dart';

class LoginScreen extends StatefulWidget {
  final String hubIp;
  final String hubPort;
  final String? hubName;

  const LoginScreen({
    super.key,
    required this.hubIp,
    required this.hubPort,
    this.hubName,
  });

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _usernameController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;
  String _lang = 'nl';

  @override
  void initState() {
    super.initState();
    _loadLanguage();
  }

  Future<void> _loadLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _lang = prefs.getString('language') ?? 'nl';
    });
  }

  String t(String key) => AppTranslations.get(key, lang: _lang);

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    // Use HTTPS and allow self-signed certificates
    String baseUrl;
    if (widget.hubIp.startsWith('http://') || widget.hubIp.startsWith('https://')) {
      baseUrl = widget.hubIp;
    } else {
      baseUrl = 'https://${widget.hubIp}:${widget.hubPort}';
    }
    final url = Uri.parse('$baseUrl/api/login');
    
    try {
      // Create a custom HttpClient that accepts self-signed certificates
      final client = HttpClient();
      client.badCertificateCallback = (X509Certificate cert, String host, int port) => true;
      
      final request = await client.postUrl(url);
      request.headers.set('Content-Type', 'application/json');
      request.add(utf8.encode(jsonEncode({
        'username': _usernameController.text,
        'password': _passwordController.text,
      })));
      
      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();
      final data = jsonDecode(responseBody);

      if (response.statusCode == 200 && data['ok'] == true) {
        // Login Success
        final prefs = await SharedPreferences.getInstance();
        await prefs.setString('hub_ip', widget.hubIp);
        await prefs.setString('hub_port', widget.hubPort);
        await prefs.setString('username', data['username']);
        if (data['userId'] != null) {
          await prefs.setString('userId', data['userId'].toString());
        }
        if (data['token'] != null) {
          await prefs.setString('cloud_token', data['token']);
        }
        
        // Check for multiple hubs
        if (data['hubs'] != null && (data['hubs'] as List).isNotEmpty) {
             if (mounted) {
                 _showHubSelectionDialog(data['hubs'], data['token']);
             }
             return;
        }
        
        // Save Hub Info if returned
        if (data['hubInfo'] != null) {
           await prefs.setString('hub_id', data['hubInfo']['id']);
           await prefs.setString('hub_name', data['hubInfo']['name']);
        }

        if (mounted) {
          Navigator.of(context).pushAndRemoveUntil(
            MaterialPageRoute(builder: (context) => const MainScreen()),
            (route) => false,
          );
        }
      } else {
        setState(() {
          _errorMessage = data['message'] ?? 'Login failed';
        });
      }
    } catch (e) {
      setState(() {
        _errorMessage = 'Connection error: $e';
      });
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  void _showHubSelectionDialog(List<dynamic> hubs, String? token) {
    showDialog(
      context: context,
      barrierDismissible: false,
      builder: (context) => AlertDialog(
        title: const Text('Select Hub'),
        content: SizedBox(
          width: double.maxFinite,
          child: ListView.builder(
            shrinkWrap: true,
            itemCount: hubs.length,
            itemBuilder: (context, index) {
              final hub = hubs[index];
              return ListTile(
                title: Text(hub['name'] ?? 'Hub ${index + 1}'),
                subtitle: Text(hub['id'] ?? ''),
                onTap: () => _selectHub(hub, token),
              );
            },
          ),
        ),
      ),
    );
  }

  Future<void> _selectHub(Map<String, dynamic> hub, String? token) async {
    Navigator.of(context).pop(); // Close dialog
    setState(() => _isLoading = true);

    final url = Uri.parse('https://${widget.hubIp}:${widget.hubPort}/api/auth/select-hub');
    
    try {
      final client = HttpClient();
      client.badCertificateCallback = (X509Certificate cert, String host, int port) => true;
      
      final request = await client.postUrl(url);
      request.headers.set('Content-Type', 'application/json');
      if (token != null) {
        request.headers.set('Authorization', 'Bearer $token');
      }
      
      request.add(utf8.encode(jsonEncode({
        'hubId': hub['id']
      })));
      
      final response = await request.close();
      
      if (response.statusCode == 200) {
         // Instead of saving and going to MainScreen, we go to HubLoginScreen
         // to authenticate with the specific Hub User.
         
         if (mounted) {
          Navigator.of(context).push(
            MaterialPageRoute(
              builder: (context) => HubLoginScreen(
                hubIp: widget.hubIp,
                hubPort: widget.hubPort,
                hubId: hub['id'],
                hubName: hub['name'] ?? 'Unknown Hub',
                cloudToken: token!,
              ),
            ),
          );
        }
      } else {
         setState(() => _errorMessage = 'Failed to select hub');
      }
    } catch (e) {
       setState(() => _errorMessage = 'Connection error: $e');
    } finally {
       if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 500),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                // Logo
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: theme.colorScheme.primaryContainer,
                  ),
                  child: Icon(
                    Icons.home_rounded,
                    size: 48,
                    color: theme.colorScheme.onPrimaryContainer,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  t('welcome_back'),
                  style: theme.textTheme.headlineMedium?.copyWith(
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  '${t('login_to')} ${widget.hubName ?? "Hub"}',
                  style: theme.textTheme.bodyLarge?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                const SizedBox(height: 40),

                Card(
                  elevation: 0,
                  color: theme.colorScheme.surfaceContainer,
                  child: Padding(
                    padding: const EdgeInsets.all(24.0),
                    child: Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (_errorMessage != null)
                            Container(
                              padding: const EdgeInsets.all(12),
                              margin: const EdgeInsets.only(bottom: 20),
                              decoration: BoxDecoration(
                                color: theme.colorScheme.errorContainer,
                                borderRadius: BorderRadius.circular(8),
                              ),
                              child: Text(
                                _errorMessage!,
                                style: TextStyle(color: theme.colorScheme.onErrorContainer),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          
                          TextFormField(
                            controller: _usernameController,
                            decoration: InputDecoration(
                              labelText: t('username_or_email'),
                              prefixIcon: const Icon(Icons.person_outline),
                              border: const OutlineInputBorder(),
                            ),
                            validator: (value) =>
                                value == null || value.isEmpty ? t('enter_username') : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _passwordController,
                            obscureText: true,
                            decoration: InputDecoration(
                              labelText: t('password'),
                              prefixIcon: const Icon(Icons.lock_outline),
                              border: const OutlineInputBorder(),
                            ),
                            validator: (value) =>
                                value == null || value.isEmpty ? t('enter_password') : null,
                          ),
                          const SizedBox(height: 32),
                          
                          SizedBox(
                            height: 50,
                            child: FilledButton(
                              onPressed: _isLoading ? null : _login,
                              child: _isLoading
                                  ? const SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Text(t('login').toUpperCase()),
                            ),
                          ),
                          const SizedBox(height: 16),
                          TextButton(
                            onPressed: () {
                              Navigator.push(
                                context,
                                MaterialPageRoute(
                                  builder: (context) => RegisterScreen(
                                    hubIp: widget.hubIp,
                                    hubPort: widget.hubPort,
                                  ),
                                ),
                              );
                            },
                            child: Text(t('create_account')),
                          ),
                        ],
                      ),
                    ),
                  ),
                ),
              ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

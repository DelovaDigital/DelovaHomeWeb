import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../widgets/gradient_background.dart';
import '../widgets/glass_card.dart';
import '../utils/app_translations.dart';
import 'main_screen.dart';

class HubLoginScreen extends StatefulWidget {
  final String hubIp;
  final String hubPort;
  final String hubId;
  final String hubName;
  final String cloudToken;

  const HubLoginScreen({
    super.key,
    required this.hubIp,
    required this.hubPort,
    required this.hubId,
    required this.hubName,
    required this.cloudToken,
  });

  @override
  State<HubLoginScreen> createState() => _HubLoginScreenState();
}

class _HubLoginScreenState extends State<HubLoginScreen> {
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

    // We are connecting via Cloud Proxy to the Hub's login endpoint
    // The Cloud Server proxies /api/* to the Hub if x-hub-id is present
    // But Cloud Login is /api/auth/login. Hub Login is /api/login.
    // So we call /api/login on the Cloud Server with x-hub-id header.
    
    String baseUrl;
    if (widget.hubIp.startsWith('http://') || widget.hubIp.startsWith('https://')) {
      baseUrl = widget.hubIp;
    } else {
      baseUrl = 'https://${widget.hubIp}:${widget.hubPort}';
    }
    
    final url = Uri.parse('$baseUrl/api/login');
    
    try {
      final client = HttpClient();
      client.badCertificateCallback = (X509Certificate cert, String host, int port) => true;
      
      final request = await client.postUrl(url);
      request.headers.set('Content-Type', 'application/json');
      request.headers.set('Authorization', 'Bearer ${widget.cloudToken}');
      request.headers.set('x-hub-id', widget.hubId);
      
      request.add(utf8.encode(jsonEncode({
        'username': _usernameController.text,
        'password': _passwordController.text,
      })));
      
      final response = await request.close();
      final responseBody = await response.transform(utf8.decoder).join();
      final data = jsonDecode(responseBody);

      if (response.statusCode == 200 && data['ok'] == true) {
        // Hub Login Success
        final prefs = await SharedPreferences.getInstance();
        
        // Save Hub Connection Info
        await prefs.setString('hub_ip', widget.hubIp);
        await prefs.setString('hub_port', widget.hubPort);
        await prefs.setString('hub_id', widget.hubId);
        await prefs.setString('hub_name', widget.hubName);
        await prefs.setString('cloud_token', widget.cloudToken);
        
        // Save Local User Info (This is what identifies us on the Hub)
        await prefs.setString('username', data['username']);
        if (data['userId'] != null) {
          await prefs.setString('userId', data['userId'].toString());
        }
        
        // We don't need to save the Hub Token because we use Cloud Token + x-delova-username header
        // But if the Hub returned a token, we could save it if we wanted to support direct connection later.
        // For now, we rely on the Cloud Proxy trust.

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

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : const Color(0xFF1E293B);
    final mutedColor = isDark ? Colors.white70 : const Color(0xFF64748B);

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: Icon(Icons.arrow_back_ios, color: textColor),
          onPressed: () => Navigator.pop(context),
        ),
      ),
      body: GradientBackground(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24.0),
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                // Logo
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05),
                    boxShadow: [
                      BoxShadow(
                        color: const Color(0xFF3B82F6).withValues(alpha: 0.2),
                        blurRadius: 20,
                        spreadRadius: 5,
                      )
                    ],
                  ),
                  child: const Icon(
                    Icons.security,
                    size: 48,
                    color: Color(0xFF3B82F6),
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Hub Authentication',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: textColor,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Login to ${widget.hubName}',
                  style: TextStyle(color: mutedColor, fontSize: 16),
                ),
                const SizedBox(height: 40),

                GlassCard(
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
                                color: Colors.red.withValues(alpha: 0.1),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.red.withValues(alpha: 0.3)),
                              ),
                              child: Text(
                                _errorMessage!,
                                style: const TextStyle(color: Colors.red),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          
                          TextFormField(
                            controller: _usernameController,
                            style: TextStyle(color: textColor),
                            decoration: InputDecoration(
                              labelText: t('username'), // Local Hub Username
                              labelStyle: TextStyle(color: mutedColor),
                              prefixIcon: Icon(Icons.person_outline, color: mutedColor),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide(color: mutedColor.withValues(alpha: 0.3)),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(color: Color(0xFF3B82F6)),
                              ),
                              filled: true,
                              fillColor: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.white.withValues(alpha: 0.5),
                            ),
                            validator: (value) =>
                                value == null || value.isEmpty ? t('enter_username') : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _passwordController,
                            obscureText: true,
                            style: TextStyle(color: textColor),
                            decoration: InputDecoration(
                              labelText: t('password'),
                              labelStyle: TextStyle(color: mutedColor),
                              prefixIcon: Icon(Icons.lock_outline, color: mutedColor),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide(color: mutedColor.withValues(alpha: 0.3)),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(color: Color(0xFF3B82F6)),
                              ),
                              filled: true,
                              fillColor: isDark ? Colors.white.withValues(alpha: 0.05) : Colors.white.withValues(alpha: 0.5),
                            ),
                            validator: (value) =>
                                value == null || value.isEmpty ? t('enter_password') : null,
                          ),
                          const SizedBox(height: 32),
                          
                          SizedBox(
                            height: 50,
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _login,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: const Color(0xFF3B82F6),
                                foregroundColor: Colors.white,
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(12),
                                ),
                                elevation: 0,
                              ),
                              child: _isLoading
                                  ? const SizedBox(
                                      height: 20,
                                      width: 20,
                                      child: CircularProgressIndicator(
                                        strokeWidth: 2,
                                        color: Colors.white,
                                      ),
                                    )
                                  : Text(
                                      t('login').toUpperCase(),
                                      style: const TextStyle(
                                        fontSize: 16,
                                        fontWeight: FontWeight.bold,
                                        letterSpacing: 1.2,
                                      ),
                                    ),
                            ),
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
    );
  }
}

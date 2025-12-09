import 'dart:io';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../widgets/gradient_background.dart';
import '../widgets/glass_card.dart';
import 'main_screen.dart';

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

  Future<void> _login() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    // Use HTTPS and allow self-signed certificates
    final url = Uri.parse('https://${widget.hubIp}:${widget.hubPort}/api/login');
    
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

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        leading: IconButton(
          icon: const Icon(Icons.arrow_back_ios, color: Colors.white),
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
                    color: Colors.white.withValues(alpha: 0.1),
                    boxShadow: [
                      BoxShadow(
                        color: Colors.cyan.withValues(alpha: 0.2),
                        blurRadius: 20,
                        spreadRadius: 5,
                      )
                    ],
                  ),
                  child: const Icon(
                    Icons.lock_outline_rounded,
                    size: 48,
                    color: Colors.white,
                  ),
                ),
                const SizedBox(height: 24),
                Text(
                  'Welcome Back',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                    color: Colors.white,
                    fontWeight: FontWeight.bold,
                  ),
                ),
                const SizedBox(height: 8),
                Text(
                  'Login to ${widget.hubName ?? "Hub"}',
                  style: const TextStyle(color: Colors.white70, fontSize: 16),
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
                                color: Colors.red.withValues(alpha: 0.2),
                                borderRadius: BorderRadius.circular(8),
                                border: Border.all(color: Colors.red.withValues(alpha: 0.5)),
                              ),
                              child: Text(
                                _errorMessage!,
                                style: const TextStyle(color: Colors.white),
                                textAlign: TextAlign.center,
                              ),
                            ),
                          
                          TextFormField(
                            controller: _usernameController,
                            style: const TextStyle(color: Colors.white),
                            decoration: InputDecoration(
                              labelText: 'Username',
                              labelStyle: const TextStyle(color: Colors.white70),
                              prefixIcon: const Icon(Icons.person_outline, color: Colors.white70),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.3)),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(color: Colors.cyan),
                              ),
                              filled: true,
                              fillColor: Colors.white.withValues(alpha: 0.05),
                            ),
                            validator: (value) =>
                                value == null || value.isEmpty ? 'Please enter username' : null,
                          ),
                          const SizedBox(height: 16),
                          TextFormField(
                            controller: _passwordController,
                            obscureText: true,
                            style: const TextStyle(color: Colors.white),
                            decoration: InputDecoration(
                              labelText: 'Password',
                              labelStyle: const TextStyle(color: Colors.white70),
                              prefixIcon: const Icon(Icons.lock_outline, color: Colors.white70),
                              enabledBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: BorderSide(color: Colors.white.withValues(alpha: 0.3)),
                              ),
                              focusedBorder: OutlineInputBorder(
                                borderRadius: BorderRadius.circular(12),
                                borderSide: const BorderSide(color: Colors.cyan),
                              ),
                              filled: true,
                              fillColor: Colors.white.withValues(alpha: 0.05),
                            ),
                            validator: (value) =>
                                value == null || value.isEmpty ? 'Please enter password' : null,
                          ),
                          const SizedBox(height: 32),
                          
                          SizedBox(
                            height: 50,
                            child: ElevatedButton(
                              onPressed: _isLoading ? null : _login,
                              style: ElevatedButton.styleFrom(
                                backgroundColor: Colors.cyan,
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
                                  : const Text(
                                      'LOGIN',
                                      style: TextStyle(
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

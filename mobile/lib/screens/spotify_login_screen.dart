import 'dart:io';
import 'package:flutter/material.dart';
import 'package:webview_flutter/webview_flutter.dart';

class SpotifyLoginScreen extends StatefulWidget {
  final String url;
  final Map<String, String> headers;

  const SpotifyLoginScreen({
    super.key,
    required this.url,
    required this.headers,
  });

  @override
  State<SpotifyLoginScreen> createState() => _SpotifyLoginScreenState();
}

class _SpotifyLoginScreenState extends State<SpotifyLoginScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;
  int _progress = 0;
  String? _errorMessage;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onNavigationRequest: (NavigationRequest request) {
            // Intercept Callback to handle it manually (avoiding SSL issues on return)
            if (request.url.contains('/api/spotify/callback')) {
              _handleCallback(request.url);
              return NavigationDecision.prevent;
            }
            return NavigationDecision.navigate;
          },
          onPageStarted: (String url) {
            debugPrint('WebView Page started: $url');
            if (mounted) {
              setState(() {
                _isLoading = true;
                _errorMessage = null;
              });
            }
          },
          onProgress: (int progress) {
            if (mounted) {
              setState(() {
                _progress = progress;
              });
            }
          },
          onPageFinished: (String url) {
            debugPrint('WebView Page finished: $url');
            if (mounted) {
              setState(() {
                _isLoading = false;
              });
            }
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('WebView error: ${error.description} (Code: ${error.errorCode})');
            // Ignore some common non-fatal errors or cancellations
            if (error.errorCode == -999) return; 
            
            if (mounted) {
              setState(() {
                _isLoading = false;
                _errorMessage = 'Failed to load page: ${error.description}';
              });
            }
          },
        ),
      );
      
    _loadInitialUrl();
  }

  Future<void> _loadInitialUrl() async {
    try {
      // 1. Manually fetch the initial URL to handle self-signed certs and get the Redirect URL
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => true;
      
      final uri = Uri.parse(widget.url);
      final request = await client.getUrl(uri);
      
      // Add headers
      widget.headers.forEach((key, value) {
        request.headers.set(key, value);
      });
      
      // Disable auto-redirect to capture the Location header
      request.followRedirects = false;
      
      final response = await request.close();
      
      if (response.statusCode == 302 || response.statusCode == 301 || response.statusCode == 303) {
        final location = response.headers.value('location');
        if (location != null) {
          debugPrint('Redirecting to Spotify Auth: $location');
          _controller.loadRequest(Uri.parse(location));
        } else {
          throw Exception('Redirect location missing');
        }
      } else if (response.statusCode == 200) {
         // Sometimes it might return 200 if it's not a redirect (unexpected for this flow but possible)
         // Just load the original URL if that happens, though it might fail in WebView if SSL is bad
         _controller.loadRequest(uri);
      } else {
        throw Exception('Server returned ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Initial load error: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Connection error: $e';
        });
      }
    }
  }

  Future<void> _handleCallback(String url) async {
    debugPrint('Handling callback manually: $url');
    setState(() {
      _isLoading = true;
    });

    try {
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => true;
      
      final request = await client.getUrl(Uri.parse(url));
      // Pass headers if needed (cookies might be needed if session based, but here we use state/code)
      widget.headers.forEach((key, value) {
        request.headers.set(key, value);
      });

      final response = await request.close();
      
      if (response.statusCode == 200) {
        debugPrint('Callback success');
        if (mounted) {
          Navigator.of(context).pop(true);
        }
      } else {
        throw Exception('Callback failed with ${response.statusCode}');
      }
    } catch (e) {
      debugPrint('Callback error: $e');
      if (mounted) {
        setState(() {
          _isLoading = false;
          _errorMessage = 'Callback failed: $e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Connect Spotify'),
        leading: IconButton(
          icon: const Icon(Icons.close),
          onPressed: () => Navigator.of(context).pop(false),
        ),
      ),
      body: Column(
        children: [
          if (_isLoading || _progress < 100)
            LinearProgressIndicator(
              value: _progress > 0 ? _progress / 100.0 : null,
              backgroundColor: Colors.grey[200],
              valueColor: const AlwaysStoppedAnimation<Color>(Colors.green),
            ),
          Expanded(
            child: _errorMessage != null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(20.0),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.error_outline, color: Colors.red, size: 48),
                          const SizedBox(height: 16),
                          Text(
                            _errorMessage!,
                            textAlign: TextAlign.center,
                            style: const TextStyle(color: Colors.red),
                          ),
                          const SizedBox(height: 20),
                          ElevatedButton(
                            onPressed: () {
                              setState(() {
                                _errorMessage = null;
                                _isLoading = true;
                              });
                              _loadInitialUrl();
                            },
                            child: const Text('Retry'),
                          )
                        ],
                      ),
                    ),
                  )
                : WebViewWidget(controller: _controller),
          ),
        ],
      ),
    );
  }
}

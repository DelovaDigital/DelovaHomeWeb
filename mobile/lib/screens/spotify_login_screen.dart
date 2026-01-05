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

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            setState(() {
              _isLoading = true;
            });
          },
          onPageFinished: (String url) {
            setState(() {
              _isLoading = false;
            });
            // Check if we have reached the callback URL and it finished loading
            if (url.contains('/api/spotify/callback')) {
              // Give the user a moment to see the "Success" message if the server sends one
              Future.delayed(const Duration(seconds: 2), () {
                if (mounted) {
                  Navigator.of(context).pop(true);
                }
              });
            }
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('WebView error: ${error.description}');
          },
        ),
      )
      ..loadRequest(Uri.parse(widget.url), headers: widget.headers);
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
      body: Stack(
        children: [
          WebViewWidget(controller: _controller),
          if (_isLoading)
            const Center(child: CircularProgressIndicator()),
        ],
      ),
    );
  }
}

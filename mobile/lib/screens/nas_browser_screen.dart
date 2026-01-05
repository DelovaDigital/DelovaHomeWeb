import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:webview_flutter/webview_flutter.dart';
import '../services/api_service.dart';
import '../utils/app_translations.dart';
import '../widgets/gradient_background.dart';

class NasBrowserScreen extends StatefulWidget {
  final String nasId;
  final String nasName;
  final String initialPath;

  const NasBrowserScreen({
    super.key,
    required this.nasId,
    required this.nasName,
    this.initialPath = '/',
  });

  @override
  State<NasBrowserScreen> createState() => _NasBrowserScreenState();
}

class _NasBrowserScreenState extends State<NasBrowserScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _files = [];
  bool _isLoading = true;
  String _currentPath = '/';
  String? _error;
  String _lang = 'nl';

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _currentPath = widget.initialPath;
    _loadFiles();
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

  Future<void> _loadFiles() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    try {
      final files = await _apiService.getNasFiles(widget.nasId, _currentPath);
      if (mounted) {
        setState(() {
          _files = files;
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  void _navigateTo(String folderName) {
    final newPath = _currentPath.endsWith('/') 
        ? '$_currentPath$folderName' 
        : '$_currentPath/$folderName';
    
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (context) => NasBrowserScreen(
          nasId: widget.nasId,
          nasName: widget.nasName,
          initialPath: newPath,
        ),
      ),
    );
  }

  Future<void> _openFile(String name) async {
    try {
      final baseUrl = await _apiService.getBaseUrl();
      
      String fullPath;
      if (_currentPath == '/' || _currentPath.isEmpty) {
        fullPath = name;
      } else {
        if (_currentPath.endsWith('/')) {
           fullPath = '$_currentPath$name';
        } else {
           fullPath = '$_currentPath/$name';
        }
      }
      
      if (fullPath.startsWith('/')) {
        fullPath = fullPath.substring(1);
      }

      final url = '$baseUrl/api/nas/${widget.nasId}/stream?path=${Uri.encodeComponent(fullPath)}';
      
      // Determine type
      final ext = name.split('.').last.toLowerCase();
      final isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].contains(ext);
      
      if (!mounted) return;
      
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => FileViewerScreen(
            url: url,
            name: name,
            isImage: isImage,
          ),
        ),
      );

    } catch (e) {
       if (mounted) {
         ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(content: Text('Error: $e')),
          );
       }
    }
  }

  IconData _getFileIcon(String type, String name) {
    if (type == 'directory') return Icons.folder;
    final ext = name.split('.').last.toLowerCase();
    if (['jpg', 'jpeg', 'png', 'gif'].contains(ext)) return Icons.image;
    if (['mp4', 'mkv', 'avi', 'mov'].contains(ext)) return Icons.movie;
    if (['mp3', 'wav', 'flac'].contains(ext)) return Icons.music_note;
    if (['pdf', 'doc', 'txt'].contains(ext)) return Icons.description;
    return Icons.insert_drive_file;
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final textColor = isDark ? Colors.white : Colors.black87;
    final subTextColor = isDark ? Colors.white54 : Colors.black54;
    final iconColor = isDark ? Colors.white70 : Colors.black54;

    return Scaffold(
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(widget.nasName, style: TextStyle(color: textColor)),
        leading: BackButton(color: textColor),
      ),
      body: GradientBackground(
        child: Column(
          children: [
            const SizedBox(height: 100), // Spacing for AppBar
            // Path Breadcrumb (Simple)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0),
              child: Card(
                child: Padding(
                  padding: const EdgeInsets.all(12.0),
                  child: Row(
                    children: [
                      const Icon(Icons.folder_open, color: Colors.cyanAccent),
                      const SizedBox(width: 10),
                      Expanded(
                        child: Text(
                          _currentPath,
                          style: TextStyle(color: textColor, fontFamily: 'monospace'),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
            const SizedBox(height: 10),
            
            // File List
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator(color: Colors.cyan))
                  : _error != null
                      ? Center(child: Text('${t('error')}: $_error', style: const TextStyle(color: Colors.redAccent)))
                      : _files.isEmpty
                          ? Center(child: Text(t('empty_folder'), style: TextStyle(color: subTextColor)))
                          : ListView.builder(
                              padding: const EdgeInsets.symmetric(horizontal: 16),
                              itemCount: _files.length,
                              itemBuilder: (context, index) {
                                final file = _files[index];
                                final name = file['name'] ?? 'Unknown';
                                final type = file['type'] ?? 'file';
                                final isDir = type == 'directory';

                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 8.0),
                                  child: Card(
                                    child: ListTile(
                                      leading: Icon(
                                        _getFileIcon(type, name),
                                        color: isDir ? Colors.amber : iconColor,
                                      ),
                                      title: Text(name, style: TextStyle(color: textColor)),
                                      trailing: isDir ? Icon(Icons.chevron_right, color: subTextColor) : null,
                                      onTap: isDir ? () => _navigateTo(name) : () => _openFile(name),
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

class FileViewerScreen extends StatefulWidget {
  final String url;
  final String name;
  final bool isImage;

  const FileViewerScreen({super.key, required this.url, required this.name, this.isImage = false});

  @override
  State<FileViewerScreen> createState() => _FileViewerScreenState();
}

class _FileViewerScreenState extends State<FileViewerScreen> {
  late final WebViewController _controller;

  @override
  void initState() {
    super.initState();
    if (!widget.isImage) {
      _controller = WebViewController()
        ..setJavaScriptMode(JavaScriptMode.unrestricted)
        ..setNavigationDelegate(
          NavigationDelegate(
            onPageStarted: (String url) {},
            onPageFinished: (String url) {},
            onWebResourceError: (WebResourceError error) {},
          ),
        )
        ..loadRequest(Uri.parse(widget.url));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        title: Text(widget.name, style: const TextStyle(color: Colors.white)),
        leading: const BackButton(color: Colors.white),
      ),
      body: widget.isImage
          ? Center(child: InteractiveViewer(child: Image.network(widget.url)))
          : WebViewWidget(controller: _controller),
    );
  }
}

import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';
import '../services/api_service.dart';
import '../widgets/glass_card.dart';
import '../widgets/device_card.dart';
import '../utils/app_translations.dart';

class DevicesTab extends StatefulWidget {
  const DevicesTab({super.key});

  @override
  State<DevicesTab> createState() => _DevicesTabState();
}

class _DevicesTabState extends State<DevicesTab> {
  final ApiService _apiService = ApiService();
  List<Device> _allDevices = [];
  List<Device> _filteredDevices = [];
  bool _isLoading = true;
  String? _error;
  Timer? _timer;
  String _lang = 'nl';
  
  // Filters
  String _searchQuery = '';
  String _selectedCategory = 'All';
  final List<String> _categories = ['All', 'Light', 'Speaker', 'TV', 'Camera', 'Switch', 'Console'];

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _fetchDevices();
    _timer = Timer.periodic(const Duration(seconds: 5), (timer) {
      _fetchDevices(silent: true);
    });
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

  String _getCategoryLabel(String category) {
    switch (category) {
      case 'All': return t('cat_all');
      case 'Light': return t('cat_light');
      case 'Speaker': return t('cat_speaker');
      case 'TV': return t('cat_tv');
      case 'Camera': return t('cat_camera');
      case 'Switch': return t('cat_switch');
      case 'Console': return t('cat_console');
      default: return category;
    }
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _fetchDevices({bool silent = false}) async {
    if (!silent) {
      setState(() {
        _isLoading = true;
        _error = null;
      });
    }

    try {
      final devices = await _apiService.getDevices();
      if (mounted) {
        setState(() {
          _allDevices = devices;
          _applyFilters();
          _isLoading = false;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          if (!silent) _error = e.toString();
          _isLoading = false;
        });
      }
    }
  }

  void _applyFilters() {
    setState(() {
      _filteredDevices = _allDevices.where((device) {
        final matchesSearch = device.name.toLowerCase().contains(_searchQuery.toLowerCase());
        
        bool matchesCategory = false;
        if (_selectedCategory == 'All') {
          matchesCategory = true;
        } else if (_selectedCategory == 'Console') {
          matchesCategory = device.type.toLowerCase() == 'ps5' || 
                           device.type.toLowerCase() == 'console' || 
                           device.type.toLowerCase() == 'game';
        } else {
          matchesCategory = device.type.toLowerCase().contains(_selectedCategory.toLowerCase());
        }
        
        return matchesSearch && matchesCategory;
      }).toList();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 0),
          child: Text(
            t('devices'),
            style: const TextStyle(
              fontSize: 28,
              fontWeight: FontWeight.bold,
              color: Colors.white,
            ),
          ),
        ),
        // Search Bar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 8),
          child: GlassCard(
            child: TextField(
              style: const TextStyle(color: Colors.white),
              decoration: InputDecoration(
                hintText: t('search_devices'),
                hintStyle: const TextStyle(color: Colors.white54),
                prefixIcon: const Icon(Icons.search, color: Colors.white54),
                filled: true,
                fillColor: Colors.transparent,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide.none,
                ),
                contentPadding: const EdgeInsets.symmetric(vertical: 12),
              ),
              onChanged: (value) {
                _searchQuery = value;
                _applyFilters();
              },
            ),
          ),
        ),

        // Category Chips
        SingleChildScrollView(
          scrollDirection: Axis.horizontal,
          padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
          child: Row(
            children: _categories.map((category) {
              final isSelected = _selectedCategory == category;
              return Padding(
                padding: const EdgeInsets.only(right: 8.0),
                child: ChoiceChip(
                  label: Text(_getCategoryLabel(category)),
                  selected: isSelected,
                  onSelected: (selected) {
                    setState(() {
                      _selectedCategory = category;
                      _applyFilters();
                    });
                  },
                  backgroundColor: Colors.white.withValues(alpha: 0.1),
                  selectedColor: Colors.cyan.withValues(alpha: 0.5),
                  labelStyle: TextStyle(
                    color: isSelected ? Colors.white : Colors.white70,
                    fontWeight: isSelected ? FontWeight.bold : FontWeight.normal,
                  ),
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(20),
                    side: BorderSide(
                      color: isSelected ? Colors.cyan : Colors.white.withValues(alpha: 0.2),
                    ),
                  ),
                  showCheckmark: false,
                ),
              );
            }).toList(),
          ),
        ),
        
        const SizedBox(height: 10),

        // Device List
        Expanded(
          child: _isLoading
              ? const Center(child: CircularProgressIndicator(color: Colors.cyan))
              : _error != null
                  ? Center(
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Text('${t('error')}: $_error', style: const TextStyle(color: Colors.redAccent)),
                          const SizedBox(height: 16),
                          ElevatedButton(
                            onPressed: () => _fetchDevices(),
                            style: ElevatedButton.styleFrom(backgroundColor: Colors.cyan),
                            child: Text(t('retry')),
                          ),
                        ],
                      ),
                    )
                  : RefreshIndicator(
                      onRefresh: () => _fetchDevices(),
                      color: Colors.cyan,
                      child: _filteredDevices.isEmpty
                          ? Center(child: Text(t('no_devices'), style: const TextStyle(color: Colors.white54)))
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                              itemCount: _filteredDevices.length,
                              itemBuilder: (context, index) {
                                return Padding(
                                  padding: const EdgeInsets.only(bottom: 12.0),
                                  child: GlassCard(
                                    child: DeviceCard(
                                      device: _filteredDevices[index],
                                      onRefresh: () => _fetchDevices(silent: true),
                                    ),
                                  ),
                                );
                              },
                            ),
                    ),
        ),
      ],
    );
  }
}

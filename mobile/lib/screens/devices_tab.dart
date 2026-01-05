import 'dart:async';
import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/device.dart';
import '../services/api_service.dart';
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
    final theme = Theme.of(context);

    return Scaffold(
      body: CustomScrollView(
        slivers: [
          // Modern Sliver App Bar
          SliverAppBar.large(
            title: Text(t('devices')),
            centerTitle: false,
            floating: true,
            pinned: true,
            actions: [
              IconButton(onPressed: () => _fetchDevices(silent: false), icon: const Icon(Icons.refresh))
            ],
          ),

          // Search & Filter Header
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
              child: Column(
                children: [
                   // Search Bar replaced with Material 3 SearchBar
                   SearchBar(
                     hintText: t('search_devices'),
                     leading: const Icon(Icons.search),
                     elevation: WidgetStateProperty.all(0),
                     backgroundColor: WidgetStateProperty.all(
                       theme.colorScheme.surfaceContainerHigh
                     ),
                     onChanged: (val) {
                       setState(() => _searchQuery = val);
                       _applyFilters();
                     },
                   ),
                   const SizedBox(height: 16),
                   // Filter Chips
                   SingleChildScrollView(
                     scrollDirection: Axis.horizontal,
                     child: Row(
                       children: _categories.map((cat) {
                         final isSelected = _selectedCategory == cat;
                         return Padding(
                           padding: const EdgeInsets.only(right: 8.0),
                           child: FilterChip(
                             label: Text(_getCategoryLabel(cat)),
                             selected: isSelected,
                             onSelected: (_) {
                               setState(() {
                                 _selectedCategory = cat;
                                 _applyFilters();
                               });
                             },
                             showCheckmark: false,
                             labelStyle: TextStyle(
                               color: isSelected ? theme.colorScheme.onPrimary : theme.colorScheme.onSurface,
                             ),
                             selectedColor: theme.colorScheme.primary,
                             backgroundColor: theme.colorScheme.surfaceContainer,
                             side: BorderSide.none,
                             shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(20)),
                           ),
                         );
                       }).toList(),
                     ),
                   ),
                ],
              ),
            ),
          ),

          // Device Grid
          _isLoading 
          ? const SliverFillRemaining(child: Center(child: CircularProgressIndicator())) 
          : _filteredDevices.isEmpty 
              ? SliverFillRemaining(child: Center(child: Text(t('no_devices'))))
              : SliverPadding(
                  padding: const EdgeInsets.all(16),
                  sliver: SliverGrid(
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                       crossAxisCount: 2,
                       childAspectRatio: 1.1, // Adjusted for new card aspect
                       crossAxisSpacing: 12,
                       mainAxisSpacing: 12,
                    ),
                    delegate: SliverChildBuilderDelegate(
                      (context, index) {
                        return DeviceCard(
                          device: _filteredDevices[index],
                          onRefresh: () => _fetchDevices(silent: true),
                        );
                      },
                      childCount: _filteredDevices.length,
                    ),
                  ),
            ),
          
          // Bottom padding for nav bar
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }

}

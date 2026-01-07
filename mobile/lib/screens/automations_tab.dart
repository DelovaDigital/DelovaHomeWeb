import 'dart:ui';
import 'package:flutter/material.dart';
import '../services/api_service.dart';
import '../utils/app_translations.dart';
import '../models/device.dart';
import 'package:shared_preferences/shared_preferences.dart';

class AutomationsTab extends StatefulWidget {
  const AutomationsTab({super.key});

  @override
  State<AutomationsTab> createState() => _AutomationsTabState();
}

class _AutomationsTabState extends State<AutomationsTab> {
  final ApiService _apiService = ApiService();
  List<dynamic> _automations = [];
  List<Device> _devices = [];
  bool _isLoading = true;
  String _lang = 'nl';

  @override
  void initState() {
    super.initState();
    _loadLanguage();
    _loadAutomations();
    _loadDevices();
  }

  Future<void> _loadLanguage() async {
    final prefs = await SharedPreferences.getInstance();
    setState(() {
      _lang = prefs.getString('language') ?? 'nl';
    });
  }

  Future<void> _loadAutomations() async {
    setState(() => _isLoading = true);
    try {
      final automations = await _apiService.getAutomations();
      setState(() {
        _automations = automations;
        _isLoading = false;
      });
    } catch (e) {
      setState(() => _isLoading = false);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error loading automations: $e')),
        );
      }
    }
  }

  Future<void> _loadDevices() async {
    try {
      final devices = await _apiService.getDevices();
      setState(() => _devices = devices);
    } catch (e) {
      debugPrint('Error loading devices: $e');
    }
  }

  String t(String key) {
    // Simple fallback if key doesn't exist in AppTranslations yet
    final val = AppTranslations.get(key, lang: _lang);
    if (val == key && key == 'Automations') return 'Automatiseringen';
    return val;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: Colors.transparent,
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(24, 16, 24, 24),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        t('Automations'),
                        style: theme.textTheme.headlineMedium?.copyWith(
                          fontWeight: FontWeight.bold,
                          color: isDark ? Colors.white : const Color(0xFF2D3142),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        '${_automations.length} active',
                        style: TextStyle(
                          color: isDark ? Colors.white70 : Colors.grey[600],
                          fontSize: 16,
                        ),
                      ),
                    ],
                  ),
                  Container(
                    decoration: BoxDecoration(
                      color: theme.primaryColor,
                      borderRadius: BorderRadius.circular(16),
                      boxShadow: [
                        BoxShadow(
                          color: theme.primaryColor.withValues(alpha: 0.3),
                          blurRadius: 10,
                          offset: const Offset(0, 4),
                        ),
                      ],
                    ),
                    child: IconButton(
                      icon: const Icon(Icons.add_rounded, color: Colors.white),
                      onPressed: _showAddAutomationDialog,
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _isLoading
                  ? const Center(child: CircularProgressIndicator())
                  : RefreshIndicator(
                      onRefresh: _loadAutomations,
                      child: _automations.isEmpty
                          ? Center(
                              child: Column(
                                mainAxisAlignment: MainAxisAlignment.center,
                                children: [
                                  Icon(
                                    Icons.auto_awesome_outlined,
                                    size: 64,
                                    color: isDark ? Colors.white24 : Colors.grey[300],
                                  ),
                                  const SizedBox(height: 16),
                                  Text(
                                    t('No automations found'),
                                    style: TextStyle(
                                      color: isDark ? Colors.white54 : Colors.grey[500],
                                      fontSize: 18,
                                    ),
                                  ),
                                ],
                              ),
                            )
                          : ListView.builder(
                              padding: const EdgeInsets.fromLTRB(20, 0, 20, 100),
                              itemCount: _automations.length,
                              itemBuilder: (context, index) {
                                return _buildAutomationCard(_automations[index]);
                              },
                            ),
                    ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildAutomationCard(Map<String, dynamic> automation) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    
    IconData triggerIcon = Icons.error_outline;
    Color triggerColor = Colors.grey;
    String triggerText = 'Unknown Trigger';
    
    final trigger = automation['trigger'];
    if (trigger != null) {
        final type = trigger['type'];
        if (type == 'time') {
            triggerIcon = Icons.access_time_rounded;
            triggerColor = Colors.orange;
            triggerText = _formatCron(trigger['cron']); 
        } else if (type == 'presence') {
            triggerIcon = Icons.location_on_rounded;
            triggerColor = Colors.blue;
            triggerText = trigger['event'] == 'arrive_home' 
                ? t('Arrive Home') 
                : t('Leave Home');
        } else if (type == 'device_state') {
            triggerIcon = Icons.devices_other_rounded;
            triggerColor = Colors.purple;
            triggerText = t('Device State');
        }
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 16),
      decoration: BoxDecoration(
        color: isDark ? const Color(0xFF1E1E1E).withValues(alpha: 0.8) : Colors.white.withValues(alpha: 0.9),
        borderRadius: BorderRadius.circular(24),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: 0.05),
            blurRadius: 15,
            offset: const Offset(0, 5),
          ),
        ],
        border: Border.all(
            color: isDark ? Colors.white.withValues(alpha: 0.1) : Colors.black.withValues(alpha: 0.05),
        ),
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(24),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 10, sigmaY: 10),
          child: Material(
            color: Colors.transparent,
            child: InkWell(
              onTap: () {
                 ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Edit not implemented yet')),
                 );
              },
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  children: [
                      Row(
                          children: [
                              Container(
                                  padding: const EdgeInsets.all(12),
                                  decoration: BoxDecoration(
                                      color: triggerColor.withValues(alpha: 0.15),
                                      shape: BoxShape.circle,
                                  ),
                                  child: Icon(triggerIcon, color: triggerColor, size: 24),
                              ),
                              const SizedBox(width: 16),
                              Expanded(
                                  child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                          Text(
                                              automation['name'] ?? 'Unnamed',
                                              style: TextStyle(
                                                  fontSize: 17,
                                                  fontWeight: FontWeight.bold,
                                                  color: isDark ? Colors.white : const Color(0xFF2D3142),
                                              ),
                                          ),
                                          const SizedBox(height: 4),
                                          Text(
                                              triggerText,
                                              style: TextStyle(
                                                  color: isDark ? Colors.white60 : Colors.black54,
                                                  fontSize: 13,
                                                  fontWeight: FontWeight.w500,
                                              ),
                                          ),
                                      ],
                                  ),
                              ),
                              Switch(
                                  value: automation['enabled'] ?? false,
                                  onChanged: (val) async {
                                    final oldVal = automation['enabled'];
                                    setState(() {
                                      automation['enabled'] = val;
                                    });
                                    try {
                                      await _apiService.updateAutomation(
                                        automation['id'],
                                        automation,
                                      );
                                    } catch (e) {
                                      if (!mounted) return;
                                      setState(() {
                                        automation['enabled'] = oldVal;
                                      });
                                      ScaffoldMessenger.of(context).showSnackBar(
                                        SnackBar(
                                          content: Text('Failed to update: $e'),
                                        ),
                                      );
                                    }
                                  },
                              ),
                          ],
                      ),
                      if (automation['actions'] != null && (automation['actions'] as List).isNotEmpty) ...[
                          const SizedBox(height: 16),
                          Divider(height: 1, color: isDark ? Colors.white10 : Colors.black12),
                          const SizedBox(height: 12),
                          Row(
                              children: [
                                  Icon(Icons.bolt_rounded, size: 16, color: isDark ? Colors.white54 : Colors.black45),
                                  const SizedBox(width: 6),
                                  Text(
                                      '${(automation['actions'] as List).length} actions configured', 
                                      style: TextStyle(
                                          color: isDark ? Colors.white54 : Colors.black45,
                                          fontSize: 13,
                                          fontWeight: FontWeight.w500
                                      )
                                  ),
                              ]
                          )
                      ]
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  String _formatCron(String? cron) {
      if (cron == null) return 'No time set';
      final parts = cron.split(' ');
      if (parts.length >= 3) {
          final min = parts[1].padLeft(2, '0');
          final hour = parts[2].padLeft(2, '0');
          return '$hour:$min';
      }
      return cron;
  }

  void _showAddAutomationDialog() {
    final nameController = TextEditingController();
    String triggerType = 'time'; // Default
    TimeOfDay selectedTime = TimeOfDay.now();
    String presenceEvent = 'arrive_home';
    List<Map<String, dynamic>> actions = [];

    showDialog(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text(t('Add Automation')),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                    controller: nameController,
                    decoration: InputDecoration(labelText: t('Name')),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: triggerType,
                    decoration: InputDecoration(labelText: t('Trigger Type')),
                    items: ['time', 'presence', 'device_state']
                        .map((t) => DropdownMenuItem(value: t, child: Text(t)))
                        .toList(),
                    onChanged: (val) => setState(() => triggerType = val!),
                  ),
                  if (triggerType == 'time') ...[
                    const SizedBox(height: 16),
                    ListTile(
                      title: Text('Time: ${selectedTime.format(context)}'),
                      trailing: const Icon(Icons.access_time),
                      onTap: () async {
                        final t = await showTimePicker(
                          context: context,
                          initialTime: selectedTime,
                        );
                        if (t != null) setState(() => selectedTime = t);
                      },
                    ),
                  ],
                  if (triggerType == 'presence') ...[
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      initialValue: presenceEvent,
                      decoration: InputDecoration(labelText: t('Event')),
                      items: ['arrive_home', 'leave_home']
                          .map(
                            (t) => DropdownMenuItem(value: t, child: Text(t)),
                          )
                          .toList(),
                      onChanged: (val) => setState(() => presenceEvent = val!),
                    ),
                  ],
                  const SizedBox(height: 20),
                  Text(
                    t('Actions'),
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                  ...actions.map((action) {
                    final device = _devices.firstWhere(
                      (d) => d.id == action['deviceId'],
                      orElse: () => Device(
                        id: '?',
                        name: 'Unknown',
                        type: '?',
                        ip: '',
                        status: DeviceStatus(
                          powerState: 'off',
                          isOn: false,
                          volume: 0.0,
                          brightness: 0.0,
                        ),
                      ),
                    );
                    return ListTile(
                      title: Text('${device.name}: ${action['command']}'),
                      subtitle: action['value'] != null
                          ? Text('Value: ${action['value']}')
                          : null,
                      trailing: IconButton(
                        icon: const Icon(Icons.delete),
                        onPressed: () => setState(() => actions.remove(action)),
                      ),
                    );
                  }),
                  TextButton.icon(
                    icon: const Icon(Icons.add),
                    label: Text(t('Add Action')),
                    onPressed: () async {
                      final result = await _showAddActionDialog();
                      if (result != null) {
                        setState(() => actions.add(result));
                      }
                    },
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(t('Cancel')),
              ),
              ElevatedButton(
                onPressed: () async {
                  if (nameController.text.isEmpty) return;

                  final newAutomation = {
                    'name': nameController.text,
                    'enabled': true,
                    'trigger': {
                      'type': triggerType,
                      if (triggerType == 'time')
                        'cron':
                            '0 ${selectedTime.minute} ${selectedTime.hour} * * *',
                      if (triggerType == 'presence') 'event': presenceEvent,
                    },
                    'actions': actions,
                  };

                  try {
                    await _apiService.addAutomation(newAutomation);
                    if (context.mounted) Navigator.pop(context);
                    _loadAutomations();
                  } catch (e) {
                    if (context.mounted) {
                      ScaffoldMessenger.of(
                        context,
                      ).showSnackBar(SnackBar(content: Text('Error: $e')));
                    }
                  }
                },
                child: Text(t('Add')),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<Map<String, dynamic>?> _showAddActionDialog() async {
    String? selectedDeviceId;
    String command = 'turn_on';
    final valueController = TextEditingController();

    return showDialog<Map<String, dynamic>>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setState) {
          return AlertDialog(
            title: Text(t('Add Action')),
            content: SingleChildScrollView(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  DropdownButtonFormField<String>(
                    initialValue: selectedDeviceId,
                    decoration: InputDecoration(labelText: t('Device')),
                    items: _devices
                        .map(
                          (d) => DropdownMenuItem(
                            value: d.id,
                            child: Text(d.name),
                          ),
                        )
                        .toList(),
                    onChanged: (val) => setState(() => selectedDeviceId = val),
                  ),
                  const SizedBox(height: 16),
                  DropdownButtonFormField<String>(
                    initialValue: command,
                    decoration: InputDecoration(labelText: t('Command')),
                    items:
                        [
                              'turn_on',
                              'turn_off',
                              'toggle',
                              'set_brightness',
                              'set_color',
                              'play',
                              'pause',
                            ]
                            .map(
                              (c) => DropdownMenuItem(value: c, child: Text(c)),
                            )
                            .toList(),
                    onChanged: (val) => setState(() => command = val!),
                  ),
                  const SizedBox(height: 16),
                  TextField(
                    controller: valueController,
                    decoration: InputDecoration(
                      labelText: t('Value (Optional)'),
                    ),
                  ),
                ],
              ),
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: Text(t('Cancel')),
              ),
              ElevatedButton(
                onPressed: () {
                  if (selectedDeviceId == null) return;
                  Navigator.pop(context, {
                    'deviceId': selectedDeviceId,
                    'command': command,
                    if (valueController.text.isNotEmpty)
                      'value': valueController.text,
                  });
                },
                child: Text(t('Add')),
              ),
            ],
          );
        },
      ),
    );
  }
}

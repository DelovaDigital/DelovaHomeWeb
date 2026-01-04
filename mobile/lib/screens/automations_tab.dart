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
    return Scaffold(
      backgroundColor: Colors.transparent,
      appBar: AppBar(
        title: Text(t('Automations')),
        backgroundColor: Colors.transparent,
        elevation: 0,
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              _showAddAutomationDialog();
            },
          ),
        ],
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadAutomations,
              child: _automations.isEmpty
                  ? Center(child: Text(t('No automations found')))
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(
                        16,
                        0,
                        16,
                        120,
                      ), // Increased bottom padding to be safe
                      itemCount: _automations.length,
                      itemBuilder: (context, index) {
                        final automation = _automations[index];
                        return Card(
                          margin: const EdgeInsets.only(bottom: 12),
                          child: ListTile(
                            title: Text(
                              automation['name'] ?? 'Unnamed Automation',
                              style: const TextStyle(
                                fontWeight: FontWeight.bold,
                              ),
                            ),
                            subtitle: Text(
                              'Trigger: ${automation['trigger']?['type'] ?? 'Unknown'}',
                            ),
                            trailing: Switch(
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
                                  setState(() {
                                    automation['enabled'] = oldVal;
                                  });
                                  if (mounted) {
                                    ScaffoldMessenger.of(context).showSnackBar(
                                      SnackBar(
                                        content: Text('Failed to update: $e'),
                                      ),
                                    );
                                  }
                                }
                              },
                            ),
                            onTap: () {
                              // TODO: Edit automation
                            },
                          ),
                        );
                      },
                    ),
            ),
    );
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

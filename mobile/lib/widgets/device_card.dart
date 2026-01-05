import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../models/device.dart';
import '../services/api_service.dart';
import '../screens/device_detail_screen.dart';

class DeviceCard extends StatefulWidget {
  final Device device;
  final VoidCallback onRefresh;

  const DeviceCard({
    super.key,
    required this.device,
    required this.onRefresh,
  });

  @override
  State<DeviceCard> createState() => _DeviceCardState();
}

class _DeviceCardState extends State<DeviceCard> with SingleTickerProviderStateMixin {
  final ApiService _apiService = ApiService();
  late AnimationController _controller;
  late Animation<double> _scaleAnimation;
  bool _isToggling = false;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 150),
    );
    _scaleAnimation = Tween<double>(begin: 1.0, end: 0.95).animate(
      CurvedAnimation(parent: _controller, curve: Curves.easeInOut),
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _handleTapDown(_) => _controller.forward();
  void _handleTapUp(_) => _controller.reverse();
  void _handleTapCancel() => _controller.reverse();

  Future<void> _handleToggle() async {
    if (_isToggling) return;
    setState(() => _isToggling = true);
    HapticFeedback.lightImpact();

    try {
      final isPoweredOn = widget.device.status.isOn;
      String cmd = 'toggle';
      final type = widget.device.type.toLowerCase();
      
      // WoL Logic for PC/NAS/RPi
      if (!isPoweredOn && (
          type == 'pc' || type == 'computer' || type == 'workstation' ||
          type == 'nas' || type == 'server' ||
          type == 'rpi' || type == 'raspberry' || type == 'raspberrypi'
      )) {
        cmd = 'wake';
      }
      // PS5 Logic
      else if (type == 'ps5' || type == 'console') {
        cmd = isPoweredOn ? 'standby' : 'wake';
      }
      
      await _apiService.sendCommand(widget.device.id, cmd);
      widget.onRefresh();
    } catch (e) {
      debugPrint('Error toggling device: $e');
    } finally {
      if (mounted) setState(() => _isToggling = false);
    }
  }

  IconData _getDeviceIcon(String type) {
    switch (type.toLowerCase()) {
      case 'light': return Icons.lightbulb_outline;
      case 'hue': return Icons.lightbulb;
      case 'switch': return Icons.toggle_on_outlined;
      case 'tv': return Icons.tv;
      case 'speaker': return Icons.speaker;
      case 'pc': return Icons.computer;
      case 'console': return Icons.gamepad;
      case 'ps5': return Icons.gamepad;
      case 'camera': return Icons.videocam_outlined;
      case 'thermostat': return Icons.thermostat;
      default: return Icons.devices_other;
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colorScheme = theme.colorScheme;
    final isOn = widget.device.status.isOn;

    // Dynamic colors based on state
    final Color activeColor = colorScheme.primary;
    final Color inactiveColor = theme.brightness == Brightness.dark 
        ? colorScheme.surfaceContainerLow 
        : Colors.white;
    
    final Color contentColor = isOn ? colorScheme.onPrimary : colorScheme.onSurface;
    final Color iconColor = isOn ? colorScheme.onPrimary : colorScheme.onSurfaceVariant;

    return AnimatedBuilder(
      animation: _scaleAnimation,
      builder: (context, child) => Transform.scale(
        scale: _scaleAnimation.value,
        child: child,
      ),
      child: GestureDetector(
        onTapDown: _handleTapDown,
        onTapUp: (details) {
            _handleTapUp(details);
            Navigator.of(context).push(
                MaterialPageRoute(
                builder: (context) => DeviceDetailScreen(
                    device: widget.device,
                    onRefresh: widget.onRefresh,
                ),
                ),
            );
        },
        onTapCancel: _handleTapCancel,
        child: AnimatedContainer(
          duration: const Duration(milliseconds: 200),
          decoration: BoxDecoration(
            color: isOn ? activeColor : inactiveColor,
            borderRadius: BorderRadius.circular(24),
            border: Border.all(
              color: isOn 
                  ? Colors.transparent 
                  : (theme.brightness == Brightness.dark ? Colors.white10 : Colors.black.withValues(alpha: 0.05)),
              width: 1,
            ),
            boxShadow: [
              if (isOn && theme.brightness == Brightness.light)
                BoxShadow(
                  color: activeColor.withValues(alpha: 0.3),
                  blurRadius: 12,
                  offset: const Offset(0, 6),
                ),
               if (!isOn && theme.brightness == Brightness.light)
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.03),
                  blurRadius: 10,
                  offset: const Offset(0, 4),
                ),
            ],
          ),
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                // Header: Icon + Toggle
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Icon(
                      _getDeviceIcon(widget.device.type),
                      color: iconColor,
                      size: 26,
                    ),
                    // Circular Toggle Button (Action)
                    Material(
                      color: Colors.transparent,
                      child: InkWell(
                        onTap: _handleToggle,
                        borderRadius: BorderRadius.circular(50),
                        child: AnimatedContainer(
                          duration: const Duration(milliseconds: 200),
                          padding: const EdgeInsets.all(8),
                          decoration: BoxDecoration(
                            shape: BoxShape.circle,
                            color: isOn 
                                ? Colors.white.withValues(alpha: 0.2)
                                : (theme.brightness == Brightness.dark ? Colors.white.withValues(alpha: 0.05) : Colors.black.withValues(alpha: 0.05)),
                          ),
                          child: _isToggling
                            ? SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: contentColor))
                            : Icon(
                                Icons.power_settings_new_rounded,
                                color: contentColor,
                                size: 20,
                              ),
                        ),
                      ),
                    ),
                  ],
                ),
                
                const SizedBox(height: 12), // Minimum spacing

                // Footer: Name + Status
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      widget.device.name,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleMedium?.copyWith(
                        color: contentColor,
                        fontWeight: FontWeight.w600,
                        height: 1.2,
                        letterSpacing: -0.2,
                        fontSize: 15,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      isOn ? 'Aan' : (widget.device.status.powerState == 'standby' ? 'Standby' : 'Uit'),
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: contentColor.withValues(alpha: 0.7),
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

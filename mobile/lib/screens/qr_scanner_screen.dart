import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:qr_code_scanner/qr_code_scanner.dart';
import '../services/secure_tunnel_client.dart';

/// QR Scanner voor het scannen van hub credentials
class QRScannerScreen extends StatefulWidget {
  const QRScannerScreen({super.key});

  @override
  State<QRScannerScreen> createState() => _QRScannerScreenState();
}

class _QRScannerScreenState extends State<QRScannerScreen> {
  final GlobalKey qrKey = GlobalKey(debugLabel: 'QR');
  QRViewController? controller;
  bool isProcessing = false;

  @override
  void dispose() {
    controller?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Scan Hub QR Code'),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Column(
        children: [
          // Instructions
          Container(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                const Icon(Icons.qr_code_scanner, size: 48, color: Colors.blue),
                const SizedBox(height: 16),
                Text(
                  'Scan de QR-code van je hub',
                  style: Theme.of(context).textTheme.titleLarge,
                  textAlign: TextAlign.center,
                ),
                const SizedBox(height: 8),
                Text(
                  'Je vindt deze in Settings → Cloud & Remote',
                  style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                        color: Colors.grey[600],
                      ),
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),

          // QR Scanner
          Expanded(
            flex: 4,
            child: Stack(
              children: [
                QRView(
                  key: qrKey,
                  onQRViewCreated: _onQRViewCreated,
                  overlay: QrScannerOverlayShape(
                    borderColor: Colors.blue,
                    borderRadius: 16,
                    borderLength: 30,
                    borderWidth: 8,
                    cutOutSize: 300,
                  ),
                ),
                if (isProcessing)
                  Container(
                    color: Colors.black54,
                    child: const Center(
                      child: Card(
                        child: Padding(
                          padding: EdgeInsets.all(24.0),
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              CircularProgressIndicator(),
                              SizedBox(height: 16),
                              Text('Verbinden met hub...'),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),

          // Footer
          Container(
            padding: const EdgeInsets.all(20),
            child: Column(
              children: [
                const Icon(Icons.lock, size: 24, color: Colors.green),
                const SizedBox(height: 8),
                Text(
                  'End-to-end versleuteld',
                  style: TextStyle(
                    color: Colors.grey[600],
                    fontSize: 12,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  'Je data blijft privé en lokaal',
                  style: TextStyle(
                    color: Colors.grey[500],
                    fontSize: 11,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  void _onQRViewCreated(QRViewController controller) {
    this.controller = controller;
    controller.scannedDataStream.listen((scanData) {
      if (!isProcessing && scanData.code != null) {
        _handleQRCode(scanData.code!);
      }
    });
  }

  Future<void> _handleQRCode(String code) async {
    setState(() => isProcessing = true);

    try {
      // Parse QR data
      final data = jsonDecode(code) as Map<String, dynamic>;

      if (data['type'] != 'delovahome_hub') {
        throw Exception('Invalid QR code');
      }

      final hubId = data['hubId'] as String;
      final accessToken = data['accessToken'] as String;

      // Save credentials
      await TunnelCredentialsStorage.saveCredentials(
        hubId: hubId,
        accessToken: accessToken,
      );

      // Test connection
      final tunnel = SecureTunnelClient(
        hubId: hubId,
        accessToken: accessToken,
      );

      final connected = await tunnel.connect();

      if (!connected) {
        throw Exception('Kon niet verbinden met hub');
      }

      // Success!
      if (mounted) {
        Navigator.pop(context, true);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Row(
              children: [
                Icon(Icons.check_circle, color: Colors.white),
                SizedBox(width: 12),
                Text('Hub succesvol gekoppeld!'),
              ],
            ),
            backgroundColor: Colors.green,
          ),
        );
      }

      tunnel.disconnect();
    } catch (e) {
      setState(() => isProcessing = false);

      if (mounted) {
        showDialog(
          context: context,
          builder: (context) => AlertDialog(
            title: const Row(
              children: [
                Icon(Icons.error, color: Colors.red),
                SizedBox(width: 12),
                Text('Fout'),
              ],
            ),
            content: Text('Kon hub niet toevoegen:\n\n$e'),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('OK'),
              ),
            ],
          ),
        );
      }
    }
  }
}

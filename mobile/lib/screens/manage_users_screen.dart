import 'dart:convert';
import 'dart:io';
import 'package:flutter/material.dart';
import '../services/api_service.dart';

class ManageUsersScreen extends StatefulWidget {
  const ManageUsersScreen({super.key});

  @override
  State<ManageUsersScreen> createState() => _ManageUsersScreenState();
}

class _ManageUsersScreenState extends State<ManageUsersScreen> {
  final ApiService _apiService = ApiService();
  List<dynamic> _users = [];
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    _loadUsers();
  }

  Future<void> _loadUsers() async {
    setState(() => _isLoading = true);
    try {
      final baseUrl = await _apiService.getBaseUrl();
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => true;
      final request = await client.getUrl(Uri.parse('$baseUrl/api/users'));
      final response = await request.close();
      
      if (response.statusCode == 200) {
        final body = await response.transform(utf8.decoder).join();
        final data = jsonDecode(body);
        if (data['ok'] == true) {
          setState(() {
            _users = data['users'];
          });
        }
      }
    } catch (e) {
      debugPrint('Error loading users: $e');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  Future<void> _addUser() async {
    final usernameController = TextEditingController();
    final passwordController = TextEditingController();
    final confirmController = TextEditingController();

    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Add User'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextField(
              controller: usernameController,
              decoration: const InputDecoration(labelText: 'Username'),
            ),
            TextField(
              controller: passwordController,
              decoration: const InputDecoration(labelText: 'Password'),
              obscureText: true,
            ),
            TextField(
              controller: confirmController,
              decoration: const InputDecoration(labelText: 'Confirm Password'),
              obscureText: true,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancel'),
          ),
          ElevatedButton(
            onPressed: () async {
              if (usernameController.text.isEmpty || passwordController.text.isEmpty) return;
              if (passwordController.text != confirmController.text) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Passwords do not match')),
                );
                return;
              }

              Navigator.pop(context);
              await _performAddUser(usernameController.text, passwordController.text);
            },
            child: const Text('Add'),
          ),
        ],
      ),
    );
  }

  Future<void> _performAddUser(String username, String password) async {
    try {
      final baseUrl = await _apiService.getBaseUrl();
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => true;
      final request = await client.postUrl(Uri.parse('$baseUrl/api/register'));
      request.headers.set('Content-Type', 'application/json');
      request.add(utf8.encode(jsonEncode({
        'username': username,
        'password': password,
      })));
      
      final response = await request.close();
      final body = await response.transform(utf8.decoder).join();
      final data = jsonDecode(body);

      if (data['ok'] == true) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('User added successfully')),
        );
        _loadUsers();
      } else {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(data['message'] ?? 'Failed to add user')),
        );
      }
    } catch (e) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Error: $e')),
      );
    }
  }

  Future<void> _toggleAccess(int userId, bool currentAccess) async {
    try {
      final baseUrl = await _apiService.getBaseUrl();
      final client = HttpClient();
      client.badCertificateCallback = (cert, host, port) => true;
      final request = await client.postUrl(Uri.parse('$baseUrl/api/users/$userId/access'));
      request.headers.set('Content-Type', 'application/json');
      request.add(utf8.encode(jsonEncode({
        'access': !currentAccess,
      })));
      
      final response = await request.close();
      if (response.statusCode == 200) {
        _loadUsers();
      }
    } catch (e) {
      debugPrint('Error toggling access: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Manage Users'),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : ListView.builder(
              itemCount: _users.length,
              itemBuilder: (context, index) {
                final user = _users[index];
                final hasAccess = user['HubAccess'] == true || user['HubAccess'] == 1;
                
                return ListTile(
                  leading: CircleAvatar(child: Text(user['Username'][0].toUpperCase())),
                  title: Text(user['Username']),
                  subtitle: Text(user['Role'] ?? 'User'),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('Hub Access: '),
                      Switch(
                        value: hasAccess,
                        onChanged: (val) => _toggleAccess(user['Id'], hasAccess),
                      ),
                    ],
                  ),
                );
              },
            ),
      floatingActionButton: FloatingActionButton(
        onPressed: _addUser,
        child: const Icon(Icons.add),
      ),
    );
  }
}

import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';
import 'package:webview_flutter_wkwebview/webview_flutter_wkwebview.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_analytics/firebase_analytics.dart';
import 'package:firebase_crashlytics/firebase_crashlytics.dart';
import 'package:firebase_performance/firebase_performance.dart';
import 'package:shared_preferences/shared_preferences.dart';

bool _isFirebaseInitialized = false;
late final SharedPreferences _prefs;

Future<void> _initFirebaseSafely() async {
  try {
    // Attempt dynamic/default initialization
    await Firebase.initializeApp();
    _isFirebaseInitialized = true;
    debugPrint("Firebase initialized successfully");
  } catch (e) {
    debugPrint("Firebase initialization failed, using local caching mode: $e");
  }
}

// Fetch high scores
Future<List<Map<String, dynamic>>> _getScores() async {
  if (_isFirebaseInitialized) {
    final Trace trace = FirebasePerformance.instance.newTrace('get_leaderboard_scores');
    await trace.start();
    try {
      final snapshot = await FirebaseFirestore.instance
          .collection('leaderboard')
          .orderBy('score', descending: true)
          .limit(10)
          .get();
      
      final List<Map<String, dynamic>> firebaseScores = [];
      for (var doc in snapshot.docs) {
        final data = doc.data();
        firebaseScores.add({
          'name': data['name'] ?? 'Anonymous',
          'score': data['score'] ?? 0,
        });
      }
      
      // Cache the list to SharedPreferences for offline capability
      await _prefs.setString('cached_leaderboard', json.encode(firebaseScores));
      
      // Log successful fetch analytics event
      await FirebaseAnalytics.instance.logEvent(
        name: 'leaderboard_fetched',
        parameters: {'count': firebaseScores.length},
      );
      
      await trace.stop();
      return firebaseScores;
    } catch (e, stack) {
      debugPrint("Failed to fetch from Firebase, using cache: $e");
      await FirebaseCrashlytics.instance.recordError(
        e,
        stack,
        reason: 'Failed to fetch leaderboard scores',
      );
      await trace.stop();
    }
  }

  // Local fallback
  final cachedStr = _prefs.getString('cached_leaderboard');
  if (cachedStr != null) {
    try {
      final List<dynamic> decoded = json.decode(cachedStr);
      return decoded.map((item) => Map<String, dynamic>.from(item)).toList();
    } catch (e) {
      debugPrint("Failed to parse cached scores: $e");
    }
  }

  // Pre-seed defaults if no cache or Firebase database connection
  return [
    { 'name': "Sven The Great", 'score': 15000 },
    { 'name': "Björn Ironfist", 'score': 12400 },
    { 'name': "Linus Torvalds", 'score': 9800 },
    { 'name': "Freja Bloom", 'score': 7500 },
    { 'name': "Surströmming Fan", 'score': 4500 }
  ];
}

// Save high score
Future<void> _saveScore(String name, int score) async {
  if (_isFirebaseInitialized) {
    final Trace trace = FirebasePerformance.instance.newTrace('save_leaderboard_score');
    await trace.start();
    try {
      await FirebaseFirestore.instance.collection('leaderboard').add({
        'name': name,
        'score': score,
        'timestamp': FieldValue.serverTimestamp(),
      });
      debugPrint("Score saved to Firebase successfully");
      
      // Log analytics event
      await FirebaseAnalytics.instance.logPostScore(
        score: score,
        level: 1,
        character: name,
      );
      
      await trace.stop();
      return;
    } catch (e, stack) {
      debugPrint("Failed to save to Firebase, saving to local cache instead: $e");
      await FirebaseCrashlytics.instance.recordError(
        e,
        stack,
        reason: 'Failed to save high score to Firestore',
      );
      await trace.stop();
    }
  }

  // Cache locally
  final cachedStr = _prefs.getString('cached_leaderboard');
  List<Map<String, dynamic>> scores = [];
  if (cachedStr != null) {
    try {
      final List<dynamic> decoded = json.decode(cachedStr);
      scores = decoded.map((item) => Map<String, dynamic>.from(item)).toList();
    } catch (_) {}
  }
  
  scores.add({'name': name, 'score': score});
  scores.sort((a, b) => (b['score'] as int).compareTo(a['score'] as int));
  if (scores.length > 10) {
    scores = scores.sublist(0, 10);
  }
  
  await _prefs.setString('cached_leaderboard', json.encode(scores));
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  _prefs = await SharedPreferences.getInstance();
  await _initFirebaseSafely();

  if (_isFirebaseInitialized) {
    // Pass all uncaught framework errors from the Flutter framework to Crashlytics.
    FlutterError.onError = (FlutterErrorDetails errorDetails) {
      FirebaseCrashlytics.instance.recordFlutterFatalError(errorDetails);
    };
    // Pass all uncaught asynchronous errors that aren't handled by the Flutter framework to Crashlytics.
    PlatformDispatcher.instance.onError = (Object error, StackTrace stack) {
      FirebaseCrashlytics.instance.recordError(error, stack, fatal: true);
      return true;
    };
  }
  
  // Set preferred orientations to landscape only
  SystemChrome.setPreferredOrientations([
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]).then((_) {
    runApp(const MyApp());
  });
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Midsommer Madness',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: Colors.black,
        useMaterial3: true,
      ),
      home: const GameScreen(),
    );
  }
}

class GameScreen extends StatefulWidget {
  const GameScreen({super.key});

  @override
  State<GameScreen> createState() => _GameScreenState();
}

class _GameScreenState extends State<GameScreen> {
  late final WebViewController _controller;
  bool _isLoading = true;

  @override
  void initState() {
    super.initState();
    
    // Set fullscreen sticky immersive mode
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);

    // Set up creation parameters for iOS WebKit to allow autoplay
    final PlatformWebViewControllerCreationParams params =
        WebViewPlatform.instance is WebKitWebViewPlatform
            ? WebKitWebViewControllerCreationParams(
                allowsInlineMediaPlayback: true,
                mediaTypesRequiringUserAction: const <PlaybackMediaTypes>{},
              )
            : const PlatformWebViewControllerCreationParams();

    _controller = WebViewController.fromPlatformCreationParams(params)
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0x00000000))
      ..addJavaScriptChannel(
        'LeaderboardChannel',
        onMessageReceived: (JavaScriptMessage message) async {
          debugPrint('Received message from game: ${message.message}');
          try {
            final Map<String, dynamic> data = json.decode(message.message);
            final String type = data['type'] ?? '';
            
            if (type == 'getScores') {
              final scores = await _getScores();
              final scoresJson = json.encode(scores);
              _controller.runJavaScript("if (window.onScoresLoaded) { window.onScoresLoaded($scoresJson); }");
            } else if (type == 'saveScore') {
              final String name = data['name'] ?? 'Player Sven';
              final int score = data['score'] ?? 0;
              await _saveScore(name, score);
              
              // Load updated scores and send back to refresh UI
              final scores = await _getScores();
              final scoresJson = json.encode(scores);
              _controller.runJavaScript("if (window.onScoresLoaded) { window.onScoresLoaded($scoresJson); }");
            } else if (type == 'logEvent') {
              final String eventName = data['name'] ?? '';
              final Map<String, Object> params = Map<String, Object>.from(data['parameters'] ?? {});
              if (eventName.isNotEmpty && _isFirebaseInitialized) {
                await FirebaseAnalytics.instance.logEvent(name: eventName, parameters: params);
              }
            } else if (type == 'recordError') {
              final String errorMessage = data['message'] ?? 'JS WebView Error';
              final String stackString = data['stack'] ?? '';
              if (_isFirebaseInitialized) {
                await FirebaseCrashlytics.instance.recordError(
                  errorMessage,
                  StackTrace.fromString(stackString),
                  reason: 'JS Game Error via WebView',
                );
              }
            }
          } catch (e) {
            debugPrint('Error processing message from WebView: $e');
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (String url) {
            setState(() {
              _isLoading = true;
            });
          },
          onPageFinished: (String url) {
            // Inject the 'android-app' class to configure mobile styling and behavior
            _controller.runJavaScript("document.documentElement.classList.add('android-app');");
            // Signal to web page that the bridge is fully functional
            _controller.runJavaScript("if (window.onFlutterBridgeReady) { window.onFlutterBridgeReady(); }");
            setState(() {
              _isLoading = false;
            });
          },
          onWebResourceError: (WebResourceError error) {
            debugPrint('Web resource error: ${error.description}');
          },
        ),
      );

    // Platform-specific configuration
    final platform = _controller.platform;
    if (platform is AndroidWebViewController) {
      // Allow media playback without user gestures to enable game music/sfx autoplay
      platform.setMediaPlaybackRequiresUserGesture(false);
    }

    // Load local game asset
    _controller.loadFlutterAsset('assets/index.html');
  }

  @override
  void dispose() {
    // Restore default system UI mode and orientation settings when screen is disposed
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    SystemChrome.setPreferredOrientations([
      DeviceOrientation.portraitUp,
      DeviceOrientation.portraitDown,
      DeviceOrientation.landscapeLeft,
      DeviceOrientation.landscapeRight,
    ]);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        top: false,
        bottom: false,
        left: false,
        right: false,
        child: Stack(
          children: [
            WebViewWidget(controller: _controller),
            if (_isLoading)
              const Center(
                child: CircularProgressIndicator(
                  color: Colors.yellow, // Swedish themed accent
                ),
              ),
          ],
        ),
      ),
    );
  }
}

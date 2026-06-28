import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_platform_interface/webview_flutter_platform_interface.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:midsommer_madness/main.dart';

class MockWebViewPlatform extends WebViewPlatform {
  @override
  PlatformWebViewController createPlatformWebViewController(
    PlatformWebViewControllerCreationParams params,
  ) {
    return MockPlatformWebViewController(params);
  }

  @override
  PlatformWebViewWidget createPlatformWebViewWidget(
    PlatformWebViewWidgetCreationParams params,
  ) {
    return MockPlatformWebViewWidget(params);
  }

  @override
  PlatformNavigationDelegate createPlatformNavigationDelegate(
    PlatformNavigationDelegateCreationParams params,
  ) {
    return MockPlatformNavigationDelegate(params);
  }
}

class MockPlatformWebViewController extends PlatformWebViewController {
  MockPlatformWebViewController(PlatformWebViewControllerCreationParams params) : super.implementation(params);
  @override
  Future<void> setJavaScriptMode(JavaScriptMode javaScriptMode) async {}
  @override
  Future<void> setBackgroundColor(Color color) async {}
  @override
  Future<void> addJavaScriptChannel(JavaScriptChannelParams javaScriptChannelParams) async {}
  @override
  Future<void> setPlatformNavigationDelegate(PlatformNavigationDelegate handler) async {}
  @override
  Future<void> loadFlutterAsset(String key) async {}
  @override
  Future<void> runJavaScript(String javaScript) async {}
}

class MockPlatformWebViewWidget extends PlatformWebViewWidget {
  MockPlatformWebViewWidget(PlatformWebViewWidgetCreationParams params) : super.implementation(params);
  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}

class MockPlatformNavigationDelegate extends PlatformNavigationDelegate {
  MockPlatformNavigationDelegate(PlatformNavigationDelegateCreationParams params) : super.implementation(params);
  @override
  Future<void> setOnPageStarted(void Function(String url) onPageStarted) async {}
  @override
  Future<void> setOnPageFinished(void Function(String url) onPageFinished) async {}
  @override
  Future<void> setOnWebResourceError(void Function(WebResourceError error) onWebResourceError) async {}
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('Midsommer Madness App Smoke Test', (WidgetTester tester) async {
    // Register the mock webview platform
    WebViewPlatform.instance = MockWebViewPlatform();
    
    // Mock SharedPreferences values for the test context
    SharedPreferences.setMockInitialValues({});

    // Build our app and trigger a frame.
    await tester.pumpWidget(const MyApp());

    // Verify that the GameScreen is rendered.
    expect(find.byType(GameScreen), findsOneWidget);
    // WebViewWidget is built in GameScreen, and since MockPlatformWebViewWidget builds SizedBox.shrink, it still matches.
    expect(find.byType(WebViewWidget), findsOneWidget);
  });
}

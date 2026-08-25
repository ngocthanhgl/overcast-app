const fs = require('fs');

function patchSigning(gradlePath) {
  let gradle = fs.readFileSync(gradlePath, 'utf8');

  if (gradle.includes('signingConfig signingConfigs.release')) {
    console.log('Signing config already patched, skipping.');
    return;
  }

  if (!gradle.includes('buildTypes {')) {
    throw new Error('buildTypes block not found in ' + gradlePath);
  }

  const signingBlock = [
    '    signingConfigs {',
    '        release {',
    '            // Values injected via environment variables set from repository secrets',
    '            storeFile file(System.getenv("KEYSTORE_FILE") ?: "upload-keystore.jks")',
    '            storePassword System.getenv("KEYSTORE_PASSWORD")',
    '            keyAlias System.getenv("KEY_ALIAS")',
    '            keyPassword System.getenv("KEY_PASSWORD")',
    '        }',
    '    }',
    '',
  ].join('\n');

  gradle = gradle.replace('    buildTypes {', signingBlock + '    buildTypes {');
  gradle = gradle.replace(
    /(buildTypes \{\s*release \{\n)/,
    '$1                signingConfig signingConfigs.release\n'
  );

  if (!gradle.includes('signingConfig signingConfigs.release')) {
    throw new Error('Failed to inject release signing config');
  }

  fs.writeFileSync(gradlePath, gradle);
  console.log('Patched', gradlePath, 'with release signing config.');
}

function patchPermissions(manifestPath) {
  let manifest = fs.readFileSync(manifestPath, 'utf8');

  if (manifest.includes('ACCESS_FINE_LOCATION')) {
    console.log('Location permissions already present, skipping.');
    return;
  }

  if (!manifest.includes('<application')) {
    throw new Error('<application tag not found in ' + manifestPath);
  }

  const permissions = [
    '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />',
    '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />',
    '',
  ].join('\n');

  manifest = manifest.replace('    <application', permissions + '    <application');

  if (!manifest.includes('ACCESS_FINE_LOCATION')) {
    throw new Error('Failed to inject location permissions');
  }

  fs.writeFileSync(manifestPath, manifest);
  console.log('Patched', manifestPath, 'with location permissions.');
}

function findFile(startDir, fileName) {
  const stack = [startDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = require('path').join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === fileName) return full;
    }
  }
  return null;
}

function patchEdgeToEdge(androidRoot) {
  const mainActivityPath = findFile(require('path').join(androidRoot, 'app', 'src', 'main', 'java'), 'MainActivity.java');
  if (!mainActivityPath) throw new Error('MainActivity.java not found');
  let activity = fs.readFileSync(mainActivityPath, 'utf8');
  if (activity.includes('WindowCompat')) {
    console.log('Edge-to-edge already patched in MainActivity, skipping.');
    return;
  }
  if (!activity.includes('class MainActivity extends BridgeActivity')) {
    throw new Error('Unexpected MainActivity.java structure');
  }

  const imports = [
    ['import android.os.Bundle;', 'android.os.Bundle'],
    ['import android.os.Build;', 'android.os.Build'],
    ['import android.view.Window;', 'android.view.Window'],
    ['import android.graphics.Color;', 'android.graphics.Color'],
    ['import androidx.core.view.WindowCompat;', 'androidx.core.view.WindowCompat'],
  ];
  const anchor = /(import com\.getcapacitor\.BridgeActivity;\n)/;
  for (const [stmt] of imports) {
    if (!activity.includes(stmt)) {
      activity = activity.replace(anchor, '$1' + stmt + '\n');
    }
  }
  for (const [, symbol] of imports) {
    if (!activity.includes(symbol)) {
      throw new Error('Failed to inject import ' + symbol);
    }
  }

  const onCreateBlock = [
    'public class MainActivity extends BridgeActivity {',
    '    @Override',
    '    public void onCreate(Bundle savedInstanceState) {',
    '        super.onCreate(savedInstanceState);',
    '        Window window = getWindow();',
    '        WindowCompat.setDecorFitsSystemWindows(window, false);',
    '        window.setStatusBarColor(Color.TRANSPARENT);',
    '        window.setNavigationBarColor(Color.TRANSPARENT);',
    '        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {',
    '            window.setStatusBarContrastEnforced(false);',
    '            window.setNavigationBarContrastEnforced(false);',
    '        }',
    '    }',
    '}',
  ].join('\n');

  activity = activity.replace(/public class MainActivity extends BridgeActivity \{\s*\}/, onCreateBlock);
  if (!activity.includes('WindowCompat.setDecorFitsSystemWindows')) {
    throw new Error('Failed to inject edge-to-edge into MainActivity');
  }
  fs.writeFileSync(mainActivityPath, activity);
  console.log('Patched', mainActivityPath, 'with edge-to-edge.');
}

function patchHighRefreshRate(androidRoot) {
  const mainActivityPath = findFile(require('path').join(androidRoot, 'app', 'src', 'main', 'java'), 'MainActivity.java');
  if (!mainActivityPath) throw new Error('MainActivity.java not found');
  let activity = fs.readFileSync(mainActivityPath, 'utf8');

  if (activity.includes('preferredDisplayModeId')) {
    console.log('High refresh rate already patched in MainActivity, skipping.');
    return;
  }

  const anchor = '            window.setNavigationBarContrastEnforced(false);\n        }';
  if (!activity.includes(anchor)) {
    throw new Error('Edge-to-edge block not found in ' + mainActivityPath + ' (run edge-to-edge patch first)');
  }

  const hfrBlock = [
    '            window.setNavigationBarContrastEnforced(false);',
    '        }',
    '        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {',
    '            android.view.Display display = ((WindowManager) getSystemService(WINDOW_SERVICE)).getDefaultDisplay();',
    '            android.view.Display.Mode currentMode = display.getMode();',
    '            int bestModeId = currentMode.getModeId();',
    '            float bestRate = currentMode.getRefreshRate();',
    '            for (android.view.Display.Mode mode : display.getSupportedModes()) {',
    '                if (mode.getPhysicalWidth() == currentMode.getPhysicalWidth()',
    '                        && mode.getPhysicalHeight() == currentMode.getPhysicalHeight()',
    '                        && mode.getRefreshRate() > bestRate) {',
    '                    bestRate = mode.getRefreshRate();',
    '                    bestModeId = mode.getModeId();',
    '                }',
    '            }',
    '            if (bestModeId != currentMode.getModeId()) {',
    '                android.view.WindowManager.LayoutParams params = getWindow().getAttributes();',
    '                params.preferredDisplayModeId = bestModeId;',
    '                getWindow().setAttributes(params);',
    '            }',
    '        }',
    '',
  ].join('\n');

  activity = activity.replace(anchor, hfrBlock);
  if (!activity.includes('preferredDisplayModeId')) {
    throw new Error('Failed to inject high refresh rate selection');
  }
  fs.writeFileSync(mainActivityPath, activity);
  console.log('Patched', mainActivityPath, 'with high refresh rate selection.');
}

patchSigning('android/app/build.gradle');
patchPermissions('android/app/src/main/AndroidManifest.xml');
patchEdgeToEdge('android');
patchHighRefreshRate('android');

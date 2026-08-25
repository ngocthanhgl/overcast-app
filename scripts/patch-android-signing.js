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

patchSigning('android/app/build.gradle');
patchPermissions('android/app/src/main/AndroidManifest.xml');

const fs = require('fs');

const gradlePath = 'android/app/build.gradle';
let gradle = fs.readFileSync(gradlePath, 'utf8');

if (gradle.includes('signingConfig signingConfigs.release')) {
  console.log('Signing config already patched, skipping.');
  process.exit(0);
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

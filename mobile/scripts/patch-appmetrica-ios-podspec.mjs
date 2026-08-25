import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(projectRoot, 'node_modules', '@appmetrica', 'react-native-analytics');
const packageJsonPath = path.join(packageRoot, 'package.json');
const podspecPath = path.join(packageRoot, 'appmetrica-react-native-analytics.podspec');
const supportedVersion = '4.1.0';
const original = '  s.dependency "AppMetricaAnalytics", ">= 5.16.0", "< 6.0"';
const replacement = [
  '  s.dependency "AppMetricaCore", ">= 5.16.0", "< 6.0"',
  '  s.dependency "AppMetricaCrashes", ">= 5.16.0", "< 6.0"',
].join('\n');

if (!fs.existsSync(packageJsonPath) || !fs.existsSync(podspecPath)) {
  throw new Error('AppMetrica package is not installed; run npm install/npm ci first.');
}

const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
if (packageJson.version !== supportedVersion) {
  throw new Error(
    `Unsupported @appmetrica/react-native-analytics version ${packageJson.version}; expected ${supportedVersion}. Review the native dependency graph before updating.`
  );
}

const podspec = fs.readFileSync(podspecPath, 'utf8');
if (podspec.includes(replacement) && !podspec.includes(original)) {
  process.stdout.write('AppMetrica iOS podspec already uses Core + Crashes only.\n');
} else if (podspec.includes(original) && !podspec.includes(replacement)) {
  fs.writeFileSync(podspecPath, podspec.replace(original, replacement));
  process.stdout.write('Patched AppMetrica iOS podspec to exclude AppMetricaAdSupport.\n');
} else {
  throw new Error('Unexpected AppMetrica podspec shape; refusing an unsafe partial patch.');
}

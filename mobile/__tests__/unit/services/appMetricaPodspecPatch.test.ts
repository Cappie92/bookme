import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('AppMetrica iOS podspec patch contract', () => {
  const projectRoot = join(__dirname, '../../..');

  it('is installed as a reproducible package lifecycle step', () => {
    const packageJson = JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
    expect(packageJson.scripts.postinstall).toBe(
      'node ./scripts/patch-appmetrica-ios-podspec.mjs'
    );
  });

  it('pins the supported wrapper and replaces umbrella analytics with Core + Crashes', () => {
    const script = readFileSync(
      join(projectRoot, 'scripts/patch-appmetrica-ios-podspec.mjs'),
      'utf8'
    );
    expect(script).toContain("const supportedVersion = '4.1.0'");
    expect(script).toContain('s.dependency "AppMetricaCore"');
    expect(script).toContain('s.dependency "AppMetricaCrashes"');
    expect(script).toContain('Unexpected AppMetrica podspec shape');
  });
});

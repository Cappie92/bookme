import { readFileSync } from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve(__dirname, '../../..');

function source(relativePath: string): string {
  return readFileSync(path.join(mobileRoot, relativePath), 'utf8');
}

describe('iOS view-controller status bar', () => {
  it('pins UIViewControllerBasedStatusBarAppearance to true in plist and Expo config', () => {
    const plist = source('ios/DeDato/Info.plist');
    const appConfig = source('app.config.ts');
    expect(plist).toMatch(
      /<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<true\/>/
    );
    expect(plist).not.toMatch(
      /<key>UIViewControllerBasedStatusBarAppearance<\/key>\s*<false\/>/
    );
    expect(appConfig).toContain('UIViewControllerBasedStatusBarAppearance: true');
  });

  it('attributes the client status bar style to the client stack, not the login form', () => {
    const clientLayout = source('app/(client)/client/_layout.tsx');
    const login = source('app/login.tsx');
    expect(clientLayout).toContain("statusBarStyle: 'dark'");
    expect(clientLayout).toContain('name="dashboard"');
    expect(login).not.toContain('statusBarStyle');
    expect(source('app/(master)/_layout.tsx')).not.toContain('statusBarStyle');
    expect(source('app/(master)/index.tsx')).toContain("Platform.OS === 'android' ? <StatusBar style=\"auto\" /> : null");
  });
});

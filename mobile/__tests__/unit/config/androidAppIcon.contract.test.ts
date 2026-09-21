import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

describe('Android launcher icon follows iOS source of truth', () => {
  const root = path.resolve(__dirname, '../../..');
  const rel = (relative: string) => path.join(root, relative);

  it('app.config points at the current committed icon assets', () => {
    const appConfig = readFileSync(rel('app.config.ts'), 'utf8');
    expect(appConfig).toContain("icon: './assets/icon.png'");
    expect(appConfig).toContain("foregroundImage: './assets/adaptive-icon.png'");
    expect(appConfig).toContain("backgroundColor: '#4CAF50'");
    expect(existsSync(rel('assets/icon.png'))).toBe(true);
    expect(existsSync(rel('assets/adaptive-icon.png'))).toBe(true);
    expect(
      existsSync(rel('ios/DeDato/Images.xcassets/AppIcon.appiconset/App-Icon-1024x1024@1x.png'))
    ).toBe(true);
  });

  it('committed adaptive XML uses native foreground + brand background', () => {
    const launcher = readFileSync(rel('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml'), 'utf8');
    const round = readFileSync(
      rel('android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml'),
      'utf8'
    );
    const colors = readFileSync(rel('android/app/src/main/res/values/colors.xml'), 'utf8');
    expect(launcher).toContain('@mipmap/ic_launcher_foreground');
    expect(round).toContain('@mipmap/ic_launcher_foreground');
    expect(colors).toContain('iconBackground');
    expect(colors).toContain('#4CAF50');
  });

  it('keeps launcher mipmaps for all densities', () => {
    const densities = ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi'];
    for (const density of densities) {
      const folder = rel(`android/app/src/main/res/mipmap-${density}`);
      expect(existsSync(path.join(folder, 'ic_launcher.webp'))).toBe(true);
      expect(existsSync(path.join(folder, 'ic_launcher_round.webp'))).toBe(true);
      expect(existsSync(path.join(folder, 'ic_launcher_foreground.webp'))).toBe(true);
    }
  });
});

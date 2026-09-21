import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

type ArtworkMetrics = {
  path: string;
  size: [number, number];
  bbox: [number, number, number, number];
  max_side_pct: number;
  min_side_pct: number;
  left_pct: number;
  right_pct: number;
  top_pct: number;
  bottom_pct: number;
  cx_pct: number;
  cy_pct: number;
  corners_transparent: boolean;
};

type IconGeometry = {
  viewport_scale: number;
  unsafe_outer_pct: number;
  icon: ArtworkMetrics;
  adaptive: ArtworkMetrics;
  target_foreground_max_side_pct: number;
  target_foreground_min_side_pct: number;
  densities: Record<
    string,
    { legacy: ArtworkMetrics; round: ArtworkMetrics; foreground: ArtworkMetrics }
  >;
};

describe('Android launcher icon follows icon.png visual source of truth', () => {
  const root = path.resolve(__dirname, '../../..');
  const rel = (relative: string) => path.join(root, relative);
  const generator = rel('scripts/dev/generate_app_icons.py');

  const geometry: IconGeometry = JSON.parse(
    execFileSync('python3', [generator, '--measure-json'], { encoding: 'utf8' })
  );

  it('app.config points at the current committed icon assets', () => {
    const appConfig = readFileSync(rel('app.config.ts'), 'utf8');
    expect(appConfig).toContain("icon: './assets/icon.png'");
    expect(appConfig).toContain("foregroundImage: './assets/adaptive-icon.png'");
    expect(appConfig).toContain("backgroundColor: '#4CAF50'");
    expect(existsSync(rel('assets/icon.png'))).toBe(true);
    expect(existsSync(rel('assets/adaptive-icon.png'))).toBe(true);
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

  it('derives adaptive foreground bounds from icon.png × Android 2/3 viewport', () => {
    expect(geometry.viewport_scale).toBeCloseTo(2 / 3, 6);
    expect(geometry.icon.max_side_pct).toBeGreaterThan(50);
    expect(geometry.icon.max_side_pct).toBeLessThan(65);
    expect(geometry.target_foreground_max_side_pct).toBeCloseTo(
      geometry.icon.max_side_pct * geometry.viewport_scale,
      6
    );

    const source = readFileSync(generator, 'utf8');
    expect(source).toContain('ADAPTIVE_VIEWPORT_SCALE = 2 / 3');
    expect(source).toContain('adaptive_foreground_from_icon');
    expect(source).not.toContain('fit_center(SIZE, white, 0.58)');
  });

  it('keeps adaptive foreground artwork inside the safe zone and matching the target', () => {
    const { adaptive, target_foreground_max_side_pct, unsafe_outer_pct } = geometry;
    expect(adaptive.corners_transparent).toBe(true);
    expect(adaptive.max_side_pct).toBeCloseTo(target_foreground_max_side_pct, 0);
    expect(Math.abs(adaptive.max_side_pct - target_foreground_max_side_pct)).toBeLessThan(1.5);
    expect(adaptive.left_pct).toBeGreaterThan(unsafe_outer_pct);
    expect(adaptive.right_pct).toBeGreaterThan(unsafe_outer_pct);
    expect(adaptive.top_pct).toBeGreaterThan(unsafe_outer_pct);
    expect(adaptive.bottom_pct).toBeGreaterThan(unsafe_outer_pct);
    expect(adaptive.cx_pct).toBeCloseTo(50, 0);
    expect(adaptive.cy_pct).toBeCloseTo(50, 0);
    // Old oversized footprint (~60% of the 108dp layer) must not return.
    expect(adaptive.max_side_pct).toBeLessThan(50);
  });

  it('matches icon.png on legacy mipmaps and scaled adaptive foreground mipmaps', () => {
    const { icon, target_foreground_max_side_pct, unsafe_outer_pct, densities } = geometry;
    for (const [folder, maps] of Object.entries(densities)) {
      expect(Math.abs(maps.legacy.max_side_pct - icon.max_side_pct)).toBeLessThan(3);
      expect(Math.abs(maps.round.max_side_pct - icon.max_side_pct)).toBeLessThan(3);
      expect(maps.foreground.corners_transparent).toBe(true);
      expect(Math.abs(maps.foreground.max_side_pct - target_foreground_max_side_pct)).toBeLessThan(
        folder === 'mipmap-mdpi' ? 4 : 2
      );
      expect(maps.foreground.left_pct).toBeGreaterThan(unsafe_outer_pct - 1);
      expect(maps.foreground.right_pct).toBeGreaterThan(unsafe_outer_pct - 1);
      expect(maps.foreground.top_pct).toBeGreaterThan(unsafe_outer_pct - 1);
      expect(maps.foreground.bottom_pct).toBeGreaterThan(unsafe_outer_pct - 1);
      expect(maps.foreground.max_side_pct).toBeLessThan(50);
    }
  });
});

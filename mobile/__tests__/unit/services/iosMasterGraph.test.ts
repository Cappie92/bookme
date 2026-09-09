import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

// Source graph complements the real Metro exports. API barrels are intentionally
// not expanded: they also serve the untouched client/Android route trees.
describe('iOS master platform-resolved source graph', () => {
  it('cannot reach master loyalty, commerce screens or StoreKit lifecycle', () => {
    const root = path.resolve(__dirname, '../../..');
    const resolve = (base: string): string | null => {
      for (const suffix of ['.ios.tsx', '.ios.ts', '.native.tsx', '.native.ts', '.tsx', '.ts', '.js', '/index.ios.tsx', '/index.tsx', '/index.ts']) {
        if (existsSync(base + suffix)) return base + suffix;
      }
      return existsSync(base) && statSync(base).isFile() ? base : null;
    };
    const list = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap(
      (entry) => entry.isDirectory() ? list(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
    );
    const seen = new Set<string>();
    const unresolved: string[] = [];
    const visit = (file: string | null) => {
      if (!file || seen.has(file)) return;
      seen.add(file);
      const ast = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      for (const node of ast.statements) {
        if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
        if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
        if ((ts.isImportDeclaration(node) && node.importClause?.isTypeOnly) || (ts.isExportDeclaration(node) && node.isTypeOnly)) continue;
        const spec = node.moduleSpecifier.text;
        const base = spec.startsWith('@src/') ? path.join(root, 'src', spec.slice(5))
          : spec.startsWith('.') ? path.resolve(path.dirname(file), spec) : null;
        if (!base) continue;
        const target = resolve(base);
        if (!target) { unresolved.push(spec); continue; }
        if (!target.includes('/services/api/')) visit(target);
      }
    };
    list(path.join(root, 'app/(master)'))
      .filter((file) => /\.(ts|tsx)$/.test(file) && !file.includes('.android.'))
      .forEach((file) => visit(resolve(file.replace(/(?:\.ios)?\.(tsx|ts)$/, ''))));
    visit(path.join(root, 'app/_layout.tsx'));
    const graph = [...seen].map((file) => path.relative(root, file));
    expect(unresolved).toEqual([]);
    expect(graph).toContain('src/components/loyalty/MasterBookingLoyaltyHost.ios.tsx');
    expect(graph).not.toContain('src/components/loyalty/MasterLoyaltyInfo.tsx');
    expect(graph).not.toContain('src/components/subscriptions/AppleIapLifecycle.tsx');
    expect(graph).not.toContain('src/components/subscriptions/SubscriptionPurchaseModal.tsx');
    expect(graph).not.toContain('src/screens/master/CommerceSubscriptionsScreen.tsx');
    expect(graph).not.toContain('src/components/FeatureLock.tsx');
  });
});

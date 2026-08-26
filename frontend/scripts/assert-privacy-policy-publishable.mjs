import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const guardedSourcePaths = [
  path.join(root, 'src', 'content', 'legal', 'privacy-policy.source.txt'),
  path.join(root, 'src', 'pages', 'UserAgreement.jsx'),
];
const draftMarkers = [
  '[ЛОКАЛЬНЫЙ DRAFT — НЕ ПУБЛИКОВАТЬ]',
  '[ТРЕБУЕТ ПОДТВЕРЖДЕНИЯ ВЛАДЕЛЬЦА ПЕРЕД ПУБЛИКАЦИЕЙ',
  '[ТРЕБУЕТ ЮРИДИЧЕСКОЙ ПРОВЕРКИ ПЕРЕД ПУБЛИКАЦИЕЙ',
];
const unresolved = guardedSourcePaths.flatMap((sourcePath) => {
  const source = fs.readFileSync(sourcePath, 'utf8');
  return draftMarkers
    .filter((marker) => source.includes(marker))
    .map((marker) => `${path.relative(root, sourcePath)}: ${marker}`);
});

if (unresolved.length === 0) {
  process.stdout.write('Legal documents contain no draft publication blockers.\n');
} else if (process.env.ALLOW_PRIVACY_POLICY_DRAFT_BUILD === '1') {
  process.stderr.write(
    'WARNING: building local Privacy Policy draft with unresolved owner/legal markers. Do not deploy this build.\n'
  );
} else {
  throw new Error(
    'Legal documents are local drafts with unresolved owner/legal markers. Publication/build is blocked. For local verification only, set ALLOW_PRIVACY_POLICY_DRAFT_BUILD=1.'
  );
}

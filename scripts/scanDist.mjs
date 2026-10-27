// Scans the built bundle (default dist/) for credentials, non-HTTPS URLs and, for a RELEASE bundle,
// demo-layer markers (the demo chunk's file name, the demo code's symbols, the demo storage prefix and the
// invented demo places; see demoMarkers.mjs), and checks the packages it ships: the icon set is exactly the pinned
// one (and never zero icons detected), and THIRD_PARTY_NOTICES.txt has a notice for every runtime package
// (lucide-react ISC with the Feather MIT notice, react, react-dom, scheduler) at the installed version.
// Details of what is and is not read: scanDistLib.mjs.
// Usage: npm run build:release                            release build + this scan (demo markers are findings)
//        npm run build:demo && npm run scan:dist:demo     demo build: demo markers are allowed
// Exit 1 on any finding, on any file or folder that could not be read, or if the folder is missing or empty.
import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { isFailure, scanDirectory } from './scanDistLib.mjs';

const args = process.argv.slice(2);
const allowDemo = args.includes('--allow-demo');
const root = resolve(args.find((a) => !a.startsWith('--')) ?? 'dist');

try {
  statSync(root);
} catch {
  console.error(`scan:dist: ${root} does not exist. Run "npm run build" first.`);
  process.exit(1);
}

const result = scanDirectory(root, { allowDemo });
for (const f of result.findings) console.error(`scan:dist: ${f.file}: ${f.name} near "${f.context}"`);
for (const u of result.unreadable) console.error(`scan:dist: ${u.path}: could not be read (${u.reason})`);
for (const s of result.skipped) console.log(`scan:dist: ${s}: not scanned (binary or unknown type; content not checked)`);
if (result.scanned.length === 0) console.error(`scan:dist: no files scanned in ${root}`);
const failed = isFailure(result);
console.log(
  `scan:dist: scanned ${result.scanned.length} file(s), not scanned ${result.skipped.length}, unreadable ${result.unreadable.length}, icons bundled ${result.icons.length} (${result.icons.join(', ') || 'none'}) in ${root} (${allowDemo ? 'demo build: demo markers allowed' : 'release build: demo markers are findings'}); ${failed ? 'FINDINGS (see above)' : 'no findings'}`,
);
process.exit(failed ? 1 : 0);

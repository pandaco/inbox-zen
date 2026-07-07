#!/usr/bin/env node
// nx release's own commit (nx.json release.git.commit) reliably captures
// version bumps and project-level CHANGELOG.md files, but the workspace-root
// CHANGELOG.md write lands after that commit and is left dirty — happened
// identically at 0.2.3 (manually patched via commit b29cb4f) and 0.2.4.
// This sweeps up only changelog files nx release touched; anything else
// dirty is left for manual review rather than blindly staged.
import { execSync } from 'node:child_process';

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf-8' }).trim();
}

const status = sh('git status --porcelain');
if (!status) {
  console.log('finalize-release: nothing left to commit.');
  process.exit(0);
}

const dirtyFiles = status
  .split('\n')
  .map(line => line.slice(3))
  .filter(f => f === 'CHANGELOG.md' || f.endsWith('/CHANGELOG.md'));

if (dirtyFiles.length === 0) {
  console.log('finalize-release: leftover changes are not changelog files — leaving them for manual review:');
  console.log(status);
  process.exit(0);
}

execSync(`git add ${dirtyFiles.map(f => `"${f}"`).join(' ')}`);
execSync('git commit -m "docs: sync changelog left uncommitted by nx release"');
console.log(`finalize-release: committed ${dirtyFiles.join(', ')}`);

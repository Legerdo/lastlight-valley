import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
const dir = 'evidence/release'; await mkdir(dir, { recursive: true });
const results = [];
for (const script of ['test', 'build']) {
  const r = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', `npm run ${script}`], { encoding: 'utf8' })
    : spawnSync('npm', ['run', script], { encoding: 'utf8' });
  process.stdout.write(r.stdout ?? ''); process.stderr.write(r.stderr ?? '');
  await writeFile(`${dir}/${script}.log`, `${r.stdout ?? ''}\n${r.stderr ?? ''}`);
  results.push({ command: `npm run ${script}`, exitCode: r.status, error: r.error?.message });
  if (r.status !== 0) { await writeFile(`${dir}/build-check.json`, JSON.stringify({ results }, null, 2)); process.exit(r.status ?? 1); }
}
const files = ['src/art.ts','src/world.ts','src/simulation.ts','src/render.ts','src/main.ts','src/ui.ts','src/style.css','src/audio.ts','package-lock.json'];
const hashes = {};
for (const file of files) hashes[file] = createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(`${dir}/build-check.json`, JSON.stringify({ date: new Date().toISOString(), node: process.version, platform: process.platform, results, hashes }, null, 2));

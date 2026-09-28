import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const build = await json('evidence/release/build-check.json');
const run = await json('evidence/release/report.json');
const motion = await json('evidence/motion/report.json');
const art = await json('evidence/art/frame-qc.json');
const perf = await json('evidence/performance/combat-30s.json');
const ps = spawnSync('pwsh', ['-NoProfile', '-Command', '@{os=(Get-CimInstance Win32_OperatingSystem | Select-Object Caption,Version,BuildNumber); cpu=(Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores,NumberOfLogicalProcessors); ram=(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory; gpu=(Get-CimInstance Win32_VideoController | Select-Object Name,DriverVersion)} | ConvertTo-Json -Depth 4 -Compress'], { encoding: 'utf8' });
const environment = ps.status === 0 ? JSON.parse(ps.stdout.trim().replace(/^\uFEFF/, '')) : { unavailable: ps.stderr };
const victory = run.checkpoints.find(c => c.name === 'victory');
const report = {
  generatedAt: new Date().toISOString(), title: '잔광의 계곡', build,
  functional: { outcome: run.outcome, failure: run.failure, errors: run.errors, browser: run.browser,
    checkpoints: run.checkpoints.map(c => ({ name: c.name, phase: c.phase, elapsed: c.elapsed, wallSeconds: c.wallSeconds, hp: c.player.hp, kills: c.kills, dodges: c.dodges })),
    victoryGameSeconds: victory?.elapsed, victoryWallSeconds: victory?.wallSeconds },
  motion: { failure: motion.failure ?? null, errors: motion.errors, checks: motion.checks, frames: motion.samples.length, video: motion.video },
  art: art.map(s => ({ kind: s.kind, size: s.size, anchor: s.anchor, frames: s.totalFrames, clipped: s.clipped.length, empty: s.empty.length })),
  performance: { ...perf, frameTimes: undefined }, environment,
  limitations: ['Normal-input automated shortest-route time is not a first-time human playtime study; 5–8 minute target remains unverified.', 'Audio implementation and mute state checked, but no human listening test.', 'Motion review is limited to captured directions, actions and occlusion routes; no claim of exhaustive coverage.'],
};
await writeFile('evidence/SUMMARY.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
if (run.outcome !== 'passed' || motion.failure || motion.errors.length || art.some(a => a.clipped.length || a.empty.length)) process.exitCode = 1;

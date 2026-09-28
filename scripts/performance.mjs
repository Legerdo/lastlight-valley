import { spawn } from 'node:child_process';
// A clean, uncaptured normal playthrough reaches combat without development teleports.
const child = spawn(process.execPath, ['scripts/playtest.mjs'], { stdio: 'inherit', env: { ...process.env, VIDEO: '0', HEADED: process.env.HEADED ?? '1' } });
child.on('exit', code => process.exit(code ?? 1));

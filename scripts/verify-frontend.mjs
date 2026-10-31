// Sequential checks with streamed logs and an evidence file after every command.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const phase = process.argv[2] ?? "latest";
if (!/^[a-z0-9-]+$/i.test(phase)) throw Error("Invalid evidence label");
fs.mkdirSync(path.join(root, ".qa"), { recursive: true });
const results = [];
const npmCli = [process.env.npm_execpath, path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'), path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js')].find(p => p && fs.existsSync(p));
if (!npmCli) throw Error('Cannot locate npm CLI beside the Node installation');
const checks = [
  { command: 'node --test scripts/check-private.test.mjs', args: ['--test', path.join(root, 'scripts/check-private.test.mjs')], cwd: root },
  ...[['run', 'format:check'], ['run', 'lint'], ['run', 'typecheck'], ['run', 'test', '--', '--run'], ['run', 'build'], ['run', 'test:e2e']].map(args => ({ command: `npm ${args.join(' ')}`, args: [npmCli, ...args], cwd: path.join(root, 'frontend') })),
  { command: 'node scripts/check-private.mjs --tracked', args: [path.join(root, 'scripts/check-private.mjs'), '--tracked'], cwd: root },
];
async function run(check) {
  console.log(check.command);
  return new Promise(resolve => {
    const child = spawn(process.execPath, check.args, { cwd: check.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '', timedOut = false, settled = false;
    const collect = (data, stream) => { const text = data.toString(); output += text; stream.write(text); };
    child.stdout.on('data', data => collect(data, process.stdout));
    child.stderr.on('data', data => collect(data, process.stderr));
    const timeout = setTimeout(() => {
      timedOut = true;
      if (process.platform === 'win32' && child.pid) spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else child.kill('SIGTERM');
    }, check.command.endsWith('test:e2e') ? 1800000 : 180000);
    const finish = (exitCode, signal, error) => { if (settled) return; settled = true; clearTimeout(timeout); resolve({ command: check.command, exitCode, signal, error, timedOut, output }); };
    child.once('error', error => finish(1, null, error.message));
    child.once('close', (code, signal) => finish(code, signal));
  });
}
for (const check of checks) {
  const record = await run(check);
  results.push(record);
  fs.writeFileSync(
    path.join(root, ".qa", `${phase}-checks.json`),
    JSON.stringify(results, null, 2),
  );
  if (record.exitCode !== 0) {
    process.exitCode = 1;
    break;
  }
}

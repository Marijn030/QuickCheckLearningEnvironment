'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PORT = 3001;
const IMAGES = { quickcheck: 'specification-lab-quickcheck:local', fitspec: 'specification-lab-fitspec:local' };
const MAX_SOURCE = 100_000;
const MAX_OUTPUT = 40_000;
const RUN_TIMEOUT_MS = { quickcheck: 25_000, fitspec: 90_000 };
const ALLOWED_ORIGINS = new Set(['http://localhost:5500', 'http://127.0.0.1:5500']);
const reference = path.join(__dirname, 'Reference.hs');

function execute(folder, kind) {
  return new Promise((resolve) => {
    const args = [
      'run', '--rm', '--network', 'none', '--read-only', '--cap-drop', 'ALL',
      '--security-opt', 'no-new-privileges', '--pids-limit', '64',
      '--memory', '512m', '--cpus', '1', '--user', '65534:65534',
      '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=192m,mode=1777',
      '--mount', `type=bind,source=${folder},target=/work,readonly`,
      '--workdir', '/tmp', IMAGES[kind],
      'sh', '-c',
      'ghc -v0 -O0 -outputdir /tmp -i/work -o /tmp/student /work/Main.hs /work/Reference.hs && /tmp/student'
    ];
    const containerName = `spec-lab-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    args.splice(2, 0, '--name', containerName);
    const child = spawn('docker', args, { windowsHide: true });
    const stopContainer = () => {
      const cleanup = spawn('docker', ['rm', '-f', containerName], { windowsHide: true, stdio: 'ignore' });
      cleanup.on('error', () => {});
      child.kill();
    };
    let output = '';
    let exceeded = false;
    let timedOut = false;
    const add = (chunk) => {
      const str = chunk.toString('utf8');
      output += str.slice(0, Math.max(0, MAX_OUTPUT - output.length));
      if (output.length >= MAX_OUTPUT && !exceeded) {
        exceeded = true;
        stopContainer();
      }
    };
    child.stdout.on('data', add);
    child.stderr.on('data', add);
    const timer = setTimeout(() => { timedOut = true; stopContainer(); }, RUN_TIMEOUT_MS[kind]);
    child.on('error', (error) => { clearTimeout(timer); resolve({ ok: false, output: `Unable to launch Docker: ${error.message}` }); });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ ok: code === 0 && !timedOut && !exceeded,
        output: output + (timedOut ? '\nExecution timed out.' : exceeded ? '\nOutput limit reached.' : '') });
    });
  });
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.writeHead(ALLOWED_ORIGINS.has(origin) ? 204 : 403).end();
    return;
  }
  const kind = req.url === '/api/quickcheck' ? 'quickcheck' : req.url === '/api/fitspec' ? 'fitspec' : null;
  if (req.method !== 'POST' || !kind) {
    res.writeHead(404).end(JSON.stringify({ error: 'Not found' })); return;
  }
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    res.writeHead(403).end(JSON.stringify({ error: 'Origin not allowed' })); return;
  }
  let raw = '';
  try {
    for await (const chunk of req) {
      raw += chunk.toString();
      if (raw.length > MAX_SOURCE + 1024) throw new Error('Submission too large');
    }
    const { code } = JSON.parse(raw);
    if (typeof code !== 'string' || !code.trim() || code.length > MAX_SOURCE) throw new Error('Invalid Haskell source');
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-lab-'));
    try {
      await fs.writeFile(path.join(folder, 'Main.hs'), code, { mode: 0o644 });
      await fs.copyFile(reference, path.join(folder, 'Reference.hs'));
      // Docker Desktop bind mounts may need readable host files.
      const result = await execute(folder, kind);
      res.writeHead(200).end(JSON.stringify(result));
    } finally {
      await fs.rm(folder, { recursive: true, force: true });
    }
  } catch (error) {
    res.writeHead(400).end(JSON.stringify({ error: error.message }));
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`QuickCheck + FitSpec API listening at http://localhost:${PORT}`));

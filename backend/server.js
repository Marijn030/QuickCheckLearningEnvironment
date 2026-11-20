'use strict';

const http = require('node:http');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '127.0.0.1';
const IMAGES = {
  quickcheck: 'specification-lab-quickcheck:prod-test',
  fitspec: 'specification-lab-fitspec:prod-test'
};
const MAX_SOURCE_BYTES = 100_000;
const MAX_REQUEST_BYTES = MAX_SOURCE_BYTES + 1024;
const MAX_OUTPUT_BYTES = 40_000;
const RUN_TIMEOUT_MS = { quickcheck: 25_000, fitspec: 90_000 };
const MAX_CONCURRENT = 2;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 8;
const ALLOWED_ORIGINS = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500')
    .split(',').map(s => s.trim()).filter(Boolean)
);
const references = { insert: path.join(__dirname, 'Reference.hs'), sort: path.join(__dirname, 'ReferenceSort.hs') };
const { runSortCoverage } = require('./coverage-sort');
const { runCoverage } = require('./coverage');

let activeRuns = 0;
const rateBuckets = new Map();

function json(res, status, value) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

function allowRequest(ip) {
  const now = Date.now();
  // Fixed-window limit; intended for a directly connected API or a trusted proxy
  // that enforces its own IP-based limits. Never trust X-Forwarded-For here.
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count += 1;
  return bucket.count <= RATE_MAX;
}

const rateCleanup = setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of rateBuckets) {
    if (now >= bucket.resetAt) rateBuckets.delete(ip);
  }
}, RATE_WINDOW_MS);
rateCleanup.unref();

function runCommand(command, args, timeoutMs = 10_000) {
  return new Promise(resolve => {
    const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
    let settled = false;
    const finish = ok => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(ok);
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(false);
    }, timeoutMs);
    child.once('error', () => finish(false));
    child.once('close', code => finish(code === 0));
  });
}

async function execute(folder, kind, signal) {
  const containerName = `spec-lab-${randomUUID()}`;
  const args = [
    'run', '--rm', '--name', containerName,
    '--network', 'none', '--read-only',
    '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--pids-limit', '64', '--memory', '512m', '--memory-swap', '512m',
    '--cpus', '1', '--user', '65534:65534',
    '--tmpfs', '/tmp:rw,exec,nosuid,nodev,size=192m,mode=1777',
    '--mount', `type=bind,source=${folder},target=/work,readonly`,
    '--workdir', '/tmp', IMAGES[kind],
    'sh', '-c',
    'ghc -v0 -O0 -outputdir /tmp -i/work -o /tmp/student /work/Main.hs /work/Reference.hs && /tmp/student'
  ];

  let output = '';
  let outputBytes = 0;
  let reason = null;
  let child;
  let closed = false;
  let resolveClose;
  const closePromise = new Promise(resolve => { resolveClose = resolve; });

  const addOutput = chunk => {
    const remaining = MAX_OUTPUT_BYTES - outputBytes;
    if (remaining > 0) {
      const kept = chunk.subarray(0, remaining);
      output += kept.toString('utf8');
      outputBytes += kept.length;
    }
    if (chunk.length > remaining) terminate('output');
  };

  // A container can be created slightly after the Docker CLI starts. Cleanup
  // retries to cover that race; the unique name avoids affecting other jobs.
  let cleanupPromise = null;
  function cleanupContainer() {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        await runCommand('docker', ['rm', '-f', containerName], 5_000);
        if (closed) break;
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    })();
    return cleanupPromise;
  }

  function terminate(why) {
    if (reason) return;
    reason = why;
    void cleanupContainer();
    // Docker CLI is killed after the removal attempt to avoid leaving an
    // attached process indefinitely. A second cleanup follows below.
  }

  const abort = () => terminate('aborted');
  if (signal.aborted) return { ok: false, output: 'Request cancelled.' };
  signal.addEventListener('abort', abort, { once: true });

  let timer;
  try {
    child = spawn('docker', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', addOutput);
    child.stderr.on('data', addOutput);
    child.once('error', err => {
      console.error('Docker launch error:', err);
      if (!reason) reason = 'launch';
      closed = true;
      resolveClose(null);
    });
    child.once('close', code => {
      closed = true;
      resolveClose(code);
    });
    timer = setTimeout(() => terminate('timeout'), RUN_TIMEOUT_MS[kind]);
    if (signal.aborted) terminate('aborted');

    // Wait for either Docker to exit or a cancellation to trigger cleanup.
    const code = await Promise.race([
      closePromise,
      new Promise(resolve => {
        const interval = setInterval(() => {
          if (reason) {
            clearInterval(interval);
            resolve(null);
          } else if (closed) clearInterval(interval);
        }, 50);
        interval.unref?.();
        closePromise.then(() => clearInterval(interval));
      })
    ]);

    if (reason) {
      await cleanupContainer();
      if (!closed) child.kill();
      await Promise.race([closePromise, new Promise(resolve => setTimeout(resolve, 2_000))]);
      // One final attempt in case the container appeared after the first rm.
      await runCommand('docker', ['rm', '-f', containerName], 5_000);
      const suffix = reason === 'timeout' ? '\nExecution timed out.'
        : reason === 'output' ? '\nOutput limit reached.'
        : reason === 'aborted' ? '\nRequest cancelled.'
        : '\nUnable to start execution.';
      return { ok: false, output: output + suffix };
    }
    return { ok: code === 0, output };
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
  }
}

const server = http.createServer(async (req, res) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    json(res, ALLOWED_ORIGINS.has(origin) ? 204 : 403, {});
    return;
  }

  const kind = req.url === '/api/coverage' ? 'coverage'
    : req.url === '/api/quickcheck' ? 'quickcheck'
    : req.url === '/api/fitspec' ? 'fitspec' : null;
  if (req.method !== 'POST' || !kind) return json(res, 404, { error: 'Not found' });
  if (origin && !ALLOWED_ORIGINS.has(origin)) return json(res, 403, { error: 'Origin not allowed' });
  if (!allowRequest(req.socket.remoteAddress || 'unknown')) return json(res, 429, { error: 'Too many requests. Try again shortly.' });
  if (activeRuns >= MAX_CONCURRENT) return json(res, 503, { error: 'Server busy. Try again shortly.' });
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json(res, 415, { error: 'Content-Type must be application/json' });
  }

  activeRuns++;
  const controller = new AbortController();
  let folder;
  const onResponseClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.once('close', onResponseClose);
  try {
    const chunks = [];
    let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > MAX_REQUEST_BYTES) {
        json(res, 413, { error: 'Submission too large' });
        return;
      }
      chunks.push(chunk);
    }
    if (controller.signal.aborted) return;
    let payload;
    try { payload = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
    catch { return json(res, 400, { error: 'Invalid JSON' }); }
    const exercise = payload?.exercise || 'insert';
    if (!Object.hasOwn(references, exercise)) return json(res, 400, { error: 'Unknown exercise' });
    const code = payload?.code;
    if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code, 'utf8') > MAX_SOURCE_BYTES) {
      return json(res, 400, { error: 'Invalid Haskell source' });
    }

    folder = await fs.mkdtemp(path.join(os.tmpdir(), 'spec-lab-'));
    await fs.writeFile(path.join(folder, 'Main.hs'), code, { mode: 0o644 });
    await fs.copyFile(references[exercise], path.join(folder, 'Reference.hs'));
    if (controller.signal.aborted) return;
    const result = kind === 'coverage'
      ? await (exercise === 'sort' ? runSortCoverage : runCoverage)({ folder, source: code, execute, signal: controller.signal })
      : await execute(folder, kind, controller.signal);
    if (!controller.signal.aborted) json(res, 200, result);
  } catch (error) {
    console.error('Execution request failed:', error);
    if (!controller.signal.aborted) json(res, 500, { error: 'Internal execution error' });
  } finally {
    res.off('close', onResponseClose);
    if (folder) {
      try { await fs.rm(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
      catch (error) { console.error('Temporary folder cleanup failed:', error); }
    }
    activeRuns--;
  }
});

server.requestTimeout = 15_000;
server.headersTimeout = 10_000;
server.listen(PORT, HOST, () => {
  console.log(`QuickCheck + FitSpec API listening at http://${HOST}:${PORT}`);
});

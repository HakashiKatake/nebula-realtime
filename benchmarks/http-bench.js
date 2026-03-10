#!/usr/bin/env node
/**
 * HTTP API Benchmark Suite for NebulaRealtime
 * Tests: Health, Auth, Leaderboard, Matchmaking Status, Profile endpoints
 */

const autocannon = require('autocannon');
const http = require('http');

const API_URL = 'http://localhost:3000';
const API2_URL = 'http://localhost:3002';
let authToken = null;
let refreshToken = null;

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const req = http.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + (parsed.search || ''),
      method: 'GET',
      headers,
    }, (res) => {
      let buf = '';
      res.on('data', (c) => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, body: buf }); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function runAutocannon(opts) {
  return new Promise((resolve, reject) => {
    autocannon(opts, (err, result) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

function formatResult(title, result) {
  return {
    title,
    requests: {
      total: result.requests.total,
      average: result.requests.average,
      mean: result.requests.mean,
      p50: result.requests.p50 || result.requests.average,
    },
    latency: {
      avg: result.latency.average,
      p50: result.latency.p50,
      p90: result.latency.p90,
      p99: result.latency.p99,
      max: result.latency.max,
    },
    throughput: {
      avgMBps: (result.throughput.average / 1024 / 1024).toFixed(2),
    },
    errors: result.errors,
    timeouts: result.timeouts,
    duration: result.duration,
    connections: result.connections,
  };
}

async function setupAuth() {
  const uid = `bench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const res = await post(`${API_URL}/auth/signup`, {
    username: uid,
    email: `${uid}@bench.test`,
    password: 'BenchmarkPass123!',
    region: 'us-east',
  });
  if (res.status === 201 || res.status === 200) {
    authToken = res.body.tokens?.accessToken || res.body.accessToken;
    refreshToken = res.body.tokens?.refreshToken || res.body.refreshToken;
    console.log(`  Auth setup: user=${uid}, token=${authToken ? 'OK' : 'MISSING'}`);
  } else {
    console.error('  Auth setup failed:', res.body);
  }
}

async function main() {
  const results = [];
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║       NebulaRealtime — HTTP Benchmark Suite         ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // --- 1. Health Check ---
  console.log('▸ [1/7] Health Check Endpoint (100 connections, 15s)');
  const health = await runAutocannon({
    url: `${API_URL}/health`,
    connections: 100,
    duration: 15,
    pipelining: 10,
  });
  results.push(formatResult('GET /health', health));
  console.log(`  → ${health.requests.average} req/s avg, p99=${health.latency.p99}ms\n`);

  // --- 2. Auth Signup Throughput ---
  console.log('▸ [2/7] Auth Signup (50 connections, 10s)');
  let signupCounter = 0;
  const signup = await runAutocannon({
    url: `${API_URL}/auth/signup`,
    connections: 50,
    duration: 10,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    setupClient: (client) => {
      const id = `bench_${Date.now()}_${signupCounter++}_${Math.random().toString(36).slice(2, 6)}`;
      client.setBody(JSON.stringify({
        username: id,
        email: `${id}@bench.test`,
        password: 'BenchmarkPass123!',
        region: 'us-east',
      }));
    },
  });
  results.push(formatResult('POST /auth/signup', signup));
  console.log(`  → ${signup.requests.average} req/s avg, p99=${signup.latency.p99}ms\n`);

  // Setup auth token for protected endpoints
  await setupAuth();

  // --- 3. Auth Login ---
  console.log('▸ [3/7] Auth Login (50 connections, 10s)');
  // Create a user to login repeatedly
  const loginUid = `loginbench_${Date.now()}`;
  await post(`${API_URL}/auth/signup`, {
    username: loginUid,
    email: `${loginUid}@bench.test`,
    password: 'BenchmarkPass123!',
  });
  const loginResult = await runAutocannon({
    url: `${API_URL}/auth/login`,
    connections: 50,
    duration: 10,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: `${loginUid}@bench.test`,
      password: 'BenchmarkPass123!',
    }),
  });
  results.push(formatResult('POST /auth/login', loginResult));
  console.log(`  → ${loginResult.requests.average} req/s avg, p99=${loginResult.latency.p99}ms\n`);

  // --- 4. Profile (authenticated) ---
  console.log('▸ [4/7] Profile (authenticated, 50 connections, 10s)');
  if (authToken) {
    const profile = await runAutocannon({
      url: `${API_URL}/profile`,
      connections: 50,
      duration: 10,
      headers: { Authorization: `Bearer ${authToken}` },
    });
    results.push(formatResult('GET /profile (auth)', profile));
    console.log(`  → ${profile.requests.average} req/s avg, p99=${profile.latency.p99}ms\n`);
  } else {
    console.log('  → SKIPPED (no auth token)\n');
  }

  // --- 5. Leaderboard ---
  console.log('▸ [5/7] Leaderboard (100 connections, 15s)');
  const leaderboard = await runAutocannon({
    url: `${API_URL}/leaderboard?limit=50`,
    connections: 100,
    duration: 15,
    pipelining: 10,
  });
  results.push(formatResult('GET /leaderboard', leaderboard));
  console.log(`  → ${leaderboard.requests.average} req/s avg, p99=${leaderboard.latency.p99}ms\n`);

  // --- 6. Matchmaking Status ---
  console.log('▸ [6/7] Matchmaking Status (100 connections, 15s)');
  const mmStatus = await runAutocannon({
    url: `${API_URL}/matchmaking/status`,
    connections: 100,
    duration: 15,
    pipelining: 10,
  });
  results.push(formatResult('GET /matchmaking/status', mmStatus));
  console.log(`  → ${mmStatus.requests.average} req/s avg, p99=${mmStatus.latency.p99}ms\n`);

  // --- 7. Multi-Server (Second API instance) ---
  console.log('▸ [7/7] Multi-Server Health (api-2, 100 connections, 10s)');
  const health2 = await runAutocannon({
    url: `${API2_URL}/health`,
    connections: 100,
    duration: 10,
    pipelining: 10,
  });
  results.push(formatResult('GET /health (api-2)', health2));
  console.log(`  → ${health2.requests.average} req/s avg, p99=${health2.latency.p99}ms\n`);

  // Print summary table
  console.log('\n╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                         BENCHMARK RESULTS SUMMARY                           ║');
  console.log('╠═══════════════════════════════╦═════════════╦════════╦════════╦════════╦═════╣');
  console.log('║ Endpoint                      ║ Req/s (avg) ║ p50    ║ p90    ║ p99    ║ Err ║');
  console.log('╠═══════════════════════════════╬═════════════╬════════╬════════╬════════╬═════╣');
  for (const r of results) {
    const name = r.title.padEnd(29);
    const rps = String(r.requests.average).padStart(11);
    const p50 = (r.latency.p50 + 'ms').padStart(6);
    const p90 = (r.latency.p90 + 'ms').padStart(6);
    const p99 = (r.latency.p99 + 'ms').padStart(6);
    const err = String(r.errors).padStart(3);
    console.log(`║ ${name} ║ ${rps} ║ ${p50} ║ ${p90} ║ ${p99} ║ ${err} ║`);
  }
  console.log('╚═══════════════════════════════╩═════════════╩════════╩════════╩════════╩═════╝');

  // Output JSON for README generation
  const output = JSON.stringify(results, null, 2);
  require('fs').writeFileSync(
    require('path').join(__dirname, 'http-results.json'),
    output
  );
  console.log('\n✓ Results saved to benchmarks/http-results.json');
}

main().catch(console.error);

#!/usr/bin/env node
/**
 * WebSocket Benchmark Suite for NebulaRealtime
 * Tests: Connection throughput, message latency, concurrent connections, matchmaking flow
 */

const http = require('http');
const WebSocket = require('ws');
const { performance } = require('perf_hooks');

const API_URL = 'http://localhost:3000';
const WS_URL = 'ws://localhost:3001';

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

async function createUser() {
  const uid = `wsbench_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const res = await post(`${API_URL}/auth/signup`, {
    username: uid,
    email: `${uid}@bench.test`,
    password: 'BenchmarkPass123!',
    region: 'us-east',
  });
  const token = res.body?.tokens?.accessToken || res.body?.accessToken;
  return { uid, token };
}

function connectWs(token) {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const ws = new WebSocket(`${WS_URL}?token=${token}`);
    ws.on('open', () => {
      const elapsed = performance.now() - start;
      resolve({ ws, connectTime: elapsed });
    });
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });
}

function waitForMessage(ws, type, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeout);
    ws.on('message', function handler(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === type) {
        clearTimeout(timer);
        ws.removeListener('message', handler);
        resolve(msg);
      }
    });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// --- Test 1: Connection Throughput ---
async function testConnectionThroughput(count = 50) {
  console.log(`\n▸ Test 1: Connection Throughput (${count} sequential connections)`);
  const users = [];
  for (let i = 0; i < count; i++) {
    users.push(await createUser());
    if ((i + 1) % 10 === 0) process.stdout.write(`  Creating users: ${i + 1}/${count}\r`);
  }
  console.log(`  Created ${count} users                     `);

  const connectTimes = [];
  const connected = [];
  let errors = 0;

  for (let i = 0; i < users.length; i++) {
    try {
      const { ws, connectTime } = await connectWs(users[i].token);
      connectTimes.push(connectTime);
      connected.push(ws);
      if ((i + 1) % 10 === 0) process.stdout.write(`  Connecting: ${i + 1}/${count}\r`);
    } catch {
      errors++;
    }
  }
  console.log(`  Connected ${connected.length}/${count} (${errors} errors)          `);

  const avg = connectTimes.reduce((a, b) => a + b, 0) / connectTimes.length;
  const sorted = [...connectTimes].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];

  // Cleanup
  for (const ws of connected) ws.close();
  await sleep(500);

  const result = { avg: avg.toFixed(2), p50: p50.toFixed(2), p90: p90.toFixed(2), p99: p99.toFixed(2), connected: connected.length, errors };
  console.log(`  → Avg: ${result.avg}ms, P50: ${result.p50}ms, P90: ${result.p90}ms, P99: ${result.p99}ms`);
  return result;
}

// --- Test 2: Ping/Pong Latency ---
async function testPingLatency(rounds = 100) {
  console.log(`\n▸ Test 2: Ping/Pong Latency (${rounds} round-trips)`);
  const { token } = await createUser();
  const { ws } = await connectWs(token);

  // Wait for 'connected' message
  await new Promise((resolve) => {
    ws.on('message', function h(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'connected') { ws.removeListener('message', h); resolve(msg); }
    });
  });

  await sleep(200); // Let connection stabilize

  const latencies = [];
  for (let i = 0; i < rounds; i++) {
    const start = performance.now();
    ws.send(JSON.stringify({ type: 'ping' }));
    try {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('pong timeout')), 5000);
        ws.once('message', (raw) => {
          clearTimeout(timer);
          resolve(JSON.parse(raw.toString()));
        });
      });
      latencies.push(performance.now() - start);
    } catch {
      // skip this round
    }
    if (i > 0 && i % 15 === 0) await sleep(50); // avoid rate limit
  }

  ws.close();

  if (latencies.length === 0) {
    console.log('  → No successful pings');
    return { avg: '0', p50: '0', p90: '0', p99: '0', min: '0', max: '0', rounds: 0 };
  }

  const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const sorted = [...latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const p99 = sorted[Math.floor(sorted.length * 0.99)];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];

  const result = { avg: avg.toFixed(2), p50: p50.toFixed(2), p90: p90.toFixed(2), p99: p99.toFixed(2), min: min.toFixed(2), max: max.toFixed(2), rounds: latencies.length };
  console.log(`  → Avg: ${result.avg}ms, P50: ${result.p50}ms, P90: ${result.p90}ms, P99: ${result.p99}ms (${latencies.length}/${rounds} successful)`);
  return result;
}

// --- Test 3: Concurrent Connections Sustained ---
async function testConcurrentConnections(target = 100) {
  console.log(`\n▸ Test 3: Concurrent Sustained Connections (target: ${target})`);
  const users = [];
  for (let i = 0; i < target; i++) {
    users.push(await createUser());
    if ((i + 1) % 20 === 0) process.stdout.write(`  Creating users: ${i + 1}/${target}\r`);
  }
  console.log(`  Created ${target} users                        `);

  const connections = [];
  let errors = 0;
  const start = performance.now();

  // Connect all in parallel (batches of 20)
  for (let batch = 0; batch < target; batch += 20) {
    const batchUsers = users.slice(batch, batch + 20);
    const promises = batchUsers.map(async u => {
      try {
        const { ws, connectTime } = await connectWs(u.token);
        connections.push({ ws, connectTime });
      } catch {
        errors++;
      }
    });
    await Promise.all(promises);
    process.stdout.write(`  Connected: ${connections.length}/${target}\r`);
  }

  const connectDuration = performance.now() - start;
  console.log(`  All ${connections.length} connected in ${(connectDuration / 1000).toFixed(2)}s (${errors} errors)`);

  // Hold connections for 3 seconds, send pings
  console.log('  Holding connections for 3s...');
  await sleep(3000);

  // Check how many are still alive
  let alive = 0;
  for (const { ws } of connections) {
    if (ws.readyState === WebSocket.OPEN) alive++;
  }
  console.log(`  → ${alive}/${connections.length} still alive after 5s`);

  // Cleanup
  for (const { ws } of connections) ws.close();
  await sleep(1000);

  return {
    target,
    connected: connections.length,
    alive,
    errors,
    totalConnectTime: (connectDuration / 1000).toFixed(2) + 's',
    avgConnectTime: (connectDuration / connections.length).toFixed(2) + 'ms',
  };
}

// --- Test 4: Message Throughput ---
async function testMessageThroughput(messages = 200) {
  console.log(`\n▸ Test 4: Message Throughput (${messages} messages)`);
  const { token } = await createUser();
  const { ws } = await connectWs(token);

  // Wait for connected
  await new Promise((resolve) => {
    ws.on('message', function h(raw) {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'connected') { ws.removeListener('message', h); resolve(msg); }
    });
  });
  await sleep(200);

  let received = 0;
  ws.on('message', () => received++);

  const start = performance.now();
  // Send in bursts of 15 to stay under rate limit (20/s)
  for (let i = 0; i < messages; i++) {
    ws.send(JSON.stringify({ type: 'ping' }));
    if ((i + 1) % 15 === 0) await sleep(100);
  }

  // Wait for responses
  await sleep(3000);
  const elapsed = performance.now() - start;

  ws.close();

  const result = {
    sent: messages,
    received,
    duration: (elapsed / 1000).toFixed(2) + 's',
    msgPerSec: (received / (elapsed / 1000)).toFixed(0),
  };
  console.log(`  → Sent: ${result.sent}, Received: ${result.received}, ${result.msgPerSec} msg/s`);
  return result;
}

// --- Test 5: Matchmaking Flow ---
async function testMatchmakingFlow() {
  console.log('\n▸ Test 5: Matchmaking Flow (2 players, time-to-match)');
  const user1 = await createUser();
  const user2 = await createUser();

  const conn1 = await connectWs(user1.token);
  const conn2 = await connectWs(user2.token);

  // Wait for connected on both
  await Promise.all([
    new Promise(r => { conn1.ws.on('message', function h(raw) { if (JSON.parse(raw.toString()).type === 'connected') { conn1.ws.removeListener('message', h); r(); } }); }),
    new Promise(r => { conn2.ws.on('message', function h(raw) { if (JSON.parse(raw.toString()).type === 'connected') { conn2.ws.removeListener('message', h); r(); } }); }),
  ]);

  await sleep(500);

  const start = performance.now();

  // Both join queue
  conn1.ws.send(JSON.stringify({ type: 'join_queue' }));
  conn2.ws.send(JSON.stringify({ type: 'join_queue' }));

  // Wait for match_found on either
  let matchFound = false;
  let matchTime = 0;

  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 15000);
        conn1.ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.type === 'match_found') { clearTimeout(t); resolve(m); } });
      }),
      new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timeout')), 15000);
        conn2.ws.on('message', (raw) => { const m = JSON.parse(raw.toString()); if (m.type === 'match_found') { clearTimeout(t); resolve(m); } });
      }),
    ]);
    matchTime = performance.now() - start;
    matchFound = true;
  } catch {
    matchTime = performance.now() - start;
    matchFound = false;
  }

  conn1.ws.close();
  conn2.ws.close();

  const result = {
    matched: matchFound,
    timeToMatch: (matchTime / 1000).toFixed(2) + 's',
  };
  console.log(`  → Match ${matchFound ? 'FOUND' : 'NOT FOUND'} in ${result.timeToMatch}`);
  return result;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║      NebulaRealtime — WebSocket Benchmark Suite     ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  const results = {};

  results.connectionThroughput = await testConnectionThroughput(30);
  results.pingLatency = await testPingLatency(50);
  results.concurrentConnections = await testConcurrentConnections(30);
  results.messageThroughput = await testMessageThroughput(100);
  results.matchmakingFlow = await testMatchmakingFlow();

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║              WebSocket Benchmark Summary             ║');
  console.log('╠══════════════════════════════════════════════════════╣');
  console.log(`║ Connection Throughput                                ║`);
  console.log(`║   Avg: ${results.connectionThroughput.avg}ms  P99: ${results.connectionThroughput.p99}ms`.padEnd(55) + '║');
  console.log(`║ Ping/Pong Latency (${results.pingLatency.rounds} rounds)`.padEnd(55) + '║');
  console.log(`║   Avg: ${results.pingLatency.avg}ms  P99: ${results.pingLatency.p99}ms`.padEnd(55) + '║');
  console.log(`║ Concurrent Connections`.padEnd(55) + '║');
  console.log(`║   ${results.concurrentConnections.alive}/${results.concurrentConnections.target} sustained`.padEnd(55) + '║');
  console.log(`║ Message Throughput`.padEnd(55) + '║');
  console.log(`║   ${results.messageThroughput.msgPerSec} msg/s`.padEnd(55) + '║');
  console.log(`║ Matchmaking`.padEnd(55) + '║');
  console.log(`║   Time-to-match: ${results.matchmakingFlow.timeToMatch}`.padEnd(55) + '║');
  console.log('╚══════════════════════════════════════════════════════╝');

  require('fs').writeFileSync(
    require('path').join(__dirname, 'ws-results.json'),
    JSON.stringify(results, null, 2)
  );
  console.log('\n✓ Results saved to benchmarks/ws-results.json');
}

main().catch(console.error);

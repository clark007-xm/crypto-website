const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Compile the two independent TS services without adding a test runtime dependency.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { SessionLogIndex } = require('../lib/contracts/log-index.ts');
const { ChainReadClient, ChainReadError } = require('../lib/rpc/read-client.ts');
const address = '0x' + '1'.repeat(40);
const hash = '0x' + '2'.repeat(64);
const topic = '0x' + '3'.repeat(64);
const log = (block, tag = '0x' + block.toString(16).padStart(64, '0')) => ({ address, topics: [topic], data: '0x', blockNumber: block, blockHash: tag, transactionHash: tag, index: 0 });
const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), map }; };
const reply = (result, status = 200) => new Response(JSON.stringify({ result }), { status });
const tick = () => new Promise(resolve => setTimeout(resolve, 1));

test('cold load scans newest windows first, publishes each successful range and bounds work', async () => {
  const store = new SessionLogIndex(1, address, 1, memory());
  const calls = []; const progress = [];
  store.subscribe(() => { if (store.snapshot().scannedBlocks) progress.push(store.snapshot().scannedBlocks); });
  await store.sync({ getBlockNumber: async () => 100000, getLogs: async (from, to) => { calls.push([from, to]); return [log(to)]; } });
  assert.equal(calls.length, 6);
  assert.deepEqual(calls[0], [91001, 100000]);
  assert.deepEqual(calls[5], [46001, 55000]);
  assert.ok(progress.includes(9000));
  assert.equal(store.snapshot().logs[0].blockNumber, 100000);
  assert.equal(store.snapshot().complete, false);
  assert.equal(store.snapshot().scannedBlocks, 54000);
});

test('concurrent subscribers share a single flight', async () => {
  let release; const held = new Promise(resolve => { release = resolve; }); let heads = 0; let logs = 0;
  const store = new SessionLogIndex(1, address, 1);
  const reader = { getBlockNumber: async () => { heads++; await held; return 100; }, getLogs: async () => { logs++; return []; } };
  const first = store.sync(reader); const second = store.sync(reader);
  assert.equal(first, second); release(); await Promise.all([first, second]);
  assert.equal(heads, 1); assert.equal(logs, 1);
});

test('reload restores coverage; refresh reads only new blocks plus a 64-block overlap', async () => {
  const storage = memory(); const first = new SessionLogIndex(1, address, 1, storage);
  await first.sync({ getBlockNumber: async () => 10000, getLogs: async () => [] });
  assert.equal(first.snapshot().complete, true);
  const restored = new SessionLogIndex(1, address, 1, storage); const calls = [];
  assert.equal(restored.snapshot().scannedBlocks, 10000);
  await restored.sync({ getBlockNumber: async () => 10200, getLogs: async (a,b) => { calls.push([a,b]); return []; } });
  assert.deepEqual(calls, [[9937, 10200]]);
  assert.equal(restored.snapshot().complete, true);
});

test('failed range is never marked empty and retry resumes the gap', async () => {
  const storage = memory(); const first = new SessionLogIndex(1, address, 1, storage); let count = 0;
  await first.sync({ getBlockNumber: async () => 20000, getLogs: async (a,b) => { if (++count === 2) throw new ChainReadError('rate-limit'); return [log(b)]; } });
  assert.equal(first.snapshot().error, 'rate-limit');
  assert.equal(first.snapshot().scannedBlocks, 9000);
  const restored = new SessionLogIndex(1, address, 1, storage); const calls = [];
  await restored.sync({ getBlockNumber: async () => 20000, getLogs: async (a,b) => { calls.push([a,b]); return []; } }, { revalidate: false, maxRanges: 1 });
  assert.deepEqual(calls, [[2001,11000]]);
  assert.equal(restored.snapshot().logs.length, 1);
});

test('shallow reorg replaces removed logs rather than duplicating cached winners/sessions', async () => {
  const store = new SessionLogIndex(1, address, 1, memory());
  await store.sync({ getBlockNumber: async () => 100, getLogs: async () => [log(90)] });
  await store.sync({ getBlockNumber: async () => 105, getLogs: async () => [] });
  assert.equal(store.snapshot().logs.length, 0);
  assert.equal(store.snapshot().scannedBlocks, 105);
});

test('chain, factory and deployment boundaries isolate caches; corrupt storage is ignored', async () => {
  const storage = memory(); const first = new SessionLogIndex(1, address, 1, storage);
  await first.sync({ getBlockNumber: async () => 100, getLogs: async () => [log(90)] });
  for (const other of [new SessionLogIndex(2,address,1,storage), new SessionLogIndex(1,'0x'+'4'.repeat(40),1,storage), new SessionLogIndex(1,address,2,storage)]) assert.equal(other.snapshot().logs.length, 0);
  storage.setItem(first.key, '{broken');
  assert.equal(new SessionLogIndex(1,address,1,storage).snapshot().scannedBlocks, 0);
});

test('storage denial does not break live results; rollback drops future coverage', async () => {
  const store = new SessionLogIndex(1,address,1,{ getItem(){ throw Error('denied'); },setItem(){ throw Error('quota'); } });
  await store.sync({ getBlockNumber: async () => 100, getLogs: async () => [log(99)] });
  await store.sync({ getBlockNumber: async () => 80, getLogs: async () => [] });
  assert.equal(store.snapshot().complete, true); assert.equal(store.snapshot().scannedBlocks,80); assert.equal(store.snapshot().logs.length,0);
});

test('429 switches to another verified same-chain node and cools the failed endpoint', async () => {
  const calls = [];
  const client = new ChainReadClient(1, ['https://a.invalid','https://b.invalid'], { gapMs: 0, fetch: async (url, options) => {
    const {method} = JSON.parse(options.body); calls.push([url,method]);
    if (method === 'eth_chainId') return reply('0x1');
    return url.includes('a.invalid') ? reply(null,429) : reply('0x64');
  } });
  assert.equal(await client.getBlockNumber(),100); assert.equal(await client.getBlockNumber(),100);
  assert.equal(calls.filter(([url,method])=>url.includes('a.invalid')&&method==='eth_blockNumber').length,1);
  assert.equal(calls.filter(([,method])=>method==='eth_chainId').length,2);
});

test('all nodes limited: bounded attempts, explicit error, no immediate retry storm', async () => {
  let calls = 0;
  const client = new ChainReadClient(1,['https://a.invalid','https://b.invalid'],{gapMs:0,fetch:async(_,options)=>{calls++;return JSON.parse(options.body).method==='eth_chainId'?reply('0x1'):reply(null,429);}});
  await assert.rejects(client.getBlockNumber(),e=>e.kind==='rate-limit'); const after = calls;
  await assert.rejects(client.getBlockNumber(),e=>e.kind==='rate-limit'); assert.equal(calls,after); assert.equal(calls,4);
});

test('requests have a real abort timeout, not an orphan Promise.race', async () => {
  const client = new ChainReadClient(1,['https://a.invalid'],{gapMs:0,timeoutMs:10,fetch:async(_,options)=>new Promise((_,reject)=>options.signal.addEventListener('abort',()=>reject(Error('aborted'))))});
  await assert.rejects(client.getBlockNumber(),e=>e.kind==='timeout');
});

test('RPC scheduling stays serial and rejects a wrong network', async () => {
  let active=0,max=0;
  const client = new ChainReadClient(1,['https://a.invalid'],{gapMs:0,fetch:async(_,options)=>{active++;max=Math.max(max,active);await tick();active--;return reply(JSON.parse(options.body).method==='eth_chainId'?'0x1':'0x64');}});
  await Promise.all([client.getBlockNumber(),client.getBlockNumber(),client.getBlockNumber()]); assert.equal(max,1);
  const wrong = new ChainReadClient(1,['https://b.invalid'],{gapMs:0,fetch:async()=>reply('0x2')});
  await assert.rejects(wrong.getBlockNumber(),e=>e.kind==='invalid-response');
  await assert.rejects(client.send('eth_sendTransaction',[]),e=>e.kind==='invalid-response');
});

test('refresh of an incomplete index does not silently restart historical backfill', async () => {
  const storage = memory(); const first = new SessionLogIndex(1,address,1,storage);
  await first.sync({getBlockNumber:async()=>100000,getLogs:async()=>[]},{maxRanges:1});
  const warm = new SessionLogIndex(1,address,1,storage); const calls=[];
  await warm.sync({getBlockNumber:async()=>100010,getLogs:async(a,b)=>{calls.push([a,b]);return[];}});
  assert.deepEqual(calls,[[99937,100010]]); assert.equal(warm.snapshot().complete,false);
});

test('deployment hint surfaces sparse old sessions without skipping the unqueried gap', async () => {
  const storage=memory();const first=new SessionLogIndex(1,address,1,storage);let probes=0;
  const reader={getBlockNumber:async()=>100000,getLogs:async(a,b)=>a===2000?[log(2001)]:[],findSeedBlock:async()=>{probes++;return 2000;}};
  await first.sync(reader,{maxRanges:1});
  assert.equal(first.snapshot().logs.length,1); assert.equal(first.snapshot().complete,false);
  assert.deepEqual(first.snapshot().ranges,[[2000,19999],[91001,100000]]);
  const warm=new SessionLogIndex(1,address,1,storage);await warm.sync(reader);assert.equal(probes,1);
});

test('a surviving subscriber can complete the shared request after the first owner unmounts', async () => {
  const store=new SessionLogIndex(1,address,1);let reads=0;const unsubscribe=store.subscribe(()=>{});
  await store.sync({getBlockNumber:async()=>100,getLogs:async()=>{reads++;return[];}},{shouldContinue:()=>false});
  assert.equal(reads,1);assert.equal(store.snapshot().complete,true);unsubscribe();
});

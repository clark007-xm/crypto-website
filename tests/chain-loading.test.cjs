const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
// Compile the independent TS services without adding a test runtime dependency.
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { SessionLogIndex } = require('../lib/contracts/log-index.ts');
const { ChainReadClient, ChainReadError } = require('../lib/rpc/read-client.ts');
const { createPurchaseLogReader } = require('../lib/contracts/purchase-log-reader.ts');
const { Interface } = require('ethers');
const { SESSION_ABI } = require('../lib/contracts/abis.ts');
const { PurchaseHistoryIndex } = require('../lib/contracts/purchase-history-index.ts');
const { createBrowserIndexStorage } = require('../lib/contracts/browser-index-storage.ts');
const { readSessionStatus, writeSessionStatus } = require('../lib/contracts/session-status-cache.ts');
const { VERIFIED_DEPLOYMENTS, resolveDeploymentBlock } = require('../lib/contracts/verified-deployments.ts');
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

test('purchase history combines purchase and winner topics with the same indexed wallet', async () => {
  const iface = new Interface(SESSION_ABI); const calls = [];
  const reader = createPurchaseLogReader({getBlockNumber:async()=>100,getLogs:async(...args)=>{calls.push(args);return[];}},[address,address],address);
  await reader.getLogs(1,100);
  assert.equal(calls.length,1); assert.deepEqual(calls[0][0],[address]);
  assert.deepEqual(calls[0][1],[[iface.getEvent('TicketsPurchased').topicHash,iface.getEvent('WinnerSelected').topicHash],iface.encodeFilterTopics('TicketsPurchased',[address])[1]]);
});

test('purchase page is bounded and concurrent refreshes share one scan', async () => {
  const store=new SessionLogIndex(1,address,1);let calls=0;
  const reader=createPurchaseLogReader({getBlockNumber:async()=>100000,getLogs:async()=>{calls++;return[];}},[address],address);
  const first=store.sync(reader);assert.equal(store.sync(reader),first);await first;
  assert.equal(calls,6);assert.equal(store.snapshot().complete,false);assert.equal(store.snapshot().loading,false);
  await store.sync(reader,{revalidate:false,maxRanges:1});assert.equal(calls,7);assert.equal(store.snapshot().scannedBlocks,63000);
});

test('a failed purchase address chunk does not fan out or advance coverage and retry resumes', async () => {
  const addresses=Array.from({length:26},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));
  const store=new SessionLogIndex(1,address,1);let calls=0,fail=true;
  const reader=createPurchaseLogReader({getBlockNumber:async()=>100,getLogs:async()=>{calls++;if(calls===2&&fail)throw new ChainReadError('rate-limit');return[log(99)];}},addresses,address);
  await store.sync(reader);assert.equal(calls,2);assert.equal(store.snapshot().scannedBlocks,0);assert.equal(store.snapshot().logs.length,0);assert.equal(store.snapshot().error,'rate-limit');
  fail=false;await store.sync(reader,{revalidate:false});assert.equal(calls,4);assert.equal(store.snapshot().complete,true);assert.equal(store.snapshot().logs.length,1);
});

test('purchase cancellation stops between address chunks without publishing partial records', async () => {
  const addresses=Array.from({length:26},(_,i)=>'0x'+(i+1).toString(16).padStart(40,'0'));
  let active=true,calls=0;const store=new SessionLogIndex(1,address,1);
  const reader=createPurchaseLogReader({getBlockNumber:async()=>100,getLogs:async()=>{calls++;active=false;return[log(90)];}},addresses,address,()=>active);
  await store.sync(reader);assert.equal(calls,1);assert.equal(store.snapshot().scannedBlocks,0);assert.equal(store.snapshot().logs.length,0);
});

test('purchase RPC 429 falls back once and uses the healthy node for subsequent windows', async () => {
  const calls=[];const client=new ChainReadClient(1,['https://a.invalid','https://b.invalid'],{gapMs:0,fetch:async(url,options)=>{
    const body=JSON.parse(options.body);calls.push([url,body.method]);
    if(body.method==='eth_chainId')return reply('0x1');if(body.method==='eth_blockNumber')return reply('0x186a0');
    return url.includes('a.invalid')?reply(null,429):reply([]);
  }});
  const store=new SessionLogIndex(1,address,1);await store.sync(createPurchaseLogReader(client,[address],address));
  assert.equal(store.snapshot().error,null);assert.equal(store.snapshot().scannedBlocks,54000);
  assert.equal(calls.filter(([url,method])=>url.includes('a.invalid')&&method==='eth_getLogs').length,1);
  assert.equal(calls.filter(([url,method])=>url.includes('b.invalid')&&method==='eth_getLogs').length,6);
});

test('all purchase RPC nodes limited stop the page and do not report empty complete history', async () => {
  let logs=0;const client=new ChainReadClient(1,['https://a.invalid','https://b.invalid'],{gapMs:0,fetch:async(_,options)=>{
    const {method}=JSON.parse(options.body);if(method==='eth_chainId')return reply('0x1');if(method==='eth_blockNumber')return reply('0x64');logs++;return reply(null,429);
  }});
  const store=new SessionLogIndex(1,address,1);const reader=createPurchaseLogReader(client,[address],address);await store.sync(reader);
  assert.equal(logs,2);assert.equal(store.snapshot().loading,false);assert.equal(store.snapshot().complete,false);assert.equal(store.snapshot().error,'rate-limit');
  await store.sync(reader);assert.equal(logs,2);
});

const asyncMemory = () => { const store=memory(); return {map:store.map,getItem:async key=>store.getItem(key),setItem:async(key,value)=>store.setItem(key,value)}; };
const otherAddress='0x'+'4'.repeat(40);
const sessionDescriptor={sessionAddress:address,creationBlock:9500,creationBlockHash:hash};
const purchasedLog = (block, session=address, player=address) => ({...log(block),address:session,topics:[new Interface(SESSION_ABI).getEvent('TicketsPurchased').topicHash,new Interface(SESSION_ABI).encodeFilterTopics('TicketsPurchased',[player])[1]]});
const purchaseClient = (head,calls,logs=[]) => ({getBlockNumber:async()=>head,getLogs:async(addresses,topics,from,to)=>{calls.push({addresses,from,to});return logs.filter(log=>addresses.includes(log.address)&&log.blockNumber>=from&&log.blockNumber<=to);}});

test('async hydration completes before refresh; only the new tail and reorg overlap are queried',async()=>{
  const storage=asyncMemory();const first=new SessionLogIndex(1,address,1,storage);
  await first.sync({getBlockNumber:async()=>10000,getLogs:async()=>[log(9990)]});
  const warm=new SessionLogIndex(1,address,1,storage);assert.equal(warm.snapshot().hydrated,false);
  await warm.ready;assert.equal(warm.snapshot().logs.length,1);assert.ok(warm.snapshot().updatedAt>0);
  const calls=[];await warm.sync({getBlockNumber:async()=>10020,getLogs:async(a,b)=>{calls.push([a,b]);return[log(9990)];}});
  assert.deepEqual(calls,[[9937,10020]]);
});

test('failed revalidation retains cached records until a successful range replaces them',async()=>{
  const store=new SessionLogIndex(1,address,1,asyncMemory());
  await store.sync({getBlockNumber:async()=>100,getLogs:async()=>[log(90)]});
  const timestamp=store.snapshot().updatedAt;
  await store.sync({getBlockNumber:async()=>101,getLogs:async()=>{throw new ChainReadError('rate-limit');}});
  assert.equal(store.snapshot().logs.length,1);assert.equal(store.snapshot().complete,false);
  assert.equal(store.snapshot().updatedAt,timestamp);assert.equal(store.snapshot().error,'rate-limit');
  await store.sync({getBlockNumber:async()=>101,getLogs:async()=>[]});assert.equal(store.snapshot().logs.length,0);
});

test('per-session purchase scans start at creation and warm reload only reads the tail',async()=>{
  const storage=asyncMemory();const first=new PurchaseHistoryIndex(1,otherAddress,1,address,storage);first.setSessions([sessionDescriptor]);
  const calls=[];await first.sync(purchaseClient(10000,calls,[purchasedLog(9990)]));
  assert.deepEqual(calls.map(call=>[call.from,call.to]),[[9500,10000]]);assert.equal(first.snapshot().logs.length,1);
  const warm=new PurchaseHistoryIndex(1,otherAddress,1,address,storage);warm.setSessions([sessionDescriptor]);await tick();
  assert.equal(warm.snapshot().logs.length,1);const tail=[];
  await warm.sync(purchaseClient(10020,tail,[purchasedLog(9990)]));assert.deepEqual(tail.map(call=>[call.from,call.to]),[[9937,10020]]);
});

test('new catalog sessions appear progressively without resetting existing purchase cursors',async()=>{
  const store=new PurchaseHistoryIndex(1,otherAddress,1,address,asyncMemory());store.setSessions([sessionDescriptor]);
  await store.sync(purchaseClient(10000,[],[purchasedLog(9990)]));
  store.setSessions([sessionDescriptor,{sessionAddress:otherAddress,creationBlock:9800,creationBlockHash:hash}]);
  assert.equal(store.snapshot().logs.length,1);const calls=[];await store.sync(purchaseClient(10000,calls));
  assert.equal(calls.length,1);assert.deepEqual(calls[0].addresses,[otherAddress]);assert.equal(calls[0].from,9800);
  assert.equal(store.snapshot().logs.length,1);assert.equal(store.snapshot().complete,true);
});

test('purchase durable caches isolate wallet, chain, factory, and session creation identity',async()=>{
  const storage=asyncMemory();const first=new PurchaseHistoryIndex(1,otherAddress,1,address,storage);first.setSessions([sessionDescriptor]);
  await first.sync(purchaseClient(10000,[],[purchasedLog(9990)]));
  for(const [chain,factory,player,descriptor] of [[2,otherAddress,address,sessionDescriptor],[1,address,address,sessionDescriptor],[1,otherAddress,otherAddress,sessionDescriptor],[1,otherAddress,address,{...sessionDescriptor,creationBlockHash:topic}]]){
    const other=new PurchaseHistoryIndex(chain,factory,1,player,storage);other.setSessions([descriptor]);await tick();assert.equal(other.snapshot().logs.length,0);
  }
  first.setSessions([{...sessionDescriptor,creationBlockHash:topic}]);assert.equal(first.snapshot().logs.length,0);
});

test('tampered cached wallet topic invalidates coverage as well as logs',async()=>{
  const storage=asyncMemory();const first=new PurchaseHistoryIndex(1,otherAddress,1,address,storage);first.setSessions([sessionDescriptor]);
  await first.sync(purchaseClient(10000,[],[purchasedLog(9990)]));
  for(const [key,value] of storage.map){const cached=JSON.parse(value);cached.logs[0].topics[1]='0x'+'0'.repeat(64);storage.map.set(key,JSON.stringify(cached));}
  const restored=new PurchaseHistoryIndex(1,otherAddress,1,address,storage);restored.setSessions([sessionDescriptor]);await tick();
  assert.equal(restored.snapshot().logs.length,0);assert.equal(restored.snapshot().scannedBlocks,0);
});

test('purchase initial work is bounded across sessions; continuation does not requery checked sessions',async()=>{
  const sessions=Array.from({length:8},(_,i)=>({sessionAddress:'0x'+(i+1).toString(16).padStart(40,'0'),creationBlock:90}));
  const store=new PurchaseHistoryIndex(1,otherAddress,1,address,asyncMemory());store.setSessions(sessions);const calls=[];
  await store.sync(purchaseClient(100,calls));assert.equal(calls.length,6);assert.equal(store.snapshot().needsInitial,true);
  await store.sync(purchaseClient(100,calls));assert.equal(calls.length,8);assert.equal(store.snapshot().needsInitial,false);
  assert.equal(new Set(calls.flatMap(call=>call.addresses)).size,8);
});

test('purchase historical continuation resumes the gap while refresh does not backfill',async()=>{
  const store=new PurchaseHistoryIndex(1,otherAddress,1,address,asyncMemory());store.setSessions([{...sessionDescriptor,creationBlock:1}]);const calls=[];
  await store.sync(purchaseClient(100000,calls));assert.deepEqual(calls.map(c=>[c.from,c.to]),[[91001,100000]]);
  await store.sync(purchaseClient(100010,calls),{mode:'refresh'});assert.deepEqual([calls[1].from,calls[1].to],[99937,100010]);
  await store.sync(purchaseClient(100010,calls),{mode:'older',maxRanges:1});assert.deepEqual([calls[2].from,calls[2].to],[82001,91000]);
});

test('storage denied or absent keeps live purchase queries usable',async()=>{
  for(const storage of [createBrowserIndexStorage(undefined),{getItem:async()=>{throw Error('denied');},setItem:async()=>{throw Error('quota');}}]){
    const store=new PurchaseHistoryIndex(1,otherAddress,1,address,storage);store.setSessions([sessionDescriptor]);await store.sync(purchaseClient(10000,[],[purchasedLog(9990)]));
    assert.equal(store.snapshot().logs.length,1);assert.equal(store.snapshot().complete,true);
  }
});

test('status snapshot restores bigint amounts and rejects different creation hashes and corrupt values',async()=>{
  const storage=asyncMemory();const session={...sessionDescriptor,ticketsSold:9007199254740993n,isSettled:false,settlementType:null,paymentTokenDecimals:6,paymentTokenSymbol:'USDT'};
  writeSessionStatus(storage,'scope',session);await tick();const restored=await readSessionStatus(storage,'scope',session);
  assert.equal(restored.value.ticketsSold,session.ticketsSold);assert.ok(restored.updatedAt>0);
  assert.equal(await readSessionStatus(storage,'scope',{...session,creationBlockHash:topic}),null);
  for(const key of storage.map.keys())storage.map.set(key,'{"ticketsSold":"NaN"}');
  assert.equal(await readSessionStatus(storage,'scope',session),null);
});

test('verified deployment bounds apply only to the exact chain and Factory',()=>{
  const entry=VERIFIED_DEPLOYMENTS[0];assert.equal(resolveDeploymentBlock(entry.chainId,entry.factory,7800000),10662082);
  assert.equal(resolveDeploymentBlock(1,entry.factory,7800000),7800000);assert.equal(resolveDeploymentBlock(entry.chainId,address,7800000),7800000);
  assert.equal(resolveDeploymentBlock(entry.chainId,entry.factory,11000000),11000000);
});

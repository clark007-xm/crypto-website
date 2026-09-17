const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),ts=require('typescript'),vm=require('node:vm');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file);
const {ChainReadClient,ChainReadError}=require('../lib/rpc/read-client.ts');
const {SessionLogIndex,EMPTY_INDEX}=require('../lib/contracts/log-index.ts');
const {SharedRead}=require('../lib/rpc/shared-read.ts');
const {createTreasuryLogReader,treasuryTopics,acceptsTreasuryLog}=require('../lib/contracts/treasury-log-reader.ts');
const {Interface,ZeroAddress}=require('ethers');
const {TREASURY_ABI}=require('../lib/contracts/abis.ts');
const iface=new Interface(TREASURY_ABI),address='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40);
const reply=(result,status=200)=>new Response(JSON.stringify({result}),{status});
const tick=()=>new Promise(r=>setImmediate(r));
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)}};

test('Treasury combines nine wallet events into two correct topic-position groups',()=>{
 const topics=treasuryTopics({userAddress:address});assert.equal(topics.length,2);
 assert.equal(topics[0][0].length,3);assert.equal(topics[1][0].length,6);assert.equal(topics[1][1],null);
 assert.equal(topics[0][1],topics[1][2]);
 const walletTopic=iface.encodeFilterTopics('BalanceUpdated',[address])[1];
 assert.equal(acceptsTreasuryLog({topics:[iface.getEvent('Withdraw').topicHash,walletTopic]},{userAddress:address}),true);
 assert.equal(acceptsTreasuryLog({topics:[iface.getEvent('PlayerPayTicketIn').topicHash,'0x'+'0'.repeat(64),walletTopic]},{userAddress:address}),true);
 assert.equal(acceptsTreasuryLog({topics:[iface.getEvent('Withdraw').topicHash,walletTopic]},{userAddress:other}),false);
 assert.equal(treasuryTopics({sessionAddress:address})[0][0].length,9);
});

test('Treasury page reads only three latest windows, six log calls; next page resumes',async()=>{
 let calls=[];const controller=new AbortController();const client={getBlockNumber:async()=>100000,getLogs:async(a,t,from,to)=>{calls.push([from,to]);return[]}};
 const index=new SessionLogIndex(1,address,0,memory());const reader=createTreasuryLogReader(client,address,{userAddress:address},controller.signal);
 await index.sync(reader,{maxRanges:3});assert.equal(calls.length,6);assert.deepEqual(calls[0],[91001,100000]);assert.equal(index.snapshot().complete,false);
 await index.sync(reader,{maxRanges:3,revalidate:false});assert.deepEqual(calls[6],[64001,73000]);assert.equal(calls.length,12);
});

test('429 stops Treasury page without retrying, inventing empty history or advancing a half-read range',async()=>{
 let calls=0;const index=new SessionLogIndex(1,address,0,memory());
 const reader=createTreasuryLogReader({getBlockNumber:async()=>100000,getLogs:async()=>{if(++calls===2)throw new ChainReadError('rate-limit');return[]}},address,{userAddress:address},new AbortController().signal);
 await index.sync(reader,{maxRanges:3});assert.equal(calls,2);assert.equal(index.snapshot().scannedBlocks,0);assert.equal(index.snapshot().error,'rate-limit');assert.equal(index.snapshot().complete,false);
});

test('cancelled RPC aborts active transport, skips queued reads, and never fails over',async()=>{
 const controller=new AbortController();let methods=[],aborted=0;let entered;const started=new Promise(r=>entered=r);
 const client=new ChainReadClient(1,['https://a.invalid','https://b.invalid'],{gapMs:0,fetch:async(url,options)=>{
  const method=JSON.parse(options.body).method;methods.push(method);
  if(method==='eth_chainId')return reply('0x1');
  if(method==='eth_getLogs'){entered();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{aborted++;reject(Error('abort'));},{once:true}));}
  return reply('0x64');
 }});
 const first=client.getLogs(address,[],0,100,controller.signal);const second=client.getLogs(address,[],0,100,controller.signal);
 const results=Promise.allSettled([first,second]);await started;controller.abort();const settled=await results;
 assert.ok(settled.every(r=>r.status==='rejected'&&r.reason.name==='AbortError'));assert.equal(aborted,1);assert.equal(methods.filter(m=>m==='eth_getLogs').length,1);
 assert.equal(await client.getBlockNumber(),100);assert.equal(methods.filter(m=>m==='eth_chainId').length,1);
});

test('abort between topic groups publishes no incomplete range',async()=>{
 const controller=new AbortController();let calls=0;const index=new SessionLogIndex(1,address,0);
 const reader=createTreasuryLogReader({getBlockNumber:async()=>100,getLogs:async()=>{calls++;controller.abort();return[]}},address,{userAddress:address},controller.signal);
 await index.sync(reader,{maxRanges:3});assert.equal(calls,1);assert.equal(index.snapshot().scannedBlocks,0);
});

test('three account consumers share a balance read, one leaving does not cancel the remaining owners',async()=>{
 let calls=0,release;const held=new Promise(r=>release=r);let signal;
 const resource=new SharedRead(async s=>{calls++;signal=s;await held;return 9n});
 const offA=resource.acquire(),offB=resource.acquire(),offC=resource.acquire();await tick();assert.equal(calls,1);
 offA();assert.equal(signal.aborted,false);release();await resource.refresh();assert.equal(resource.snapshot().value,9n);offB();offC();
 const offD=resource.acquire();await tick();assert.equal(calls,1);offD();
});

test('last owner cancels; remount gets a new flight and ignores old results',async()=>{
 let releases=[];const resource=new SharedRead(signal=>new Promise(r=>releases.push({signal,r})));
 const off=resource.acquire();await tick();off();assert.equal(releases[0].signal.aborted,true);
 const off2=resource.acquire();await tick();releases[0].r(100n);await tick();assert.equal(resource.snapshot().value,null);
 releases[1].r(2n);await resource.refresh();assert.equal(resource.snapshot().value,2n);off2();
});

test('balance failure retains previous value with an error and mounting does not auto-retry',async()=>{
 let fail=false,calls=0;const resource=new SharedRead(async()=>{calls++;if(fail)throw new ChainReadError('rate-limit');return 5n});
 const off=resource.acquire();await resource.refresh();fail=true;await resource.refresh();
 assert.equal(resource.snapshot().value,5n);assert.equal(resource.snapshot().error,'rate-limit');off();
 const off2=resource.acquire();await tick();assert.equal(calls,2);fail=false;await resource.refresh();assert.equal(resource.snapshot().error,null);off2();
});

// Execute the current hook body with controlled React primitives and a real cancellable RPC client.
// This verifies its actual effect cleanup without a wallet or external RPC requests.
function mountActivity(client,storage,options={}){
 const source=fs.readFileSync(require.resolve('../lib/contracts/hooks.ts'),'utf8');const ast=ts.createSourceFile('hooks.ts',source,ts.ScriptTarget.Latest,true);
 const node=ast.statements.find(s=>ts.isFunctionDeclaration(s)&&s.name?.text==='useTreasuryActivity');
 const js=ts.transpileModule(node.getText(ast).replace(/^export /,''),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
 const effects=[];
 const context={AbortController,useWallet:()=>({address,chainId:1,status:'connected'}),useChainReadClient:()=>client,getAddresses:()=>({treasury:address}),hasDeployedContracts:()=>true,
  ZeroAddress,SessionLogIndex,EMPTY_INDEX,createTreasuryLogReader,acceptsTreasuryLog,getBrowserIndexStorage:()=>storage,
  useMemo:fn=>fn(),useCallback:fn=>fn,useRef:current=>({current}),useState:value=>[value,()=>{}],useEffect:fn=>effects.push(fn),useSyncExternalStore:(_,get)=>get(),
  TREASURY_INTERFACE:iface,parseTreasuryActivityEvent:()=>null,matchesTreasuryActivityRecord:()=>true};
 vm.createContext(context);vm.runInContext(js,context);context.useTreasuryActivity(options);const cleanups=effects.map(fn=>fn());
 return ()=>cleanups.forEach(fn=>{if(typeof fn==='function')fn()});
}

test('actual Treasury hook cleanup cancels the scan; returning home can read without old traffic',async()=>{
 let logCalls=0,abortCount=0,entered;const started=new Promise(r=>entered=r);
 const client=new ChainReadClient(1,['https://test.invalid'],{gapMs:0,fetch:async(_,options)=>{
  const method=JSON.parse(options.body).method;if(method==='eth_chainId')return reply('0x1');if(method==='eth_blockNumber')return reply('0x186a0');
  logCalls++;entered();return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>{abortCount++;reject(Error('aborted'));},{once:true}));
 }});
 const unmount=mountActivity(client,memory());await started;unmount();assert.equal(await client.getBlockNumber(),100000);await tick();
 assert.equal(logCalls,1);assert.equal(abortCount,1);
});

test('disconnected or disabled Treasury activity starts no RPC work',async()=>{
 let calls=0;const client={chainId:1,getBlockNumber:async()=>{calls++;return 100},getLogs:async()=>{calls++;return[]}};
 const unmount=mountActivity(client,memory(),{enabled:false});await tick();assert.equal(calls,0);unmount();
});

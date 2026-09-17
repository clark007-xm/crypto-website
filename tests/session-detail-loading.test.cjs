const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,f);
const {Interface,ZeroAddress}=require('ethers');
const {SESSION_ABI,ERC20_ABI,TREASURY_ABI}=require('../lib/contracts/abis.ts');
const {readSessionDetails,readSessionTreasury}=require('../lib/contracts/session-detail-reader.ts');
const {ChainReadError}=require('../lib/rpc/read-client.ts');
const {SessionLogIndex,EMPTY_INDEX}=require('../lib/contracts/log-index.ts');
const {SharedRead}=require('../lib/rpc/shared-read.ts');
const sessionAbi=new Interface(SESSION_ABI),tokenAbi=new Interface(ERC20_ABI),treasuryAbi=new Interface(TREASURY_ABI);
const address='0x'+'1'.repeat(40),other='0x'+'2'.repeat(40),hash='0x'+'3'.repeat(64);
const values={admin:address,creator:address,productInfoId:1n,sessionCommitment:hash,treasury:other,ticketPrice:1000000n,totalTickets:100n,nextTicketIndex:10n,paymentToken:other,partnerShareBps:1000,platformFeeBps:500,unsoldTicketsPartnerDepositSlashBps:1000,creatorAbsentPartnerDepositSlashBps:1000,unlockTimestamp:100n,commitDurationSeconds:100n,revealDurationSeconds:100n,isSettled:false,settledType:0,decimals:6,symbol:'USDT'};
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(fail){const calls=[];return {calls,chainId:1,send:async(method,params,signal)=>{signal.throwIfAborted();assert.equal(method,'eth_call');const iface=params[0].to===other?tokenAbi:sessionAbi;const name=iface.parseTransaction({data:params[0].data}).name;calls.push(name);if(name===fail)throw new ChainReadError('rate-limit');return iface.encodeFunctionResult(name,[values[name]])}};}

test('detail state reads once in sequence, retains token precision and never scans winner history inline',async()=>{
 const client=fixture();const info=await readSessionDetails(client,address,new AbortController().signal);
 assert.equal(client.calls.length,19);assert.equal(new Set(client.calls).size,19);assert.equal(info.paymentTokenDecimals,6);assert.equal(info.ticketPrice,1000000n);assert.equal(info.isSettled,false);assert.equal(info.winner,ZeroAddress);
});
test('detail state stops at the first 429 instead of fabricating zero/false fields',async()=>{
 const client=fixture('creator');await assert.rejects(readSessionDetails(client,address,new AbortController().signal),e=>e.kind==='rate-limit');assert.deepEqual(client.calls,['admin','creator']);
});
test('metadata failure cannot return a usable session with a guessed amount precision',async()=>{
 const client=fixture('decimals');await assert.rejects(readSessionDetails(client,address,new AbortController().signal),e=>e.kind==='rate-limit');assert.ok(!client.calls.includes('symbol'));
});
test('detail cancellation stops between contract fields',async()=>{
 const controller=new AbortController(),client=fixture();const send=client.send;client.send=async(...args)=>{const value=await send(...args);controller.abort();return value};
 await assert.rejects(readSessionDetails(client,address,controller.signal),e=>e.name==='AbortError');assert.equal(client.calls.length,1);
});
test('session Treasury failure stops before balances and is not a fabricated empty pool',async()=>{
 let calls=0;await assert.rejects(readSessionTreasury({send:async()=>{calls++;throw new ChainReadError('rate-limit')}},other,address,new AbortController().signal),e=>e.kind==='rate-limit');assert.equal(calls,1);
});

// Run current hook bodies with dependency-aware hook primitives. No wallet or external network.
const source=fs.readFileSync(require.resolve('../lib/contracts/hooks.ts'),'utf8'),ast=ts.createSourceFile('hooks.ts',source,ts.ScriptTarget.Latest,true);
const names=new Set(['usePagedSessionLogs','useDetailRead']);
const code=ts.transpileModule(ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.has(n.name?.text)).map(n=>n.getText(ast)).join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS}}).outputText;
function harness(client){let position=0,pending=[];const slots=[];const cache=new Map();const equal=(a,b)=>a&&b&&a.length===b.length&&a.every((v,i)=>Object.is(v,b[i]));
 const memo=(fn,deps)=>{const n=position++;if(!slots[n]||!equal(slots[n].deps,deps))slots[n]={deps,value:fn()};return slots[n].value};
 const context={AbortController,ZeroAddress,SharedRead,DETAIL_READS:new WeakMap(),EMPTY_ACCOUNT_READ:{value:null,loading:false,error:null,updatedAt:0},SessionLogIndex,EMPTY_INDEX,
  useChainReadClient:()=>client,getAddresses:()=>({factory:other}),isAddress:()=>true,getBrowserIndexStorage:()=>({getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v)}),
  useMemo:memo,useCallback:(fn,deps)=>memo(()=>fn,deps),useRef:value=>memo(()=>({current:value}),[]),useState:value=>{const state=memo(()=>({value}),[]);return[state.value,v=>{state.value=typeof v==='function'?v(state.value):v}]},
  useSyncExternalStore:(_,snapshot)=>snapshot(),useEffect:(fn,deps)=>{const n=position++;if(!slots[n]||!equal(slots[n].deps,deps))pending.push(()=>{slots[n]?.cleanup?.();slots[n]={deps,cleanup:fn()}})}};
 vm.createContext(context);vm.runInContext(code,context);return {render(fn){position=0;const result=fn(context);const effects=pending;pending=[];effects.forEach(fn=>fn());return result},unmount(){slots.forEach(s=>s?.cleanup?.())}};
}
test('countdown rerenders do not restart session reads; duplicate consumers share the same flight',async()=>{
 const h=harness({});let calls=0;
 // Keep the real client identity stable, as useChainReadClient does.
 const client={};const run=()=>h.render(c=>{const a=c.useDetailRead(client,'session:1',true,async()=>{calls++;return 7});const b=c.useDetailRead(client,'session:1',true,async()=>{calls++;return 8});return[a,b]});
 run();await tick();for(let i=0;i<30;i++)run();assert.equal(calls,1);assert.equal(run()[0].value,7);h.unmount();
});
test('detail event page has only three reads; rerenders do not restart scans and continuation resumes',async()=>{
 const calls=[];const client={chainId:1,getBlockNumber:async()=>100000,getLogs:async(a,t,from,to)=>{calls.push([from,to]);return[]}};const h=harness(client);
 const run=()=>h.render(c=>c.usePagedSessionLogs(address,[[hash],hash],true,0,'creation',24));run();await tick();
 for(let i=0;i<30;i++)run();await tick();assert.equal(calls.length,3);assert.deepEqual(calls[0],[91001,100000]);
 await run().loadMore();assert.equal(calls.length,6);assert.deepEqual(calls[3],[64001,73000]);h.unmount();
});
test('detail log cleanup aborts the active request and no next window can start',async()=>{
 let count=0,aborted=0,started;const entered=new Promise(r=>started=r);const h=harness({chainId:1,getBlockNumber:async()=>100000,getLogs:async(a,t,from,to,signal)=>{count++;started();return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(new DOMException('cancelled','AbortError'))},{once:true}))}});
 h.render(c=>c.usePagedSessionLogs(address,[[hash],hash],true));await entered;h.unmount();await tick();assert.equal(count,1);assert.equal(aborted,1);
});
test('switching wallets aborts the previous detail scan before reading the new scope',async()=>{
 let calls=0,aborted=0;const h=harness({chainId:1,getBlockNumber:async()=>100,getLogs:async(a,t,from,to,signal)=>{calls++;return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted++;reject(new DOMException('cancelled','AbortError'))},{once:true}))}});
 h.render(c=>c.usePagedSessionLogs(address,[[hash],hash],true));await tick();
 h.render(c=>c.usePagedSessionLogs(address,[[hash],'0x'+'4'.repeat(64)],true));await tick();assert.equal(aborted,1);assert.equal(calls,2);h.unmount();await tick();assert.equal(aborted,2);
});

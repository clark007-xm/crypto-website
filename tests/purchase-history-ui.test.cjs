const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
for (const extension of ['.ts', '.tsx']) {
  require.extensions[extension] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, filename);
}
const { zh } = require('../lib/i18n/locales/zh.ts');
const { getOneTapCopy } = require('../lib/one-tap-copy.ts');
const copy = getOneTapCopy('zh');
let state;
let connected = true;
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === '@/lib/contracts/hooks') return { useAllPurchaseHistory: () => state,
    SESSION_SETTLEMENT_TYPES: { UNSOLD_TICKETS: 1, CREATOR_ABSENT: 2 },
    useClaimPrincipalAndPenalty: () => ({ claimPrincipalAndPenalty() {}, loading: false, error: null }),
    useClaimPrincipalAndCompensationIfCreatorAbsent: () => ({ claimPrincipalAndCompensation() {}, loading: false, error: null }),
    useSessionInfo: () => ({info:null,loading:false,error:'rate-limit',refresh(){}}),
    useSessionWinnerSelection: () => ({winner:null,logs:[],loading:false,error:null,complete:false,hasMore:false,refresh(){},loadMore(){}}),
    usePlayerTickets: () => ({tickets:0n,checked:false,loading:false,error:null,refresh(){}}),
    useTreasuryBalance: () => ({balance:0n,loading:false,checked:false,error:'rate-limit',refresh(){}}),
    usePartnerDeposit: () => ({balance:0n,requiredDeposit:1n,loading:false,checked:false,refresh(){}}),
    useIsPartner: () => ({isPartner:false,loading:false,checked:false,error:null,refresh(){}}),
    useTreasuryActivity: () => ({records:[],loading:false,error:'rate-limit',complete:false,hasMore:true,scannedBlocks:0,updatedAt:0,refresh(){},loadMore(){}}),
    useWithdrawFromTreasury: () => ({withdraw(){},loading:false,error:null}),
    useDepositToTreasury: () => ({deposit(){},loading:false,error:null}),
  };
  if (request === 'next/navigation') return {useParams:()=>({address:'0x'+'1'.repeat(40)}),useRouter:()=>({push(){},back(){}})};
  if (request === '@/components/transaction-flow-provider') return {useTransactionFlow:()=>({})};
  if (request === '@/components/session-network-notice') return { useSessionWriteAccess: () => ({ canWrite: connected }), SessionNetworkNotice: () => null };
  if (request === '@/lib/wallet/context') return { useWallet: () => ({ status: connected ? 'connected' : 'disconnected', address: null }) };
  if (request === '@/lib/rpc/context') return { useRpc: () => ({ chain: 'sepolia' }) };
  if (request === '@/lib/i18n/context') return { useT: () => zh, useLocale: () => ["zh", () => {}] };
  if (request === '@/components/one-tap/navigation') return { useOneTapCopy: () => copy };
  if (request.startsWith('@/')) request = path.join(__dirname, '..', request.slice(2));
  return originalLoad.call(this, request, parent, isMain);
};
let AllPurchaseHistory, TreasuryActivityList, TreasuryCenter, SessionDetailPage, PlayerClaimPanel;
try { ({ AllPurchaseHistory } = require('../components/all-purchase-history.tsx')); ({ TreasuryActivityList } = require('../components/treasury-activity-list.tsx')); ({ TreasuryCenter } = require('../components/treasury-center.tsx')); SessionDetailPage=require('../app/session/[address]/page.tsx').default; }
finally { ({ PlayerClaimPanel } = require('../components/player-claim-panel.tsx')); Module._load = originalLoad; }
function render(overrides = {}) {
  state = { records: [], loading: false, error: null, complete: false, scannedBlocks: 54000,
    catalogLoading: false, catalogScannedBlocks: 54000, updatedAt: 0, showingCached: false, hasMore: true, refresh() {}, loadMore() {}, ...overrides };
  return renderToStaticMarkup(React.createElement(AllPurchaseHistory));
}

test('rate limiting shows an actionable error, not an empty history or permanent spinner', () => {
  const html = render({ error: 'rate-limit' });
  assert.ok(html.includes('role="alert"'));
  assert.ok(html.includes(copy.rateLimited));
  assert.ok(!html.includes(zh.session.noGlobalPurchaseHistory));
  assert.ok(!html.includes('loading-spinner'));
  assert.ok(!html.includes('disabled=""'));
});

test('partial history labels totals as incomplete and exposes continuation', () => {
  const html = render();
  assert.ok(html.includes(copy.recordsPartial));
  assert.ok(html.includes(copy.recordsOlder));
  assert.ok(!html.includes(zh.session.noGlobalPurchaseHistory));
});

test('directory loading shows its stage and progress without claiming zero purchases', () => {
  const html = render({ loading: true, catalogLoading: true, hasMore: false });
  assert.ok(html.includes(copy.recordsCatalogLoading));
  assert.ok(html.includes('54,000'));
  assert.ok(!html.includes(zh.session.noGlobalPurchaseHistory));
});

test('only a successful complete scan displays empty history', () => {
  const html = render({ complete: true, hasMore: false });
  assert.ok(html.includes(zh.session.noGlobalPurchaseHistory));
  assert.ok(!html.includes(copy.recordsOlder));
});

test('disconnected users see the connection prompt', () => {
  connected = false;
  try {
    const html = render();
    assert.ok(html.includes(zh.session.connectToViewAllRecords));
    assert.ok(!html.includes(copy.recordsOlder));
  } finally { connected = true; }
});

test('cached history clearly labels the saved data and ongoing synchronization', () => {
  const html=render({updatedAt:1700000000000,showingCached:true,loading:true});
  assert.ok(html.includes(copy.cachedData));assert.ok(html.includes(copy.syncing));
  assert.ok(!html.includes(zh.session.noGlobalPurchaseHistory));
});

function treasuryMarkup(overrides={}) {
  return renderToStaticMarkup(React.createElement(TreasuryActivityList,{title:'流水',description:'资金流水',records:[],loading:false,error:null,complete:false,hasMore:true,scannedBlocks:27000,updatedAt:0,onRefresh(){},onLoadMore(){},...overrides}));
}
test('Treasury failure exposes an error and retry instead of empty history',()=>{
 const html=treasuryMarkup({error:'rate-limit'});assert.ok(html.includes('role="alert"'));assert.ok(html.includes(copy.rateLimited));assert.ok(!html.includes(zh.treasury.noActivity));
});
test('Treasury partial history offers continuation and only complete history can be empty',()=>{
 const html=treasuryMarkup();assert.ok(html.includes(copy.partialNote));assert.ok(html.includes(copy.treasuryOlder));assert.ok(!html.includes(zh.treasury.noActivity));
 assert.ok(treasuryMarkup({complete:true,hasMore:false}).includes(zh.treasury.noActivity));
});

test('unreadable Treasury balance shows unknown, not a verified zero or no-balance message',()=>{
 const html=renderToStaticMarkup(React.createElement(TreasuryCenter));assert.ok(html.includes(copy.rateLimited));assert.ok(html.includes('—'));assert.ok(!html.includes(zh.treasury.noBalance));
});

test('detail state failure displays retry instead of not-found or fabricated session phase',()=>{
 const html=renderToStaticMarkup(React.createElement(SessionDetailPage));assert.ok(html.includes(copy.rateLimited));assert.ok(html.includes(copy.retryRead));assert.ok(!html.includes(zh.session.notFound));assert.ok(!html.includes(zh.session.waitingReveal));
});

test('both refund settlements retain their ETH amounts and actionable claim panel', () => {
  for (const settlementType of [1, 2]) {
    const session = { settlementType, chainId: 11155111, ticketPrice: 100000000000000n,
      paymentToken: '0x'+'3'.repeat(40), paymentTokenDecimals: 18, paymentTokenSymbol: 'ETH',
      unsoldTicketsPartnerDepositSlashBps: 1000, creatorAbsentPartnerDepositSlashBps: 2000 };
    const html = renderToStaticMarkup(React.createElement(PlayerClaimPanel, { session, playerTicketCount: 2 }));
    assert.ok(html.includes(zh.session.claimRefundPanel));
    assert.ok(html.includes(zh.session.claimNow));
    assert.ok(html.includes('0.0002 ETH'));
    assert.ok(html.includes(settlementType === 1 ? '0.00002 ETH' : '0.00004 ETH'));
    assert.ok(!html.includes('USDT'));
    assert.ok(!html.includes('disabled=""'));
    connected = false;
    try { assert.ok(renderToStaticMarkup(React.createElement(PlayerClaimPanel, { session, playerTicketCount: 2 })).includes('disabled=""')); }
    finally { connected = true; }
  }
});

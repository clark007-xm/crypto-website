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

const { getRefundKind } = require('../lib/contracts/refund-eligibility.ts');
const { zh } = require('../lib/i18n/locales/zh.ts');
const { getOneTapCopy } = require('../lib/one-tap-copy.ts');
const { trackContractRead, refreshContractReads } = require('../lib/contracts/read-invalidation.ts');
const { SharedRead } = require('../lib/rpc/shared-read.ts');
const tick = () => new Promise(resolve => setImmediate(resolve));

function session(overrides = {}) {
  return { isSettled: false, settlementType: null, ticketsSold: 3n, totalTickets: 10n,
    commitDeadline: 1100n, revealDeadline: 1200n, ...overrides };
}

test('unsold holders can claim after commit expiry without creator finalization', () => {
  assert.equal(getRefundKind(session(), 3n, 1101n), 'unsold');
  assert.equal(getRefundKind(session({ isSettled: true, settlementType: 1 }), 3n, 1101n), 'unsold');
});

test('sold-out holders can claim after reveal expiry without admin finalization', () => {
  const soldOut = session({ ticketsSold: 10n });
  assert.equal(getRefundKind(soldOut, 3n, 1201n), 'creator-absent');
  assert.equal(getRefundKind({ ...soldOut, isSettled: true, settlementType: 2 }, 3n, 1201n), 'creator-absent');
});

test('both refund paths enforce strict contract deadline boundaries', () => {
  for (const [record, deadline, expected] of [[session(), 1100n, 'unsold'], [session({ ticketsSold: 10n }), 1200n, 'creator-absent']]) {
    assert.equal(getRefundKind(record, 3n, deadline - 1n), null);
    assert.equal(getRefundKind(record, 3n, deadline), null);
    assert.equal(getRefundKind(record, 3n, deadline + 1n), expected);
  }
});

test('normal, unknown or incompatible settlements never offer a refund', () => {
  for (const settlementType of [0, null, 99]) {
    assert.equal(getRefundKind(session({ isSettled: true, settlementType }), 3n, 2000n), null);
  }
  assert.equal(getRefundKind(session({ isSettled: true, settlementType: 2 }), 3n, 2000n), null);
  assert.equal(getRefundKind(session({ isSettled: true, settlementType: 1, ticketsSold: 10n }), 3n, 2000n), null);
});

test('a zero compensation ratio still allows principal recovery, zero holdings do not', () => {
  assert.equal(getRefundKind(session({ unsoldTicketsPartnerDepositSlashBps: 0 }), 3n, 2000n), 'unsold');
  assert.equal(getRefundKind(session(), 0n, 2000n), null);
  assert.equal(getRefundKind(session({ ticketsSold: 10n }), 0n, 2000n), null);
});

test('confirmed claims invalidate the originating account and session caches only', async () => {
  const origin = { chainId: 11155111, address: '0x'+'a'.repeat(40), treasuryAddress: '0x'+'b'.repeat(40), sessionAddress: '0x'+'c'.repeat(40) };
  const calls = [];
  const resources = [];
  for (const [label, scope] of [
    ['balance-A', { chainId: origin.chainId, address: origin.address, treasuryAddress: origin.treasuryAddress }],
    ['tickets-A', { chainId: origin.chainId, address: origin.address, sessionAddress: origin.sessionAddress }],
    ['pool', { chainId: origin.chainId, treasuryAddress: origin.treasuryAddress, sessionAddress: origin.sessionAddress }],
    ['balance-B', { chainId: origin.chainId, address: '0x'+'d'.repeat(40), treasuryAddress: origin.treasuryAddress }],
    ['other-chain', { ...origin, chainId: 1 }],
    ['other-session', { ...origin, sessionAddress: '0x'+'e'.repeat(40) }],
  ]) {
    const resource = { invalidate: async () => { calls.push(label); } }; resources.push(resource); trackContractRead(scope, resource);
  }
  await refreshContractReads(origin);
  assert.deepEqual(calls.sort(), ['balance-A', 'pool', 'tickets-A']);
});

test('an unavailable refresh cannot downgrade an already confirmed claim', async () => {
  const scope = { chainId: 1, address: '0x'+'7'.repeat(40) };
  let healthy = 0;
  const failed = { invalidate: async () => { throw Error('RPC unavailable'); } };
  const succeeded = { invalidate: async () => { healthy++; } };
  trackContractRead(scope, failed); trackContractRead(scope, succeeded);
  await assert.doesNotReject(refreshContractReads(scope));
  assert.equal(healthy, 1);
});

test('confirmation aborts a pre-confirmation read and only the fresh result can update the cache', async () => {
  const scope = { chainId: 11155111, address: '0x'+'4'.repeat(40), sessionAddress: '0x'+'5'.repeat(40) };
  const flights = [];
  const resource = new SharedRead(signal => new Promise(resolve => { flights.push({ signal, resolve }); }));
  trackContractRead(scope, resource);
  const off = resource.acquire();
  try {
    await tick();
    assert.equal(flights.length, 1);
    const refreshed = refreshContractReads(scope);
    await tick();
    assert.equal(flights[0].signal.aborted, true);
    assert.equal(flights.length, 2, 'one new read replaces the invalid pre-confirmation flight');
    flights[1].resolve(0n); await refreshed;
    assert.equal(resource.snapshot().value, 0n);
    flights[0].resolve(3n); await tick();
    assert.equal(resource.snapshot().value, 0n, 'late old ticket counts cannot restore the claim button');
  } finally { off(); }
});

test('confirmation invalidates an unowned warm cache without RPC and reacquisition refetches', async () => {
  const scope = { chainId: 11155111, address: '0x'+'6'.repeat(40), treasuryAddress: '0x'+'7'.repeat(40) };
  let ledger = 0n, reads = 0;
  const resource = new SharedRead(async () => { reads++; return ledger; });
  trackContractRead(scope, resource);
  const off = resource.acquire(); await resource.refresh(); off();
  assert.equal(resource.snapshot().value, 0n);
  ledger = 300000000000000n;
  await refreshContractReads(scope);
  assert.equal(reads, 1, 'an inactive page must not keep RPC traffic running');
  assert.equal(resource.snapshot().value, null);
  assert.equal(resource.snapshot().updatedAt, 0);
  const offAgain = resource.acquire();
  try {
    await resource.refresh();
    assert.equal(reads, 2);
    assert.equal(resource.snapshot().value, ledger);
  } finally { offAgain(); }
});

// Execute the real panel and scope hook with controlled hook storage. Key changes
// dispose the old component and run its effect cleanup, as React reconciliation does.
function claimHarness() {
  const fibers = new Map();
  const timers = new Map();
  let nextTimer = 0, nowMs = 2000_000;
  let active, seen, effects, wallet = '0x'+'1'.repeat(40), action = async () => ({ hash: 'synthetic' });
  let props = { session: session({ chainId: 11155111, sessionAddress: '0x'+'3'.repeat(40), ticketPrice: 100000000000000n,
    paymentToken: '0x'+'0'.repeat(40), paymentTokenDecimals: 18, paymentTokenSymbol: 'ETH',
    unsoldTicketsPartnerDepositSlashBps: 0, creatorAbsentPartnerDepositSlashBps: 5000 }), playerTicketCount: 3n };
  const invocations = [];
  const depsEqual = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const hooks = {
    ...React,
    useState(initial) {
      const fiber = active, index = fiber.cursor++;
      if (!(index in fiber.slots)) fiber.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [fiber.slots[index], value => { fiber.slots[index] = typeof value === 'function' ? value(fiber.slots[index]) : value; }];
    },
    useRef(initial) {
      const fiber = active, index = fiber.cursor++;
      return fiber.slots[index] ??= { current: initial };
    },
    useMemo(fn, deps) {
      const fiber = active, index = fiber.cursor++, old = fiber.slots[index];
      if (!old || !depsEqual(old.deps, deps)) fiber.slots[index] = { value: fn(), deps };
      return fiber.slots[index].value;
    },
    useCallback(fn, deps) { return hooks.useMemo(() => fn, deps); },
    useEffect(fn, deps) {
      const fiber = active, index = fiber.cursor++, old = fiber.slots[index];
      if (!old || !depsEqual(old.deps, deps)) {
        effects.push(() => { old?.cleanup?.(); fiber.slots[index] = { deps, cleanup: fn() }; });
      }
    },
  };
  const originalLoad = Module._load;
  function withClock(fn) {
    const originalNow = Date.now, originalSetTimeout = global.setTimeout, originalClearTimeout = global.clearTimeout;
    Date.now = () => nowMs;
    global.setTimeout = (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, at: nowMs + delay }); return id; };
    global.clearTimeout = id => { timers.delete(id); };
    try { return fn(); }
    finally { Date.now = originalNow; global.setTimeout = originalSetTimeout; global.clearTimeout = originalClearTimeout; }
  }
  let PlayerClaimPanel;
  Module._load = function(request, parent, isMain) {
    if (request === 'react') return hooks;
    if (request === '@/lib/wallet/context') return { useWallet: () => ({ status: 'connected', address: wallet, shortAddress: 'test', chainId: 11155111 }) };
    if (request === '@/lib/rpc/context') return { useRpc: () => ({ chain: 'sepolia' }) };
    if (request === '@/lib/i18n/context') return { useT: () => zh };
    if (request === '@/components/one-tap/navigation') return { useOneTapCopy: () => getOneTapCopy('zh') };
    if (request === '@/components/session-network-notice') return { useSessionWriteAccess: () => ({ canWrite: true }), SessionNetworkNotice: () => null };
    if (request === '@/components/transaction-flow-provider') return { useTransactionFlow: () => ({ createController: () => ({ callbacks: {} }) }) };
    if (request === '@/lib/contracts/hooks') return {
      SESSION_SETTLEMENT_TYPES: { NORMAL: 0, UNSOLD_TICKETS: 1, CREATOR_ABSENT: 2 },
      useClaimPrincipalAndPenalty: () => ({ claimPrincipalAndPenalty: (...args) => { invocations.push(['unsold', ...args]); return action(...args); }, loading: false, error: null }),
      useClaimPrincipalAndCompensationIfCreatorAbsent: () => ({ claimPrincipalAndCompensation: (...args) => { invocations.push(['creator-absent', ...args]); return action(...args); }, loading: false, error: null }),
    };
    if (request.startsWith('@/')) request = path.join(__dirname, '..', request.slice(2));
    return originalLoad.call(this, request, parent, isMain);
  };
  try {
    const panelPath = require.resolve('../components/player-claim-panel.tsx');
    delete require.cache[panelPath];
    const scopePath = require.resolve('../lib/transactions/use-transaction-scope.ts');
    delete require.cache[scopePath];
    ({ PlayerClaimPanel } = require(panelPath));
  } finally { Module._load = originalLoad; }
  function dispose(fiber) { withClock(() => { for (const value of fiber.slots) value?.cleanup?.(); }); }
  function resolve(node, location) {
    if (Array.isArray(node)) return node.map((child, i) => {
      const result = resolve(child, `${location}.${i}`);
      return React.isValidElement(result) ? React.cloneElement(result, { key: result.key ?? i }) : result;
    });
    if (!node || typeof node !== 'object') return node;
    if (typeof node.type === 'function') {
      const key = `${location}:${node.type.name}:${node.key ?? ''}`;
      let fiber = fibers.get(key);
      if (!fiber) { fiber = { slots: [], cursor: 0 }; fibers.set(key, fiber); }
      seen.add(key); fiber.cursor = 0; active = fiber;
      return resolve(node.type(node.props), `${key}/child`);
    }
    if (!node.props) return node;
    return React.cloneElement(node, node.props, resolve(node.props.children, `${location}/dom`));
  }
  function render() {
    seen = new Set(); effects = [];
    const tree = withClock(() => resolve(React.createElement(PlayerClaimPanel, props), 'root'));
    for (const [key, fiber] of fibers) if (!seen.has(key)) { dispose(fiber); fibers.delete(key); }
    withClock(() => { for (const effect of effects) effect(); });
    return tree;
  }
  function buttons(node) {
    if (Array.isArray(node)) return node.flatMap(buttons);
    if (!node || typeof node !== 'object') return [];
    return [...(node.type === 'button' && node.props.onClick ? [node] : []), ...buttons(node.props?.children)];
  }
  return { render, html: () => renderToStaticMarkup(render()), invocations,
    click: () => { const button = buttons(render())[0]; assert.ok(button, 'claim button must be available'); return button.props.onClick(); },
    setWallet: value => { wallet = value; }, setAction: value => { action = value; },
    setProps: value => { props = { ...props, ...value }; },
    advanceTo: seconds => {
      nowMs = Number(seconds) * 1000;
      withClock(() => { for (const [id, timer] of timers) if (timer.at <= nowMs) { timers.delete(id); timer.callback(); } });
    },
    unmount: () => { for (const fiber of fibers.values()) dispose(fiber); fibers.clear(); },
  };
}

test('the real panel offers an expired, unfinalized refund and refreshes once after success', async () => {
  const h = claimHarness(); let refreshed = 0;
  h.setProps({ onClaimSuccess: async () => { refreshed++; } });
  try {
    assert.ok(h.html().includes(zh.session.claimNow));
    await h.click();
    assert.equal(h.invocations.length, 1);
    assert.equal(h.invocations[0][0], 'unsold');
    assert.equal(refreshed, 1);
  } finally { h.unmount(); }
});

test('a mounted panel opens after the strict deadline without remounting or polling', () => {
  const h = claimHarness();
  h.setProps({ session: session({ chainId: 11155111, sessionAddress: '0x'+'3'.repeat(40), ticketPrice: 100000000000000n,
    paymentToken: '0x'+'0'.repeat(40), paymentTokenDecimals: 18, paymentTokenSymbol: 'ETH',
    unsoldTicketsPartnerDepositSlashBps: 0, creatorAbsentPartnerDepositSlashBps: 5000,
    commitDeadline: 2000n, revealDeadline: 2100n }) });
  try {
    assert.ok(!h.html().includes(zh.session.claimNow));
    h.advanceTo(2001n);
    assert.ok(h.html().includes(zh.session.claimNow));
  } finally { h.unmount(); }
});

test('a failed claim does not publish success or refresh dependent reads', async () => {
  const h = claimHarness(); let refreshed = 0;
  h.setProps({ onClaimSuccess: () => { refreshed++; } }); h.setAction(async () => null);
  try {
    await h.click();
    assert.equal(refreshed, 0);
    assert.ok(!h.html().includes(zh.session.claimSuccess));
  } finally { h.unmount(); }
});

test('an old wallet confirmation cannot refresh or mark a new wallet as claimed', async () => {
  const h = claimHarness(); let release, refreshed = 0;
  h.setProps({ onClaimSuccess: () => { refreshed++; } });
  h.setAction(() => new Promise(resolve => { release = resolve; }));
  try {
    const pending = h.click();
    h.setWallet('0x'+'2'.repeat(40)); h.render();
    release({ hash: 'synthetic-A' }); await pending;
    assert.equal(refreshed, 0);
    assert.ok(!h.html().includes(zh.session.alreadyClaimed));
    assert.ok(h.html().includes(zh.session.claimNow));
  } finally { h.unmount(); }
});

test('returning A after an A-B-A wallet change does not revive the old confirmation', async () => {
  const h = claimHarness(); let release, refreshed = 0;
  h.setProps({ onClaimSuccess: () => { refreshed++; } });
  h.setAction(() => new Promise(resolve => { release = resolve; }));
  try {
    const pending = h.click();
    h.setWallet('0x'+'2'.repeat(40)); h.render();
    h.setWallet('0x'+'1'.repeat(40)); h.render();
    release({ hash: 'synthetic-old-A' }); await pending;
    assert.equal(refreshed, 0);
    assert.ok(!h.html().includes(zh.session.alreadyClaimed));
  } finally { h.unmount(); }
});

test('an unmounted panel ignores a later claim completion', async () => {
  const h = claimHarness(); let release, refreshed = 0;
  h.setProps({ onClaimSuccess: () => { refreshed++; } });
  h.setAction(() => new Promise(resolve => { release = resolve; }));
  const pending = h.click(); h.unmount(); release({ hash: 'synthetic-A' }); await pending;
  assert.equal(refreshed, 0);
});

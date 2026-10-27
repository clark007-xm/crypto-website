const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const ethers = require('ethers');
const { renderToStaticMarkup } = require('react-dom/server');

require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, filename);
const { zh } = require('../lib/i18n/locales/zh.ts');
const { getOneTapCopy } = require('../lib/one-tap-copy.ts');
const { formatTokenValue } = require('../lib/token-format.ts');

function functionCode(file, names) {
  const source = fs.readFileSync(require.resolve(file), 'utf8');
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return ts.transpileModule(ast.statements.filter(node => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
    .map(node => node.getText(ast).replace(/^export /, '')).join('\n'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const scopeCode = functionCode('../lib/transactions/use-transaction-scope.ts', ['useTransactionScope']);

// Controlled React lifecycle executes the actual hooks/components, including cleanup on remount.
function host(context, render) {
  const values = [], effects = new Map();
  let index = 0, pending = [];
  context.useRef = initial => {
    const position = index++;
    return values[position] ??= { current: initial };
  };
  context.useState = initial => {
    const position = index++;
    if (!(position in values)) values[position] = typeof initial === 'function' ? initial() : initial;
    return [values[position], next => { values[position] = typeof next === 'function' ? next(values[position]) : next; }];
  };
  context.useEffect = (effect, deps) => {
    const position = index++, previous = effects.get(position);
    if (!previous || deps?.some((value, i) => value !== previous.deps?.[i])) pending.push(() => {
      previous?.cleanup?.();
      effects.set(position, { deps, effect, cleanup: effect() });
    });
  };
  context.useMemo = (fn, deps) => {
    const position = index++, previous = values[position];
    if (!previous || !deps || deps.some((value, i) => value !== previous.deps?.[i])) values[position] = { deps, value: fn() };
    return values[position].value;
  };
  context.useCallback = (fn, deps) => context.useMemo(() => fn, deps);
  const primitives = Object.fromEntries(['useRef', 'useState', 'useEffect', 'useMemo', 'useCallback'].map(name => [name, context[name]]));
  return {
    render(...args) { Object.assign(context, primitives); index = 0; pending = []; const result = render(...args); pending.forEach(effect => effect()); return result; },
    unmount() { effects.forEach(value => value.cleanup?.()); effects.clear(); },
    replayEffects() { effects.forEach(value => { value.cleanup?.(); value.cleanup = value.effect(); }); },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
function nodes(node, predicate) {
  if (Array.isArray(node)) return node.flatMap(child => nodes(child, predicate));
  if (!node || typeof node !== 'object') return [];
  return [...(predicate(node) ? [node] : []), ...nodes(node.props?.children, predicate)];
}
function text(node) {
  if (Array.isArray(node)) return node.map(text).join('');
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  return node && typeof node === 'object' ? text(node.props?.children) : '';
}

test('transaction scopes invalidate old A after A-B-A, unmount, and StrictMode cleanup', () => {
  const context = { require, exports: {} };
  vm.createContext(context); vm.runInContext(scopeCode, context);
  const view = host(context, key => context.useTransactionScope(key));
  const firstA = view.render('A')();
  assert.equal(firstA(), true);
  const b = view.render('B')();
  assert.equal(firstA(), false);
  const secondA = view.render('A')();
  assert.equal(firstA(), false); assert.equal(b(), false); assert.equal(secondA(), true);
  view.replayEffects();
  assert.equal(secondA(), false);
  const currentA = view.render('A')();
  assert.equal(currentA(), true);
  view.unmount(); assert.equal(currentA(), false);
});

function treasuryFixture() {
  let wallet = { status: 'connected', address: 'A', shortAddress: 'A', chainId: 1 }, selectedChain = 'eth-mainnet';
  const pending = [], refreshes = [];
  const context = { require, exports: {}, ...ethers, formatTokenValue,
    useT: () => zh, useOneTapCopy: () => getOneTapCopy('zh'), useWallet: () => ({ ...wallet, refreshBalance: async () => refreshes.push(['wallet', wallet.address]) }),
    useRpc: () => ({ chain: selectedChain }), useTransactionFlow: () => ({ createController: () => ({ callbacks: {} }) }),
    useTreasuryBalance: () => ({ balance: ethers.parseEther('1'), checked: true, loading: false, error: null, refresh: async () => refreshes.push(['ledger', wallet.address]) }),
    useWithdrawFromTreasury: () => ({ withdraw: () => new Promise(resolve => pending.push(resolve)), loading: false, error: null }),
    useDepositToTreasury: () => ({ deposit: () => new Promise(resolve => pending.push(resolve)), loading: false, error: null }),
    useIsPartner: () => ({ isPartner: true, checked: true, loading: false, error: null, refresh: async () => {} }),
    useTreasuryActivity: () => ({ records: [], loading: false, complete: true, hasMore: false, scannedBlocks: 0, updatedAt: 0, refresh: async () => refreshes.push(['activity', wallet.address]), loadMore() {} }),
    MobileSection: ({ children }) => children, WalletButton: () => null, TreasuryActivityList: () => null,
    AlertTriangle: () => null, CheckCircle: () => null, RefreshCw: () => null, ShieldAlert: () => null, Wallet: () => null,
  };
  vm.createContext(context); vm.runInContext(scopeCode + functionCode('../components/treasury-center.tsx', ['formatEth', 'TreasuryCenter', 'TreasuryCenterContent']), context);
  const wrapperView = host(context, () => context.TreasuryCenter());
  let current, key;
  function render() {
    const wrapper = wrapperView.render();
    if (wrapper.key !== key) {
      current?.unmount(); key = wrapper.key;
      current = host(context, props => context.TreasuryCenterContent(props));
    }
    return current.render(wrapper.props);
  }
  return { render, pending, refreshes,
    switchWallet(address) { wallet = { ...wallet, address, shortAddress: address }; },
    switchChain() { selectedChain = 'sepolia'; },
    unmount() { current?.unmount(); wrapperView.unmount(); },
    input(value, deposit = false) { const inputs = nodes(render(), node => node.type === 'input'); inputs[deposit ? 1 : 0].props.onChange({ target: { value } }); },
    click(label) { const button = nodes(render(), node => node.type === 'button' && text(node).trim() === label)[0]; assert.ok(button); button.props.onClick(); },
  };
}

test('late A withdrawal cannot clear B input, show B success, or refresh B balances', async () => {
  const page = treasuryFixture(); page.render(); page.input('0.1'); page.click(zh.treasury.withdraw);
  page.switchWallet('B'); page.render(); page.input('0.2');
  page.pending[0]({ hash: 'A-confirmed' }); await tick();
  const view = page.render();
  assert.equal(nodes(view, node => node.type === 'input')[0].props.value, '0.2');
  assert.ok(!renderToStaticMarkup(view).includes(zh.treasury.withdrawSuccess));
  assert.deepEqual(page.refreshes, []); page.unmount();
});

test('current withdrawal clears its own amount and refreshes wallet ETH without duplicating contract refreshes', async () => {
  const page = treasuryFixture(); page.render(); page.input('0.1'); page.click(zh.treasury.withdraw);
  page.pending[0]({ hash: 'A-confirmed' }); await tick();
  const view = page.render();
  assert.equal(nodes(view, node => node.type === 'input')[0].props.value, '');
  assert.ok(renderToStaticMarkup(view).includes(zh.treasury.withdrawSuccess));
  assert.deepEqual(page.refreshes, [['wallet', 'A']]); page.unmount();
});

test('switching RPC chain resets input and a late deposit completion cannot mark the new chain successful', async () => {
  const page = treasuryFixture(); page.render(); page.input('0.1', true); page.click(zh.treasury.depositTopUp);
  page.switchChain(); page.render(); page.input('0.2', true);
  page.pending[0](true); await tick();
  const view = page.render();
  assert.equal(nodes(view, node => node.type === 'input')[1].props.value, '0.2');
  assert.ok(!renderToStaticMarkup(view).includes(zh.treasury.depositSuccess));
  assert.deepEqual(page.refreshes, []); page.unmount();
});

function walletFixture() {
  const handlers = {}, storage = new Map();
  let account = '0x' + '1'.repeat(40), balance = ethers.parseEther('1'), held;
  const context = { require, exports: {}, ...ethers,
    WalletContext: { Provider: 'provider' },
    window: { ethereum: { on: (name, fn) => { handlers[name] = fn; }, removeListener: name => { delete handlers[name]; } } },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    getExplorerBaseUrl() {}, CHAINS: {}, getChainByNumericId() {}, getNodesByChain() {},
    BrowserProvider: class {
      async send(method) { return method === 'eth_accounts' ? [account] : []; }
      async getSigner() { const captured = account; return { getAddress: async () => captured }; }
      async getBalance() { if (held) { const result = held; held = null; return result; } return balance; }
      async getNetwork() { return { chainId: 1n }; }
    },
  };
  vm.createContext(context); vm.runInContext(functionCode('../lib/wallet/context.tsx', ['shortenAddress', 'WalletProvider']), context);
  const view = host(context, () => context.WalletProvider({ children: null }));
  const current = () => view.render().props.value;
  return { current, unmount: () => view.unmount(),
    async connect() { await current().connect(); },
    setBalance(value) { balance = ethers.parseEther(value); },
    hold() { return new Promise(resolve => { held = new Promise(done => resolve(done)); }); },
    async switchAccount() { account = '0x' + '2'.repeat(40); balance = ethers.parseEther('2'); await handlers.accountsChanged([account]); },
  };
}

test('wallet ETH refresh updates current account and drops a read that finishes after account replacement', async () => {
  const wallet = walletFixture(); await wallet.connect();
  wallet.setBalance('1.5'); await wallet.current().refreshBalance();
  assert.equal(wallet.current().balance, '1.5');
  const release = await wallet.hold();
  const pending = wallet.current().refreshBalance();
  await wallet.switchAccount();
  release(ethers.parseEther('9')); await pending;
  assert.equal(wallet.current().balance, '2.0');
  wallet.unmount();
});

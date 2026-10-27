const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript'), vm = require('node:vm');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, f);
const { Interface, ZeroAddress, parseEther } = require('ethers');
const { TREASURY_ABI, SESSION_ABI, FACTORY_ABI } = require('../lib/contracts/abis.ts');
const { parseTreasuryActivityEvent } = require('../lib/contracts/treasury-events.ts');
const { treasuryTopics, acceptsTreasuryLog } = require('../lib/contracts/treasury-log-reader.ts');
const { SESSION_PAYMENT, parseSessionTicketPrice, requiredSessionDeposit } = require('../lib/contracts/payment.ts');
const { prepareContractWrite, WriteContextError } = require('../lib/contracts/write-guard.ts');
const { canAccessTestnet, allowedRpcChain, readFactoryAdmin } = require('../lib/rpc/admin-access.ts');
const { readSessionStatus, sessionStatusKey } = require('../lib/contracts/session-status-cache.ts');
const { formatTokenValue } = require('../lib/token-format.ts');
const { waitForConfirmation } = require('../lib/transactions/wait-for-confirmation.ts');
const account = '0x' + '1'.repeat(40), session = '0x' + '2'.repeat(40), other = '0x' + '3'.repeat(40);
const jsonAbi = new Interface(require('../lib/contracts/abi-json/CommitRevealTreasury.json'));
const runtimeAbi = new Interface(TREASURY_ABI);

test('every Treasury JSON event survives decoding with exact named amounts and addresses', () => {
  for (const event of jsonAbi.fragments.filter(f => f.type === 'event')) {
    const args = event.inputs.map(i => i.type === 'address' ? i.name === 'session' ? session : account : 123n);
    const encoded = jsonAbi.encodeEventLog(event, args);
    const record = parseTreasuryActivityEvent({ interface: runtimeAbi }, { ...encoded, transactionHash: '0x' + 'a'.repeat(64), blockNumber: 100, index: 2 }, 11155111, new Map([[100, 1000]]));
    assert.ok(record, event.name);
    assert.equal(record.amount, event.name === 'SessionRegistered' ? null : 123n, event.name);
    assert.equal(record.session, event.inputs.some(i => i.name === 'session') ? session : null);
    assert.equal(record.user, event.inputs.some(i => ['user', 'player', 'partner'].includes(i.name)) ? account : null);
    assert.equal(record.recipient, null);
    assert.equal(record.blockTimestamp, 1000);
    assert.equal(record.logIndex, 2);
  }
});

test('deployed three-argument slash topic is fetched for both partner and session scopes', () => {
  const event = jsonAbi.encodeEventLog('PartnerDepositSlashed', [session, account, 123n]);
  assert.equal(runtimeAbi.getEvent('PartnerDepositSlashed').topicHash, jsonAbi.getEvent('PartnerDepositSlashed').topicHash);
  assert.ok(acceptsTreasuryLog(event, { sessionAddress: session }));
  assert.ok(acceptsTreasuryLog(event, { userAddress: account }));
  assert.equal(acceptsTreasuryLog(event, { userAddress: other }), false);
  assert.ok(treasuryTopics({ userAddress: account })[1][0].includes(event.topics[0]));
});

test('new ETH ticket price and required collateral use exactly the same wei units', () => {
  const price = parseSessionTicketPrice('0.0001');
  assert.equal(price, 100000000000000n);
  assert.equal(requiredSessionDeposit(price, 2000n), parseEther('0.2'));
  assert.equal(SESSION_PAYMENT.address, ZeroAddress);
  assert.throws(() => parseSessionTicketPrice('0'));
  assert.throws(() => requiredSessionDeposit(price, 0n));
});

test('historical tiny ETH amounts are never formatted as zero', () => {
  assert.equal(formatTokenValue(1000000n, 18), '0.000000000001');
  assert.equal(formatTokenValue(1n, 18), '0.000000000000000001');
  assert.equal(formatTokenValue(parseEther('0.0001'), 18), '0.0001');
});

test('old token metadata cannot restore an incorrect denomination from the session cache', async () => {
  const entry = { sessionAddress: session, creationBlockHash: 'creation', paymentToken: other };
  assert.ok(sessionStatusKey('scope', entry).includes('v2-eth'));
  const cached = { updatedAt: Date.now(), ticketsSold: '2', isSettled: false, settlementType: null, decimals: 6, symbol: 'USDT' };
  const restored = await readSessionStatus({ getItem: () => JSON.stringify(cached) }, 'scope', entry);
  assert.equal(restored.value.paymentTokenDecimals, 18);
  assert.equal(restored.value.paymentTokenSymbol, 'ETH');
  assert.equal(restored.value.paymentToken, other);
});

function walletFixture() {
  const live = { chain: 11155111, account };
  const signer = { getAddress: async () => account, provider: { send: async method => method === 'eth_chainId' ? '0x' + live.chain.toString(16) : [live.account] } };
  const state = { signer, address: account, walletChainId: 11155111, selectedChainId: 11155111, connected: true, allowed: true };
  return { live, state };
}
test('write guard rejects wrong RPC chain, wallet chain, disconnected and unauthorized contexts', async () => {
  for (const patch of [{ selectedChainId: 1 }, { walletChainId: 1 }, { connected: false }, { allowed: false }]) {
    const { state } = walletFixture(); Object.assign(state, patch);
    await assert.rejects(prepareContractWrite(11155111, () => state), WriteContextError);
  }
});
test('write guard checks live chain/accounts again after preflight and rejects account replacement', async () => {
  for (const change of [f => f.live.chain = 1, f => f.live.account = other, f => f.state.address = other, f => f.state.allowed = false]) {
    const f = walletFixture(); const write = await prepareContractWrite(11155111, () => f.state);
    change(f); await assert.rejects(write.assertCurrent(), WriteContextError);
  }
});

// Execute actual action hooks; contract methods are controlled doubles, never a real signer.
const hookSource = fs.readFileSync(require.resolve('../lib/contracts/hooks.ts'), 'utf8');
const ast = ts.createSourceFile('hooks.ts', hookSource, ts.ScriptTarget.Latest, true);
const hookNames = ['useBuyTickets', 'useDepositToTreasury', 'useWithdrawFromTreasury', 'useCreateSession', 'useUnsoldSettlement', 'useCreatorAbsentSettlement', 'useRevealSession', 'useClaimPrincipalAndPenalty', 'useClaimPrincipalAndCompensationIfCreatorAbsent'];
const helperNames = ['readSessionPurchaseState', 'getBuyWindowErrorMessage', 'formatTimestampForUser'];
const code = ts.transpileModule(ast.statements.filter(n => ts.isFunctionDeclaration(n) && [...hookNames, ...helperNames].includes(n.name?.text)).map(n => n.getText(ast).replace(/^export /, '')).join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
function actions(f, onStatic = () => {}, onWait = async () => ({ status: 1, logs: [] })) {
  const sent = [], failures = [], refreshes = [], price = parseEther('0.0001');
  const context = { Date, BigInt, Error, Number, SESSION_ABI, TREASURY_ABI, SESSION_PAYMENT, waitForConfirmation,
    refreshContractReads: async scope => { refreshes.push(scope); },
    useWallet: () => ({ chainId: 11155111, address: account }), useState: v => [v, () => {}], useCallback: f => f,
    useContractWriteGuard: () => chain => prepareContractWrite(chain, () => f.state),
    getAddresses: () => ({ factory: other, treasury: other }), detectFactoryAbiVersion: async () => 'current', getFactoryAbi: () => FACTORY_ABI,
    buildCreatorRevealPayload: () => ({ revealData: '0x1234', salt: '0x' + '4'.repeat(64) }),
    getReadableContractErrorMessage: e => e.message, decodeSessionBuyError: e => e.message,
    Contract: function () {
      const contract = { unlockTimestamp: async () => BigInt(Math.floor(Date.now() / 1000) - 10), commitDurationSeconds: async () => 3600n,
        totalTickets: async () => 1000n, nextTicketIndex: async () => 10n, isSettled: async () => false, ticketPrice: async () => price };
      for (const method of ['playerBuyAndCommitTicket', 'partnerDeposit', 'withdraw', 'createSession', 'finalizeTicketsUnsoldSettlement', 'finalizeCreatorAbsentSettlement', 'reveal', 'creditPrincipalAndPenaltyIfTicketsUnsold', 'creditPrincipalAndCompensationIfCreatorAbsent']) {
        contract[method] = Object.assign(async (...args) => { sent.push({ method, args }); const transaction = transactionFixture({ wait: () => onWait(transaction) }); return transaction; }, { staticCall: async () => onStatic() });
      }
      return contract;
    } };
  vm.createContext(context); vm.runInContext(code, context);
  return { context, sent, failures, refreshes, callbacks: { onError: e => failures.push(e) } };
}
const actionCases = [
  ['useBuyTickets', 'buyTickets', [session, 11155111, 3, '0x' + '4'.repeat(64), false]],
  ['useDepositToTreasury', 'deposit', [1n]], ['useWithdrawFromTreasury', 'withdraw', [1n]],
  ['useCreateSession', 'createSession', [{ ticketPrice: 1n, totalTickets: 1, productInfoId: 1 }]],
  ['useUnsoldSettlement', 'finalizeUnsoldSettlement', [session, 11155111]],
  ['useCreatorAbsentSettlement', 'finalizeCreatorAbsentSettlement', [session, 11155111]],
  ['useRevealSession', 'revealSession', [session, 11155111, 'synthetic-test-input']],
  ['useClaimPrincipalAndPenalty', 'claimPrincipalAndPenalty', [session, 11155111]],
  ['useClaimPrincipalAndCompensationIfCreatorAbsent', 'claimPrincipalAndCompensation', [session, 11155111]],
];
test('all nine live write actions reject a wrong wallet chain before any transaction', async () => {
  for (const [hook, action, args] of actionCases) {
    const f = walletFixture(); f.live.chain = 1; const a = actions(f);
    await a.context[hook]()[action](...args, a.callbacks);
    assert.equal(a.sent.length, 0, hook); assert.ok(a.failures[0] instanceof WriteContextError, hook);
  }
});
test('purchase sends exact ETH from onchain price, balance mode sends zero', async () => {
  for (const useBalance of [false, true]) {
    const a = actions(walletFixture());
    await a.context.useBuyTickets().buyTickets(session, 11155111, 3, '0x' + '4'.repeat(64), useBalance, a.callbacks);
    assert.equal(a.failures.length, 0); assert.equal(a.sent.length, 1);
    assert.equal(a.sent[0].args[3].value, useBalance ? 0n : parseEther('0.0003'));
  }
});
test('account switch during contract preflight never reaches send', async () => {
  const f = walletFixture(); const a = actions(f, () => { f.live.account = other });
  await a.context.useBuyTickets().buyTickets(session, 11155111, 1, '0x' + '4'.repeat(64), false, a.callbacks);
  assert.equal(a.sent.length, 0); assert.ok(a.failures[0] instanceof WriteContextError);
});
test('create action writes native ETH configuration and preserves the supplied wei price', async () => {
  const a = actions(walletFixture()); const config = { ticketPrice: parseEther('0.0001'), totalTickets: 100, productInfoId: 1, partnerShareBps: 1000, platformFeeBps: 500, commitDurationSeconds: 3600, revealDurationSeconds: 600 };
  await a.context.useCreateSession().createSession(config, a.callbacks);
  assert.equal(a.sent.length, 1); assert.equal(a.sent[0].args[0].paymentToken, ZeroAddress); assert.equal(a.sent[0].args[0].ticketPrice, config.ticketPrice);
});

function transactionFixture(overrides = {}) {
  return { hash: 'synthetic-original', from: account, to: other, data: '0x1234', value: 0n, nonce: 1,
    chainId: 11155111n, wait: async () => ({ status: 1 }), ...overrides };
}
function replacementError(original, patch = {}) {
  const replacement = transactionFixture({ ...original, hash: 'synthetic-replacement' });
  return Object.assign(new Error('transaction was replaced'), { code: 'TRANSACTION_REPLACED', reason: 'repriced',
    cancelled: false, replacement, receipt: { status: 1 }, ...patch });
}
test('confirmation accepts only a successful fee-only replacement of the same action', async () => {
  const original = transactionFixture();
  const accelerated = replacementError(original);
  original.wait = async () => { throw accelerated; };
  const hashes = [];
  assert.equal(await waitForConfirmation(original, { onSubmitted: tx => hashes.push(tx.hash) }), accelerated.replacement);
  assert.deepEqual(hashes, ['synthetic-replacement']);
  const invalid = [
    { cancelled: true, reason: 'cancelled' }, { reason: 'replaced' }, { receipt: { status: 0 } },
    ...[{ data: '0xabcd' }, { value: 1n }, { to: session }, { from: session }, { nonce: 2 }, { chainId: 1n }]
      .map(patch => ({ replacement: transactionFixture(patch) })),
  ];
  for (const patch of invalid) {
    const rejected = replacementError(original, patch); original.wait = async () => { throw rejected; };
    await assert.rejects(waitForConfirmation(original), error => error === rejected);
  }
  await assert.rejects(waitForConfirmation(transactionFixture({ wait: async () => null })));
  await assert.rejects(waitForConfirmation(transactionFixture({ wait: async () => ({ status: 0 }) })));
});
test('both refund actions preflight eligibility and never submit a rejected or repeated claim', async () => {
  for (const [hook, action, args] of actionCases.filter(([name]) => name.startsWith('useClaim'))) {
    const failure = new Error('NoTicketsOwned');
    const a = actions(walletFixture(), () => { throw failure; });
    await a.context[hook]()[action](...args, a.callbacks);
    assert.equal(a.sent.length, 0); assert.equal(a.failures[0], failure);
  }
});
test('withdraw and both refund hooks confirm the replacement hash after wallet acceleration', async () => {
  for (const [hook, action, args] of actionCases.filter(([name]) => name === 'useWithdrawFromTreasury' || name.startsWith('useClaim'))) {
    const a = actions(walletFixture(), () => {}, async original => { throw replacementError(original); });
    const stages = [];
    const result = await a.context[hook]()[action](...args, {
      onSubmitted: tx => stages.push('submitted:' + tx.hash), onConfirmed: tx => stages.push('confirmed:' + tx.hash),
      onError: e => a.failures.push(e),
    });
    assert.equal(a.failures.length, 0, hook); assert.equal(result.hash, 'synthetic-replacement');
    assert.deepEqual(stages, ['submitted:synthetic-original', 'submitted:synthetic-replacement', 'confirmed:synthetic-replacement']);
    assert.equal(a.refreshes.length, 1); assert.equal(a.refreshes[0].address, account);
    assert.equal(a.refreshes[0].chainId, 11155111); assert.equal(a.refreshes[0].treasuryAddress, other);
    assert.equal(a.refreshes[0].sessionAddress, hook.startsWith('useClaim') ? session : undefined);
  }
});
test('confirmed actions refresh their original wallet scope after switching accounts while pending', async () => {
  for (const [hook, action, args] of actionCases.filter(([name]) => name === 'useWithdrawFromTreasury' || name.startsWith('useClaim'))) {
    const f = walletFixture();
    const a = actions(f, () => {}, async () => { f.live.account = other; f.state.address = other; return { status: 1 }; });
    const result = await a.context[hook]()[action](...args, a.callbacks);
    assert.ok(result, hook); assert.equal(a.failures.length, 0);
    assert.equal(a.refreshes.length, 1); assert.equal(a.refreshes[0].address, account);
  }
});
test('read refresh failure never turns a confirmed withdrawal or refund into transaction failure', async () => {
  for (const [hook, action, args] of actionCases.filter(([name]) => name === 'useWithdrawFromTreasury' || name.startsWith('useClaim'))) {
    const a = actions(walletFixture()); a.context.refreshContractReads = async () => { throw Error('RPC unavailable'); };
    let confirmed = false;
    const result = await a.context[hook]()[action](...args, { ...a.callbacks, onConfirmed: () => { confirmed = true; } });
    assert.ok(result, hook); assert.equal(confirmed, true); assert.equal(a.failures.length, 0);
  }
});
test('testnet is fail-closed and only the Factory admin gets access', () => {
  assert.equal(canAccessTestnet(true, true, account.toUpperCase(), account), true);
  for (const args of [[false, true, account, account], [true, false, account, account], [true, true, other, account], [true, true, account, null]]) assert.equal(canAccessTestnet(...args), false);
  assert.equal(allowedRpcChain('sepolia', false), 'eth-mainnet');
  assert.equal(allowedRpcChain('sepolia', true), 'sepolia');
});
test('admin lookup uses Factory admin(), fails closed on unreadable/zero values', async () => {
  const factory = new Interface(FACTORY_ABI), signal = new AbortController().signal;
  const client = { send: async (method, params) => { assert.equal(method, 'eth_call'); assert.equal(params[0].to, other); assert.equal(params[0].data, factory.encodeFunctionData('admin')); return factory.encodeFunctionResult('admin', [account]); } };
  assert.equal(await readFactoryAdmin(client, other, signal), account);
  await assert.rejects(readFactoryAdmin({ send: async () => '0x' }, other, signal));
  await assert.rejects(readFactoryAdmin(client, ZeroAddress, signal));
});

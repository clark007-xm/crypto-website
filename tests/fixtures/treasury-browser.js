// Browser QA only: inject into an isolated localhost tab, never into a user's wallet tab.
// Does not expose signing or transaction methods. Clear the synthetic wallet_connected flag and cached activity, then close the test tab afterwards.
(() => {
  const mode = new URL(location.href).searchParams.get('rpcQa');
  if (!['cancel', 'normal', 'rate-limit'].includes(mode)) return;
  let treasuryTarget;
  const counts = { logCalls: 0, aborted: 0, logsAfterLeaving: 0, calls: 0 };
  const publish = () => {
    if (!document.body) return;
    let label = document.getElementById('treasury-qa');
    if (!label) { label = document.createElement('output'); label.id = 'treasury-qa'; label.style.cssText = 'position:fixed;bottom:0;left:0;z-index:99999;background:#fff;color:#000;font-size:11px;padding:4px'; document.body.append(label); }
    label.dataset.logCalls = String(counts.logCalls);
    label.textContent = `模拟 RPC ${mode} | ${JSON.stringify(counts)}`;
  };
  const account = '0x' + '1'.repeat(40);
  Object.defineProperty(window, 'ethereum', { configurable: true, value: {
    isMetaMask: true, on() {}, removeListener() {},
    async request({ method }) {
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
      if (method === 'eth_chainId') return '0xaa36a7';
      if (method === 'eth_getBalance') return '0x0';
      throw new Error('QA fixture does not permit wallet operations');
    },
  } });
  localStorage.setItem('wallet_connected', 'true');
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, options) => {
    const url = String(input);
    if (!['https://ethereum-sepolia-rpc.publicnode.com', 'https://sepolia.drpc.org', 'https://rpc.sepolia.org', 'https://sepolia.gateway.tenderly.co'].some(base => url.startsWith(base))) return originalFetch(input, options);
    const body = JSON.parse(options.body); counts.calls++;
    let result;
    if (body.method === 'eth_chainId') result = '0xaa36a7';
    else if (body.method === 'eth_blockNumber') result = '0xb2db8e';
    else if (body.method === 'eth_getLogs') {
      counts.logCalls++;
      if (location.pathname === '/treasury') treasuryTarget = body.params[0].address;
      if (location.pathname !== '/treasury' && body.params[0].address === treasuryTarget) counts.logsAfterLeaving++;
      publish();
      if (location.pathname === '/treasury' && mode === 'cancel') return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => { counts.aborted++; publish(); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
      if (location.pathname === '/treasury' && mode === 'rate-limit') return new Response(JSON.stringify({error:{code:-32005,message:'QA rate limit'}}),{status:429});
      result = [];
    } else if (body.method === 'eth_call') result = '0x' + '0'.repeat(63) + '1';
    else if (body.method === 'eth_getCode') result = '0x';
    else if (body.method === 'eth_getBlockByNumber') result = null;
    else throw new Error('Unexpected QA RPC method');
    publish();return new Response(JSON.stringify({jsonrpc:'2.0',id:body.id,result}),{status:200,headers:{'Content-Type':'application/json'}});
  };
  window.addEventListener('load', publish, { once: true });
})();

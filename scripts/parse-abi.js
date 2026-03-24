const fs = require('fs');

const abi = JSON.parse(fs.readFileSync('/vercel/share/v0-project/lib/contracts/abi-json/CommitRevealSession.json', 'utf8'));

console.log('=== Session ABI Functions ===\n');

abi.forEach(item => {
  if (item.type === 'function') {
    const inputs = item.inputs.map(i => `${i.type} ${i.name}`).join(', ');
    const outputs = item.outputs ? item.outputs.map(o => o.type).join(', ') : '';
    const mutability = item.stateMutability || '';
    console.log(`${item.name}(${inputs}) ${mutability} ${outputs ? `-> ${outputs}` : ''}`);
  }
});

console.log('\n=== Events ===\n');

abi.forEach(item => {
  if (item.type === 'event') {
    const inputs = item.inputs.map(i => `${i.indexed ? 'indexed ' : ''}${i.type} ${i.name}`).join(', ');
    console.log(`${item.name}(${inputs})`);
  }
});

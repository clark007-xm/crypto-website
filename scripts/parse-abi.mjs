import { readFileSync } from 'fs';

const treasuryAbi = JSON.parse(readFileSync('./lib/contracts/abi-json/CommitRevealTreasury.json', 'utf8'));

console.log('=== Treasury ABI Functions ===');
treasuryAbi.filter(item => item.type === 'function').forEach(fn => {
  const inputs = fn.inputs?.map(i => `${i.type} ${i.name}`).join(', ') || '';
  const outputs = fn.outputs?.map(o => o.type).join(', ') || 'void';
  const mutability = fn.stateMutability || '';
  console.log(`${fn.name}(${inputs}) ${mutability} -> ${outputs}`);
});

console.log('\n=== Treasury ABI Events ===');
treasuryAbi.filter(item => item.type === 'event').forEach(ev => {
  const inputs = ev.inputs?.map(i => `${i.indexed ? 'indexed ' : ''}${i.type} ${i.name}`).join(', ') || '';
  console.log(`${ev.name}(${inputs})`);
});

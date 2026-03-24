import json

with open('/vercel/share/v0-project/lib/contracts/abi-json/treasury-full.json', 'r') as f:
    abi = json.load(f)

print('=== CommitRevealTreasury Functions ===\n')
for item in abi:
    if item.get('type') == 'function':
        name = item.get('name', '')
        inputs = ', '.join([f"{i['type']} {i['name']}" for i in item.get('inputs', [])])
        outputs = ', '.join([o['type'] for o in item.get('outputs', [])])
        mutability = item.get('stateMutability', '')
        print(f"{name}({inputs}) {mutability} -> {outputs}")

print('\n=== Events ===\n')
for item in abi:
    if item.get('type') == 'event':
        name = item.get('name', '')
        inputs = ', '.join([f"{'indexed ' if i.get('indexed') else ''}{i['type']} {i['name']}" for i in item.get('inputs', [])])
        print(f"{name}({inputs})")

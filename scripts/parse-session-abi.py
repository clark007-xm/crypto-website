import json

with open('/vercel/share/v0-project/lib/contracts/abi-json/CommitRevealSession.json', 'r') as f:
    abi = json.load(f)

print("=== FUNCTIONS ===")
for item in abi:
    if item.get('type') == 'function':
        name = item.get('name', 'unknown')
        inputs = item.get('inputs', [])
        outputs = item.get('outputs', [])
        state = item.get('stateMutability', 'nonpayable')
        
        input_str = ', '.join([f"{i.get('type')} {i.get('name')}" for i in inputs])
        output_str = ', '.join([o.get('type') for o in outputs])
        
        print(f"  {name}({input_str}) -> ({output_str}) [{state}]")

print("\n=== EVENTS ===")
for item in abi:
    if item.get('type') == 'event':
        name = item.get('name', 'unknown')
        print(f"  {name}")

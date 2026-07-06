import sys, json
d = json.load(sys.stdin)
data = d['data']['list']
print(f'Total OKX USDT-SWAP symbols: {len(data)}')
print('First 10:')
for s in data[:10]:
    print(f'  {s["symbol"]} (lev={s["maxLeverage"]}x)')
print('Last 3:')
for s in data[-3:]:
    print(f'  {s["symbol"]} (lev={s["maxLeverage"]}x)')

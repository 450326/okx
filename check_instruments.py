import json
d = json.load(open(r'C:\Users\kaser22\Desktop\okx_instruments_check.json'))
usdt = [x for x in d['data'] if x.get('ctValCcy') == 'USDT' and x.get('ctType') == 'linear']
usdc = [x for x in d['data'] if x.get('ctValCcy') == 'USDC' and x.get('ctType') == 'linear']
print(f'total={len(d["data"])}, usdt_linear={len(usdt)}, usdc_linear={len(usdc)}')
# Check any linear contracts
linear = [x for x in d['data'] if x.get('ctType') == 'linear']
print(f'linear count={len(linear)}, first 3 ctValCcy: {[x.get("ctValCcy") for x in linear[:3]]}')
# Check one BTC contract
btc = [x for x in d['data'] if 'BTC' in x.get('instId', '')][0]
print(f'Sample BTC contract: instId={btc["instId"]} ctValCcy={btc.get("ctValCcy")} ctType={btc.get("ctType")}')

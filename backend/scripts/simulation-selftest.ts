/**
 * 模拟盘账务自测。
 *
 * 运行：pnpm run test:simulation
 * 说明：只测纯引擎，不联网、不启动 Nest、不读写 backend/data。
 */
import * as assert from 'node:assert/strict';
import { SimulationEngine } from '../src/modules/simulation/simulation-engine';
import { MarketSnapshot, SIM_ERROR, SimulationError } from '../src/modules/simulation/simulation.types';

const SYMBOL = 'BTC-USDT-SWAP';

function market(price: number, symbol = SYMBOL): MarketSnapshot {
  return {
    symbol,
    markPrice: price,
    lastPrice: price,
    bidPrice: price,
    askPrice: price,
    ts: Date.now(),
  };
}

function approx(actual: number, expected: number, message: string, epsilon = 1e-6): void {
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${message}: expected ${expected}, got ${actual}`,
  );
}

function expectError(fn: () => unknown, code: number, messagePart: string): void {
  try {
    fn();
    assert.fail(`预期抛出错误，但实际成功：${messagePart}`);
  } catch (error) {
    assert.ok(error instanceof SimulationError, `错误类型不对：${String(error)}`);
    assert.equal(error.code, code, `错误码不对：${error.message}`);
    assert.ok(error.message.includes(messagePart), `错误信息不匹配：${error.message}`);
  }
}

function newEngine(): SimulationEngine {
  return new SimulationEngine(undefined, { slippageRate: 0 });
}

function openLong(engine: SimulationEngine, qty = '0.02', price = 65000, leverage = 10) {
  return engine.placeOrder(
    {
      mode: 'simulation',
      symbol: SYMBOL,
      side: 'long',
      action: 'open',
      orderType: 'market',
      qty,
      leverage,
    },
    market(price),
  );
}

let passed = 0;
function test(name: string, fn: () => void): void {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (error) {
    console.error(`  ✗ ${name}`);
    throw error;
  }
}

console.log('模拟盘账务自测');

test('初始账户为 100000 USDT，权益一致', () => {
  const engine = newEngine();
  const snapshot = engine.snapshot({ [SYMBOL]: market(65000) });
  approx(snapshot.walletBalance, 100000, 'walletBalance');
  approx(snapshot.availableBalance, 100000, 'availableBalance');
  approx(snapshot.positionMargin, 0, 'positionMargin');
  approx(snapshot.orderMargin, 0, 'orderMargin');
  approx(snapshot.equity, 100000, 'equity');
});

test('市价开多：手续费按名义价值收取，保证金正确冻结', () => {
  const engine = newEngine();
  const result = openLong(engine);
  assert.equal(result.order.status, 'filled');
  approx(result.order.fee, 0.65, 'open fee');
  assert.ok(result.position);
  approx(result.position!.qty, 0.02, 'position qty');
  approx(result.position!.entryPrice, 65000, 'entry price');
  approx(result.position!.margin, 130, 'position margin');

  const snapshot = engine.snapshot({ [SYMBOL]: market(65000) });
  approx(snapshot.walletBalance, 99999.35, 'wallet after fee');
  approx(snapshot.availableBalance, 99869.35, 'available after margin+fee');
  approx(snapshot.positionMargin, 130, 'position margin');
  approx(snapshot.equity, 99999.35, 'equity');
});

test('标记价上涨后未实现盈亏与 ROE 正确', () => {
  const engine = newEngine();
  openLong(engine);
  const snapshot = engine.snapshot({ [SYMBOL]: market(66000) });
  const position = engine.listPositions({ [SYMBOL]: market(66000) })[0];

  approx(snapshot.unrealizedPnl, 20, 'unrealized pnl');
  approx(snapshot.equity, 100019.35, 'equity');
  approx(position.unrealizedPnl, 20, 'position pnl');
  approx(position.roe, 20 / 130, 'roe ratio');
  approx(position.liquidationPrice, 65000 * (1 - 1 / 10 + 0.005), 'liq price');
});

test('部分平仓：释放对应保证金、收平仓费、计算已实现盈亏', () => {
  const engine = newEngine();
  openLong(engine);

  const close = engine.placeOrder(
    {
      mode: 'simulation',
      symbol: SYMBOL,
      side: 'long',
      action: 'close',
      orderType: 'market',
      qty: '0.01',
      leverage: 10,
    },
    market(66000),
  );

  assert.equal(close.order.status, 'filled');
  approx(close.order.fee, 0.33, 'close fee');
  const snapshot = engine.snapshot({ [SYMBOL]: market(66000) });
  approx(snapshot.walletBalance, 99999.35 + 10 - 0.33, 'wallet after partial close');
  approx(snapshot.positionMargin, 65, 'remaining margin');
  approx(snapshot.availableBalance, 99944.02, 'available after partial close');
  approx(snapshot.realizedPnl, 10 - 0.33, 'realized pnl');
  approx(engine.listPositions({ [SYMBOL]: market(66000) })[0].qty, 0.01, 'remaining qty');
});

test('按持仓 ID 一键平仓', () => {
  const engine = newEngine();
  const opened = openLong(engine);
  const result = engine.closePosition(opened.position!.id, undefined, market(66000));
  assert.equal(result.order.status, 'filled');
  assert.equal(engine.listPositions({ [SYMBOL]: market(66000) }).length, 0);
  const snapshot = engine.snapshot({ [SYMBOL]: market(66000) });
  approx(snapshot.availableBalance, 100018.69, 'available after id close');
});

test('限价单立即穿越时按对手价成交，按 taker 收费', () => {
  const engine = newEngine();
  const result = engine.placeOrder(
    {
      mode: 'simulation',
      symbol: SYMBOL,
      side: 'long',
      action: 'open',
      orderType: 'limit',
      qty: '0.02',
      leverage: 10,
      price: '66000',
    },
    market(65000),
  );
  assert.equal(result.order.status, 'filled');
  approx(result.order.avgFillPrice!, 65000, 'crossed at ask');
  approx(result.order.fee, 0.65, 'taker fee');
});

test('全部平仓：保证金完全释放，持仓消失', () => {
  const engine = newEngine();
  openLong(engine);
  engine.placeOrder(
    {
      mode: 'simulation',
      symbol: SYMBOL,
      side: 'long',
      action: 'close',
      orderType: 'market',
      qty: '0.02',
      leverage: 10,
    },
    market(66000),
  );

  const snapshot = engine.snapshot({ [SYMBOL]: market(66000) });
  assert.equal(engine.listPositions({ [SYMBOL]: market(66000) }).length, 0);
  approx(snapshot.walletBalance, 100018.69, 'final wallet');
  approx(snapshot.availableBalance, 100018.69, 'final available');
  approx(snapshot.positionMargin, 0, 'final margin');
  approx(snapshot.realizedPnl, 19.34, 'final realized');
});

test('同方向加仓：开仓均价按数量加权', () => {
  const engine = newEngine();
  openLong(engine, '0.01', 65000, 10);
  const add = engine.placeOrder(
    {
      mode: 'simulation',
      symbol: SYMBOL,
      side: 'long',
      action: 'open',
      orderType: 'market',
      qty: '0.01',
      leverage: 10,
    },
    market(67000),
  );

  approx(add.position!.entryPrice, 66000, 'weighted entry');
  approx(add.position!.qty, 0.02, 'total qty');
  approx(add.position!.margin, 132, 'total margin');
});

test('余额不足时拒绝开仓并留下 rejected 订单', () => {
  const engine = newEngine();
  expectError(
    () => openLong(engine, '100', 65000, 10),
    SIM_ERROR.INSUFFICIENT_BALANCE,
    '可用余额不足',
  );
  assert.equal(engine.getOrderSnapshots('history')[0].status, 'rejected');
});

test('杠杆超限与反向开仓被拒绝', () => {
  const engine = newEngine();
  expectError(
    () =>
      engine.placeOrder(
        {
          mode: 'simulation',
          symbol: SYMBOL,
          side: 'long',
          action: 'open',
          orderType: 'market',
          qty: '0.01',
          leverage: 100,
        },
        market(65000),
      ),
    SIM_ERROR.LEVERAGE_LIMIT,
    '杠杆',
  );

  openLong(engine);
  expectError(
    () =>
      engine.placeOrder(
        {
          mode: 'simulation',
          symbol: SYMBOL,
          side: 'short',
          action: 'open',
          orderType: 'market',
          qty: '0.01',
          leverage: 10,
        },
        market(65000),
      ),
    SIM_ERROR.RISK_REJECTED,
    '不能同时持有多空',
  );
});

test('平仓数量超过持仓被拒绝', () => {
  const engine = newEngine();
  openLong(engine);
  expectError(
    () =>
      engine.placeOrder(
        {
          mode: 'simulation',
          symbol: SYMBOL,
          side: 'long',
          action: 'close',
          orderType: 'market',
          qty: '0.03',
          leverage: 10,
        },
        market(65000),
      ),
    SIM_ERROR.INVALID_QTY,
    '可平数量不足',
  );
});

test('限价单冻结保证金，触价后按限价成交', () => {
  const engine = newEngine();
  const placed = engine.placeOrder(
    {
      mode: 'simulation',
      symbol: SYMBOL,
      side: 'long',
      action: 'open',
      orderType: 'limit',
      qty: '0.02',
      leverage: 10,
      price: '64000',
    },
    market(65000),
  );

  assert.equal(placed.order.status, 'pending');
  const before = engine.snapshot({ [SYMBOL]: market(65000) });
  approx(before.orderMargin, 128.256, 'reserved margin + maker fee');
  approx(before.availableBalance, 100000 - 128.256, 'available after reserve');

  const notYet = engine.processMarkets({ [SYMBOL]: market(64500) });
  assert.equal(notYet.changed, false);
  assert.equal(engine.getOrderSnapshots('open')[0].status, 'pending');

  const filled = engine.processMarkets({ [SYMBOL]: market(63900) });
  assert.equal(filled.changed, true);
  const order = engine.getOrderSnapshots('history')[0];
  assert.equal(order.status, 'filled');
  approx(order.avgFillPrice!, 64000, 'limit fill price');
  approx(order.fee, 0.256, 'maker fee');

  const after = engine.snapshot({ [SYMBOL]: market(63900) });
  approx(after.orderMargin, 0, 'reserve released');
  approx(after.positionMargin, 128, 'position margin');
  approx(after.walletBalance, 99999.744, 'wallet after maker fee');
  approx(after.availableBalance, 99871.744, 'available after fill');
});

test('撤单释放冻结保证金', () => {
  const engine = newEngine();
  const placed = engine.placeOrder(
    {
      mode: 'simulation',
      symbol: SYMBOL,
      side: 'long',
      action: 'open',
      orderType: 'limit',
      qty: '0.02',
      leverage: 10,
      price: '64000',
    },
    market(65000),
  );

  engine.cancelOrder(placed.order.orderId);
  const snapshot = engine.snapshot({ [SYMBOL]: market(65000) });
  assert.equal(engine.getOrderSnapshots('open').length, 0);
  approx(snapshot.orderMargin, 0, 'order margin');
  approx(snapshot.availableBalance, 100000, 'available');
});

test('止盈按市价平仓并计入手续费/已实现盈亏', () => {
  const engine = newEngine();
  const opened = openLong(engine);
  engine.updateRisk(opened.position!.id, '66000', '64000');

  const result = engine.processMarkets({ [SYMBOL]: market(66100) });
  assert.equal(result.changed, true);
  assert.equal(engine.listPositions({ [SYMBOL]: market(66100) }).length, 0);

  const snapshot = engine.snapshot({ [SYMBOL]: market(66100) });
  approx(snapshot.walletBalance, 99999.35 + 22 - 0.661, 'wallet after tp');
  approx(snapshot.realizedPnl, 22 - 0.661, 'realized after tp');
  approx(snapshot.totalFee, 0.65 + 0.661, 'total fee');
  assert.ok(engine.getOrderSnapshots('fills').some((o) => o.source === 'tp'), '应记录 tp 成交');
});

test('止损按市价平仓', () => {
  const engine = newEngine();
  const opened = openLong(engine);
  engine.updateRisk(opened.position!.id, null, '64000');

  engine.processMarkets({ [SYMBOL]: market(63900) });
  const snapshot = engine.snapshot({ [SYMBOL]: market(63900) });
  assert.equal(engine.listPositions({ [SYMBOL]: market(63900) }).length, 0);
  approx(snapshot.walletBalance, 99999.35 - 22 - 0.639, 'wallet after sl');
  assert.ok(engine.getOrderSnapshots('fills').some((o) => o.source === 'sl'), '应记录 sl 成交');
});

test('强平：仓位权益低于维持保证金时自动平仓', () => {
  const engine = newEngine();
  openLong(engine, '1', 10000, 10);

  const result = engine.processMarkets({ [SYMBOL]: market(9000) });
  assert.equal(result.changed, true);
  assert.equal(engine.listPositions({ [SYMBOL]: market(9000) }).length, 0);
  assert.ok(
    engine.getOrderSnapshots('fills').some((o) => o.source === 'liquidation'),
    '应记录强平成交',
  );

  const snapshot = engine.snapshot({ [SYMBOL]: market(9000) });
  approx(snapshot.walletBalance, 100000 - 5 - 1000 - 4.5, 'wallet after liquidation');
  approx(snapshot.realizedPnl, -1004.5, 'realized after liquidation');
});

test('止盈止损方向校验', () => {
  const engine = newEngine();
  const opened = openLong(engine);
  expectError(
    () => engine.updateRisk(opened.position!.id, '64000', null),
    SIM_ERROR.BAD_REQUEST,
    '止盈价必须高于开仓价',
  );
});

test('限价平仓单触价后减少仓位', () => {
  const engine = newEngine();
  openLong(engine);
  const close = engine.placeOrder(
    {
      mode: 'simulation',
      symbol: SYMBOL,
      side: 'long',
      action: 'close',
      orderType: 'limit',
      qty: '0.01',
      leverage: 10,
      price: '66000',
    },
    market(65000),
  );
  assert.equal(close.order.status, 'pending');

  engine.processMarkets({ [SYMBOL]: market(66100) });
  const position = engine.listPositions({ [SYMBOL]: market(66100) })[0];
  approx(position.qty, 0.01, 'remaining qty');
  approx(position.initialMargin, 65, 'remaining margin');
  assert.equal(engine.getOrderSnapshots('fills')[0].source, 'user');
});

test('权益曲线按秒去重且时间严格递增', () => {
  const engine = newEngine();
  openLong(engine);
  engine.closePosition(engine.listPositions({ [SYMBOL]: market(66000) })[0].id, undefined, market(66000));
  openLong(engine);
  const points = engine.getEquityHistory('1d');
  assert.ok(points.length >= 1, '至少一个权益点');
  for (let i = 1; i < points.length; i += 1) {
    assert.ok(points[i].ts > points[i - 1].ts, '权益时间必须严格递增');
    assert.equal(points[i].ts % 1000, 0, '权益时间取整到秒');
  }
});

test('重置恢复初始资金并清空持仓/委托', () => {
  const engine = newEngine();
  openLong(engine);
  engine.reset();
  const snapshot = engine.snapshot({ [SYMBOL]: market(65000) });
  assert.equal(engine.listPositions({ [SYMBOL]: market(65000) }).length, 0);
  assert.equal(engine.getOrderSnapshots('open').length, 0);
  approx(snapshot.walletBalance, 100000, 'wallet after reset');
  approx(snapshot.availableBalance, 100000, 'available after reset');
  approx(snapshot.realizedPnl, 0, 'realized after reset');
});

test('试算返回真实保证金、手续费与最大可开数量', () => {
  const engine = newEngine();
  const preview = engine.preview(
    {
      mode: 'simulation',
      symbol: SYMBOL,
      side: 'long',
      action: 'open',
      orderType: 'market',
      qty: '0.02',
      leverage: 10,
    },
    market(65000),
  );
  approx(preview.notional, 1300, 'notional');
  approx(preview.margin, 130, 'margin');
  approx(preview.fee, 0.65, 'fee');
  approx(preview.liquidationPrice, 65000 * (1 - 1 / 10 + 0.005), 'liq');
  assert.ok(preview.maxQty > 0.02, 'max qty');
});

console.log(`\n全部通过：${passed} 项`);

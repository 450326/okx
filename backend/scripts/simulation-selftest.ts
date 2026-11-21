/**
 * 模拟盘账务自测。
 *
 * 运行：pnpm run test:simulation
 * 说明：只测纯引擎，不联网、不启动 Nest、不读写 backend/data。
 */
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { addMoney, toUnits } from '../src/common/money';
import { SimulationEngine } from '../src/modules/simulation/simulation-engine';
import {
  MarketSnapshot,
  PredictionMarketSnapshot,
  SIM_ERROR,
  SimulationError,
} from '../src/modules/simulation/simulation.types';

const SYMBOL = 'BTC-USDT-SWAP';
const PREDICTION_SLUG = 'test-prediction-market';

function predictionMarket(
  yesPrice: number,
  bestBid = yesPrice,
  bestAsk = yesPrice,
): PredictionMarketSnapshot {
  return {
    slug: PREDICTION_SLUG,
    marketId: 'pm_1',
    question: 'Will the test pass?',
    eventTitle: 'Test Event',
    icon: '',
    yesPrice,
    noPrice: 1 - yesPrice,
    bestBid,
    bestAsk,
    yesName: 'Yes',
    noName: 'No',
    yesTokenId: 'yes-token',
    noTokenId: 'no-token',
    closed: false,
    ts: Date.now(),
  };
}

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

function assertAccountIdentity(snapshot: {
  walletBalance: number;
  contractPnl: number;
  spotValue: number;
  predictionValue: number;
  equity: number;
  totalUnrealizedPnl: number;
  spotUnrealizedPnl: number;
  predictionUnrealizedPnl: number;
  realizedPnl: number;
  contractRealizedPnl: number;
  spotRealizedPnl: number;
  predictionRealizedPnl: number;
}): void {
  approx(
    snapshot.equity,
    snapshot.walletBalance + snapshot.contractPnl + snapshot.spotValue + snapshot.predictionValue,
    'equity identity',
  );
  approx(
    snapshot.totalUnrealizedPnl,
    snapshot.contractPnl + snapshot.spotUnrealizedPnl + snapshot.predictionUnrealizedPnl,
    'unrealized pnl identity',
  );
  approx(
    snapshot.realizedPnl,
    snapshot.contractRealizedPnl + snapshot.spotRealizedPnl + snapshot.predictionRealizedPnl,
    'realized pnl identity',
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
  // 旧用例按 100000 初始资金编写；这里显式指定，避免受应用默认资金调整影响
  return new SimulationEngine(undefined, { slippageRate: 0, initialWallet: 100000 });
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

test('默认初始账户为 8000 USDT，权益一致', () => {
  const engine = new SimulationEngine(undefined, { slippageRate: 0 });
  const snapshot = engine.snapshot({ [SYMBOL]: market(65000) });
  approx(snapshot.walletBalance, 8000, 'walletBalance');
  approx(snapshot.availableBalance, 8000, 'availableBalance');
  approx(snapshot.positionMargin, 0, 'positionMargin');
  approx(snapshot.orderMargin, 0, 'orderMargin');
  approx(snapshot.equity, 8000, 'equity');
});

test('自定义初始账户为 100000 USDT，权益一致', () => {
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

// ---------------------------------------------------------------- 预测盘模拟交易

test('预测买入用同一钱包全额扣款，权益按当前概率计值', () => {
  const engine = newEngine();
  const result = engine.placePredictionOrder(
    { slug: PREDICTION_SLUG, outcome: 'yes', action: 'buy', qty: '100' },
    predictionMarket(0.5),
  );
  assert.equal(result.order.status, 'filled');
  approx(Number(result.order.price), 0.5, 'fill price');
  approx(Number(result.order.notional), 50, 'notional');

  const snapshot = engine.snapshot();
  approx(snapshot.walletBalance, 99950, 'wallet after buy');
  approx(snapshot.availableBalance, 99950, 'available after buy');
  approx(snapshot.predictionValue, 50, 'prediction value');
  approx(snapshot.equity, 100000, 'equity after buy');

  const positions = engine.listPredictionPositions();
  assert.equal(positions.length, 1);
  approx(Number(positions[0].qty), 100, 'position qty');
  approx(Number(positions[0].entryPrice), 0.5, 'entry price');
});

test('预测概率上涨后浮动盈亏和权益同步增加', () => {
  const engine = newEngine();
  engine.placePredictionOrder(
    { slug: PREDICTION_SLUG, outcome: 'yes', action: 'buy', qty: '100' },
    predictionMarket(0.5),
  );
  engine.updatePredictionMarks({ [PREDICTION_SLUG]: predictionMarket(0.6) });
  const snapshot = engine.snapshot();
  approx(snapshot.predictionValue, 60, 'prediction value at 0.6');
  approx(snapshot.predictionUnrealizedPnl, 10, 'prediction pnl');
  approx(snapshot.equity, 100010, 'equity at 0.6');
});

test('预测卖出收回现金、记录已实现盈亏并按数量递减', () => {
  const engine = newEngine();
  engine.placePredictionOrder(
    { slug: PREDICTION_SLUG, outcome: 'yes', action: 'buy', qty: '100' },
    predictionMarket(0.5),
  );
  engine.updatePredictionMarks({ [PREDICTION_SLUG]: predictionMarket(0.6) });
  const sold = engine.placePredictionOrder(
    { slug: PREDICTION_SLUG, outcome: 'yes', action: 'sell', qty: '40' },
    predictionMarket(0.6),
  );
  approx(Number(sold.order.realizedPnl), 4, 'realized pnl');

  const snapshot = engine.snapshot();
  approx(snapshot.walletBalance, 99974, 'wallet after sell');
  approx(snapshot.predictionValue, 36, 'remaining value');
  approx(snapshot.equity, 100010, 'equity after sell');
  approx(snapshot.realizedPnl, 4, 'realized pnl in account');

  const positions = engine.listPredictionPositions();
  assert.equal(positions.length, 1);
  approx(Number(positions[0].qty), 60, 'remaining qty');
});

test('预测盘余额不足、卖出未持有结果会被拒绝', () => {
  const engine = newEngine();
  expectError(
    () =>
      engine.placePredictionOrder(
        { slug: PREDICTION_SLUG, outcome: 'yes', action: 'buy', qty: '1000000' },
        predictionMarket(0.9),
      ),
    SIM_ERROR.INSUFFICIENT_BALANCE,
    '可用余额不足',
  );

  engine.placePredictionOrder(
    { slug: PREDICTION_SLUG, outcome: 'yes', action: 'buy', qty: '10' },
    predictionMarket(0.5),
  );
  expectError(
    () =>
      engine.placePredictionOrder(
        { slug: PREDICTION_SLUG, outcome: 'no', action: 'sell', qty: '10' },
        predictionMarket(0.5),
      ),
    SIM_ERROR.POSITION_NOT_FOUND,
    '没有可卖出',
  );
});

test('预测盘重置会清空预测持仓和成交', () => {
  const engine = newEngine();
  engine.placePredictionOrder(
    { slug: PREDICTION_SLUG, outcome: 'yes', action: 'buy', qty: '100' },
    predictionMarket(0.5),
  );
  engine.reset();
  assert.equal(engine.listPredictionPositions().length, 0);
  assert.equal(engine.getPredictionOrderSnapshots().length, 0);
  const snapshot = engine.snapshot();
  approx(snapshot.walletBalance, 100000, 'wallet after reset');
  approx(snapshot.equity, 100000, 'equity after reset');
});

test('现货买入/卖出使用同一钱包并更新持仓', () => {
  const engine = newEngine();
  const spotSymbol = 'BTC-USDT';
  const buy = engine.placeSpotOrder(
    { symbol: spotSymbol, side: 'buy', qty: '0.1' },
    market(65000, spotSymbol),
  );
  approx(buy.order.notional, 6500, 'spot buy notional');
  approx(buy.order.fee, 3.25, 'spot buy fee');

  const afterBuy = engine.snapshot({ [spotSymbol]: market(66000, spotSymbol) });
  approx(afterBuy.walletBalance, 93496.75, 'wallet after spot buy');
  approx(afterBuy.spotValue, 6600, 'spot value');
  approx(afterBuy.spotUnrealizedPnl, 96.75, 'spot unrealized pnl');
  approx(afterBuy.equity, 100096.75, 'equity after spot buy');

  const sell = engine.placeSpotOrder(
    { symbol: spotSymbol, side: 'sell', qty: '0.1' },
    market(66000, spotSymbol),
  );
  approx(sell.order.realizedPnl, 93.45, 'spot realized pnl');
  assert.equal(engine.listSpotHoldings().length, 0);
  approx(engine.snapshot().walletBalance, 100093.45, 'wallet after spot sell');
});

test('现货余额不足和卖出未持有会被拒绝', () => {
  const engine = newEngine();
  expectError(
    () =>
      engine.placeSpotOrder(
        { symbol: 'BTC-USDT', side: 'buy', qty: '100' },
        market(65000, 'BTC-USDT'),
      ),
    SIM_ERROR.INSUFFICIENT_BALANCE,
    '可用余额不足',
  );
  expectError(
    () =>
      engine.placeSpotOrder(
        { symbol: 'BTC-USDT', side: 'sell', qty: '1' },
        market(65000, 'BTC-USDT'),
      ),
    SIM_ERROR.POSITION_NOT_FOUND,
    '可用数量不足',
  );
});

test('逐仓可以追加保证金并改善强平价', () => {
  const engine = newEngine();
  const marketSnapshot = market(100, 'BTC-USDT-SWAP');
  engine.placeOrder(
    {
      symbol: 'BTC-USDT-SWAP',
      side: 'long',
      action: 'open',
      orderType: 'market',
      leverage: 10,
      qty: '1',
      marginMode: 'isolated',
    },
    marketSnapshot,
  );
  const before = engine.listPositions({ 'BTC-USDT-SWAP': marketSnapshot })[0];
  engine.addPositionMargin(before.id, 50);
  const after = engine.listPositions({ 'BTC-USDT-SWAP': marketSnapshot })[0];
  approx(after.margin, before.margin + 50, 'added margin');
  assert.ok(after.liquidationPrice < before.liquidationPrice, 'liquidation price improves');
});

test('全仓模式记录模式且不支持逐仓追加保证金', () => {
  const engine = newEngine();
  const marketSnapshot = market(100, 'BTC-USDT-SWAP');
  engine.placeOrder(
    {
      symbol: 'BTC-USDT-SWAP',
      side: 'long',
      action: 'open',
      orderType: 'market',
      leverage: 10,
      qty: '1',
      marginMode: 'cross',
    },
    marketSnapshot,
  );
  const position = engine.listPositions({ 'BTC-USDT-SWAP': marketSnapshot })[0];
  assert.equal(position.marginMode, 'cross');
  assert.throws(() => engine.addPositionMargin(position.id, 10));
});

test('止盈止损订单记录触发价、执行价和触发保证金率', () => {
  const engine = newEngine();
  const entryMarket = market(100, 'BTC-USDT-SWAP');
  engine.placeOrder(
    {
      symbol: 'BTC-USDT-SWAP',
      side: 'long',
      action: 'open',
      orderType: 'market',
      leverage: 10,
      qty: '1',
      takeProfitPrice: '101',
    },
    entryMarket,
  );
  engine.processMarkets({ 'BTC-USDT-SWAP': market(102, 'BTC-USDT-SWAP') });
  const order = engine.getState().orders.find((item) => item.source === 'tp');
  assert.ok(order, 'tp order exists');
  approx(order!.triggerPrice || 0, 102, 'trigger price');
  assert.ok((order!.avgFillPrice || 0) > 0, 'execution price');
  assert.ok((order!.marginRatioAtTrigger || 0) > 0, 'margin ratio at trigger');
});

test('资金费按名义价值结算：正费率多单支付、空单收取', () => {
  const engine = newEngine();
  const marketSnapshot = market(100, 'BTC-USDT-SWAP');
  engine.placeOrder(
    {
      symbol: 'BTC-USDT-SWAP',
      side: 'long',
      action: 'open',
      orderType: 'market',
      leverage: 10,
      qty: '1',
    },
    marketSnapshot,
  );
  const position = engine.listPositions({ 'BTC-USDT-SWAP': marketSnapshot })[0];
  const before = engine.snapshot({ 'BTC-USDT-SWAP': marketSnapshot }).walletBalance;
  const fundingTime = Date.now();
  const result = engine.applyFundingFee(position.id, 0.0001, fundingTime, 100);
  assert.ok(result);
  approx(result!.notional, 100, 'funding notional');
  approx(result!.amount, -0.01, 'long funding payment');
  const after = engine.snapshot({ 'BTC-USDT-SWAP': marketSnapshot });
  approx(after.walletBalance, before - 0.01, 'funding wallet change');
  const afterPosition = engine.listPositions({ 'BTC-USDT-SWAP': marketSnapshot })[0];
  approx(afterPosition.fundingFee || 0, -0.01, 'position funding fee');
  const entry = engine.getLedger(50).find((item) => item.type === 'funding_fee');
  assert.ok(entry, 'funding ledger entry');
  assertAccountIdentity(after);
});

test('连续大批量现货交易后账本重算无尾差', () => {
  const engine = newEngine();
  const spotMarket = market(65000, 'BTC-USDT');
  for (let i = 0; i < 100; i += 1) {
    engine.placeSpotOrder({ symbol: 'BTC-USDT', side: 'buy', qty: '0.001' }, spotMarket);
    engine.placeSpotOrder({ symbol: 'BTC-USDT', side: 'sell', qty: '0.001' }, spotMarket);
  }
  const snapshot = engine.snapshot({ 'BTC-USDT': spotMarket });
  const ledgerSum = addMoney(
    ...engine.getLedger(1000).map((entry) => entry.amount),
  );
  approx(snapshot.walletBalance, ledgerSum, 'ledger rebuild', 1e-8);
  assertAccountIdentity(snapshot);
});

test('权益恒等式与已实现盈亏分项始终成立', () => {
  const engine = newEngine();
  assertAccountIdentity(engine.snapshot());

  engine.placeSpotOrder(
    { symbol: 'BTC-USDT', side: 'buy', qty: '0.1' },
    market(65000, 'BTC-USDT'),
  );
  assertAccountIdentity(engine.snapshot({ 'BTC-USDT': market(66000, 'BTC-USDT') }));

  engine.placePredictionOrder(
    { slug: PREDICTION_SLUG, outcome: 'yes', action: 'buy', qty: '100' },
    predictionMarket(0.5),
  );
  assertAccountIdentity(engine.snapshot({ 'BTC-USDT': market(66000, 'BTC-USDT') }));

  openLong(engine);
  assertAccountIdentity(engine.snapshot({ 'BTC-USDT': market(66000, 'BTC-USDT') }));
});

test('金额换算：科学计数法先移位再量化，不丢高位有效数字', () => {
  assert.equal(toUnits('1e-8'), 1n);
  assert.equal(toUnits('1.5e-8'), 2n);
  assert.equal(toUnits('9.99e-9'), 1n);
  // 旧实现先截到 8 位小数再乘 10^21，会少算 4e20 个最小单位
  assert.equal(toUnits(1.234567894e21), 123456789400000000000000000000n);
  assert.equal(toUnits('1.234567894e+21'), 123456789400000000000000000000n);
});

test('金额换算：四舍五入到最小单位且正负对称', () => {
  assert.equal(toUnits('2.5e-8'), 3n);
  assert.equal(toUnits('-1.5e-8'), -2n);
  assert.equal(toUnits('123456789.123456789'), 12345678912345679n);
  assert.equal(toUnits(0.1 + 0.2), 30000000n);
  assert.equal(toUnits('8000'), 800000000000n);
  assert.equal(toUnits(null), 0n);
});

console.log(`\n全部通过：${passed} 项`);

// 供文档一致性检查读取，避免 README 中的自测项数手工漂移。
fs.writeFileSync(
  path.resolve(__dirname, '../.simulation-selftest.json'),
  JSON.stringify({ passed, at: new Date().toISOString() }, null, 2),
);

import { Injectable } from '@nestjs/common';

export interface SimOrder {
  orderId: string;
  symbol: string;
  side: 'long' | 'short';
  action: 'open' | 'close';
  orderType: 'market' | 'limit';
  price?: string | null;
  qty: string;
  leverage: number;
  takeProfitPrice?: string;
  stopLossPrice?: string;
  status: 'pending' | 'filled' | 'cancelled';
  avgFillPrice?: string;
  fee?: string;
  createdAt: string;
}

export interface SimPosition {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  leverage: number;
  qty: string;
  entryPrice: string;
}

@Injectable()
export class SimulationState {
  private orders: SimOrder[] = [];
  private positions: Map<string, SimPosition> = new Map();
  private nextOrdId = 1003;
  private nextPosId = 1003;
  walletBalance = 100000;
  availableBalance = 98200;
  positionMargin = 1500;

  getAllOrders(): SimOrder[] {
    return this.orders;
  }

  getPendingOrders(symbol?: string): SimOrder[] {
    let list = this.orders.filter((o) => o.status === 'pending');
    if (symbol) list = list.filter((o) => o.symbol === symbol);
    return list;
  }

  getHistoryOrders(symbol?: string): SimOrder[] {
    let list = this.orders.filter((o) => o.status !== 'pending');
    if (symbol) list = list.filter((o) => o.symbol === symbol);
    return list;
  }

  addOrder(
    body: {
      symbol: string;
      side: 'long' | 'short';
      action: 'open' | 'close';
      orderType: 'market' | 'limit';
      qty: string;
      leverage: number;
      price?: string | null;
      takeProfitPrice?: string;
      stopLossPrice?: string;
    },
    fillPrice?: string,
  ): { orderId: string; status: string } {
    const orderId = `ord_${this.nextOrdId++}`;
    const now = new Date().toISOString();

    if (body.orderType === 'market' && fillPrice) {
      const order: SimOrder = {
        orderId,
        symbol: body.symbol,
        side: body.side,
        action: body.action,
        orderType: body.orderType,
        price: body.price,
        qty: body.qty,
        leverage: body.leverage,
        takeProfitPrice: body.takeProfitPrice,
        stopLossPrice: body.stopLossPrice,
        status: 'filled',
        avgFillPrice: fillPrice,
        fee: (Number(body.qty) * 0.0005).toFixed(4),
        createdAt: now,
      };
      this.orders.push(order);
      this.applyFillToPosition(body.symbol, body.side, body.qty, fillPrice, body.leverage);
      return { orderId, status: 'filled' };
    }

    const order: SimOrder = {
      orderId,
      symbol: body.symbol,
      side: body.side,
      action: body.action,
      orderType: body.orderType,
      price: body.price,
      qty: body.qty,
      leverage: body.leverage,
      takeProfitPrice: body.takeProfitPrice,
      stopLossPrice: body.stopLossPrice,
      status: 'pending',
      createdAt: now,
    };
    this.orders.push(order);
    return { orderId, status: 'pending' };
  }

  cancelOrder(orderId: string): boolean {
    const order = this.orders.find((o) => o.orderId === orderId);
    if (order && order.status === 'pending') {
      order.status = 'cancelled';
      return true;
    }
    return false;
  }

  private applyFillToPosition(symbol: string, side: 'long' | 'short', qty: string, fillPrice: string, leverage: number) {
    const qtyNum = Number(qty);
    const priceNum = Number(fillPrice);
    const existing = this.positions.get(symbol);

    if (existing && existing.side === side) {
      const existingQty = Number(existing.qty);
      const existingPrice = Number(existing.entryPrice);
      const newQty = existingQty + qtyNum;
      const newPrice = ((existingQty * existingPrice) + (qtyNum * priceNum)) / newQty;
      existing.qty = newQty.toFixed(4);
      existing.entryPrice = newPrice.toFixed(2);
      existing.leverage = leverage;
    } else if (existing && existing.side !== side) {
      const existingQty = Number(existing.qty);
      const net = existingQty - qtyNum;
      if (net > 0) {
        existing.qty = net.toFixed(4);
      } else if (net < 0) {
        existing.side = side;
        existing.qty = Math.abs(net).toFixed(4);
        existing.entryPrice = fillPrice;
        existing.leverage = leverage;
      } else {
        this.positions.delete(symbol);
      }
    } else {
      this.positions.set(symbol, {
        id: `pos_${this.nextPosId++}`,
        symbol,
        side,
        leverage,
        qty: qtyNum.toFixed(4),
        entryPrice: fillPrice,
      });
    }

    const marginUsed = qtyNum * priceNum / leverage;
    this.positionMargin += marginUsed;
    this.availableBalance = Math.max(0, this.availableBalance - marginUsed);
  }

  closePosition(symbol: string, closePrice: string): boolean {
    const pos = this.positions.get(symbol);
    if (!pos) return false;

    const qty = Number(pos.qty);
    const entry = Number(pos.entryPrice);
    const close = Number(closePrice);
    const pnl = pos.side === 'long'
      ? (close - entry) * qty
      : (entry - close) * qty;

    this.availableBalance += pnl;
    this.walletBalance += pnl;
    this.positions.delete(symbol);
    return true;
  }

  getAllPositions(): SimPosition[] {
    return Array.from(this.positions.values());
  }

  getPosition(symbol: string): SimPosition | undefined {
    return this.positions.get(symbol);
  }
}

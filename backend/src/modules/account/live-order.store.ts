import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

export interface LiveOrderRecord {
  userId: string;
  clientOrderId: string;
  requestHash: string;
  instId: string;
  side: 'long' | 'short';
  action: 'open' | 'close';
  orderType: 'market' | 'limit';
  marginMode?: 'cross' | 'isolated';
  qty: string;
  price: string | null;
  leverage: number;
  exchangeOrderId: string | null;
  localStatus: string;
  exchangeStatus: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredLiveOrders {
  version: 1;
  orders: LiveOrderRecord[];
}

const MAX_ORDERS = 1000;

@Injectable()
export class LiveOrderStore {
  private readonly logger = new Logger(LiveOrderStore.name);
  private readonly filePath: string;
  private data: StoredLiveOrders;

  constructor() {
    this.filePath = path.resolve(__dirname, '../../../data/live-orders.json');
    this.data = this.load();
  }

  get(clientOrderId: string, userId: string): LiveOrderRecord | undefined {
    return this.data.orders.find(
      (order) => order.clientOrderId === clientOrderId && order.userId === userId,
    );
  }

  findByExchangeOrderId(orderId: string, userId: string): LiveOrderRecord | undefined {
    return this.data.orders.find(
      (order) => order.exchangeOrderId === orderId && order.userId === userId,
    );
  }

  list(userId: string): LiveOrderRecord[] {
    return [...this.data.orders]
      .filter((order) => order.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  save(record: LiveOrderRecord): LiveOrderRecord {
    const index = this.data.orders.findIndex((order) => order.clientOrderId === record.clientOrderId);
    if (index >= 0) {
      this.data.orders[index] = record;
    } else {
      this.data.orders.push(record);
    }
    if (this.data.orders.length > MAX_ORDERS) {
      this.data.orders.splice(0, this.data.orders.length - MAX_ORDERS);
    }
    this.saveFile();
    return record;
  }

  private load(): StoredLiveOrders {
    try {
      if (!fs.existsSync(this.filePath)) return { version: 1, orders: [] };
      const raw = JSON.parse(fs.readFileSync(this.filePath, 'utf-8')) as Partial<StoredLiveOrders>;
      return {
        version: 1,
        orders: Array.isArray(raw.orders)
          ? raw.orders
              .filter((order): order is LiveOrderRecord => Boolean(order?.clientOrderId))
              .map((order) => ({ ...order, userId: order.userId || 'u_demo' }))
              .slice(-MAX_ORDERS)
          : [],
      };
    } catch (error) {
      this.logger.warn(`读取实盘订单映射失败: ${(error as Error).message}`);
      return { version: 1, orders: [] };
    }
  }

  private saveFile(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (error) {
      this.logger.error(`保存实盘订单映射失败: ${(error as Error).message}`);
    }
  }
}

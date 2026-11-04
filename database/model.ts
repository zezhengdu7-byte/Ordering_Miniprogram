/** 单店云端模型 v2；restaurant/table-service 负责云端数据，store.ts 仅缓存菜单和本机购物车。金额单位：分。时间：服务端 epoch ms。 */
export type OrderStatus = 'pending' | 'accepted' | 'completed' | 'cancelled';
export type PaymentStatus = 'unpaid' | 'paying' | 'paid';
export type Flavor = '标准' | '不辣' | '微辣' | '中辣' | '特辣';
export interface Document { _id: string; createdAt: number; updatedAt: number }
export interface Store extends Document {
  storeId: 'charcoal-demo'; appId: string; active: boolean;
  name: string; welcome: string; open: boolean; cutleryPrice: number; napkinPrice: number;
}
export interface StoreMember extends Document {
  storeId: 'charcoal-demo'; appId: string; openid: string; role: 'owner' | 'staff'; active: boolean;
}
export interface Category extends Document { name: string; sort: number; onSale: boolean; active: boolean }
export interface Dish extends Document {
  categoryId: string; name: string; description: string; price: number; unit: string;
  imageFileId: string; onSale: boolean; soldOut: boolean; spicy: boolean; tag: string;
  minQuantity?: number; sort: number; active: boolean; version: number;
}
export interface DiningTable extends Document {
  name: string; active: boolean; qrTokenHash: string; qrVersion: number; currentSessionId: string | null; codes?: { release: string };
}
export interface DiningSession extends Document {
  tableId: string; tableName: string; status: 'open' | 'closed'; closedAt: number | null; settledAt?: number; settledTotal?: number; unsettledOrderIds: string[]; dining?: Dining; diningFeeOrderId?: string | null;
}
export interface SessionMember extends Document {
  sessionId: string; openid: string; active: boolean; lastSeenAt: number;
}
export interface CartLine { dishId: string; flavor: Flavor; quantity: number }
/** 预留共享购物车文档；本版顾客购物车保存在设备，下单后订单云端同步。 */
export interface Cart extends Document { sessionId: string; version: number; lines: CartLine[] }
export interface OrderLine extends CartLine { name: string; unit: string; unitPrice: number; subtotal: number }
export interface Dining { people: number; cutlery: number; napkins: number; cutleryPrice: number; napkinPrice: number; total: number; confirmed: true; charged?: boolean }
export interface Order extends Document {
  sessionId: string; tableId: string; tableName: string; submittedBy: string;
  requestId: string; requestHash: string; cartVersion: number | null;
  tableValidated: true; source: 'table-code'; paymentMode: 'demo'; demoPaid: boolean; number: string; businessDate: string;
  dining: Dining; foodTotal: number; items: OrderLine[]; total: number; note: string; status: OrderStatus;
  paymentStatus: PaymentStatus; activePaymentId: string | null; paidPaymentId: string | null;
  settledAt?: number; acceptedAt: number | null; completedAt: number | null; cancelledAt: number | null; version: number;
}
export interface Payment extends Document {
  orderId: string; payerOpenid: string; requestId: string; outTradeNo: string;
  amount: number; currency: 'CNY'; status: 'created' | 'pending' | 'succeeded' | 'closed';
  transactionId: string | null; paidAt: number | null;
}
/** 无平台密钥；密钥只放服务端密钥管理。 */
export interface Printer extends Document {
  name: string; provider: string; serial: string; copies: number; autoPrint: boolean; active: boolean;
}
export interface PrintJob extends Document {
  orderId: string; printerId: string; kind: 'kitchen' | 'receipt'; copyNo: number;
  dedupeKey: string; requestedBy: string; content: string;
  status: 'queued' | 'sending' | 'succeeded' | 'failed' | 'unknown';
  attempts: number; leaseUntil: number | null; providerJobId: string | null;
  lastErrorCode: string | null; finishedAt: number | null;
}

export interface CatalogMeta extends Document { version: number }

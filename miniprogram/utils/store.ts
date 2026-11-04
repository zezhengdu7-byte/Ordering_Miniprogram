import { MENU_VERSION, menuCategories, menuDishes } from './menu-data';

export interface Category { id: string; name: string; onSale?: boolean }
export interface Dish {
  id: string; categoryId: string; name: string; description: string;
  price: number; unit: string; image: string; onSale: boolean; soldOut: boolean;
  spicy: boolean; tag: string; minQuantity?: number;
}
export interface CartItem { key: string; dishId: string; flavor: string; quantity: number }
export interface OrderItem { dishId?: string; minQuantity?: number; name: string; unit: string; price: number; quantity: number; flavor: string }
export interface Order {
  id: string; number: string; table: string; createdAt: number;
  items: OrderItem[]; total: number; note: string; dining?: any; foodTotal?: number;
  status: 'pending' | 'accepted' | 'completed' | 'cancelled'; paid: boolean;
  settledAt?: number; tableId?: string; sessionId?: string; source?: string; version?: number;
}
export interface Shop { name: string; welcome: string; open: boolean; cutleryPrice?: number | null; napkinPrice?: number | null }
export interface Table { id: string; name: string }
export interface Printer { name: string; serial: string; copies: number; autoPrint: boolean }
export interface State { menuVersion?: number; meatOrderVersion?: number; categories: Category[]; dishes: Dish[]; cart: CartItem[]; orders: Order[]; nextOrder: number; shop: Shop; tables: Table[]; currentTable: string; printer: Printer }
const KEY = 'charcoal-demo-v1';
export const money = (cents: number): string => (cents / 100).toFixed(2);
function seed(): State {
  return {
    menuVersion: MENU_VERSION,
    meatOrderVersion: 1,
    categories: menuCategories.map(c => ({ ...c })),
    dishes: menuDishes.map(d => ({ ...d })),
    cart: [], orders: [], nextOrder: 1,
    shop: { name: '炭火里 · 烧烤', welcome: '三两好友，一桌好味', open: true },
    tables: [{ id: 'table-a01', name: 'A01' }, { id: 'table-a02', name: 'A02' }, { id: 'table-a06', name: 'A06' }], currentTable: 'A06',
    printer: { name: '后厨小票机', serial: '', copies: 1, autoPrint: false }
  };
}
export function initialize(): void {
  const saved = wx.getStorageSync(KEY) as State | undefined;
  if (!saved) { wx.setStorageSync(KEY, seed()); return; }
  if ((saved.menuVersion || 0) < MENU_VERSION) {
    const defaults = seed();
    // 更新默认菜单并补充新菜；自建菜品、订单、购物车和门店设置继续保留。
    const merge = <T extends { id: string }>(existing: T[], incoming: T[]): T[] => {
      const ids = new Set(incoming.map(x => x.id));
      return [...incoming.map(x => ({ ...x })), ...existing.filter(x => !ids.has(x.id))];
    };
    wx.setStorageSync(KEY, { ...defaults, ...saved, menuVersion: MENU_VERSION,
      categories: merge(saved.categories || [], defaults.categories),
      dishes: merge(saved.dishes || [], defaults.dishes) });
  }
  const current = wx.getStorageSync(KEY) as State;
  if ((current.meatOrderVersion || 0) < 1) {
    const firstIds = ['lamb', 'beef', 'pork', 'pork-belly'];
    const meat = current.dishes.filter(d => d.categoryId === 'meat');
    const first = firstIds.map(id => meat.find(d => d.id === id)).filter((d): d is Dish => !!d);
    const ordered = [...first, ...meat.filter(d => !firstIds.includes(d.id))];
    let index = 0;
    current.dishes = current.dishes.map(d => d.categoryId === 'meat' ? ordered[index++] : d);
    current.meatOrderVersion = 1;
    wx.setStorageSync(KEY, current);
  }
}
export function read(): State { initialize(); const saved = JSON.parse(JSON.stringify(wx.getStorageSync(KEY))); return { ...seed(), ...saved }; }
function write(state: State): void { wx.setStorageSync(KEY, state); }
export function reset(): void { write(seed()); }
export function saveShop(shop: Shop): void {
  const name = shop.name.trim(), welcome = shop.welcome.trim();
  if (!name || name.length > 20) throw new Error('店名需为 1–20 个字');
  if (!welcome || welcome.length > 48) throw new Error('欢迎词需为 1–48 个字');
  const s = read(); s.shop = { name, welcome, open: !!shop.open }; write(s);
}
export function saveTable(id: string | null, rawName: string): void {
  const s = read(), name = rawName.trim().toUpperCase();
  if (!/^[A-Z0-9\u4e00-\u9fa5-]{1,12}$/.test(name)) throw new Error('桌号限 1–12 位中文、字母或数字');
  if (s.tables.some(t => t.name === name && t.id !== id)) throw new Error('这个桌号已经存在');
  if (id) {
    const table = s.tables.find(t => t.id === id); if (!table) throw new Error('桌台不存在');
    if (s.orders.some(o => o.table === table.name && (o.status === 'pending' || o.status === 'accepted'))) throw new Error('该桌还有未完成订单，暂不能改名');
    if (s.currentTable === table.name) s.currentTable = name;
    table.name = name;
  } else s.tables.push({ id: `table-${Date.now()}-${Math.random().toString(36).slice(2,7)}`, name });
  write(s);
}
export function deleteTable(id: string): void {
  const s = read(), table = s.tables.find(t => t.id === id); if (!table) return;
  if (s.tables.length === 1) throw new Error('至少保留一张桌台');
  if (s.orders.some(o => o.table === table.name && (o.status === 'pending' || o.status === 'accepted'))) throw new Error('该桌还有未完成订单');
  s.tables = s.tables.filter(t => t.id !== id);
  if (s.currentTable === table.name) s.currentTable = s.tables[0].name;
  write(s);
}
export function selectDemoTable(id: string): void {
  const s = read(), table = s.tables.find(t => t.id === id); if (!table) throw new Error('桌台不存在');
  if (s.cart.length && table.name !== s.currentTable) throw new Error('请先提交或清空购物车，再切换桌台');
  s.currentTable = table.name; write(s);
}
export function savePrinter(printer: Printer): void {
  const name = printer.name.trim(), serial = printer.serial.trim();
  if (!name || name.length > 20) throw new Error('请填写 1–20 字设备名称');
  if (serial.length > 40) throw new Error('设备编号过长');
  if (![1,2,3].includes(printer.copies)) throw new Error('打印联数需为 1–3 联');
  const s = read(); s.printer = { name, serial, copies: printer.copies, autoPrint: !!printer.autoPrint }; write(s);
}
export function categoriesWithCount() {
  const s = read();
  return s.categories.map(c => ({ ...c, count: s.dishes.filter(d => d.categoryId === c.id).length }));
}
export function saveCategory(id: string | null, rawName: string): void {
  const name = rawName.trim(); const s = read();
  if (!name || name.length > 12) throw new Error('分区名称需为 1–12 个字');
  if (s.categories.some(c => c.name === name && c.id !== id)) throw new Error('这个分区已经存在');
  if (id) { const c = s.categories.find(c => c.id === id); if (!c) throw new Error('分区不存在'); c.name = name; }
  else s.categories.push({ id: `cat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name });
  write(s);
}
export function setCategoryStatus(id: string): void {
  const s = read(), category = s.categories.find(c => c.id === id);
  if (!category) throw new Error('分区不存在');
  category.onSale = category.onSale === false; write(s);
}
export function moveCategory(id: string, direction: number): void {
  const s = read(); const i = s.categories.findIndex(c => c.id === id); const j = i + direction;
  if (i < 0 || j < 0 || j >= s.categories.length) return;
  [s.categories[i], s.categories[j]] = [s.categories[j], s.categories[i]]; write(s);
}
export function deleteCategory(id: string): void {
  const s = read(); if (s.dishes.some(d => d.categoryId === id)) throw new Error('请先移动或删除该分区里的菜品');
  s.categories = s.categories.filter(c => c.id !== id); write(s);
}
export function saveDish(dish: Dish): void {
  const s = read();
  if (!dish.name.trim() || dish.name.trim().length > 24) throw new Error('请填写 1–24 字的菜品名称');
  if (!s.categories.some(c => c.id === dish.categoryId)) throw new Error('请选择有效分区');
  if (!Number.isSafeInteger(dish.price) || dish.price <= 0 || dish.price > 9999900) throw new Error('价格需为 0.01–99999 元');
  if (!dish.unit.trim()) throw new Error('请填写计价单位');
  const d = { ...dish, name: dish.name.trim(), unit: dish.unit.trim() };
  const i = s.dishes.findIndex(x => x.id === d.id);
  if (i >= 0) s.dishes[i] = d; else s.dishes.push(d);
  if (d.soldOut) s.cart = s.cart.filter(line => line.dishId !== d.id);
  write(s);
}
export function setDishStatus(id: string, field: 'onSale' | 'soldOut'): void {
  const s = read(); const d = s.dishes.find(d => d.id === id); if (!d) return;
  d[field] = !d[field];
  if (d.soldOut) s.cart = s.cart.filter(line => line.dishId !== id);
  write(s);
}
export function deleteDish(id: string): void {
  const s = read(); s.dishes = s.dishes.filter(d => d.id !== id); s.cart = s.cart.filter(c => c.dishId !== id); write(s);
}
export const minQuantityOf = (d: Dish): number => {
  if (d.minQuantity && d.minQuantity > 1) return d.minQuantity;
  if ((d.description || '').indexOf('5串起点') >= 0) return 5;
  return 1;
};
export function changeCart(dishId: string, flavor: string, delta: number): void {
  if (!Number.isInteger(delta)) throw new Error('数量无效');
  const s = read(); const d = s.dishes.find(x => x.id === dishId);
  if (!d || (delta > 0 && (!d.onSale || d.soldOut || !s.categories.some(c => c.id === d.categoryId && c.onSale !== false)))) throw new Error('该菜品暂时无法点单');
  const key = `${dishId}:${flavor}`; const i = s.cart.findIndex(c => c.key === key);
  const current = i >= 0 ? s.cart[i].quantity : 0;
  const min = minQuantityOf(d);
  let q = current + delta;
  if (delta < 0 && q < min) q = 0;
  if (delta > 0 && current === 0) q = Math.max(q, min);
  if (q > 99) throw new Error('同款菜品最多添加 99 份');
  if (q <= 0) { s.cart = s.cart.filter(c => c.key !== key); }
  else if (i >= 0) s.cart[i].quantity = q;
  else s.cart.push({ key, dishId, flavor, quantity: q });
  write(s);
}
export function clearCart(): void { const s = read(); s.cart = []; write(s); }
// 菜单快捷加减：沿用已选口味；最后一份减完后移除该行。
export function changeDishQuantity(dishId: string, delta: number): void {
  if (delta !== 1 && delta !== -1) throw new Error('数量每次只能加减一份');
  const state = read();
  const dish = state.dishes.find(d => d.id === dishId);
  if (!dish) throw new Error('菜品不存在');
  const line = state.cart.filter(item => item.dishId === dishId).slice(-1)[0];
  if (delta < 0 && !line) return;
  changeCart(dishId, line?.flavor || (dish.spicy ? '不辣' : '标准'), delta);
}
export function cartView() {
  const s = read();
  const items = s.cart.map(c => {
    const d = s.dishes.find(d => d.id === c.dishId);
    return d ? { ...c, ...d, available: d.onSale && !d.soldOut && s.categories.some(category => category.id === d.categoryId && category.onSale !== false), minQuantity: minQuantityOf(d), priceText: money(d.price), subtotalText: money(d.price * c.quantity) } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x);
  return { items, count: items.reduce((v, c) => v + c.quantity, 0), total: items.reduce((v, c) => v + c.price * c.quantity, 0) };
}
export function submitOrder(note: string): Order {
  const s = read(); const c = cartView();
  if (!s.shop.open) throw new Error('门店休息中，暂不接单');
  if (!c.items.length) throw new Error('先选几道喜欢的菜吧');
  if (c.items.some(i => !i.available)) throw new Error('购物车中有已下架、售罄或所属分区下架的菜品，请先移除');
  const n = s.nextOrder++;
  const o: Order = {
    id: `order-${Date.now()}-${n}`, number: `A${String(n).padStart(3, '0')}`, table: s.currentTable, createdAt: Date.now(),
    items: c.items.map(i => ({ dishId:i.id,minQuantity:minQuantityOf(i),name: i.name, unit: i.unit, price: i.price, quantity: i.quantity, flavor: i.flavor })),
    total: c.total, note: note.trim().slice(0, 100), status: 'pending', paid: false
  };
  s.orders.unshift(o); s.cart = []; write(s); return o;
}
export function payDemo(id: string): void {
  const s = read(); const o = s.orders.find(o => o.id === id);
  if (!o || o.status === 'cancelled') throw new Error('订单不可支付');
  o.paid = true; o.settledAt = o.settledAt || Date.now(); write(s);
}
export function updateOrder(id: string, next: Order['status']): void {
  const s = read(); const o = s.orders.find(o => o.id === id);
  const transitions: Record<Order['status'], string[]> = { pending: ['accepted', 'cancelled'], accepted: ['completed'], completed: [], cancelled: [] };
  if (!o || !transitions[o.status].includes(next)) throw new Error('订单状态已变化，请刷新');
  if (next === 'cancelled' && o.paid) throw new Error('已模拟付款的订单不支持取消');
  o.status = next; write(s);
}
// 商家可取消未完成的本地演示订单；保留付款标记和菜品快照，不模拟退款。
export function cancelMerchantOrder(id: string): void {
  const s = read(), order = s.orders.find(o => o.id === id);
  if (!order || !['pending', 'accepted'].includes(order.status)) throw new Error('订单已结束，无法取消');
  order.status = 'cancelled'; write(s);
}
export const statusNames = { pending: '待接单', accepted: '制作中', completed: '已完成', cancelled: '已取消' };
export function orderDisplayItems(order: Order) {
  const items: (OrderItem & {service?:string})[] = order.items.map(i => ({ ...i }));
  const dining = order.dining;
  if (dining?.charged) {
    if (dining.cutlery > 0) items.push({ service:'cutlery',name: '餐具', unit: '套', price: dining.cutleryPrice, quantity: dining.cutlery, flavor: '' });
    if (dining.napkins > 0) items.push({ service:'napkins',name: '餐巾纸', unit: '包', price: dining.napkinPrice, quantity: dining.napkins, flavor: '' });
  }
  return items.map(i => ({ ...i, priceText: money(i.price * i.quantity) }));
}
export function orderView() {
  return read().orders.map(o => {
    const t = new Date(o.createdAt); const pad = (n: number) => String(n).padStart(2, '0');
    return { ...o, statusText: statusNames[o.status], totalText: money(o.total), timeText: `${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`, items: orderDisplayItems(o) };
  });
}

// 云端目录只缓存公开菜单和本店配置，不导入本机演示订单到云端。
export function cacheCloudCatalog(snapshot: { categories: Category[]; dishes: Dish[]; shop: Shop; tables: Table[]; printer?: Printer }): void {
  const state = read();
  state.categories = snapshot.categories; state.dishes = snapshot.dishes; state.shop = snapshot.shop; state.tables = snapshot.tables;
  state.cart = state.cart.filter(line => snapshot.dishes.some(d => d.id === line.dishId && !d.soldOut));
  if (snapshot.printer) state.printer = snapshot.printer;
  if (!state.tables.some(t => t.name === state.currentTable)) state.currentTable = state.tables[0]?.name || '';
  write(state);
}

// Cloud data is authoritative. Keep the cart and the archived local demo orders on this device.
export function cacheCloudState(remote: State): void {
  const current=read();
  if (!wx.getStorageSync('charcoal-local-orders-archive')) wx.setStorageSync('charcoal-local-orders-archive', current.orders);
  write({ ...current, categories:remote.categories,dishes:remote.dishes,orders:remote.orders,shop:remote.shop,
    cart:current.cart.filter(line=>remote.dishes.some(d=>d.id===line.dishId&&!d.soldOut)),menuVersion:MENU_VERSION });
}

export function editPendingOrder(id:string,lines:{dishId:string;flavor:string;quantity:number}[],note:string,merchant=false) {
  const state=read(),order=state.orders.find(o=>o.id===id);
  if(!order||!(order.status==='pending'||merchant&&order.status==='accepted')||order.paid)throw new Error('订单当前状态不允许修改');
  if(!lines.length)throw new Error('请至少保留一道菜，或取消订单');
  const items=lines.map(line=>{
    const d=state.dishes.find(d=>d.id===line.dishId);
    if(!d||!d.onSale||d.soldOut||!Number.isInteger(line.quantity)||line.quantity<minQuantityOf(d)||line.quantity>99)throw new Error('菜品或数量无效');
    return {dishId:d.id,name:d.name,unit:d.unit,price:d.price,flavor:line.flavor,quantity:line.quantity,minQuantity:minQuantityOf(d)};
  });
  order.items=items;order.total=items.reduce((n,i)=>n+i.price*i.quantity,0);order.note=note.trim().slice(0,100);write(state);
}

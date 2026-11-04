import { cloudConfig } from '../config';
import { initAuth } from './auth';
import { tableState, TableBinding, clearTableBinding } from './table-service';
import * as local from './store';
import type { Dish, Shop, Printer, Order } from './store';
export { read, money, cartView, categoriesWithCount, changeCart, changeDishQuantity, clearCart, selectDemoTable, statusNames } from './store';
const enabled = () => cloudConfig.businessCloud === true;
let version: number | undefined;
let customerOrders: Order[] = [], merchantOrders: Order[] = [];
let pendingSubmit: { fingerprint: string; requestId: string } | null = null;
const messages: Record<string,string> = {
  ORDER_ITEMS_ONLY:'只能修改订单中已有的菜品', BILL_CHANGED:'结算金额已变化，请核对后重新结算', ORDERS_NOT_COMPLETED:'本桌还有订单未完成，暂不能结算', ORDER_NOT_EDITABLE:'订单当前状态不允许修改，请刷新后查看', DINING_ALREADY_CHARGED:'餐具和纸巾已提交订单，无法修改，请联系店员', FEE_CHANGED:'收费已更新，请重新查看并确认', DINING_FEES_NOT_CONFIGURED:'餐具及纸巾收费尚未设置，请联系店员', INVALID_DINING:'人数为1至99，餐具和纸巾数量为0至99', INVALID_FEE:'请填写有效的餐具及纸巾单价', DINING_REQUIRED:'请先确认用餐人数和餐具数量', FORBIDDEN:'当前微信无权执行此操作', UNAUTHENTICATED:'请在微信中重新打开小程序', OWNER_REQUIRED:'仅店主可执行',
  STORE_UNAVAILABLE:'门店暂不可用', STORE_CLOSED:'门店休息中，暂不接单', VERSION_CONFLICT:'数据已更新，请刷新后重试',
  DISH_UNAVAILABLE:'菜品已下架或售罄，请刷新菜单', CATEGORY_NOT_EMPTY:'请先移动或删除分区里的菜品',
  DUPLICATE_NAME:'名称已经存在', TABLE_BUSY:'该桌还有未完成订单，暂不能修改', LAST_TABLE:'至少保留一张桌台',
  INVALID_ORDER_TRANSITION:'订单状态已变化，请刷新', PAYMENT_MUST_BE_CLOSED:'请先处理订单支付', INVALID_IMAGE:'请先上传菜品图片',
  REQUEST_REUSED:'提交内容已变化，请重新下单', SESSION_REQUIRED:'请先扫描桌码', SESSION_CLOSED:'本次用餐已结束，请重新扫码', NOT_INITIALIZED:'云端菜单尚未初始化'
};
export async function call(action: string, payload: any = {}, expectedVersion?: number): Promise<any> {
  initAuth();
  if (!wx.cloud) throw new Error('当前微信版本不支持云开发');
  let response: any;
  try { response = await wx.cloud.callFunction({name:'restaurant',data:{action,payload,...(expectedVersion === undefined ? {} : {expectedVersion})}}); }
  catch (_) { throw new Error('云端连接失败，请稍后重试'); }
  const result = response?.result;
  if (!result?.ok) { const error: any = new Error(messages[result?.code] || '云端操作未完成，请刷新后重试'); error.cloudCode = result?.code; throw error; }
  return result.data;
}
function applyCatalog(snapshot: any): void { version = snapshot.version; local.cacheCloudCatalog(snapshot); }
export async function syncCatalog(merchant = false): Promise<void> {
  if (!enabled()) return;
  applyCatalog(await call(merchant ? 'snapshot' : 'catalog'));
}
export async function syncOrders(merchant = false): Promise<void> {
  if (!enabled()) return;
  const orders = await call('orders',{merchant});
  if (merchant) merchantOrders = orders; else customerOrders = orders;
}
export async function syncMerchant(): Promise<void> { await Promise.all([syncCatalog(true),syncOrders(true)]); }
async function mutation(action: string, payload: any): Promise<void> {
  try { applyCatalog(await call(action,payload,version)); }
  catch(e) { await syncCatalog(true).catch(()=>{}); throw e; }
}
export async function uploadDishImage(filePath: string): Promise<string> {
  if (!enabled() || filePath.startsWith('cloud://')) return filePath;
  initAuth();
  const content = wx.getFileSystemManager().readFileSync(filePath,'base64');
  return await call('uploadImage',{content});
}
export async function saveDish(dish: Dish) { if (!enabled()) return local.saveDish(dish); const image=await uploadDishImage(dish.image); await mutation('saveDish',{dish:{...dish,image}}); }
export async function deleteDish(id: string) { if (!enabled()) return local.deleteDish(id); await mutation('deleteDish',{id}); }
export async function setDishStatus(id: string,field: 'onSale'|'soldOut') { if (!enabled()) return local.setDishStatus(id,field); await mutation('setDishStatus',{id,field}); }
export async function saveCategory(id: string|null,name: string) { if (!enabled()) return local.saveCategory(id,name); await mutation('saveCategory',{id,name}); }
export async function deleteCategory(id: string) { if (!enabled()) return local.deleteCategory(id); await mutation('deleteCategory',{id}); }
export async function moveCategory(id: string,direction: number) { if (!enabled()) return local.moveCategory(id,direction); await mutation('moveCategory',{id,direction}); }
export async function setCategoryStatus(id: string) { if (!enabled()) return local.setCategoryStatus(id); await mutation('setCategoryStatus',{id}); }
export async function saveShop(shop: Shop) { if (!enabled()) return local.saveShop(shop); await mutation('saveShop',{shop}); }
export async function saveTable(id: string|null,name: string) { if (!enabled()) return local.saveTable(id,name); await mutation('saveTable',{id,name}); }
export async function deleteTable(id: string) { if (!enabled()) return local.deleteTable(id); await mutation('deleteTable',{id}); }
export async function savePrinter(printer: Printer) { if (!enabled()) return local.savePrinter(printer); await mutation('savePrinter',{printer}); }
export async function submitOrder(note: string, confirmedBinding?: TableBinding): Promise<Order> {
  if (!enabled()) return local.submitOrder(note);
  const state=local.read();const binding=confirmedBinding || tableState().binding;if(!binding)throw new Error('请先扫描桌码');
  const lines=state.cart.map(c=>({dishId:c.dishId,flavor:c.flavor,quantity:c.quantity}));
  const payload={tableId:binding.tableId,sessionId:binding.sessionId,note:note.trim().slice(0,100),lines};
  const fingerprint=JSON.stringify(payload);
  const stored=wx.getStorageSync('charcoal-pending-cloud-order');
  if(!pendingSubmit && stored?.fingerprint && stored?.requestId) pendingSubmit=stored;
  // After a timeout the same submission is retried first, even if the local cart has since changed.
  if(pendingSubmit && pendingSubmit.fingerprint !== fingerprint) throw new Error('上一笔提交结果未确认，请恢复原购物车并重试');
  if(!pendingSubmit){pendingSubmit={fingerprint,requestId:`${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`};wx.setStorageSync('charcoal-pending-cloud-order',pendingSubmit);}
  let order: Order;
  try { order=await call('submitOrder',{...payload,requestId:pendingSubmit.requestId}); }
  catch(e: any) {
    if(e.cloudCode && e.cloudCode !== 'SERVICE_UNAVAILABLE') { pendingSubmit=null; wx.setStorageSync('charcoal-pending-cloud-order',null); }
    throw e;
  }
  pendingSubmit=null;wx.setStorageSync('charcoal-pending-cloud-order',null);
  customerOrders=[order,...customerOrders.filter(o=>o.id!==order.id)];local.clearCart();return order;
}
export async function payDemo(id: string) { if (!enabled()) return local.payDemo(id); await call('payDemo',{id});await syncOrders(false); }
export async function updateOrder(id: string,status: Order['status']) {
  if (!enabled()) return local.updateOrder(id,status);
  const order=customerOrders.find(o=>o.id===id);
  await call('cancelCustomerOrder',{id,status,version:(order as any)?.version});await syncOrders(false);
}
export async function merchantOrderAction(id: string,status: Order['status']) {
  if (!enabled()) return status==='cancelled'?local.cancelMerchantOrder(id):local.updateOrder(id,status);
  const order=merchantOrders.find(o=>o.id===id);
  await call('updateOrder',{id,status,version:(order as any)?.version});await syncOrders(true);
}
export function orderView(merchant = false) {
  if (!enabled()) return local.orderView();
  return (merchant?merchantOrders:customerOrders).map(o=>{
    const t=new Date(o.createdAt),pad=(n:number)=>String(n).padStart(2,'0');
    return {...o,statusText:local.statusNames[o.status],totalText:local.money(o.total),diningFeeText:local.money(o.dining?.total||0),cutleryFeeText:local.money((o.dining?.cutleryPrice||0)*(o.dining?.cutlery||0)),napkinFeeText:local.money((o.dining?.napkinPrice||0)*(o.dining?.napkins||0)),timeText:`${pad(t.getMonth()+1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}`,items:local.orderDisplayItems(o)};
  });
}

export async function getBill() {
  if(!enabled()) {
    const rows=local.read().orders.filter(o=>o.table===local.read().currentTable&&o.status!=='cancelled'&&!o.paid);
    return {sessionId:'local',table:local.read().currentTable,total:rows.reduce((n,o)=>n+o.total,0),unfinished:rows.filter(o=>o.status!=='completed').length,count:rows.length};
  }
  const sid=tableState().binding?.sessionId;
  if(!sid)return null;
  try{return await call('getBill',{sessionId:sid});}catch(e:any){if(e.cloudCode==='SESSION_CLOSED'){clearTableBinding(sid);local.clearCart();return null;}throw e;}
}
export async function settleTable(expectedTotal?:number) {
  if(!enabled()){
    const bill=await getBill();if(bill?.unfinished)throw new Error('本桌还有订单未完成，暂不能结算');
    local.read().orders.filter(o=>o.table===bill?.table&&o.status==='completed'&&!o.paid).forEach(o=>local.payDemo(o.id));
    return;
  }
  const sid=tableState().binding?.sessionId;if(!sid)throw new Error('请先扫描桌码');
  await call('settleSession',{sessionId:sid,expectedTotal});clearTableBinding(sid);local.clearCart();await syncOrders(false);
}
export async function editCustomerOrder(order:any,merchant=false) {
  const lines=order.items.filter((i:any)=>!i.service).map((i:any)=>({dishId:i.dishId,flavor:i.flavor,quantity:i.quantity}));
  if(!enabled())return local.editPendingOrder(order.id,lines,order.note,merchant);
  await call(merchant?'editMerchantOrder':'editCustomerOrder',{id:order.id,version:order.version,lines,note:order.note,
    ...(order.dining?.charged?{dining:{cutlery:order.items.find((i:any)=>i.service==='cutlery')?.quantity||0,napkins:order.items.find((i:any)=>i.service==='napkins')?.quantity||0}}:{})});
  await syncOrders(merchant);
}

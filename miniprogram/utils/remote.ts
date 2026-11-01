import { cloudConfig } from '../config';
import * as local from './store';
import { initAuth } from './auth';
let revision: number | undefined;
const enabled = () => !!cloudConfig.envId && cloudConfig.businessEnabled;
let syncTask: Promise<void> | null = null;
async function call(action: string, args: any[] = [], requestId = ''): Promise<any> {
  initAuth();
  const response = await wx.cloud.callFunction({ name: 'business', data: { storeId: cloudConfig.storeId, action, args, requestId, revision } });
  const result = response.result;
  if (!result || !result.ok) { const error: any = new Error(result?.message || (result?.code === 'NOT_INITIALIZED' ? '云端菜单尚未初始化，请由商家进入工作台同步' : '云端连接失败，请重试')); error.code=result?.code; error.merchant=result?.merchant; throw error; }
  return result;
}
export async function syncCloud(): Promise<void> {
  if (!enabled()) return;
  if (syncTask) return syncTask;
  syncTask = (async () => {
    let result;
    try { result = await call('read'); }
    catch (e: any) {
      if (e.code !== 'NOT_INITIALIZED' || !e.merchant) throw e;
      const state=local.read(); const dishes=[];
      for (const d of state.dishes) dishes.push(await cloudDish(d));
      await call('bootstrap', [{ categories:state.categories,dishes }], token());
      result = await call('read');
    }
    revision=result.revision; local.cacheCloudState(result.state);
  })().finally(() => { syncTask=null; });
  return syncTask;
}
function token() { return `r-${Date.now()}-${Math.random().toString(36).slice(2,12)}`; }
async function cloudDish(dish: local.Dish): Promise<local.Dish> {
  if (dish.image.startsWith('/assets/') || dish.image.startsWith('cloud://')) return dish;
  const upload = await wx.cloud.uploadFile({ cloudPath:`menu/${cloudConfig.storeId}/${token()}.jpg`,filePath:dish.image });
  return { ...dish,image:upload.fileID };
}
// Reuse a request ID if a network response is lost; server receipts prevent duplicate orders or toggles.
async function mutate(action: string, args: any[]): Promise<any> {
  if (!enabled()) return (local as any)[action](...args);
  const key='charcoal-cloud-pending';
  const serialized=JSON.stringify({action,args}); const pending=wx.getStorageSync(key);
  const requestId=pending?.serialized===serialized ? pending.requestId : token();
  wx.setStorageSync(key,{serialized,requestId});
  let response;
  try { response=await call(action,args,requestId); }
  catch (e: any) { if(e.code) wx.removeStorageSync(key); throw e; }
  wx.removeStorageSync(key);
  // A refresh failure must not turn a successfully committed order into a failed submission.
  try { await syncCloud(); } catch (_) { wx.showToast({title:'已保存云端，列表刷新失败，请重新进入',icon:'none'}); }
  return response.result;
}
export const saveDish = async (dish: local.Dish) => mutate('saveDish',[enabled() ? await cloudDish(dish) : dish]);
export const deleteDish = (id:string) => mutate('deleteDish',[id]);
export const setDishStatus = (id:string,field:string) => mutate('setDishStatus',[id,field]);
export const saveCategory = (id:string|null,name:string) => mutate('saveCategory',[id,name]);
export const deleteCategory = (id:string) => mutate('deleteCategory',[id]);
export const moveCategory = (id:string,direction:number) => mutate('moveCategory',[id,direction]);
export const setCategoryStatus = (id:string) => mutate('setCategoryStatus',[id]);
export const updateOrder = (id:string,status:local.Order['status']) => mutate('updateOrder',[id,status]);
export const cancelMerchantOrder = (id:string) => mutate('cancelMerchantOrder',[id]);
export const payDemo = (id:string) => mutate('payDemo',[id]);
export async function submitOrder(note:string):Promise<local.Order> {
  if(!enabled()) return local.submitOrder(note);
  const state=local.read();
  const order=await mutate('submitOrder',[{cart:state.cart.map(({dishId,flavor,quantity})=>({dishId,flavor,quantity})),table:state.currentTable,note}]);
  local.clearCart(); return order;
}

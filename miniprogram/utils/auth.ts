import { cloudConfig } from '../config';
export interface Identity { role: 'customer' | 'owner' | 'staff'; storeId: string; accountId?: string }
let identity: Identity = { role: 'customer', storeId: cloudConfig.storeId };
let initialized = false;
let merchantPreview = false;
// 仅未接云环境的开发工具可预览本机数据，不授予任何云端身份。
export function canPreviewMerchant(): boolean {
  try { return !configured() && wx.getDeviceInfo().platform === 'devtools' && wx.getAccountInfoSync().miniProgram.envVersion === 'develop'; }
  catch (_) { return false; }
}
export function isMerchantPreview(): boolean { return merchantPreview && canPreviewMerchant(); }
export function enterMerchantPreview(): void {
  if (!canPreviewMerchant()) throw new Error('本地预览仅限微信开发工具');
  merchantPreview = true;
}
export function leaveMerchantPreview(): void { merchantPreview = false; }
export function configured(): boolean { return !!cloudConfig.envId.trim(); }
export function initAuth(): void {
  if (!configured() || initialized || !wx.cloud) return;
  wx.cloud.init({ env: cloudConfig.envId }); initialized = true;
}
export function isMerchant(): boolean { return identity.role === 'owner' || identity.role === 'staff'; }
export function clearIdentity(): void { identity = { role: 'customer', storeId: cloudConfig.storeId }; }
export async function refreshIdentity(): Promise<Identity> {
  // 权限不从本地存储、页面参数或昵称读取，每次均向云端校验。
  clearIdentity();
  if (!configured()) return { ...identity };
  initAuth();
  if (!initialized) throw new Error('当前微信版本暂不支持云开发');
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const response: any = await Promise.race([
      wx.cloud.callFunction({ name: 'identity', data: { storeId: cloudConfig.storeId } }),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('身份验证超时，请重试')), 10000); })
    ]).finally(() => { if (timer !== undefined) clearTimeout(timer); });
    const result = response.result;
    if (!result || result.ok !== true || result.storeId !== cloudConfig.storeId || !['customer', 'owner', 'staff'].includes(result.role)) throw new Error('身份校验失败，请重试');
    identity = { role: result.role, storeId: result.storeId, accountId: typeof result.accountId === 'string' ? result.accountId : '' };
    return { ...identity };
  } catch (_) { clearIdentity(); throw new Error('身份验证未完成，请检查云环境配置后重试'); }
}
export async function requireMerchant(): Promise<void> {
  if (isMerchantPreview()) return;
  const current = await refreshIdentity();
  if (!['owner', 'staff'].includes(current.role)) throw new Error(configured() ? '当前微信尚未获得这家门店的管理权限' : '尚未配置微信云环境，商家管理暂未开放');
}
export function syncMerchantEntry(page: any): void {
  page.setData({ merchantVisible: false });
  void refreshIdentity().then(() => page.setData({ merchantVisible: isMerchant() })).catch(() => page.setData({ merchantVisible: false }));
}
export function staffLogin(): void { wx.navigateTo({ url: '/pages/staff-login/index' }); }
// 页面守卫负责阻止直接路由进入及过期身份操作。真正的云端业务也必须逐次鉴权。
export function merchantPage(options: any): any {
  const guarded: any = { ...options, data: { ...options.data, authorized: false } };
  for (const key of Object.keys(options)) {
    const fn = options[key];
    if (typeof fn !== 'function') continue;
    if (key === 'refresh') {
      guarded[key] = function(this: any, ...args: any[]) { if (this.data.authorized) return fn.apply(this, args); };
      continue;
    }
    if (key === 'onHide' || key === 'onUnload') { guarded[key] = fn; continue; }
    guarded[key] = async function(this: any, ...args: any[]) {
      if (key === 'onLoad' || key === 'onShow') this.setData({ authorized: false });
      try { await requireMerchant(); }
      catch (e: any) {
        this.setData({ authorized: false, dishes: [], categories: [], orders: [], receipt: null, categoryOpen: false });
        wx.showToast({ title: e.message, icon: 'none' });
        wx.redirectTo({ url: '/pages/staff-login/index' });
        return;
      }
      this.setData({ authorized: true, simulatorPreview: isMerchantPreview() });
      try { return await fn.apply(this, args); }
      catch (e: any) { wx.showToast({ title: e.message || '云端操作未完成', icon: 'none' }); }
    };
  }
  if (!options.onShow) {
    guarded.onShow = async function(this: any) {
      this.setData({ authorized: false });
      try { await requireMerchant(); this.setData({ authorized: true, simulatorPreview: isMerchantPreview() }); }
      catch (_) { wx.redirectTo({ url: '/pages/staff-login/index' }); }
    };
  }
  const onHide = options.onHide;
  guarded.onHide = function(this: any) { this.setData({ authorized: false }); if (onHide) onHide.call(this); };
  return guarded;
}

import { initAuth } from './auth';
export interface TableBinding { tableId: string; tableName: string; sessionId: string }
let binding: TableBinding | null = null;
let generation = 0;
let pending = false;
let error = '';
export async function tableCall(action: string, data: any = {}): Promise<any> {
  initAuth();
  let timer: any;
  const r: any = await Promise.race([
    wx.cloud.callFunction({ name: 'table-service', data: { ...data, action } }),
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('桌台服务超时，请重试')), 15000); })
  ]).finally(() => clearTimeout(timer));
  if (!r.result?.ok) throw new Error(r.result?.message || '桌台服务未部署或暂不可用');
  return r.result;
}
export function tableState() { return { binding, pending, error }; }
export async function enterMerchantTable(tableId: string): Promise<void> {
  const seq = ++generation;
  pending = true; error = '';
  try {
    const result = await tableCall('merchantJoin', { tableId });
    if (seq !== generation) throw new Error('桌号已变化，请重新选择');
    binding = result.binding;
    wx.setStorageSync('table-binding', binding);
  } finally { if (seq === generation) pending = false; }
}
export async function handleTableEntry(options: any): Promise<void> {
  const scene = options?.query?.scene;
  const seq = ++generation;
  pending = true; error = ''; binding = null;
  // Any fresh scan clears previous authority immediately, including malformed scans.
  try {
    let result;
    if (scene !== undefined) {
      wx.removeStorageSync('table-binding');
      const token = decodeURIComponent(scene);
      if (!/^[A-Za-z0-9_-]{22}$/.test(token)) throw new Error('桌码无效，请重新扫码');
      result = await tableCall('join', { token });
    } else {
      const saved = wx.getStorageSync('table-binding');
      if (!saved?.sessionId) return;
      result = await tableCall('binding', { sessionId: saved.sessionId });
    }
    if (seq !== generation) return;
    binding = result.binding;
    wx.setStorageSync('table-binding', binding);
  } catch (e: any) {
    if (seq !== generation) return;
    error = e.message || '桌码识别失败，请重新扫码';
    wx.removeStorageSync('table-binding');
  } finally { if (seq === generation) pending = false; }
}

// 路径和 scene 在不同客户端可能经过编码；桌号权限始终由云端令牌校验。
export function scanScene(result: any): string {
  let path = typeof result.path === 'string' ? result.path : '';
  for (let i = 0; i < 2; i++) {
    const match = /^\/?pages\/menu\/index(?:\.html)?\?([^#]*)(?:#.*)?$/.exec(path);
    if (match) {
      const values = match[1].split('&').filter(part => /^scene(?:=|%3d)/i.test(part));
      if (values.length !== 1) return '';
      let value = values[0].replace(/^scene(?:=|%3d)/i, '');
      for (let n = 0; n < 2; n++) {
        if (/^[A-Za-z0-9_-]{22}$/.test(value)) return value;
        try { value = decodeURIComponent(value); } catch (_) { return ''; }
      }
      return '';
    }
    try { const decoded = decodeURIComponent(path); if (decoded === path) break; path = decoded; }
    catch (_) { return ''; }
  }
  // 部分扫码回调只提供 WX_CODE 的原始内容，不包含本小程序路径。
  if (!result.path && result.scanType === 'WX_CODE') {
    if (typeof result.result === 'string' && /^[A-Za-z0-9_-]{22}$/.test(result.result)) return result.result;
    if (typeof result.rawData === 'string') {
      try {
        const bytes = new Uint8Array(wx.base64ToArrayBuffer(result.rawData));
        const token = Array.from(bytes).map(v => String.fromCharCode(v)).join('');
        if (/^[A-Za-z0-9_-]{22}$/.test(token)) return token;
      } catch (_) {}
    }
  }
  return '';
}
export async function scanTable(): Promise<void> {
  const result: any = await new Promise((resolve, reject) => wx.scanCode({
    onlyFromCamera: true, success: resolve, fail: reject
  }));
  const scene = scanScene(result);
  await handleTableEntry({ query: { scene } });
  if (!scene) throw new Error('未读到桌号信息，请扫描本店桌码；开发工具请用真机预览测试');
  const state = tableState();
  if (!state.binding || state.error) throw new Error(state.error || '桌码识别失败，请重新扫码');
}

export function clearTableBinding(sessionId:string):void {
  if(binding?.sessionId!==sessionId)return;
  ++generation;binding=null;pending=false;error='本次用餐已结束，请重新扫码';
  wx.removeStorageSync('table-binding');
}

export async function refreshTableBinding():Promise<void> {
  const current=binding;if(!current||pending)return;
  try {
    await tableCall('binding',{sessionId:current.sessionId});
  } catch(e:any) {
    if(/本次用餐已结束|请重新扫描桌码/.test(e.message))clearTableBinding(current.sessionId);
  }
}

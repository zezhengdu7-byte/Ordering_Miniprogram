import { call, syncCatalog } from '../../utils/cloud-repository';
import { tableState, scanTable, refreshTableBinding } from '../../utils/table-service';
import { syncMerchantEntry, staffLogin } from '../../utils/auth';
import { read, cartView, changeCart, changeDishQuantity, clearCart, submitOrder, money } from '../../utils/cloud-repository';
Page({
  data: { shopName: '炭火里 · 烧烤', welcome: '', open: true, tableName: '未选择桌号', tableConfirmed: false, tablePending: false, scanning: false, merchantVisible: false, cloudReady: false, categories: [] as any[], dishes: [] as any[], activeCategory: 'meat', cart: [] as any[], count: 0, foodCount:0, diningCart:[] as any[], totalText: '0.00', cartOpen: false, selected: null as any, flavor: '不辣', flavors: ['不辣', '微辣', '中辣', '特辣'], note: '', diningOpen:false, diningLoading:false, dining:null as any, diningCharged:false, feesReady:false, peopleOptions:[1,2,3,4,5,6,7,8], quantityOptions:[0,1,2,3,4,5,6,7,8], people:1,cutlery:1,napkins:0,cutleryPrice:0,napkinPrice:0,cutleryPriceText:'',napkinPriceText:'',cutleryTotalText:'0.00',napkinTotalText:'0.00',diningTotalText:'0.00' },
  async onShow() { this.menuVisible=true;clearTimeout(this.tableTimer);try { await syncCatalog();this.setData({cloudReady:true}); } catch (e: any) { wx.showToast({title:e.message,icon:'none'}); } if(!this.menuVisible)return;this.refresh(); syncMerchantEntry(this); this.pollTable(); },
  async refreshCatalog() {
    if(this.catalogSyncing || Date.now()-(this.catalogSyncedAt||0)<5000)return;
    this.catalogSyncing=true;this.catalogSyncedAt=Date.now();
    try { await syncCatalog();if(this.menuVisible)this.refresh(); }
    catch (_) { /* 保留购物车，等待下次成功同步菜单。 */ }
    finally { this.catalogSyncing=false; }
  },
  pollTable() {
    clearTimeout(this.tableTimer);
    if(!this.menuVisible||this.data.scanning)return;
    void this.refreshCatalog();
    const bindingSession=tableState().binding?.sessionId;
    if(bindingSession&&!this.bindingSyncing&&Date.now()-(this.lastBindingSync||0)>=5000){this.bindingSyncing=true;this.lastBindingSync=Date.now();void refreshTableBinding().finally(()=>{this.bindingSyncing=false;if(!tableState().binding)clearCart();if(this.menuVisible)this.refresh();});}
    const sid=tableState().binding?.sessionId;
    if(sid&&this.diningSession!==sid){this.diningSession=sid;void this.loadDining(sid);}
    if(!sid&&(this.diningSession||this.data.dining||this.data.diningOpen)){
      this.diningSession=null;this.setData({dining:null,diningOpen:false});
    }
    this.refresh();
    this.tableTimer=setTimeout(()=>this.pollTable(),1000);
  },
  onHide() { this.menuVisible=false;clearTimeout(this.tableTimer); },
  onUnload() { this.menuVisible=false;clearTimeout(this.tableTimer); },
  refresh() {
    const s = read(); const c = cartView();
    if(this.data.selected){
      const selected=s.dishes.find(d=>d.id===this.data.selected.id);
      if(!selected||selected.soldOut||!selected.onSale)this.setData({selected:null});
    }
    const state = tableState();
    const confirmed = !!state.binding && !state.pending;
    const title = confirmed ? state.binding!.tableName + ' 桌 · 本桌点单' : '请先扫码确认桌号';
    if(this.menuTitle!==title){wx.setNavigationBarTitle({title});this.menuTitle=title;}
    const categories = s.categories.filter(x => x.onSale !== false).map(x => ({ ...x, count: s.dishes.filter(d => d.categoryId === x.id && d.onSale).length }));
    let active = this.data.activeCategory;
    if (!categories.some(x => x.id === active)) active = categories[0]?.id || '';
    const dishes = s.dishes.filter(d => d.onSale && categories.some(c => c.id === d.categoryId) && d.categoryId === active).map(d => ({ ...d, min: d.minQuantity && d.minQuantity > 1 ? d.minQuantity : 1, priceText: money(d.price), quantity: c.items.filter(i => i.dishId === d.id).reduce((n, i) => n + i.quantity, 0) }));
    const dining=this.data.dining;
    const diningCart=dining&&!this.data.diningCharged ? [
      {id:'cutlery',name:'餐具',unit:'套',quantity:dining.cutlery,price:dining.cutleryPrice},
      {id:'napkins',name:'餐巾纸',unit:'包',quantity:dining.napkins,price:dining.napkinPrice}
    ].filter(i=>i.quantity>0).map(i=>({...i,priceText:money(i.price),subtotalText:money(i.price*i.quantity)})) : [];
    const diningTotal=diningCart.reduce((n,i)=>n+i.quantity*i.price,0);
    const diningCount=diningCart.reduce((n,i)=>n+i.quantity,0);
    const next = { tableConfirmed: confirmed, tablePending: state.pending, shopName: s.shop.name, welcome: s.shop.welcome, open: s.shop.open, tableName: state.binding?.tableName || (state.pending ? '识别中' : '未选择桌号'), tableNotice: tableState().error || (tableState().binding ? '桌号已确认，提交后订单将同步至商家。' : '请先扫描桌码确认桌号，再选购商品。'), categories, dishes, activeCategory: active, cart: c.items, diningCart, foodCount:c.count, count: c.count+diningCount, totalText: money(c.total+diningTotal) };
    const patch:Record<string,any>={};
    Object.keys(next).forEach(key=>{
      const value=(next as any)[key];
      if(JSON.stringify(this.data[key])!==JSON.stringify(value))patch[key]=value;
    });
    if(Object.keys(patch).length)this.setData(patch);
  },
  requireTable() {
    const state = tableState();
    if(state.binding && !state.pending && !this.data.scanning)return true;
    wx.showToast({title:'请先扫码确认桌号',icon:'none'});
    return false;
  },
  async scanTable() {
    if(this.data.scanning || tableState().pending || this.submitting)return;
    this.diningSession=null;
    this.setData({scanning:true,selected:null,cartOpen:false,diningOpen:false,dining:null});
    try {
      await scanTable();
      this.diningSession=null;
      this.setData({dining:null,diningCharged:false,people:1,cutlery:1,napkins:0});
      wx.showToast({title:'桌号已确认',icon:'success'});
    } catch(e:any) {
      if(!String(e.errMsg || '').includes('cancel'))wx.showToast({title:e.message || '扫码失败，请重试',icon:'none'});
    } finally {
      this.setData({scanning:false});
      this.refresh();
      if(this.menuVisible)this.pollTable();
    }
  },
  async loadDining(sessionId:string) {
    this.setData({diningLoading:true});
    try {const r=await call('getDining',{sessionId});if(this.diningSession!==sessionId)return;this.setData({dining:r.dining,diningCharged:r.charged,feesReady:r.fees.configured,cutleryPrice:r.fees.cutleryPrice||0,napkinPrice:r.fees.napkinPrice||0,cutleryPriceText:r.fees.cutleryPrice==null?'待设置':money(r.fees.cutleryPrice),napkinPriceText:r.fees.napkinPrice==null?'待设置':money(r.fees.napkinPrice),diningOpen:!r.dining});this.diningTotals();this.refresh();}
    catch(e:any){this.diningSession=null;wx.showToast({title:e.message,icon:'none'});}
    finally{this.setData({diningLoading:false});}
  },
  selectDining(e:any) {
    if(this.data.diningLoading)return;
    const {field,value}=e.currentTarget.dataset;
    const quantity=Number(value);
    if(!['people','cutlery','napkins'].includes(field)||!Number.isInteger(quantity)||quantity<(field==='people'?1:0)||quantity>8)return;
    this.setData({[field]:quantity});this.diningTotals();
  },
  diningTotals() {const c=Number(this.data.cutlery)*this.data.cutleryPrice,n=Number(this.data.napkins)*this.data.napkinPrice;this.setData({cutleryTotalText:money(c),napkinTotalText:money(n),diningTotalText:money(c+n)});},
  async confirmDining() {
    if(!this.requireTable())return;
    const sid=tableState().binding?.sessionId;if(!sid||this.data.diningLoading)return;this.setData({diningLoading:true});
    try {const r=await call('setDining',{sessionId:sid,people:Number(this.data.people),cutlery:Number(this.data.cutlery),napkins:Number(this.data.napkins),cutleryPrice:this.data.cutleryPrice,napkinPrice:this.data.napkinPrice});if(this.diningSession!==sid)return;this.setData({dining:r.dining,diningCharged:r.charged,diningOpen:false});this.refresh();}
    catch(e:any){wx.showToast({title:e.message,icon:'none'});await this.loadDining(sid);}
    finally{this.setData({diningLoading:false});}
  },
  async stepDining(e:any) {
    if(!this.requireTable())return;
    const sid=tableState().binding?.sessionId;
    if(!sid||!this.data.dining||this.data.diningCharged||this.data.diningLoading||this.submitting)return;
    const {id,delta}=e.currentTarget.dataset;
    if(!['cutlery','napkins'].includes(id)||![1,-1].includes(Number(delta)))return;
    const value=this.data.dining[id]+Number(delta);
    if(value<0||value>99)return;
    this.setData({diningLoading:true});
    try {
      const d=this.data.dining;
      const r=await call('setDining',{sessionId:sid,people:d.people,cutlery:d.cutlery,napkins:d.napkins,cutleryPrice:d.cutleryPrice,napkinPrice:d.napkinPrice,[id]:value});
      if(this.diningSession!==sid)return;
      this.setData({dining:r.dining,diningCharged:r.charged});this.refresh();
    } catch(e:any){wx.showToast({title:e.message,icon:'none'});await this.loadDining(sid);}
    finally{this.setData({diningLoading:false});}
  },
  async viewDining(){const sid=tableState().binding?.sessionId;if(sid)await this.loadDining(sid);},
  category(e: any) { this.setData({ activeCategory: e.currentTarget.dataset.id }); this.refresh(); },
  quickStep(e: any) {
    if(!this.requireTable())return;
    const { id, delta } = e.currentTarget.dataset;
    try {
      const s = read();
      const dish = s.dishes.find(d => d.id === id);
      if (Number(delta) === 1 && dish?.spicy && !s.cart.some(item => item.dishId === id && item.quantity > 0)) {
        this.choose(e);
        return;
      }
      changeDishQuantity(id, Number(delta)); this.refresh();
    }
    catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
  },
  choose(e: any) {
    if(!this.requireTable())return;
    const d = read().dishes.find(x => x.id === e.currentTarget.dataset.id);
    if (!d || d.soldOut || !d.onSale || !read().categories.some(c => c.id === d.categoryId && c.onSale !== false)) return;
    this.setData({ selected: { ...d, priceText: money(d.price) }, flavor: d.spicy ? '不辣' : '标准' });
  },
  flavor(e: any) { this.setData({ flavor: e.currentTarget.dataset.value }); },
  addSelected() {
    if(!this.requireTable() || !this.data.selected)return;
    try { changeCart(this.data.selected.id, this.data.flavor, 1); this.setData({ selected: null }); this.refresh(); wx.showToast({ title: '已加入购物车', icon: 'success' }); }
    catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
  },
  closeSelected() { this.setData({ selected: null }); },
  toggleCart() { this.setData({ cartOpen: !this.data.cartOpen }); this.refresh(); },
  closeCart() { this.setData({ cartOpen: false }); },
  noop() {},
  step(e: any) {
    if(!this.requireTable())return;
    const { id, flavor, delta } = e.currentTarget.dataset;
    try { changeCart(id, flavor, Number(delta)); this.refresh(); }
    catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
  },
  clear() { wx.showModal({ title: '清空购物车？', content: '已选菜品将全部移除。', success: (r: any) => { if (r.confirm) { clearCart(); this.refresh(); } } }); },
  note(e: any) { this.setData({ note: e.detail.value }); },
  async submit() {
    if(!this.requireTable())return;
    if(!this.data.dining){this.setData({diningOpen:true});return;}
    if(this.submitting||this.data.diningLoading)return;
    this.submitting=true;wx.showLoading({title:'正在提交',mask:true});
    try { const order=await submitOrder(this.data.note, tableState().binding || undefined);this.setData({cartOpen:false,note:'',diningCharged:true});this.refresh();wx.showToast({title:'下单成功'});wx.switchTab({url:'/pages/orders/index'}); }
    catch(e:any){wx.showToast({title:e.message,icon:'none'});}
    finally {this.submitting=false;wx.hideLoading();}
  },
  checkoutOrScan() { if(!tableState().binding || tableState().pending){void this.scanTable();return;}this.checkout(); },
  checkout() { if(!this.requireTable())return;this.setData({ cartOpen: true }); this.refresh(); },
  staffLogin() { staffLogin(); },
  toManage() { wx.navigateTo({ url: '/pages/manage/index' }); }
});

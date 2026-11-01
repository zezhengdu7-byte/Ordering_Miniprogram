import { call, syncCatalog } from '../../utils/cloud-repository';
import { tableState } from '../../utils/table-service';
import { syncMerchantEntry, staffLogin } from '../../utils/auth';
import { read, cartView, changeCart, changeDishQuantity, clearCart, submitOrder, money } from '../../utils/cloud-repository';
Page({
  data: { shopName: '炭火里 · 烧烤', welcome: '', open: true, tableName: 'A06', merchantVisible: false, cloudReady: false, categories: [] as any[], dishes: [] as any[], activeCategory: 'meat', cart: [] as any[], count: 0, totalText: '0.00', cartOpen: false, selected: null as any, flavor: '微辣', flavors: ['不辣', '微辣', '中辣', '特辣'], note: '', diningOpen:false, diningLoading:false, dining:null as any, diningCharged:false, feesReady:false, people:1,cutlery:1,napkins:0,cutleryPrice:0,napkinPrice:0,cutleryPriceText:'',napkinPriceText:'',cutleryTotalText:'0.00',napkinTotalText:'0.00',diningTotalText:'0.00' },
  async onShow() { try { await syncCatalog();this.setData({cloudReady:true}); } catch (e: any) { wx.showToast({title:e.message,icon:'none'}); } this.refresh(); wx.setNavigationBarTitle({ title: this.data.shopName }); syncMerchantEntry(this); this.pollTable(); },
  pollTable() { this.refresh(); const sid=tableState().binding?.sessionId;if(sid && this.diningSession!==sid){this.diningSession=sid;void this.loadDining(sid);}if(!sid){this.diningSession=null;this.setData({dining:null,diningOpen:false});} this.tableTimer = setTimeout(() => this.pollTable(), 1000); },
  onHide() { clearTimeout(this.tableTimer); },
  onUnload() { clearTimeout(this.tableTimer); },
  refresh() {
    const s = read(); const c = cartView();
    const categories = s.categories.filter(x => x.onSale !== false).map(x => ({ ...x, count: s.dishes.filter(d => d.categoryId === x.id && d.onSale).length }));
    let active = this.data.activeCategory;
    if (!categories.some(x => x.id === active)) active = categories[0]?.id || '';
    const dishes = s.dishes.filter(d => d.onSale && categories.some(c => c.id === d.categoryId) && d.categoryId === active).map(d => ({ ...d, priceText: money(d.price), quantity: c.items.filter(i => i.dishId === d.id).reduce((n, i) => n + i.quantity, 0) }));
    this.setData({ shopName: s.shop.name, welcome: s.shop.welcome, open: s.shop.open, tableName: tableState().binding?.tableName || (tableState().pending ? '识别中' : '请扫码'), tableNotice: tableState().error || (tableState().binding ? '桌号已确认，提交后订单将同步至商家。' : '请扫描桌上小程序码识别桌号。当前菜单可浏览。'), categories, dishes, activeCategory: active, cart: c.items, count: c.count, totalText: money(c.total) });
  },
  async loadDining(sessionId:string) {
    this.setData({diningLoading:true});
    try {const r=await call('getDining',{sessionId});if(this.diningSession!==sessionId)return;this.setData({dining:r.dining,diningCharged:r.charged,feesReady:r.fees.configured,cutleryPrice:r.fees.cutleryPrice||0,napkinPrice:r.fees.napkinPrice||0,cutleryPriceText:r.fees.cutleryPrice==null?'待设置':money(r.fees.cutleryPrice),napkinPriceText:r.fees.napkinPrice==null?'待设置':money(r.fees.napkinPrice),diningOpen:!r.dining});this.diningTotals();}
    catch(e:any){this.diningSession=null;wx.showToast({title:e.message,icon:'none'});}
    finally{this.setData({diningLoading:false});}
  },
  diningInput(e:any) {this.setData({[e.currentTarget.dataset.field]:e.detail.value});this.diningTotals();},
  diningTotals() {const c=Number(this.data.cutlery)*this.data.cutleryPrice,n=Number(this.data.napkins)*this.data.napkinPrice;this.setData({cutleryTotalText:money(c),napkinTotalText:money(n),diningTotalText:money(c+n)});},
  async confirmDining() {
    const sid=tableState().binding?.sessionId;if(!sid||this.data.diningLoading)return;this.setData({diningLoading:true});
    try {const r=await call('setDining',{sessionId:sid,people:Number(this.data.people),cutlery:Number(this.data.cutlery),napkins:Number(this.data.napkins),cutleryPrice:this.data.cutleryPrice,napkinPrice:this.data.napkinPrice});if(this.diningSession!==sid)return;this.setData({dining:r.dining,diningCharged:r.charged,diningOpen:false});}
    catch(e:any){wx.showToast({title:e.message,icon:'none'});await this.loadDining(sid);}
    finally{this.setData({diningLoading:false});}
  },
  async viewDining(){const sid=tableState().binding?.sessionId;if(sid)await this.loadDining(sid);},
  category(e: any) { this.setData({ activeCategory: e.currentTarget.dataset.id }); this.refresh(); },
  quickStep(e: any) {
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
    const d = read().dishes.find(x => x.id === e.currentTarget.dataset.id);
    if (!d || d.soldOut || !d.onSale || !read().categories.some(c => c.id === d.categoryId && c.onSale !== false)) return;
    this.setData({ selected: { ...d, priceText: money(d.price) }, flavor: d.spicy ? '微辣' : '标准' });
  },
  flavor(e: any) { this.setData({ flavor: e.currentTarget.dataset.value }); },
  addSelected() {
    try { changeCart(this.data.selected.id, this.data.flavor, 1); this.setData({ selected: null }); this.refresh(); wx.showToast({ title: '已加入购物车', icon: 'success' }); }
    catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
  },
  closeSelected() { this.setData({ selected: null }); },
  toggleCart() { this.setData({ cartOpen: !this.data.cartOpen }); this.refresh(); },
  closeCart() { this.setData({ cartOpen: false }); },
  noop() {},
  step(e: any) {
    const { id, flavor, delta } = e.currentTarget.dataset;
    try { changeCart(id, flavor, Number(delta)); this.refresh(); }
    catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
  },
  clear() { wx.showModal({ title: '清空购物车？', content: '已选菜品将全部移除。', success: (r: any) => { if (r.confirm) { clearCart(); this.refresh(); } } }); },
  note(e: any) { this.setData({ note: e.detail.value }); },
  async submit() {
    if(!this.data.dining){this.setData({diningOpen:true});return;}
    if(this.submitting)return;
    this.submitting=true;wx.showLoading({title:'正在提交',mask:true});
    try { const order=await submitOrder(this.data.note);this.setData({cartOpen:false,note:''});this.refresh();wx.showToast({title:'下单成功'});wx.switchTab({url:'/pages/orders/index'}); }
    catch(e:any){wx.showToast({title:e.message,icon:'none'});}
    finally {this.submitting=false;wx.hideLoading();}
  },
  checkout() { this.setData({ cartOpen: true }); this.refresh(); },
  staffLogin() { staffLogin(); },
  toManage() { wx.navigateTo({ url: '/pages/manage/index' }); }
});

import { syncMerchant } from '../../utils/cloud-repository';
import { merchantPage } from '../../utils/auth';
import { read, saveShop } from '../../utils/cloud-repository';
Page(merchantPage({
  data: { name: '', welcome: '', open: true, cutleryYuan: '', napkinYuan: '' },
  async onLoad() { await syncMerchant(); const shop=read().shop; this.setData({...shop,cutleryYuan:shop.cutleryPrice==null?'':(shop.cutleryPrice/100).toFixed(2),napkinYuan:shop.napkinPrice==null?'':(shop.napkinPrice/100).toFixed(2)}); },
  input(e: any) { this.setData({ [e.currentTarget.dataset.field]: e.detail.value }); },
  toggle(e: any) { this.setData({ open: e.detail.value }); },
  async save() {
    try {
      const price=(value:string)=>{if(!/^\d{1,4}(\.\d{1,2})?$/.test(value.trim())||Number(value)>1000)throw new Error('请填写0至1000元的单价，最多两位小数');return Math.round(Number(value)*100);};
      await saveShop({cutleryPrice:price(this.data.cutleryYuan),napkinPrice:price(this.data.napkinYuan), name: this.data.name, welcome: this.data.welcome, open: this.data.open }); wx.showToast({ title: '店铺设置已保存' }); }
    catch (e: any) { wx.showToast({ title: e.message, icon: 'none' }); }
  }
}));

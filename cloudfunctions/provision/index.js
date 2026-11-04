'use strict';
const cloud=require('wx-server-sdk');
const CloudBaseModule=require('@cloudbase/manager-node');
const CloudBase=CloudBaseModule.default||CloudBaseModule;
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {requireMerchant}=require('./access');
const manifest=require('./collections.json'),menu=require('./menu.json');
const ENV='cloud1-d0g5igvuk85096f8a';
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
async function get(db,name,id){try {const r=await db.collection(name).doc(id).get();return Array.isArray(r.data)?r.data[0]:r.data;}catch(e){if(/DOCUMENT_NOT_EXIST|DOCUMENT_NOT_FOUND|document.*(not exist|does not exist|not found)/i.test(e.message||e.errMsg||''))return null;throw e;}}
async function insertMissing(db,name,id,data){if(await get(db,name,id))return false;await db.collection(name).doc(id).set({data});return true;}
exports.main=async event=>{
  try {
    const ctx=cloud.getWXContext();if(ctx.APPID!==manifest.appId)throw new Error('UNAUTHENTICATED');
    const db=cloud.database(),identity=await requireMerchant(db,ctx,manifest.storeId);
    if(identity.role!=='owner')throw new Error('OWNER_REQUIRED');
    const e=event||{},now=Date.now();
    if(e.action==='schema'){
      const name=e.collection;if(!Object.hasOwn(manifest.collections,name))throw new Error('INVALID_COLLECTION');
      const manager=new CloudBase({envId:ENV});
      const exists=await manager.database.checkCollectionExists(name);
      if(!exists.Exists)await manager.database.createCollection(name);
      await manager.commonService().call({Action:'ModifySafeRule',Param:{CollectionName:name,EnvId:ENV,AclTag:'CUSTOM',Rule:JSON.stringify({read:false,write:false})}});
      const detail=await manager.database.describeCollection(name);
      const wanted=manifest.collections[name].indexes;
      const missing=wanted.filter(i=>!(detail.Indexes||[]).some(x=>x.Name===i.name));
      if(missing.length)await manager.database.updateCollection(name,{CreateIndexes:missing.map(i=>({IndexName:i.name,MgoKeySchema:{MgoIndexKeys:i.fields.map(f=>({Name:f.field,Direction:f.order==='desc'?'-1':'1'})),MgoIsUnique:i.unique}}))});
      const rule=await manager.commonService().call({Action:'DescribeSafeRule',Param:{CollectionName:name,EnvId:ENV}});
      const after=await manager.database.describeCollection(name);
      return {ok:true,collection:name,created:!exists.Exists,rule:rule.Rule,indexes:after.Indexes?.map(x=>({name:x.Name,unique:x.Unique,keys:x.Keys}))};
    }
    if(e.action==='seedBase'){
      const stores=(await db.collection('stores').where({storeId:manifest.storeId,appId:manifest.appId,active:true}).limit(1).get()).data;
      if(stores.length!==1)throw new Error('STORE_UNAVAILABLE');
      const store=stores[0],patch={};
      for(const [key,value] of Object.entries({name:'炭火里 · 烧烤',welcome:'三两好友，一桌好味',open:true,cutleryPrice:100,napkinPrice:100,createdAt:now,updatedAt:now}))if(store[key]===undefined)patch[key]=value;
      if(Object.keys(patch).length)await db.collection('stores').doc(store._id).update({data:patch});
      for(let i=0;i<menu.categories.length;i++){
        const c=menu.categories[i];await insertMissing(db,'categories',c.id,{name:c.name,sort:i,onSale:true,active:true,createdAt:now,updatedAt:now});
      }
      for(const name of ['A01','A02','A06']){const existing=await db.collection('tables').where({name,active:true}).limit(1).get();if(!existing.data.length)await insertMissing(db,'tables',crypto.createHash('sha256').update(name).digest('hex'),{name,active:true,qrTokenHash:'',qrVersion:0,currentSessionId:null,createdAt:now,updatedAt:now});}
      await insertMissing(db,'printers','kitchen',{name:'后厨小票机',serial:'',copies:1,autoPrint:false,provider:'demo',active:true,createdAt:now,updatedAt:now});
      await insertMissing(db,'catalog_meta','menu',{version:1,createdAt:now,updatedAt:now});
      return {ok:true,categories:menu.categories.length,tables:3};
    }
    if(e.action==='seedImages'){
      const start=e.start;if(!Number.isInteger(start)||start<0||start>=menu.dishes.length)throw new Error('INVALID_OFFSET');
      const limit=Number.isInteger(e.limit)&&e.limit>=1&&e.limit<=6?e.limit:1;
      const results=[];
      for(let i=start;i<Math.min(start+limit,menu.dishes.length);i++){
        const d=menu.dishes[i];
        if(await get(db,'dishes',d.id)){results.push({id:d.id,skipped:true});continue;}
        const uploaded=await cloud.uploadFile({cloudPath:`menu/v2/${d.id}.jpg`,fileContent:fs.readFileSync(path.join(__dirname,'assets',d.id+'.jpg'))});
        await insertMissing(db,'dishes',d.id,{categoryId:d.categoryId,name:d.name,description:d.description,minQuantity:d.minQuantity,price:d.price,unit:d.unit,imageFileId:uploaded.fileID,onSale:d.onSale,soldOut:d.soldOut,spicy:d.spicy,tag:d.tag,sort:i,active:true,version:1,createdAt:now,updatedAt:now});
        results.push({id:d.id,fileID:uploaded.fileID});
      }
      return {ok:true,results,next:Math.min(start+limit,menu.dishes.length),total:menu.dishes.length};
    }
    if(e.action==='verify'){
      const counts={};for(const name of Object.keys(manifest.collections))counts[name]=(await db.collection(name).count()).total;
      const dishes=(await db.collection('dishes').limit(100).get()).data;
      const ids=dishes.map(d=>d.imageFileId);
      const images=[];
      for(let i=0;i<ids.length;i+=50){
        const urls=await cloud.getTempFileURL({fileList:ids.slice(i,i+50)});
        images.push(...urls.fileList.map(f=>({fileID:f.fileID,status:f.status})));
      }
      return {ok:true,counts,images,firstMeat:dishes.filter(d=>d.categoryId==='meat').sort((a,b)=>a.sort-b.sort).slice(0,4).map(d=>d.name)};
    }
    throw new Error('UNKNOWN_ACTION');
  }catch(e){console.error('provision',e.code||e.errCode||'',e.message);return {ok:false,code:e.code||e.errCode||e.message,message:String(e.message).slice(0,500)};}
};

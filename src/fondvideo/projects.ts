// SCELYO Studio projects stay on this device. IndexedDB stores the source video and editable timeline.
const DB = 'scelyo-studio-projects';
const STORE = 'projects';
function database() {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB,1);
    request.onupgradeneeded=()=>request.result.createObjectStore(STORE,{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
  });
}
async function operation(mode, callback) {
  const db=await database();
  try {
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,mode);
      const request=callback(tx.objectStore(STORE));
      request.onsuccess=()=>resolve(request.result);
      request.onerror=()=>reject(request.error);
      tx.onabort=()=>reject(tx.error);
    });
  } finally {db.close();}
}
export const saveStudioProject = project => operation('readwrite',store=>store.put(project));
export const getStudioProject = id => operation('readonly',store=>store.get(id));
export const listStudioProjects = async () => (await operation('readonly',store=>store.getAll()))
  .map(({id,name,updatedAt,video})=>({id,name,updatedAt,size:video?.size||0}))
  .sort((a,b)=>b.updatedAt-a.updatedAt);
export const deleteStudioProject = id => operation('readwrite',store=>store.delete(id));

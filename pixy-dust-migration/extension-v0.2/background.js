
chrome.runtime.onMessage.addListener((msg,sender,sendResponse)=>{
 if(msg?.type==="EXPORT_RESULTS"){
  const blob=new Blob([JSON.stringify(msg.payload,null,2)],{type:"application/json"});
  const reader=new FileReader();
  reader.onload=()=>chrome.downloads.download({url:reader.result,filename:"ebay-photo-map.json",saveAs:true});
  reader.readAsDataURL(blob);
  sendResponse({ok:true});return true;
 }
});

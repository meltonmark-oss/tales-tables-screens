/* Scanner recovery v26. Maintains the existing validated ISBN / UPC logic.
 * On iPhone, prioritize the previously working ZXing decoder.
 * Provides alternate CDN, photo scanning, and concrete diagnostic feedback.
 */
(function(){
"use strict";
const byId=id=>document.getElementById(id);
const status=(message)=>{byId("scanStatus").textContent=message};
let booting=false,watchdog=null,loadPending=null,activeReader=null,runId=0;
function cancelWatchdog(){if(watchdog){clearTimeout(watchdog);watchdog=null}}
function stopAll(){runId++;cancelWatchdog();stopCamera();try{activeReader?.reset?.()}catch(e){}activeReader=null;booting=false}
function loadScript(url){
 return new Promise((resolve,reject)=>{
  const script=document.createElement("script");script.src=url;script.async=true;
  const timer=setTimeout(()=>{script.onload=script.onerror=null;script.remove();reject(new Error("Timed out loading decoder"))},10500);
  script.onload=()=>{clearTimeout(timer);if(window.ZXingBrowser?.BrowserMultiFormatReader)resolve();else reject(new Error("Decoder not initialized"))};
  script.onerror=()=>{clearTimeout(timer);script.remove();reject(new Error("Decoder URL unavailable"))};
  document.head.appendChild(script);
 });
}
async function ensureReader(){
 if(window.ZXingBrowser?.BrowserMultiFormatReader)return window.ZXingBrowser;
 if(loadPending)return loadPending;
 loadPending=(async()=>{
  const sources=[
   "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js",
   "https://unpkg.com/@zxing/browser@0.1.5/umd/zxing-browser.min.js"
  ];
  const errors=[];
  for(let i=0;i<sources.length;i++){
   status("Loading camera barcode reader"+(i?" (backup source)":"")+"…");
   try{await loadScript(sources[i]);return window.ZXingBrowser}catch(e){errors.push(e.message)}
  }
  throw new Error("Barcode reader could not load from either source. Check your Internet connection and try Scan from photo or enter the number manually.");
 })().finally(()=>{loadPending=null});
 return loadPending;
}
function photoUnsupported(){
 status("This device could not decode the photo. Type the printed ISBN or UPC instead, or take a sharper photo with the bars filling the frame.");
}
async function scanPhoto(file){
 if(!file)return;
 stopAll();
 const id=runId;
 booting=true;
 status("Reading the barcode from your photo…");
 try{
  let raw="",format="";
  if("BarcodeDetector" in window){
   try{
    const supported=await BarcodeDetector.getSupportedFormats();
    const wants=["ean_13","upc_a","upc_e"].filter(x=>supported.includes(x));
    if(wants.length&&"createImageBitmap" in window){
     const bitmap=await createImageBitmap(file);
     try{const detector=new BarcodeDetector({formats:wants});const found=await detector.detect(bitmap);
       const match=found.find(x=>{const v=String(x.rawValue).replace(/\D/g,"");return tab==="books"||tab==="kids"?/^97[89]\d{10}$/.test(v):/^\d{12,13}$/.test(v)});
       if(match){raw=match.rawValue;format=match.format}
     }finally{bitmap.close?.()}
    }
   }catch(e){}
  }
  if(!raw){
   const api=await ensureReader();const reader=new api.BrowserMultiFormatReader(),url=URL.createObjectURL(file);
   try{const result=await reader.decodeFromImageUrl(url);raw=result.getText();format=String(result.getBarcodeFormat?.()||"")}
   finally{URL.revokeObjectURL(url);try{reader.reset?.()}catch(e){}}
  }
  if(id!==runId)return;
  scanActive=true;capturedBarcode(raw,format);
  if(scanActive){stopAll();status("The photo contained a barcode, but it did not pass the "+(tab==="books"||tab==="kids"?"ISBN":"UPC")+" check. Try another angle or enter the number manually.")}
 }catch(e){if(id===runId){stopAll();photoUnsupported()}}
 finally{booting=false}
}
async function startCamera(){
 if(booting)return;
 stopAll();booting=true;const id=runId,video=byId("scanVideo");
 try{
  status("Preparing barcode reader for your iPhone…");
  video.hidden=false;
  if(!navigator.mediaDevices?.getUserMedia){throw new Error("Camera access is not supported in this browser. Open the site directly in Safari.")}
  /* Start with ZXing on iOS to bypass inconsistent native BarcodeDetector behavior. */
  const iphone=/iPhone|iPad|iPod/i.test(navigator.userAgent||"");
  if(!iphone&&"BarcodeDetector" in window){
   try{
    const formats=await BarcodeDetector.getSupportedFormats();
    const wanted=(tab==="books"||tab==="kids"?["ean_13"]:["upc_a","ean_13"]).filter(x=>formats.includes(x));
    if(wanted.length){
     const detector=new BarcodeDetector({formats:wanted});
     cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}});
     if(id!==runId){cameraStream?.getTracks().forEach(x=>x.stop());return}
     video.srcObject=cameraStream;await video.play();scanActive=true;
     status("Camera running · Reading "+(tab==="books"||tab==="kids"?"ISBN":"UPC")+" barcodes…");
     let busy=false;
     scanTimer=setInterval(async()=>{if(!scanActive||busy||video.readyState<2)return;busy=true;
       try{const found=await detector.detect(video);if(found.length)for(const x of found){capturedBarcode(x.rawValue,x.format);if(!scanActive)break}}catch(e){}finally{busy=false}
     },220);
     watchdog=setTimeout(()=>{if(scanActive)status("Camera is on, but no barcode was recognized yet. Hold the whole barcode in focus, or try Scan from photo.")},15000);
     return;
    }
   }catch(e){stopCamera();video.hidden=false}
  }
  const lib=await ensureReader();if(id!==runId)return;
  status("Opening rear camera…");
  const reader=new lib.BrowserMultiFormatReader();
  activeReader=reader;scanActive=true;
  let attempts=0;
  const controls=await reader.decodeFromConstraints(
   {audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}},
   video,
   (result,error)=>{
    if(id!==runId||!scanActive)return;
    if(result){capturedBarcode(result.getText(),String(result.getBarcodeFormat?.()||""));cancelWatchdog();return}
    attempts++;
    if(attempts===55)status("Camera running · Searching for "+(tab==="books"||tab==="kids"?"a 13-digit ISBN":"a valid UPC")+". Move slightly closer and avoid reflections.");
   }
  );
  if(id!==runId||!scanActive){controls?.stop?.();return}
  cameraControls=controls;
  status("Camera running · Reading "+(tab==="books"||tab==="kids"?"ISBN":"UPC")+" barcodes…");
  watchdog=setTimeout(()=>{if(scanActive)status("Camera is on, but no barcode was recognized after 15 seconds. Try Scan from photo, or enter the number manually.")},15000);
 }catch(e){
  if(id===runId){stopAll();status("Camera scanner error: "+(e.message||String(e))+". You can use Scan from photo or type the code.");}
 }finally{booting=false}
}
function init(){
 if(!byId("cameraStart")||!byId("scanPhoto")||!byId("barcodePhoto"))return;
 byId("cameraStart").onclick=startCamera;
 byId("scanPhoto").onclick=()=>{stopAll();byId("barcodePhoto").click()};
 byId("barcodePhoto").addEventListener("change",e=>{const file=e.target.files?.[0];e.target.value="";scanPhoto(file)});
 const oldClose=byId("scanClose").onclick;
 byId("scanClose").onclick=()=>{stopAll();oldClose?.()};
 const oldOpen=byId("scan").onclick;
 byId("scan").onclick=()=>{stopAll();oldOpen?.();byId("scanPhoto").disabled=false;};
 document.addEventListener("visibilitychange",()=>{if(document.hidden&&scanActive)stopAll()});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
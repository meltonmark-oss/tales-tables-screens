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

function photoUnsupported(reason){
 const detail=reason?.message?String(reason.message):String(reason||"No barcode detected");
 const shortened=detail.length>130?detail.slice(0,130)+"…":detail;
 status("Photo scan: "+shortened+". Try a sharper, closer picture with all barcode bars visible, or type the printed number.");
}
/* Canvas scanning is more reliable than scanning an entire iPhone photo: try
   several barcode-sized regions at different orientations and contrast. */
async function imageFromFile(file){
 const url=URL.createObjectURL(file);
 try{
  const img=await new Promise((resolve,reject)=>{
   const im=new Image();
   const wait=setTimeout(()=>reject(new Error("Photo did not finish loading")),12000);
   im.onload=()=>{clearTimeout(wait);resolve(im)};
   im.onerror=()=>{clearTimeout(wait);reject(new Error("iPhone photo format not supported here; try a JPEG screenshot"))};
   im.src=url;
  });
  return img;
 }finally{ /* URL is kept through the async image loading; safe to revoke after load */
  URL.revokeObjectURL(url);
 }
}
function makePhotoCanvas(image,region,opts={}){
 const nw=image.naturalWidth||image.width,nh=image.naturalHeight||image.height;
 const sx=Math.max(0,Math.floor(region[0]*nw)),sy=Math.max(0,Math.floor(region[1]*nh));
 const sw=Math.max(1,Math.min(nw-sx,Math.floor(region[2]*nw)));
 const sh=Math.max(1,Math.min(nh-sy,Math.floor(region[3]*nh)));
 const rotate=!!opts.rotate;
 const scale=Math.min(2,2200/Math.max(sw,sh));
 const w=Math.max(1,Math.floor(sw*scale)),h=Math.max(1,Math.floor(sh*scale));
 const c=document.createElement("canvas");
 c.width=rotate?h:w;c.height=rotate?w:h;
 const ctx=c.getContext("2d",{willReadFrequently:true})||c.getContext("2d");
 if(!ctx)throw new Error("Could not prepare photo for reading");
 ctx.fillStyle="#fff";ctx.fillRect(0,0,c.width,c.height);
 if(opts.highContrast&&"filter" in ctx)ctx.filter="grayscale(1) contrast(1.65)";
 if(rotate){ctx.translate(c.width,0);ctx.rotate(Math.PI/2)}
 ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality="high";
 ctx.drawImage(image,sx,sy,sw,sh,0,0,w,h);
 return c;
}
function validReading(raw){
 const code=String(raw||"").replace(/\D/g,"");
 if(tab==="books"||tab==="kids")return code.length===13&&/^97[89]/.test(code)&&validEAN13(code);
 return validUPC(code)||(code.length===13&&validEAN13(code));
}
async function photoCandidates(file,token){
 const image=await imageFromFile(file);
 if(token!==runId)return null;
 const lib=await ensureReader();
 const reader=new lib.BrowserMultiFormatReader();
 try{
  const regions=[
   [0,0,1,1],
   [.13,.10,.74,.8],
   [0,0,1,.55],[0,.45,1,.55],
   [0,0,.6,1],[.4,0,.6,1],
   [0,0,.65,.58],[.35,0,.65,.58],
   [0,.42,.65,.58],[.35,.42,.65,.58],
   [.18,.18,.64,.64],
   [0,.22,1,.55],[.22,0,.56,1]
  ];
  let lastError=null,attempt=0;
  for(const region of regions){
   for(const opts of [{}, {highContrast:true}]){
    if(token!==runId)return null;
    attempt++;
    if(attempt===1||attempt%5===0){
      status("Reading photo… trying region "+attempt+" of "+(regions.length*2));
      await new Promise(resolve=>setTimeout(resolve,0));
    }
    const c=makePhotoCanvas(image,region,opts);
    try{
     const result=reader.decodeFromCanvas(c),raw=result.getText();
     if(validReading(raw))return {raw,format:String(result.getBarcodeFormat?.()||"")};
     lastError=new Error("Detected a code ("+raw+") but not a valid "+(tab==="books"||tab==="kids"?"ISBN":"UPC"));
    }catch(e){lastError=e}
    finally{c.width=0;c.height=0}
   }
  }
  /* Camera photos occasionally have rotated barcodes. Try turning all or center once. */
  for(const region of [[0,0,1,1],[.1,.1,.8,.8]]){
   if(token!==runId)return null;
   const c=makePhotoCanvas(image,region,{rotate:true});
   try{const result=reader.decodeFromCanvas(c);if(validReading(result.getText()))return {raw:result.getText(),format:String(result.getBarcodeFormat?.()||"")}}
   catch(e){lastError=e}
   finally{c.width=0;c.height=0}
  }
  throw new Error("No readable "+(tab==="books"||tab==="kids"?"ISBN":"UPC")+" found in this photo");
 }finally{try{reader.reset?.()}catch(e){}}
}
async function scanPhoto(file){
 if(!file)return;
 stopAll();const token=runId;
 booting=true;status("Preparing your photo for barcode recognition…");
 try{
  let match=null;
  if("BarcodeDetector" in window){
   try{
    const supported=await BarcodeDetector.getSupportedFormats();
    const formats=["ean_13","upc_a","upc_e"].filter(x=>supported.includes(x));
    if(formats.length&&typeof createImageBitmap==="function"){
     const bitmap=await createImageBitmap(file);
     try{
      const detected=await new BarcodeDetector({formats}).detect(bitmap);
      const first=detected.find(x=>validReading(x.rawValue));
      if(first)match={raw:first.rawValue,format:first.format};
     }finally{bitmap.close?.()}
    }
   }catch(e){/* Safari often disables BarcodeDetector. Use ZXing instead. */}
  }
  if(!match)match=await photoCandidates(file,token);
  if(token!==runId||!match)return;
  scanActive=true;capturedBarcode(match.raw,match.format);
  if(scanActive){stopAll();throw new Error("The detected barcode failed its check digit")}
 }catch(e){if(token===runId){stopAll();photoUnsupported(e)}}
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
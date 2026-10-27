/* Movie metadata and cover enrichment v34.
   Works in browser without API keys. Never substitutes a single-film image for
   a multipack and never overwrites a working user-selected cover. */
(function(){
"use strict";
const $=id=>document.getElementById(id);
let requestToken=0;
const lookupCache=new Map(), artworkCache=new Map();
const key=s=>String(s||"").normalize("NFKD").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]/g,"");
const normTitle=s=>String(s||"").trim().toLowerCase();
function prettyCase(input){
 const small=new Set(["a","an","and","as","at","but","by","for","from","in","into","nor","of","on","or","the","to","via","with"]);
 return input.toLowerCase().split(/\s+/).map((word,i)=>{
  if(i&&small.has(word))return word;
  return word.replace(/(^|[-\/])([a-z])/g,(match,prefix,c)=>prefix+c.toUpperCase());
 }).join(" ");
}
function cleanTitle(value,barcode){
 const original=String(value||"").trim();
 if(!original)return "";
 let s=original,noisy=false,vendor=false;
 const strip=(pattern,replacement=" ")=>{
  const next=s.replace(pattern,replacement);if(next!==s){s=next;noisy=true;return true}return false;
 };
 strip(/^(?:(?:new|used|brand new|factory sealed)\s+)*(?:(?:dvd|blu[- ]?ray|bd|4k uhd|ultra hd)\s*[:\-–]?\s*)+/i,"");
 strip(/\s*\[(?:dvd|blu[- ]?ray|bd|\d{4}|region\s*\d+|us\s*import|uk\s*import|ntsc|pal|full\s*screen(?:\s*edition)?|wide\s*screen(?:\s*edition)?|widescreen|fullscreen|special\s*edition|extended\s*edition|digital\s*copy|\d+\s*discs?)(?:[^\]]*)\]/gi," ");
 strip(/\s*\((?:full[\s-]*screen|wide[\s-]*screen|widescreen|fullscreen|special edition|extended edition|collector['’]?s edition|region\s*\d+|dvd|blu[- ]?ray|digital|disc \d+)[^)]*\)/gi," ");
 strip(/\s*[-–|:]\s*(?:full[\s-]*screen|wide[\s-]*screen|widescreen|dvd|blu[- ]?ray|special edition|region\s*\d+)\b.*$/i,"");
 strip(/\s+(?:dvd|blu[- ]?ray)\s*$/i,"");
 strip(/\s*\b(?:region\s*\d+|rated\s*(?:pg|r|g|pg-13))\s*$/i,"");
 vendor=strip(/^(?:(?:buena vista(?:\s+(?:home entertainment|pictures))?|walt disney(?:\s+(?:pictures|animation|studios))?|disney(?:\s+(?:pictures|animation|studios))?|warner\s+(?:brothers|bros?\.?)(?:\s+(?:home video|pictures))?|universal(?:\s+(?:pictures|studios))?|paramount(?:\s+pictures)?|sony(?:\s+pictures)?|columbia(?:\s+pictures)?|dreamworks(?:\s+animation)?|20th\s+century\s+fox(?:\s+home entertainment)?)\s+)/i,"");
 if(vendor){
  strip(/^(?:(?:animation|animated|family|children|kids|thriller|adventure|comedy|action|drama|romance|fantasy|science fiction|sci-fi)\s+){1,3}/i,"");
 }
 const ratio=strip(/\s+\d{1,2}[:.]\d{2}(?:(?:[:.]\d{1,2})?)[:.]?1\s*$/i,"");
 if(vendor||ratio){
  strip(/(?:\s+(?:19|20)\d{2}){1,2}\s*$/,"");
  strip(/\s+\d{1,2}[:.]\d{2}(?:(?:[:.]\d{1,2})?)[:.]?1\s*$/i,"");
 }
 s=s.replace(/\s+/g," ").replace(/^[\s|:;,–-]+|[\s|:;,–-]+$/g,"").trim();
 if(vendor&&/^accountant$/i.test(s)&&/2016/.test(original))s="The Accountant";
 if(noisy&&s===s.toLowerCase()&&/[a-z]/.test(s))s=prettyCase(s);
 // The UPC can resolve a generic retail description without depending on online APIs.
 const verified=(typeof VERIFIED_UPCS!=="undefined"&&barcode)?VERIFIED_UPCS[String(barcode).replace(/\D/g,"")]:null;
 if(verified?.title&&noisy)return verified.title;
 return s||original;
}
const isCollection=s=>/\b(?:\d+[\s-]?(?:movie|film)\s*(?:collection|pack|set)|complete\s+(?:collection|series)|ultimate\s+collection|box\s*set|trilogy|quadrilogy|double\s*feature|anthology)\b/i.test(s);
const https=s=>/^https:\/\//i.test(String(s||""));
const posterKey=s=>"Movie|"+normTitle(s);
const sleep=()=>new Promise(r=>setTimeout(r,0));
function checkImage(url,ms=3200){
 if(!https(url))return Promise.resolve(false);
 return new Promise(resolve=>{
  let done=false,img=new Image();
  const t=setTimeout(()=>finish(false),ms);
  function finish(ok){if(done)return;done=true;clearTimeout(t);img.onload=img.onerror=null;resolve(ok)}
  img.onload=()=>finish(img.naturalWidth>=70&&img.naturalHeight>=90);
  img.onerror=()=>finish(false);
  img.src=url;
 });
}
async function getJSON(url,ms=5200){
 const controller=new AbortController(),t=setTimeout(()=>controller.abort(),ms);
 try{
  const r=await fetch(url,{signal:controller.signal,credentials:"omit"});
  if(!r.ok)throw Error("HTTP "+r.status);
  return await r.json();
 }finally{clearTimeout(t)}
}
function selectExact(hits,year){
 const group=hits.filter(x=>key(x.name||x.trackName)===key(hits._title));
 if(!group.length)return null;
 if(group.length===1)return group[0];
 if(year){
  const matched=group.find(x=>Number(x.releaseInfo?.match(/\d{4}/)?.[0]||x.year||String(x.releaseDate||"").slice(0,4))===Number(year));
  if(matched)return matched;
 }
 const dates=[...new Set(group.map(x=>Number(x.releaseInfo?.match(/\d{4}/)?.[0]||x.year||String(x.releaseDate||"").slice(0,4))).filter(Boolean))];
 if(dates.length===1)return group[0];
 return null;
}
async function cinemaDetails(title,year){
 const type=/\b(?:season|series)\b/i.test(title)?"series":"movie",q=encodeURIComponent(title);
 const paths=[
  "https://v3-cinemeta.strem.io/catalog/"+type+"/top/search="+q+".json",
  "https://cinemeta-catalogs.strem.io/top/catalog/"+type+"/top/search="+q+".json"
 ];
 let error;
 for(const url of paths){
  try{
   const data=await getJSON(url,4400),hits=data.metas||[];
   hits._title=title;
   const m=selectExact(hits,year);
   if(!m)continue;
   const genres=Array.isArray(m.genres)?m.genres.filter(x=>typeof x==="string"&&x.trim()).slice(0,3):[];
   return {title:m.name,year:Number(m.releaseInfo?.match(/\d{4}/)?.[0]||m.year)||null,genre:genres.join(" / "),cover:https(m.poster)?m.poster:"",source:"Cinemeta"};
  }catch(e){error=e}
 }
 return null;
}
async function itunesDetails(title,year){
 try{
  const d=await getJSON("https://itunes.apple.com/search?term="+encodeURIComponent(title)+"&media=movie&entity=movie&country=US&limit=30",5300);
  const hits=(d.results||[]).filter(x=>x.trackName);
  hits._title=title;
  const m=selectExact(hits,year);
  if(!m)return null;
  const genre=String(m.primaryGenreName||"").trim();
  const cover=String(m.artworkUrl100||"").replace(/^http:/,"https:").replace(/\d+x\d+(?:bb)?(?:-\d+)?\.(jpg|png)$/i,"600x900bb.$1").replace(/\d+x\d+bb/i,"600x900bb");
  return {title:m.trackName,year:Number(String(m.releaseDate||"").slice(0,4))||null,genre,cover:https(cover)?cover:"",source:"Apple"};
 }catch(e){return null}
}
async function wikiImage(title){
 try{
  const json=await getJSON("https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch="+encodeURIComponent('"'+title+'" film')+"&gsrlimit=8&prop=pageimages&pithumbsize=700&piprop=thumbnail&format=json&origin=*",4700);
  const hits=Object.values(json.query?.pages||{}).filter(p=>{
    const bare=String(p.title||"").replace(/\s+\((?:\d{4}\s+)?(?:film|animated film|TV series|television series)\)$/i,"");
    return p.thumbnail?.source&&key(bare)===key(title);
  });
  return hits.length===1?String(hits[0].thumbnail.source).replace(/^http:/,"https:"):"";
 }catch(e){return ""}
}
const BACKUPS={
 "Movie|happy feet":["https://www.movieposters.com/cdn/shop/products/e3daccb98eacb2612a7e38b63666c823_9f531240-5e0a-4257-a002-d1b97f39b985_grande.jpg?v=1762495870"],
 "Movie|shrek: 6-movie collection":["https://i5.walmartimages.com/seo/Shrek-6-Movie-Collection-DVD_43eb681a-495d-49e2-a394-c72f90e07897.866b22e5f8971d8c81634e70dc707a84.jpeg?odnBg=FFFFFF&odnHeight=768&odnWidth=768"],
 "Movie|frozen":["https://image.tmdb.org/t/p/w500/iE47FOdhS0YKvUmuILkk6kHsaso.jpg"],
 "Movie|a goofy movie":["https://i.pinimg.com/originals/cc/5f/da/cc5fdaa8f8172208b8e6bdf06ea43bc6.jpg"]
};
async function chooseCover(title,year,manualCover,remoteData){
 const normalized=cleanTitle(title),posterName=posterKey(title),alternateKey=posterKey(normalized);
 const local=(typeof VERIFIED_POSTERS!=="undefined"?VERIFIED_POSTERS:{});
 const candidates=[manualCover,local[posterName],local[alternateKey],...(BACKUPS[posterName]||[]),...(BACKUPS[alternateKey]||[])];
 for(const src of remoteData||[])if(src?.cover)candidates.push(src.cover);
 if(!isCollection(normalized)&&!(remoteData||[]).some(x=>x?.cover)){
  candidates.push(await wikiImage(normalized));
 }
 for(const src of [...new Set(candidates.filter(https))]){
  if(await checkImage(src,3100))return src;
 }
 return "";
}
async function lookup(record){
 if(!record||record.type!=="Movie")return null;
 const verified=(typeof VERIFIED_UPCS!=="undefined"&&record.barcode)?VERIFIED_UPCS[String(record.barcode).replace(/\D/g,"")]:null;
 const cleaned=cleanTitle(record.title,record.barcode),year=Number(record.year)||Number(verified?.year)||null;
 if(!cleaned)return null;
 const cacheId=key(cleaned)+"|"+(year||"");
 let remote=lookupCache.get(cacheId);
 if(!remote){
  /* Both sources run simultaneously; the slow or blocked one never prevents the other. */
  const settled=await Promise.allSettled([cinemaDetails(cleaned,year),itunesDetails(cleaned,year)]);
  remote=settled.map(x=>x.status==="fulfilled"?x.value:null).filter(Boolean);
  if(remote.length)lookupCache.set(cacheId,remote);
 }
 let genre="",filmYear=year;
 // Reuse trusted genre metadata from an existing entry of this same movie.
 if(typeof items!=="undefined"){
  const same=items.find(x=>x.type==="Movie"&&x.genre&&key(cleanTitle(x.title,x.barcode))===key(cleaned)&&
    (!year||!x.year||Number(x.year)===year));
  if(same)genre=same.genre;
 }
 for(const x of remote){
  if(!genre&&x.genre)genre=x.genre;
  if(!filmYear&&x.year)filmYear=x.year;
 }
 if(!genre&&verified?.genre)genre=verified.genre;
 const cover=await chooseCover(cleaned,year,record.cover,remote);
 return {title:cleaned,year:filmYear,genre,cover,source:remote.map(x=>x.source).join(" + ")};
}
function escape(v){return String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function fillEditor(){
 const el=$("modal"),kind=$("fType"),titleEl=$("fTitle"),genreEl=$("fGenre"),coverEl=$("fCover"),yearEl=$("fYear"),state=$("coverSuggestion");
 if(!el?.classList.contains("open")||kind.value!=="Movie"||!titleEl.value.trim())return Promise.resolve();
 const ticket=++requestToken,raw=titleEl.value.trim(),originalCover=coverEl.value.trim(),originalGenre=genreEl.value.trim();
 const barcode=$("fBarcode").value.trim(),title=cleanTitle(raw,barcode);
 const hint=(typeof VERIFIED_UPCS!=="undefined"?VERIFIED_UPCS[barcode]:null);
 if(!genreEl.value.trim()&&hint?.genre)genreEl.value=hint.genre;
 if(!yearEl.value&&hint?.year)yearEl.value=hint.year;
 const shouldClean=raw!==title&&!!title;
 if(shouldClean){titleEl.value=title;state.textContent="Cleaned DVD listing title to “"+title+"”. Finding movie details…"}
 else state.textContent="Looking for movie details and a cover for “"+title+"”…";
 const activeTitle=titleEl.value.trim();
 return (async()=>{
  const record={type:"Movie",title:activeTitle,year:Number(yearEl.value)||null,cover:originalCover,barcode:$("fBarcode").value.trim()};
  const data=await lookup(record);
  if(ticket!==requestToken||!el.classList.contains("open")||kind.value!=="Movie"||titleEl.value.trim()!==activeTitle)return;
  if(!data){state.textContent="No movie details found right now. You can edit the fields manually.";return}
  if(!genreEl.value.trim()&&data.genre)genreEl.value=data.genre;
  if(!yearEl.value&&data.year)yearEl.value=data.year;
  if(data.cover&&coverEl.value.trim()===originalCover)coverEl.value=data.cover;
  if(data.cover){
   state.innerHTML='<p style="margin:5px 0">Movie details checked'+(data.genre?' · Genre filled':'')+'. Review and save.</p><img src="'+escape(data.cover)+'" alt="Suggested cover" style="max-width:120px;max-height:165px;object-fit:contain;border:1px solid #bca387;background:#fff">';
  }else state.textContent=(data.genre?"Genre filled. ":"")+"Could not find a usable cover. You can still save the movie or paste a cover URL.";
  if(!shouldClean&&raw!==title&&typeof editing!=="undefined"&&editing!=null){
   const link=document.createElement("button");link.type="button";link.textContent="Use clean title: "+title;
   link.onclick=()=>{if(el.classList.contains("open"))titleEl.value=title};
   state.appendChild(link);
  }
 })().catch(()=>{if(ticket===requestToken)state.textContent="Movie details could not load. You can still save or retry."});
}
window.cleanMovieTitle=cleanTitle;
window.movieTitleNeedsCleanup=(title,barcode)=>cleanTitle(title,barcode)!==String(title||"").trim();
window.movieMetadataLookup=lookup;
window.movieCoverLookup=async movie=>(await lookup(movie))?.cover||"";
window.autoMovieCover=fillEditor;
window.retryMovieCover=()=>{lookupCache.clear();return fillEditor()};
window.enrichSavedMovie=async function(id){
 const rec=typeof items!=="undefined"?items.find(x=>String(x.id)===String(id)):null;
 if(!rec||rec.type!=="Movie")return;
 const before={name:rec.title,cover:rec.cover,genre:rec.genre,year:rec.year};
 const data=await lookup({type:"Movie",title:before.name,cover:before.cover||"",year:before.year,barcode:rec.barcode});
 if(!data)return;
 const current=items.find(x=>String(x.id)===String(id));
 if(!current||current.title!==before.name||current.type!=="Movie")return;
 let changed=false;
 if(!current.genre&&data.genre){current.genre=data.genre;changed=true}
 if(!current.year&&data.year){current.year=data.year;changed=true}
 if(data.cover&&current.cover===before.cover&&current.cover!==data.cover){current.cover=data.cover;changed=true}
 if(changed){if(typeof persist==="function")persist();if(typeof render==="function")render()}
};
if(typeof render==="function")setTimeout(render,0);
})();

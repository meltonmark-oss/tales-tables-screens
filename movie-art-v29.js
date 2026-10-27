/* Automatic movie cover enrichment (v29)
   Finds art by exact movie/series title, validates that it loads, and places the
   verified image in the edit form. No key, user account, or server required.
   Multi-film collections are intentionally handled as whole products only.
*/
(function(){
"use strict";
const $=id=>document.getElementById(id);
let requestToken=0;
const nameKey=s=>String(s||"").normalize("NFKD").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]/g,"");
const clean=s=>String(s||"")
 .replace(/\s*\((?:DVD|Blu-ray|4K|HD|Digital|Widescreen|Full.?screen|Special Edition|Collector's Edition|2.Disc|3.Disc)[^)]*\)\s*/gi," ")
 .replace(/\s*[-–|]\s*(?:DVD|Blu-ray|Digital|Widescreen|Full.?screen)\b.*$/gi,"")
 .replace(/\s+/g," ").trim();
const collection=s=>/\b(?:\d+[\s-]?(?:movie|film)\s*(?:collection|pack|set)|complete\s+(?:collection|series)|ultimate\s+collection|box\s*set|trilogy|quadrilogy|double\s*feature|anthology)\b/i.test(s);
const urlOK=s=>/^https:\/\//i.test(String(s||""));
const key=x=>String(x.type||"Movie")+"|"+String(x.title||"").toLowerCase().trim();
const existingPoster=x=>{
 if(x.cover&&urlOK(x.cover))return x.cover;
 const byTitle=(typeof VERIFIED_POSTERS!=="undefined"?VERIFIED_POSTERS[key(x)]:"");
 if(byTitle&&urlOK(byTitle))return byTitle;
 const saved=(typeof artCache!=="undefined"?artCache[String(x.type||"Movie")+"|"+String(x.title||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim()]:null);
 return typeof saved==="string"?saved:(saved?.url||"");
};
const resultCache=new Map();
async function fetchJSONFast(url,ms){
 const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
 try{
  const res=await fetch(url,{signal:c.signal,credentials:"omit",redirect:"follow"});
  if(!res.ok)throw new Error("HTTP "+res.status);
  return await res.json()
 }finally{clearTimeout(t)}
}
function imageWorks(src,timeout=7000){
 if(!urlOK(src))return Promise.resolve(false);
 return new Promise(resolve=>{
  const img=new Image();let done=false;
  const timer=setTimeout(()=>finish(false),timeout);
  function finish(ok){if(done)return;done=true;clearTimeout(timer);img.onload=img.onerror=null;resolve(ok)}
  img.onload=()=>finish(img.naturalWidth>=80&&img.naturalHeight>=100);
  img.onerror=()=>finish(false);
  img.src=src;
 })
}
async function getCinemeta(title,year){
 const type=/\b(?:season|series|complete series)\b/i.test(title)?"series":"movie";
 const q=encodeURIComponent(title);
 const data=await fetchJSONFast("https://v3-cinemeta.strem.io/catalog/"+type+"/top/search="+q+".json",4800);
 const hits=(data.metas||[]).filter(a=>a.poster&&urlOK(a.poster)&&nameKey(a.name)===nameKey(title));
 if(hits.length===0)return "";
 if(hits.length===1)return hits[0].poster;
 if(year){
  const exact=hits.find(h=>Number(h.releaseInfo?.match(/\d{4}/)?.[0]||h.year)===Number(year));
  if(exact)return exact.poster;
 }
 /* Avoid a poster from a remake when the edition does not identify a film year. */
 return "";
}
async function getApple(title,year){
 const data=await fetchJSONFast("https://itunes.apple.com/search?term="+encodeURIComponent(title)+"&entity=movie&country=US&limit=35",5500);
 const matches=(data.results||[]).filter(p=>p.artworkUrl100&&nameKey(p.trackName)===nameKey(title));
 if(!matches.length)return "";
 let choice=matches[0];
 if(matches.length>1&&year){
  const y=matches.find(p=>new Date(p.releaseDate||"").getUTCFullYear()===Number(year));
  if(y)choice=y;
 }
 const src=String(choice.artworkUrl100).replace(/^http:/i,"https:").replace(/\d+x\d+(?:bb)?(?:-\d+)?\.(jpg|png)$/i,"600x900bb.$1").replace(/\d+x\d+bb/i,"600x900bb");
 return src;
}
async function getWikipedia(title){
 const q='"'+title+'" film';
 const json=await fetchJSONFast("https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch="+encodeURIComponent(q)+"&gsrlimit=8&prop=pageimages&pithumbsize=700&piprop=thumbnail&format=json&origin=*",5200);
 const pages=Object.values(json.query?.pages||[]);
 const hits=pages.filter(p=>{
  if(!p.thumbnail?.source)return false;
  const bare=String(p.title||"").replace(/\s+\((?:\d{4}\s+)?(?:film|animated film|television series|TV series)\)$/i,"");
  return nameKey(bare)===nameKey(title)
 });
 return hits.length===1?String(hits[0].thumbnail.source).replace(/^http:/,"https:"):"";
}
async function getPoster(record){
 if(!record||record.type!=="Movie")return "";
 const title=clean(record.title);
 if(!title)return "";
 const k=key(record),previous=resultCache.get(k);
 if(previous&&previous.expires>Date.now())return previous.url;
 const existing=existingPoster(record);
 if(existing&&await imageWorks(existing,4100)){
  resultCache.set(k,{url:existing,expires:Date.now()+86400000});return existing
 }
 const searches=[];
 if(!collection(title)){
  searches.push(()=>getCinemeta(title,record.year),()=>getApple(title,record.year),()=>getWikipedia(title))
 } else {
  /* Matching 'Shrek 6-Movie Collection' to 'Shrek' misrepresents a box set. */
  searches.push(()=>getCinemeta(title,record.year))
 }
 for(const search of searches){
  try{
   const candidate=await search();
   if(candidate&&await imageWorks(candidate,5400)){
    resultCache.set(k,{url:candidate,expires:Date.now()+86400000});
    return candidate;
   }
  }catch(e){}
 }
 resultCache.set(k,{url:"",expires:Date.now()+3*3600000});return "";
}
async function enrichOpenEditor(){
 const form=$("modal"),type=$("fType"),titleField=$("fTitle"),coverInput=$("fCover"),msg=$("coverSuggestion");
 if(!form||!form.classList.contains("open")||type.value!=="Movie"||!titleField.value.trim())return;
 const token=++requestToken,originalTitle=titleField.value.trim(),initialUrl=coverInput.value.trim();
 const item={type:"Movie",title:originalTitle,year:Number($("fYear")?.value)||null,cover:""};
 const liveRecord=typeof items!=="undefined"?items.find(x=>x.type==="Movie"&&nameKey(x.title)===nameKey(originalTitle)):null;
 if(liveRecord?.cover){return} /* Never override a saved user cover. */
 if(initialUrl&&await imageWorks(initialUrl,3800)){return}
 if(token!==requestToken)return;
 if(initialUrl)coverInput.value="";
 msg.textContent="Finding a movie poster for “"+originalTitle+"”…";
 const url=await getPoster(item);
 if(token!==requestToken||!form.classList.contains("open")||type.value!=="Movie"||titleField.value.trim()!==originalTitle)return;
 if(!url){msg.textContent="No confident cover match yet. You can tap Find a matching cover or paste an image URL.";return}
 if(coverInput.value.trim())return; /* Do not overwrite manual input. */
 coverInput.value=url;
 msg.innerHTML='<p style="margin:5px 0">Poster found for '+escapeHtml(originalTitle)+'. Check it, then tap Save item.</p><img src="'+escapeHtml(url)+'" alt="Suggested movie poster" style="max-width:135px;max-height:190px;object-fit:contain;background:#fff;border:1px solid #bca387;border-radius:4px">';
}
function escapeHtml(v){return String(v||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
window.enrichSavedMovie=async function(id){
 const record=typeof items!=="undefined"?items.find(x=>String(x.id)===String(id)):null;
 if(!record||record.type!=="Movie"||record.cover)return;
 const name=record.title,url=await getPoster({type:"Movie",title:name,year:record.year,barcode:record.barcode});
 if(!url)return;
 const current=items.find(x=>String(x.id)===String(id));
 if(!current||current.type!=="Movie"||current.cover||current.title!==name)return;
 current.cover=url;
 if(typeof persist==="function")persist();
 if(typeof render==="function")render();
};
window.movieCoverLookup=getPoster;
window.autoMovieCover=enrichOpenEditor;
})();

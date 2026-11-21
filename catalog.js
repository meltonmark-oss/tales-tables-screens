const KEY="tts_catalog_v2";
const oldKey="tales_tables_screens_v1";
const $=id=>document.getElementById(id);
const isKids=x=>x.type==="Book"&&(x.kids===true||(x.kids!==false&&/children|picture book|board book|early reader/i.test(x.genre||"")));
const section=x=>x.type==="Movie"?"movies":x.type==="Game"?"games":isKids(x)?"kids":"books";
let tab="books",items=ORIGINAL.map(x=>({...x})),editing=null;
let scanIntoItem=false,scanEditionMode=false,editionCandidate=null;
window.scanIntoItemCategory = () => scanEditionMode ? "Book" : scanIntoItem ? $("fType").value : null;
try{let previous=JSON.parse(localStorage.getItem(KEY));if(!Array.isArray(previous))previous=JSON.parse(localStorage.getItem(oldKey));if(Array.isArray(previous)&&previous.length){items=previous.map(x=>({...x}));const known=new Set(items.map(x=>String(x.id)));for(const x of ORIGINAL){if(!known.has(String(x.id))){
  /* Photo-added titles use reserved IDs. Avoid inserting a second copy when
     this browser already has a manually scanned entry with the same film title. */
  const keyOf=t=>String(t||"").toLowerCase().replace(/^(?:dvd|blu[- ]?ray)\s+/i,"").replace(/\s*\[[^\]]*\]/g,"").replace(/\s*\((?:widescreen|fullscreen|full screen edition)\)/ig,"").replace(/[^a-z0-9]/g,"");
  const prior=Number(x.id)>=80001?items.find(y=>y.type===x.type&&keyOf(y.title)===keyOf(x.title)):null;
  if(prior){if(!prior.genre)prior.genre=x.genre;if(!prior.year)prior.year=x.year;continue}
  items.push({...x});known.add(String(x.id))
 }else if(x.barcode){const old=items.find(y=>String(y.id)===String(x.id));if(old){if(!old.barcode)old.barcode=x.barcode;if(!old.year&&x.year)old.year=x.year}}}}}catch(e){}
  /* Cover and UPC updates for existing device catalogs: preserve user-selected artwork and edits. */
  const DEFAULT_BY_ID = new Map(ORIGINAL.map(x=>[String(x.id),x]));
  function applyDefaultCoverUpdates(collection){
    for(const item of collection){
      const original=DEFAULT_BY_ID.get(String(item.id));
      if (!matchesTitle(item, original)) continue;
      if(!item.cover && original.cover)item.cover=original.cover;
      if(!item.barcode && original.barcode)item.barcode=original.barcode;
    }
  }
function persist(){try{localStorage.setItem(KEY,JSON.stringify(items))}catch(e){alert("Browser storage is unavailable. Export a backup to save changes.")}}
function esc(s){return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function displayTitle(x){if(x.type!=="Movie"||!window.cleanMovieTitle)return String(x.title||"");return window.cleanMovieTitle(x.title,x.barcode)||String(x.title||"")}
const sections = {
  books: { room: "Great Library", noun: "book", search: "books", icon: "book" },
  movies: { room: "Silver Screen", noun: "title", search: "movies and TV", icon: "film" },
  games: { room: "Guild Hall", noun: "game", search: "games", icon: "dice" },
  kids: { room: "Little Tales", noun: "book", search: "kids’ books", icon: "kids" }
};
const filterIds = ["genre", "authorFilter", "pagesFilter", "yearFilter", "status", "sort"];
const textFilters = ["search", ...filterIds];
const tabSettings = new Map();

function genreParts(value) {
  return [...new Set(String(value || "").split(/\s*\/\s*|\s*[,;|&+]\s*|\s+and\s+/i)
    .map(s => s.trim().replace(/\s+/g, " ")).filter(Boolean))];
}

function populateFilter(id, values, placeholder) {
  const control = $(id);
  const chosen = control.value;
  const sorted = [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  control.replaceChildren(new Option(placeholder, ""), ...sorted.map(value => new Option(value, value)));
  if (sorted.includes(chosen)) control.value = chosen;
}

function sectionItems() {
  return items.filter(item => section(item) === tab);
}

function matchesTitle(item, original) {
  if (!original || original.type !== item.type) return false;
  if (item.type === "Book" && item.barcode && item.barcode === original.barcode && validISBN(item.barcode)) return true;
  if (normalizedArtTitle(displayTitle(item)) !== normalizedArtTitle(displayTitle(original))) return false;
  if (item.type === "Book" && item.author && original.author &&
      normalizedArtTitle(item.author) !== normalizedArtTitle(original.author)) return false;
  return item.type !== "Movie" || !item.year || !original.year || Number(item.year) === Number(original.year);
}

function catalogDetails(item) {
  const original = DEFAULT_BY_ID.get(String(item.id));
  if (matchesTitle(item, original)) return CATALOG_DETAILS[original.id];
  const matches = ORIGINAL.filter(candidate => matchesTitle(item, candidate));
  return matches.length === 1 ? CATALOG_DETAILS[matches[0].id] : undefined;
}

function descriptionsAllowed(item) {
  return !isKids(item) && !catalogDetails(item)?.coverOnly;
}

function descriptionFor(item) {
  if (!descriptionsAllowed(item)) return "";
  return typeof item.description === "string" ? item.description.trim() : catalogDetails(item)?.description || "";
}

function isLent(item) {
  return /lent|loan|borrow|out/i.test(item.status || "");
}

function current(all = sectionItems()) {
  const q = $("search").value.trim().toLocaleLowerCase();
  const genre = $("genre").value;
  const status = $("status").value;
  const author = tab === "books" || tab === "kids" ? $("authorFilter").value : "";
  const length = tab === "books" || tab === "kids" ? $("pagesFilter").value : "";
  const year = tab === "books" || tab === "kids" ? $("yearFilter").value : "";
  const [minPages, maxPages] = length.split("-").map(Number);
  const filtered = all.filter(x => {
    if (q && ![x.title, displayTitle(x), x.author, x.genre, x.format, x.barcode].some(value =>
      String(value || "").toLocaleLowerCase().includes(q))) return false;
    if (genre && !genreParts(x.genre).includes(genre)) return false;
    if (status && isLent(x) !== (status === "out")) return false;
    if (author && !String(x.author || "").toLocaleLowerCase().includes(author.toLocaleLowerCase())) return false;
    if (year && String(x.year || "") !== year) return false;
    if (length === "unknown") return !Number(x.pages);
    if (length) return Number(x.pages) >= minPages && Number(x.pages) <= maxPages;
    return true;
  });
  const direction = $("sort").value === "za" ? -1 : 1;
  return filtered.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)) * direction);
}

/* Keep using cover matches already saved by earlier versions of the site. */
const ART_KEY = "tts_artwork_v2";
let artCache = {};
try { artCache = JSON.parse(localStorage.getItem(ART_KEY)) || {}; } catch {}
function cachedCover(item) {
  const cacheKey = title => item.type + "|" + String(title).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const entry = artCache[cacheKey(displayTitle(item))] || artCache[cacheKey(item.title)];
  return typeof entry === "string" ? entry : entry?.url || "";
}
const VERIFIED_POSTERS={"Movie|up":"https://media-manager.starsinsider.com/gallery/1080/na_6509caf9db7ab.jpg","Movie|finding nemo":"https://cf-img-a-in.tosshub.com/sites/visualstory/wp/2024/10/5919a697bff3873f28f73992c95e5e5f.jpg?size=%2A%3A900","Movie|bluey: seasons 1 & 2":"https://i5.walmartimages.com/seo/Bluey-Season-1-2-DVD_15611014-1335-4c4b-9f3a-e8d12d73be37.ec600ad333c001f808ad92bcaa9a40fe.jpeg?odnBg=FFFFFF&odnHeight=576&odnWidth=576","Movie|toy story 5":"https://assets.murphysmultiverse.com/uploads/2026/08/10386958_3D-Pack-Shot_TOY-STORY-5_BD-1982x2048.jpg","Movie|10 things i hate about you":"https://filmartgallery.com/cdn/shop/files/10-Things-I-Hate-About-You-Vintage-Movie-Poster-Original.jpg?v=1743650431","Movie|17 again":"https://i5.walmartimages.com/seo/17-Again-DVD-Feature-Comedy-Comedy-Comedy-Comedy-Drama_7c3da9a7-1f12-4e9d-a515-c5f6d936cbbf.b54fe8c5dd8c7a7579150909d2eef861.jpeg?odnBg=FFFFFF&odnHeight=768&odnWidth=768","Movie|2 fast 2 furious":"https://blob.cede.ch/catalog/10048000/10048815_1_92.jpg?v=1","Game|3 up 3 down":"https://img.kwcdn.com/product/fancy/48df2665-6b4a-4228-b710-7e381f5229b0.jpg","Game|battleship":"https://i5.walmartimages.com/seo/Hasbro-Battleship-Board-Game_4dc5f5e3-eb6d-4f5f-93dc-69459619e380.3af2bf81f2113859c98222ccccb80712.jpeg","Game|bluey keepy uppy game":"https://dsom-imager-prod.shipt.com/87882657-27/7-107bd3ee27d28f3dbc2aaf9a6f69b7ed.jpeg","Movie|coco":"https://m.media-amazon.com/images/M/MV5BMDIyM2E2NTAtMzlhNy00ZGUxLWI1NjgtZDY5MzhiMDc5NGU3XkEyXkFqcGc%40._V1_.jpg","Movie|how to train your dragon: 3-movie collection":"https://images.contentstack.io/v3/assets/blt13adb7e2033fcee5/blt191fdfed3cd68669/690eb2c191128279e22406c0/HowToTrainYourDragon3MovieCollection_PosterArt.jpg?width=1200","Movie|shrek: 6-movie collection":"https://i5.walmartimages.com/seo/Shrek-6-Movie-Collection-DVD_43eb681a-495d-49e2-a394-c72f90e07897.866b22e5f8971d8c81634e70dc707a84.jpeg?odnBg=FFFFFF&odnHeight=768&odnWidth=768","Movie|happy feet":"https://www.movieposters.com/cdn/shop/products/e3daccb98eacb2612a7e38b63666c823_9f531240-5e0a-4257-a002-d1b97f39b985_grande.jpg?v=1762495870","Movie|frozen":"https://image.tmdb.org/t/p/w500/iE47FOdhS0YKvUmuILkk6kHsaso.jpg","Movie|a goofy movie":"https://i.pinimg.com/originals/cc/5f/da/cc5fdaa8f8172208b8e6bdf06ea43bc6.jpg"};
const badCoverUrls=new Set();
function tidyTitle(s){return String(s).replace(/\s*\([^)]*(?:dvd|blu-ray|extended edition|special edition|collector|widescreen|fullscreen|disc set)[^)]*\)/ig,"").replace(/\s*:\s*\d+[- ]?(?:movie|film)\s*(?:collection|pack)/ig,"").replace(/\s+\([2345]-disc[^)]*\)/ig,"").trim()}
function normalizedArtTitle(s){return String(s||"").normalize("NFKD").toLowerCase().replace(/&/g,"and").replace(/[^a-z0-9]/g,"")}
function improvedArtUrl(v){return String(v||"").replace(/^http:/,"https:").replace(/\d+x\d+bb/,"600x900bb").replace(/\d+x\d+-\d+\.jpg/,"600x900bb.jpg")}
async function fetchJSON(url){const c=new AbortController(),t=setTimeout(()=>c.abort(),9500);try{const r=await fetch(url,{signal:c.signal});if(!r.ok)throw Error("HTTP "+r.status);return await r.json()}finally{clearTimeout(t)}}
async function wikiArtwork(title,kind){
 try{const term='"'+title+'" '+(kind==="Game"?"board game":"film");const url="https://en.wikipedia.org/w/api.php?action=query&generator=search&gsrsearch="+encodeURIComponent(term)+"&gsrlimit=10&prop=pageimages&pithumbsize=600&piprop=thumbnail&format=json&origin=*";
 const data=await fetchJSON(url),pages=Object.values(data.query?.pages||{});
 const matches=pages.filter(p=>{if(!p.thumbnail?.source)return false;const actual=String(p.title||""),base=actual.replace(/\s+\((?:\d{4}\s+)?(?:film|animated film|board game|television series|TV series)\)$/i,"");if(normalizedArtTitle(base)!==normalizedArtTitle(title))return false;
 const suffix=(actual.match(/\(([^)]*)\)$/)||[])[1]||"";
 if(kind==="Game")return /board game/i.test(suffix)||!suffix;
 return !suffix||/film|television|tv series/i.test(suffix)});
 if(matches.length){const exact=matches.find(x=>normalizedArtTitle(x.title)===normalizedArtTitle(title));const hit=exact||matches[0];return hit.thumbnail.source.replace(/^http:/,"https:")}
 }catch(e){}return "";
}
async function findArtwork(x){
 const title=tidyTitle(x.title),query=encodeURIComponent(title),norm=normalizedArtTitle;
 if(x.type==="Book"){
  if(/^(?:97[89]\d{10}|\d{9}[\dX])$/i.test(x.barcode||""))return "https://covers.openlibrary.org/b/isbn/"+encodeURIComponent(x.barcode)+"-M.jpg?default=false";
  try{const d=await fetchJSON("https://openlibrary.org/search.json?title="+query+"&limit=12&fields=title,author_name,cover_i");const hits=(d.docs||[]).filter(a=>a.cover_i&&norm(a.title)===norm(title));const hit=hits.find(a=>!x.author||(a.author_name||[]).some(z=>norm(z)===norm(x.author)));if(hit)return "https://covers.openlibrary.org/b/id/"+hit.cover_i+"-M.jpg?default=false"}catch(e){}
  try{const d=await fetchJSON("https://www.googleapis.com/books/v1/volumes?q=intitle:"+query+(x.author?"%20inauthor:"+encodeURIComponent(x.author):"")+"&maxResults=8");const hit=(d.items||[]).find(a=>norm(a.volumeInfo?.title)===norm(title)&&a.volumeInfo?.imageLinks&&(!x.author||a.volumeInfo.authors?.some(author=>norm(author)===norm(x.author))));if(hit)return (hit.volumeInfo.imageLinks.thumbnail||hit.volumeInfo.imageLinks.smallThumbnail||"").replace(/^http:/,"https:").replace(/&edge=curl/,"")}catch(e){}
 }
 if(x.type==="Movie"){
  if(window.movieCoverLookup){try{const found=await window.movieCoverLookup(x);if(found)return found}catch(e){}}
  const tv=title.match(/^(.+?)\s*(?:—|–|-|,|:)\s*Season\s+(\d+)\s*$/i);
  if(tv){try{const q=encodeURIComponent(tv[1]+" season "+tv[2]);const d=await fetchJSON("https://itunes.apple.com/search?term="+q+"&media=tvShow&entity=tvSeason&country=US&limit=30");const hit=(d.results||[]).find(a=>norm(a.collectionName)===norm(tv[1]+" season "+tv[2])&&a.artworkUrl100);if(hit)return improvedArtUrl(hit.artworkUrl100)}catch(e){}
  }else{
    try{const d=await fetchJSON("https://itunes.apple.com/search?term="+query+"&entity=movie&country=US&limit=20");const exact=(d.results||[]).filter(a=>norm(a.trackName)===norm(title)&&a.artworkUrl100);if(exact.length)return improvedArtUrl(exact[0].artworkUrl100)}catch(e){}
    const wiki=await wikiArtwork(title,"Movie");if(wiki)return wiki;
  }
 }
 if(x.type==="Game"){const wiki=await wikiArtwork(title,"Game");if(wiki)return wiki}
 return "";
}
function artworkURL(url) {
  return typeof url === "string" && /^(?:https?:\/\/|data:image\/(?:jpeg|png|webp|gif|avif);)/i.test(url) ? url : "";
}

function artworkFor(item) {
  const extra = catalogDetails(item);
  const posterKey = name => item.type + "|" + String(name).toLowerCase().trim();
  const seed = DEFAULT_BY_ID.get(String(item.id));
  const defaultImage = matchesTitle(item, seed) && (!item.barcode || !seed.barcode || item.barcode === seed.barcode) ? seed.cover : "";
  const candidates = [
    { url: item.cover },
    { url: defaultImage },
    { url: extra?.cover, source: extra?.source },
    { url: extra?.alternate, source: extra?.alternateSource || extra?.source },
    { url: VERIFIED_POSTERS[posterKey(displayTitle(item))] },
    { url: VERIFIED_POSTERS[posterKey(item.title)] },
    { url: cachedCover(item) }
  ];
  return candidates.find(({url}) => artworkURL(url) && !badCoverUrls.has(url));
}

function icon(name) {
  return '<svg class="icon" aria-hidden="true"><use href="#icon-' + name + '"></use></svg>';
}

const coverHues = {books: [144, 162, 27, 10, 210, 50], movies: [219, 227, 269, 188], games: [31, 45, 14, 58], kids: [298, 190, 141, 341]};

function coverHue(item, kind) {
  const colors = coverHues[kind];
  const code = [...String(item.id)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return colors[code % colors.length];
}

function coverHTML(item, {detail = false, eager = false} = {}) {
  const kind = section(item);
  const artwork = artworkFor(item);
  const image = artwork ? '<img ' + (eager || detail ? "" : 'loading="lazy" ') +
    'decoding="async" alt="' + (detail ? "Artwork for " + esc(displayTitle(item)) : "") +
    '" src="' + esc(artwork.url) + '">' : "";
  return '<span class="cover cover-' + kind + (image ? "" : " fallback") + '" data-cover-id="' + esc(item.id) +
    '" style="--cover-hue:' + coverHue(item, kind) + '"' + (detail ? "" : ' aria-hidden="true"') + '>' +
    icon(sections[kind].icon) + '<span class="cover-title">' + esc(displayTitle(item)) + "</span>" + image + "</span>";
}

function artworkLink(source) {
  return /^https:\/\//i.test(source || "") ?
    '<a href="' + esc(source) + '" target="_blank" rel="noopener noreferrer">Artwork source</a>' : "";
}

document.addEventListener("error", event => {
  const image = event.target;
  if (!(image instanceof HTMLImageElement)) return;
  const frame = image.closest("[data-cover-id]");
  if (!frame) return;
  badCoverUrls.add(image.getAttribute("src"));
  const item = items.find(x => String(x.id) === frame.dataset.coverId);
  const alternative = item && artworkFor(item);
  if (alternative) {
    image.src = alternative.url;
  } else {
    image.remove();
    frame.classList.add("fallback");
  }
  const credit = frame.closest("figure")?.querySelector("figcaption");
  if (credit) {
    credit.innerHTML = artworkLink(alternative?.source);
    credit.hidden = !credit.firstChild;
  }
}, true);

function gamePlayerText(item) {
  const game = window.gameNightMeta?.(item);
  if (!game?.minPlayers && !game?.maxPlayers) return "";
  const { minPlayers: min, maxPlayers: max } = game;
  const range = min && max && min !== max ? min + "–" + max : min || max;
  return range + (range === 1 ? " player" : " players");
}

function cardHTML(item, index, spines) {
  const title = displayTitle(item);
  const lent = isLent(item);
  if (spines) {
    return '<button class="item" type="button" data-id="' + esc(item.id) + '" title="' + esc(title) +
      '" aria-label="View ' + esc(title) + (lent ? ', lent out' : '') + '">' +
      '<span class="spine-slot" aria-hidden="true"><span class="book-spine" style="--cover-hue:' + coverHue(item, "books") +
      '"><span class="spine-title">' + esc(title) + '</span></span></span>' +
      '<span class="item-copy">' + (lent ? '<span class="loan">Lent out</span>' : '') + '</span></button>';
  }
  const subtitle = item.type === "Game" ? gamePlayerText(item) || genreParts(item.genre)[0] :
    item.type === "Book" ? item.author || item.format : [item.year, item.format].filter(Boolean).join(" · ");
  const description = descriptionFor(item);
  return '<button class="item" type="button" data-id="' + esc(item.id) + '" aria-label="View ' + esc(title) + '">' +
    coverHTML(item, { eager: index < 4 }) + '<span class="item-copy"><span class="label">' + esc(title) + '</span>' +
    (subtitle ? '<span class="item-meta">' + esc(subtitle) + '</span>' : "") +
    (lent ? '<span class="loan">Lent out</span>' : "") +
    (description ? '<span class="item-description">' + esc(description) + '</span>' : "") +
    "</span></button>";
}

function updateFilterToggle() {
  const fields = filterIds.filter(id => !$(id).closest("label").hidden);
  const count = fields.filter(id => $(id).value && (id !== "sort" || $(id).value !== "az")).length;
  $("filterLabel").textContent = count ? "Filters (" + count + ")" : "Filters";
  $("filterToggle").toggleAttribute("data-filtered", count > 0);
  $("clearFilters").disabled = count === 0;
}

function paintCards() {
  const all = sectionItems();
  const list = current(all);
  const { noun } = sections[tab];
  const count = n => n + " " + noun + (n === 1 ? "" : "s");
  $("roomCount").textContent = count(all.length) + " in your collection";
  const order = $("sort").value === "za" ? "Title Z–A" : "Title A–Z";
  $("summary").textContent = list.length === all.length ? order : list.length + " of " + count(all.length);
  $("random").disabled = !list.length;
  const spines = currentView() === "spines";
  $("cards").innerHTML = list.length ? list.map((item, index) => cardHTML(item, index, spines)).join("") : all.length ?
    '<div class="empty"><h3>No matches</h3><p>Try another search or clear your filters.</p><button class="button secondary" type="button" id="emptyReset">Clear search and filters</button></div>' :
    '<div class="empty"><h3>This shelf is empty</h3><button class="button secondary" type="button" id="emptyAdd">Add an item</button></div>';
  updateFilterToggle();
}

function render() {
  const room = sections[tab];
  document.body.dataset.tab = tab;
  $("heading").textContent = room.room;
  updateViewControls();
  $("search").placeholder = tab === "movies" ? "Search movies" : "Search " + room.search;
  $("search").setAttribute("aria-label", "Search " + room.search);
  document.querySelectorAll("[data-go]").forEach(button => {
    if (button.dataset.go === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".book-filter").forEach(field => field.hidden = tab !== "books" && tab !== "kids");
  const all = sectionItems();
  populateFilter("genre", all.flatMap(item => genreParts(item.genre)), "All genres");
  populateFilter("authorFilter", all.map(item => item.author), "All authors");
  paintCards();
  window.renderGameNight?.();
}

function setFiltersOpen(open) {
  $("filterFields").hidden = !open;
  $("filterToggle").setAttribute("aria-expanded", String(open));
}

function switchTab(next) {
  if (next === tab) return;
  tabSettings.set(tab, { fields: textFilters.map(id => $(id).value), filtersOpen: !$("filterFields").hidden });
  tab = next;
  const previous = tabSettings.get(tab);
  for (const id of textFilters) $(id).value = id === "sort" ? "az" : "";
  render();
  if (previous) textFilters.forEach((id, index) => $(id).value = previous.fields[index]);
  setFiltersOpen(Boolean(previous?.filtersOpen));
  if (previous) paintCards();
  window.scrollTo({ top: 0 });
}

function resetFilters(searchToo = false) {
  for (const id of filterIds) $(id).value = id === "sort" ? "az" : "";
  if (searchToo) $("search").value = "";
  paintCards();
}

const VIEW_KEY = "tts_browse_view";
const SPINES_KEY = "tts_library_spines";
let browseView = "grid";
let useSpines = false;
try {
  if (localStorage.getItem(VIEW_KEY) === "list") browseView = "list";
  useSpines = localStorage.getItem(SPINES_KEY) === "true";
} catch {}
const viewButtons = document.querySelectorAll(".view-controls button");

function currentView() {
  return tab === "books" && useSpines ? "spines" : browseView;
}

function updateViewControls() {
  const view = currentView();
  const library = tab === "books";
  const gridLabel = library ? "Covers grid view" : "Grid view";
  document.querySelector(".shelf").dataset.view = view;
  $("spinesView").hidden = !library;
  $("gridView").setAttribute("aria-label", gridLabel);
  $("gridView").title = gridLabel;
  for (const button of viewButtons) {
    button.setAttribute("aria-pressed", String(view === button.dataset.view));
  }
}

function setView(view) {
  const previous = currentView();
  if (tab === "books") useSpines = view === "spines";
  if (view !== "spines") browseView = view;
  try {
    localStorage.setItem(VIEW_KEY, browseView);
    localStorage.setItem(SPINES_KEY, String(useSpines));
  } catch {}
  updateViewControls();
  if (previous !== currentView() && (previous === "spines" || currentView() === "spines")) paintCards();
}

$("filterToggle").onclick = () => setFiltersOpen($("filterFields").hidden);
$("clearFilters").onclick = () => resetFilters();
for (const id of textFilters) {
  $(id).addEventListener(id === "search" || id === "yearFilter" ? "input" : "change", paintCards);
}
document.querySelectorAll("[data-go]").forEach(button => button.onclick = () => switchTab(button.dataset.go));
viewButtons.forEach(button => button.onclick = () => setView(button.dataset.view));
document.addEventListener("click", event => {
  if (!$("toolsMenu").contains(event.target)) $("toolsMenu").open = false;
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && $("toolsMenu").open) {
    $("toolsMenu").open = false;
    $("toolsMenu").querySelector("summary").focus();
  }
});
$("cards").addEventListener("click", event => {
  const button = event.target.closest("[data-id]");
  if (button) {
    if (tab === "games" && currentView() === "grid") button.classList.add("lifted");
    showDetails(button.dataset.id);
  }
  if (event.target.closest("#emptyReset")) resetFilters(true);
  if (event.target.closest("#emptyAdd")) edit(null);
});

function openDialog(id) {
  const dialog = $(id);
  if (!dialog.open) dialog.showModal();
  dialog.classList.add("open");
  dialog.scrollTop = 0;
}

function closeDialog(id) {
  const dialog = $(id);
  dialog.classList.remove("open");
  if (dialog.open) dialog.close();
}

function closeOnEscapeOrBackdrop(id, closeButton) {
  $(id).addEventListener("cancel", event => {
    event.preventDefault();
    $(closeButton).click();
  });
  $(id).addEventListener("click", event => {
    if (event.target === $(id)) $(closeButton).click();
  });
}

let detailId = null;
function showDetails(id) {
  const item = items.find(x => String(x.id) === String(id));
  if (!item) return;
  detailId = item.id;
  const title = displayTitle(item);
  const description = descriptionFor(item);
  const book = item.type === "Book";
  const game = item.type === "Game";
  const gameMeta = game ? window.gameNightMeta?.(item) : null;
  const details = [
    ["Genre", item.genre],
    ["Format or edition", item.format],
    [book ? "Publication year" : "Year", item.year],
    ["Publisher", item.publisher],
    ["Pages", book && item.pages],
    ["Players", game && gamePlayerText(item)],
    ["Play time", gameMeta?.playMinutes && "About " + gameMeta.playMinutes + " min"],
    [book ? "ISBN" : "Barcode", item.barcode]
  ].filter(([, value]) => value);
  const credit = artworkLink(artworkFor(item)?.source);
  $("detailContent").innerHTML = '<div class="detail-content"><figure class="detail-art">' +
    coverHTML(item, { detail: true }) + '<figcaption' + (credit ? "" : " hidden") + ">" + credit +
    '</figcaption></figure><div class="detail-text"><div class="detail-header"><p class="detail-category">' +
    esc(isKids(item) ? "Kids’ book" : book ? "Book" : game ? "Board game" : "Movies & TV") + '</p><h2 id="detailTitle" class="detail-title">' +
    esc(title) + '</h2>' + (book && item.author ? '<p class="detail-byline">' + esc(item.author) + '</p>' : "") +
    '<span class="detail-status' + (isLent(item) ? " loan" : "") + '">' + (isLent(item) ? "Lent out" : "Available") + '</span></div>' +
    (description ? '<p class="detail-description">' + esc(description) + '</p>' : "") +
    (details.length ? '<dl class="detail-info">' + details.map(([label, value]) =>
      '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>').join("") + '</dl>' : "") + '</div></div>';
  $("detailEdition").hidden = !book;
  $("returnGame").hidden = !game;
  openDialog("detailModal");
}

$("closeDetail").onclick = $("returnGame").onclick = () => closeDialog("detailModal");
$("detailModal").addEventListener("close", () => {
  $("cards").querySelector(".lifted")?.classList.remove("lifted");
});
closeOnEscapeOrBackdrop("detailModal", "closeDetail");
$("detailEdit").onclick = () => {
  closeDialog("detailModal");
  edit(detailId);
};
$("detailEdition").onclick = () => {
  closeDialog("detailModal");
  edit(detailId);
  $("editionTools").open = true;
  $("editionSummary").focus();
};
let editorVersion = 0;
const recordById = id => items.find(item => String(item.id) === String(id));

function updateEditorFields() {
  const type = $("fType").value;
  document.querySelectorAll(".book-field").forEach(el => el.hidden = type !== "Book");
  document.querySelectorAll(".game-field").forEach(el => el.hidden = type !== "Game");
  const draft = { id: editing, title: $("fTitle").value, author: $("fAuthor").value, type, kids: $("fKids").checked };
  $("descriptionField").hidden = !descriptionsAllowed(draft);
}

function edit(id, typeOverride) {
  const type = typeOverride || (tab === "movies" ? "Movie" : tab === "games" ? "Game" : "Book");
  const item = id == null ? { type, kids: tab === "kids" } : recordById(id);
  if (!item) return;
  editing = id == null ? null : item.id;
  editorVersion++;
  const meta = window.gameNightMeta?.(item) || item;
  const values = {
    fTitle: item.title, fType: item.type, fGenre: item.genre,
    fAuthor: item.author, fFormat: item.format, fYear: item.year, fPages: item.pages, fPublisher: item.publisher,
    fStatus: isLent(item) ? "Lent Out" : "Available", fDescription: descriptionFor(item),
    fBarcode: item.barcode, fCover: item.cover, editionISBN: item.type === "Book" ? item.barcode : "",
    fMinPlayers: meta.minPlayers, fMaxPlayers: meta.maxPlayers, fPlayMinutes: meta.playMinutes, fGameMood: meta.gameMood
  };
  for (const [key, value] of Object.entries(values)) $(key).value = value ?? "";
  $("editTitle").textContent = editing == null ? "Add to collection" : "Edit item";
  $("fKids").checked = isKids(item);
  $("delete").hidden = editing == null;
  $("editionTools").open = false;
  $("editionPreview").replaceChildren();
  $("coverSuggestion").replaceChildren();
  $("lookupStatus").textContent = "";
  $("findCover").disabled = false;
  editionCandidate = null;
  editionSearchNumber++;
  updateEditorFields();
  openDialog("modal");
  $("itemForm").scrollTop = 0;
}

$("add").onclick = () => edit(null);
$("fType").addEventListener("change", updateEditorFields);
$("fKids").addEventListener("change", updateEditorFields);
$("fTitle").addEventListener("input", updateEditorFields);
$("cancel").onclick = $("closeEdit").onclick = () => closeDialog("modal");
closeOnEscapeOrBackdrop("modal", "closeEdit");

$("findCover").onclick = async () => {
  const title = $("fTitle").value.trim();
  const target = $("coverSuggestion");
  if (!title) {
    target.textContent = "Enter the title to look up artwork.";
    return;
  }
  const draft = {
    id: editing, title, type: $("fType").value, author: $("fAuthor").value.trim(),
    barcode: $("fBarcode").value.trim(), year: Number($("fYear").value) || null
  };
  const request = editorVersion;
  const sameDraft = () => request === editorVersion && $("modal").open &&
    title === $("fTitle").value.trim() && draft.type === $("fType").value &&
    draft.author === $("fAuthor").value.trim() && draft.barcode === $("fBarcode").value.trim();
  let preview;
  $("findCover").disabled = true;
  target.textContent = "Looking for matching artwork…";
  try {
    const url = artworkFor(draft)?.url || artworkURL(await findArtwork(draft));
    if (!sameDraft()) return;
    if (!url) {
      target.textContent = "No confident match found. Paste an image address to add your own.";
      return;
    }
    preview = document.createElement("img");
    preview.alt = "Suggested artwork";
    preview.onload = () => {
      if (!sameDraft()) return;
      const note = document.createElement("p");
      note.textContent = "Check the artwork against your copy.";
      const use = document.createElement("button");
      use.type = "button";
      use.textContent = "Use this artwork";
      use.onclick = () => {
        if (!sameDraft()) return;
        $("fCover").value = url;
        target.textContent = "Artwork selected. Tap Save item to apply it.";
      };
      target.replaceChildren(note, preview, use);
    };
    preview.onerror = () => {
      if (sameDraft()) target.textContent = "The image source could not load. Try another image address.";
    };
    preview.src = url;
  } catch {
    if (sameDraft()) target.textContent = "Artwork lookup is unavailable right now.";
  } finally {
    if (request === editorVersion) $("findCover").disabled = false;
  }
};

$("itemForm").addEventListener("submit", event => {
  event.preventDefault();
  const draftTitle = $("fTitle").value.trim();
  if (!draftTitle) {
    $("fTitle").focus();
    return;
  }
  const type = $("fType").value;
  const barcode = $("fBarcode").value.trim();
  const title = type === "Movie" && window.cleanMovieTitle ? window.cleanMovieTitle(draftTitle, barcode) : draftTitle;
  const existing = recordById(editing);
  const obj = {
    ...existing, title, type, barcode,
    genre: $("fGenre").value.trim(), format: $("fFormat").value.trim(), status: $("fStatus").value,
    cover: $("fCover").value.trim(), year: Number($("fYear").value) || null
  };
  if (obj.cover && !artworkURL(obj.cover) && obj.cover !== existing?.cover) {
    alert("Use a web address starting with https:// for the cover.");
    $("fCover").focus();
    return;
  }
  if (type === "Book") {
    obj.author = $("fAuthor").value.trim();
    obj.kids = $("fKids").checked;
    obj.pages = Number($("fPages").value) || null;
    obj.publisher = $("fPublisher").value.trim();
  }
  if (descriptionsAllowed(obj) && !$("descriptionField").hidden) {
    const description = $("fDescription").value.trim();
    if (existing ? typeof existing.description === "string" || description !== descriptionFor(existing) : Boolean(description)) {
      obj.description = description;
    }
  }
  if (type === "Game") {
    const min = Number($("fMinPlayers").value) || null;
    const max = Number($("fMaxPlayers").value) || null;
    if (min && max && min > max) {
      alert("Minimum players cannot exceed maximum players.");
      return;
    }
    Object.assign(obj, { minPlayers: min, maxPlayers: max, playMinutes: Number($("fPlayMinutes").value) || null, gameMood: $("fGameMood").value });
  }
  if (!existing) {
    obj.id = Math.max(0, ...items.map(item => Number(item.id) || 0)) + 1;
    items.push(obj);
  } else {
    items[items.indexOf(existing)] = obj;
  }
  persist();
  closeDialog("modal");
  if (section(obj) !== tab) switchTab(section(obj));
  else render();
});

$("delete").onclick = () => {
  if (editing == null || !confirm("Delete this item from your catalog?")) return;
  items = items.filter(item => String(item.id) !== String(editing));
  persist();
  closeDialog("modal");
  render();
};

$("random").onclick = () => {
  const list = current();
  if (list.length) showDetails(list[Math.floor(Math.random() * list.length)].id);
};
$("backup").onclick=()=>{const b=new Blob([JSON.stringify(items,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download="Tales_Tables_Screens_Backup.json";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)};

/* No silent mutation of the user's saved Safari catalog: preview and confirm. */
const TITLE_UNDO_KEY="tts_dvd_title_undo_v34";
const TITLE_SAFETY_KEY="tts_dvd_title_before_v34";
function titleCorrections(){
 if(!window.cleanMovieTitle)return [];
 return items.filter(x=>x.type==="Movie").map(x=>({id:x.id,oldTitle:x.title,newTitle:window.cleanMovieTitle(x.title,x.barcode)})).filter(x=>x.newTitle&&x.newTitle!==x.oldTitle);
}
function refreshUndoTitleControl(){
 let exists=false;try{exists=Array.isArray(JSON.parse(localStorage.getItem(TITLE_UNDO_KEY)||"null"))}catch(e){}
 $("undoMovieTitles").hidden=!exists;
}
$("cleanMovieTitles").onclick=()=>{
 if(!window.cleanMovieTitle){alert("Movie title helper has not finished loading. Reload the page and try again.");return}
 const changes=titleCorrections();
 if(!changes.length){alert("No DVD listing titles need cleanup right now.");return}
 const examples=changes.slice(0,5).map(x=>"• "+x.oldTitle+" → "+x.newTitle).join("\n");
 if(!confirm("Clean "+changes.length+" movie title"+(changes.length===1?"":"s")+"?\n\n"+examples+(changes.length>5?"\n…":"")+"\n\nOnly movie title fields will change. Your barcodes, genres, covers, and other entries are preserved. An undo copy will be saved on this device."))return;
 try{
   localStorage.setItem(TITLE_SAFETY_KEY,JSON.stringify(items));
   localStorage.setItem(TITLE_UNDO_KEY,JSON.stringify(changes));
 }catch(err){alert("Cannot save a safety copy in Safari. Export a Backup first, then retry.");return}
 const byId=new Map(changes.map(x=>[String(x.id),x]));
 for(const item of items){const change=byId.get(String(item.id));if(change&&item.title===change.oldTitle)item.title=change.newTitle}
 persist();render();refreshUndoTitleControl();
 alert("Cleaned "+changes.length+" movie titles. You can undo these changes from Tools.");
};
$("undoMovieTitles").onclick=()=>{
 let changes;try{changes=JSON.parse(localStorage.getItem(TITLE_UNDO_KEY)||"null")}catch(e){}
 if(!Array.isArray(changes)||!changes.length){alert("No recent title fixes to undo.");return}
 if(!confirm("Undo the last DVD title cleanup? Only titles that have not been edited since cleanup will be restored."))return;
 let count=0;
 for(const c of changes){const item=items.find(x=>String(x.id)===String(c.id));if(item?.type==="Movie"&&item.title===c.newTitle){item.title=c.oldTitle;count++}}
 persist();localStorage.removeItem(TITLE_UNDO_KEY);render();refreshUndoTitleControl();
 alert("Restored "+count+" previous title"+(count===1?"":"s")+".");
};
refreshUndoTitleControl();
$("restore").onclick=()=>$("restoreFile").click();
$("restoreFile").onchange=async e=>{try{const data=JSON.parse(await e.target.files[0].text());if(!Array.isArray(data))throw Error("not array");if(confirm("Replace the saved catalog on this device with the backup?")){items=data;applyDefaultCoverUpdates(items);persist();render()}}catch(e){alert("Could not open that JSON backup.")}e.target.value=""};
/* Book editions: lookup by exact ISBN and show a review before filling the edit form. */
function validISBN(code){
 const v=String(code||"").replace(/[\s-]/g,"").toUpperCase();
 if(/^\d{13}$/.test(v)){let sum=0;for(let i=0;i<12;i++)sum+=Number(v[i])*(i%2?3:1);return (10-sum%10)%10===Number(v[12])}
 if(/^\d{9}[\dX]$/.test(v)){let sum=0;for(let i=0;i<10;i++)sum+=(10-i)*(v[i]==="X"?10:Number(v[i]));return sum%11===0}
 return false;
}
async function isbnInfo(code){
 const isbn=String(code||"").replace(/[\s-]/g,"").toUpperCase();
 if(!validISBN(isbn))throw Error("Enter a valid 10- or 13-digit ISBN.");
 const d=await fetchJSON("https://openlibrary.org/isbn/"+encodeURIComponent(isbn)+".json");
 if(!d?.title)throw Error("No edition was found for this ISBN.");
 const authors=await Promise.all((d.authors||[]).slice(0,4).map(async a=>{try{const v=await fetchJSON("https://openlibrary.org"+a.key+".json");return v.name||""}catch(e){return ""}}));
 return {barcode:isbn,title:d.title,author:authors.filter(Boolean).join(", "),pages:d.number_of_pages||null,year:Number((d.publish_date||"").match(/\d{4}/)?.[0])||null,publisher:(d.publishers||[]).join(", "),format:d.physical_format||"",cover:d.covers?.[0]?"https://covers.openlibrary.org/b/id/"+d.covers[0]+"-L.jpg?default=false":""};
}
function normTitle(v){return String(v||"").toLowerCase().replace(/[^a-z0-9]/g,"")}
function matchingItems(info,type){const film=type==="Movie",scrub=t=>film&&window.cleanMovieTitle?window.cleanMovieTitle(t):t;return items.filter(x=>x.type===type&&(x.barcode&&x.barcode===info.barcode||info.title&&normTitle(scrub(x.title))===normTitle(scrub(info.title))))}
let editionSearchNumber = 0;

function previewEdition(info) {
  const originalId = editing;
  const originalTitle = $("fTitle").value;
  editionCandidate = info;
  const differs = originalTitle && normTitle(originalTitle) !== normTitle(info.title);
  const fields = [["Author", info.author], ["Publisher", info.publisher], ["Year", info.year], ["Pages", info.pages], ["Format", info.format]];
  const image = artworkURL(info.cover) ? '<img id="editionCover" alt="Edition cover" src="' + esc(info.cover) + '">' : "";
  $("editionPreview").innerHTML = '<div class="edition-preview"><div class="edition-preview-info">' + image +
    '<div><h3>' + esc(info.title) + '</h3><p>ISBN ' + esc(info.barcode) + '</p><dl>' +
    fields.filter(([, value]) => value).map(([label, value]) =>
      '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>').join("") + '</dl></div></div>' +
    (differs ? '<p class="field-message">The ISBN is listed under a different title. Check the edition before applying it.</p>' : "") +
    '<button type="button" id="applyEdition" class="button secondary">Use these edition details</button></div>';
  $("lookupStatus").textContent = "Edition found. Review the match above.";
  $("applyEdition").onclick = () => {
    if (editionCandidate !== info || editing !== originalId || $("fType").value !== "Book") return;
    if (differs && !confirm("This ISBN is listed as “" + info.title + "”. Apply it to “" + originalTitle + "”?")) return;
    const values = {fBarcode: info.barcode, fTitle: info.title, fAuthor: info.author, fPages: info.pages, fYear: info.year,
      fPublisher: info.publisher, fFormat: info.format, fCover: info.cover};
    for (const [id, value] of Object.entries(values)) if (value) $(id).value = value;
    $("editionISBN").value = info.barcode;
    $("editionPreview").replaceChildren();
    editionCandidate = null;
    updateEditorFields();
    $("lookupStatus").textContent = "Edition details filled in. Tap Save item to apply them.";
  };
  const cover = $("editionCover");
  if (cover) cover.onerror = () => { cover.remove(); info.cover = ""; };
}

async function lookupEdition(code) {
  if ($("fType").value !== "Book") return;
  const token = ++editionSearchNumber;
  const originalTitle = $("fTitle").value;
  editionCandidate = null;
  $("editionPreview").replaceChildren();
  $("lookupStatus").textContent = "Checking ISBN edition…";
  const stillEditing = () => token === editionSearchNumber && $("modal").open &&
    $("fType").value === "Book" && $("fTitle").value === originalTitle;
  try {
    const info = await isbnInfo(code);
    if (stillEditing()) previewEdition(info);
  } catch (error) {
    if (stillEditing()) $("lookupStatus").textContent = error.message || "The edition lookup is unavailable.";
  }
}

function applyBookInfo(info) {
  const matches = matchingItems(info, "Book");
  const match = matches.find(item => item.barcode === info.barcode) || (matches.length === 1 ? matches[0] : null);
  $("scanClose").click();
  edit(match?.id ?? null, "Book");
  $("editionTools").open = true;
  $("editionISBN").value = info.barcode;
  previewEdition(info);
  $("editionSummary").focus();
}

$("lookupBook").onclick = () => lookupEdition($("editionISBN").value.trim() || $("fBarcode").value.trim());
$("editionISBN").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    $("lookupBook").click();
  }
});
$("scanEdition").onclick = () => {
  $("scan").click();
  scanEditionMode = true;
  $("scanTitle").textContent = "Scan an ISBN";
  $("scanStatus").textContent = "Scan the ISBN on the book’s back cover.";
  $("scanLookup").textContent = "Compare ISBN";
};
let cameraControls=null,cameraStream=null,scanTimer=null,scanReader=null,scanActive=false,scanSeen={};
function validEAN13(s){if(!/^\d{13}$/.test(s))return false;let sum=0;for(let i=0;i<12;i++)sum+=Number(s[i])*(i%2?3:1);return (10-sum%10)%10===Number(s[12])}
function validUPC(s){if(!/^\d{12}$/.test(s))return false;let sum=0;for(let i=0;i<11;i++)sum+=Number(s[i])*(i%2?1:3);return (10-sum%10)%10===Number(s[11])}
function stopCamera(){scanActive=false;scanSeen={};if(scanTimer){clearInterval(scanTimer);scanTimer=null}try{cameraControls?.stop()}catch(e){}cameraControls=null;try{scanReader?.reset?.()}catch(e){}scanReader=null;if(cameraStream){cameraStream.getTracks().forEach(t=>t.stop());cameraStream=null}const v=$("scanVideo");if(v.srcObject){v.srcObject.getTracks().forEach(t=>t.stop());v.srcObject=null}v.hidden=true}
function scanWantsBook(){return scanEditionMode||(scanIntoItem?$("fType").value==="Book":tab==="books"||tab==="kids")}
function applyBarcodeToEditor(raw){
 let code=String(raw||"").replace(/\D/g,"");
 const isBook=$("fType").value==="Book";
 if(isBook){
  if(!/^97[89]/.test(code)||!validEAN13(code)){$("scanStatus").textContent="This item's barcode must be a valid 13-digit ISBN starting 978 or 979.";return false}
 }else{
  if(code.length===13&&code[0]==="0"&&validEAN13(code))code=code.slice(1);
  if(!validUPC(code)&&!validEAN13(code)){$("scanStatus").textContent="A valid 12-digit UPC or 13-digit EAN is required.";return false}
 }
 const duplicate=items.find(x=>x.barcode&&x.barcode.replace(/\D/g,"").replace(/^0+/,"")===code.replace(/^0+/,"")&&String(x.id)!==String(editing));
 if(duplicate&&!confirm("This code is already on "+duplicate.title+". Use it on the current item too?")){$("scanStatus").textContent="No change made. That barcode is already assigned to "+duplicate.title+".";return false}
 $("fBarcode").value=code;
 $("lookupStatus").textContent=(isBook?"ISBN ":"UPC / EAN ")+code+" filled in. Review this item and tap Save item to keep it.";
 $("scanClose").click();
 return true;
}
function capturedBarcode(raw,format){let code=String(raw||"").replace(/\D/g,"");if(!code||!scanActive)return;const books=scanWantsBook();
if(books){if(!validEAN13(code)||!/^97[89]/.test(code)){$("scanStatus").textContent="Looking for a valid ISBN beginning 978 or 979. Last other reading: "+code;return}}
else{if(code.length===13&&code[0]==="0"&&validEAN13(code))code=code.slice(1);
if(!(validUPC(code)||validEAN13(code))){$("scanStatus").textContent="Detected "+(format||"other barcode")+" ("+code+"), but not a valid UPC. Keep the full main barcode in view.";return}}
$("scanCode").value=code;$("scanCode").blur();stopCamera();if(scanEditionMode){scanEditionMode=false;$("scanClose").click();$("scanLookup").textContent="Look up";$("editionISBN").value=code;lookupEdition(code);return}if(scanIntoItem){applyBarcodeToEditor(code);return}$("scanStatus").textContent=(books?"ISBN":"UPC")+" captured: "+code+". Tap Look up.";try{navigator.vibrate?.(80)}catch(e){}}
$("scan").onclick=()=>{scanIntoItem=false;scanEditionMode=false;$("scanTitle").textContent="Scan a barcode";$("scanLookup").textContent="Look up";$("scanApplyToItem").hidden=true;$("scanLookup").hidden=false;$("scanResult").innerHTML="";$("scanCode").value="";$("scanStatus").textContent="Scan the main barcode or type the number below.";openDialog("scanModal");};
$("scanClose").onclick=()=>{stopCamera();closeDialog("scanModal");scanIntoItem=false;scanEditionMode=false;$("scanLookup").textContent="Look up";$("scanApplyToItem").hidden=true;$("scanLookup").hidden=false};
closeOnEscapeOrBackdrop("scanModal", "scanClose");
$("scanThisBarcode").onclick=()=>{
 $("scan").click();
 scanIntoItem=true;
 $("scanApplyToItem").hidden=false;
 $("scanLookup").hidden=true;
 $("scanStatus").textContent="Scan the barcode for "+($("fTitle").value.trim()||"this item")+". It will fill this item's field without changing its other details.";
};
$("scanApplyToItem").onclick=()=>applyBarcodeToEditor($("scanCode").value);
$("scanCode").addEventListener("keydown", event => {
  if (event.key === "Enter") {
    event.preventDefault();
    $(scanIntoItem ? "scanApplyToItem" : "scanLookup").click();
  }
});
$("cameraStart").onclick=async()=>{const video=$("scanVideo");try{stopCamera();$("scanStatus").textContent="Starting rear camera…";video.hidden=false;scanActive=true;
if("BarcodeDetector" in window){try{const formats=await BarcodeDetector.getSupportedFormats();const wanted=(scanWantsBook()?["ean_13"]:["upc_a","ean_13"]).filter(x=>formats.includes(x));if(wanted.length){const detector=new BarcodeDetector({formats:wanted});cameraStream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1920},height:{ideal:1080}}});video.srcObject=cameraStream;await video.play();let frames=0;scanTimer=setInterval(async()=>{if(!scanActive||video.readyState<2)return;try{const codes=await detector.detect(video);if(codes.length)for(const candidate of codes){capturedBarcode(candidate.rawValue,candidate.format);if(!scanActive)break}else if(++frames===45)$("scanStatus").textContent="Still searching. Move closer, keep the bars horizontal and avoid glare."}catch(e){if(frames++===0)$("scanStatus").textContent="Trying to read barcode…"}},180);$("scanStatus").textContent="Scanning with rear camera… Keep the entire barcode in view.";return}}catch(e){stopCamera();video.hidden=false;scanActive=true}}
const scriptUrl="https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/umd/zxing-browser.min.js";if(!window.ZXingBrowser){const script=document.createElement("script");script.src=scriptUrl;await new Promise((res,rej)=>{script.onload=res;script.onerror=()=>rej(Error("Barcode reader failed to load."));document.head.appendChild(script)})}
const reader=new ZXingBrowser.BrowserMultiFormatReader();
try{if(ZXingBrowser.BarcodeFormat&&("possibleFormats" in reader)){const B=ZXingBrowser.BarcodeFormat;reader.possibleFormats=scanWantsBook()?[B.EAN_13]:[B.UPC_A,B.EAN_13,B.UPC_E]}}catch(e){}
scanReader=reader;let attempts=0;cameraControls=await reader.decodeFromConstraints({audio:false,video:{facingMode:{ideal:"environment"},width:{ideal:1280},height:{ideal:720}}},video,(result,error)=>{if(result){capturedBarcode(result.getText(),String(result.getBarcodeFormat?.()||""));return}if(++attempts===90&&scanActive&&!$("scanStatus").textContent.startsWith("Detected "))$("scanStatus").textContent="Still searching. Move closer until the entire barcode takes up half the camera preview, and avoid glare."});if(scanActive)$("scanStatus").textContent="Scanning with rear camera… Keep the entire barcode in view.";
}catch(e){stopCamera();$("scanStatus").textContent="Camera scanner error: "+(e.message||String(e))+". You can type the barcode below."}};

const VERIFIED_UPCS={"786936790290":{title:"Bolt",format:"DVD",year:2008,genre:"Family / Animation / Adventure"},"786936844856":{title:"Big Hero 6",format:"DVD",year:2014,genre:"Family / Animation / Action"},"025192001420":{title:"Balto",format:"DVD",year:1995,genre:"Family / Animation / Adventure"},"027616865731":{title:"The Princess Bride",format:"DVD",year:1987,genre:"Adventure / Comedy / Fantasy"},"025195018678":{title:"Sixteen Candles",format:"DVD",year:1984,genre:"Comedy / Romance"},"097361178042":{title:"She's the Man",format:"DVD",year:2006,genre:"Comedy / Romance"},"097360512748":{title:"The Prince and Me",format:"DVD",year:2004,genre:"Comedy / Romance"},"786936165142":{title:"Lilo & Stitch",format:"DVD",year:2002,genre:"Family / Animation"},"085391120926":{title:"Happy Feet",format:"DVD",year:2006,genre:"Family / Animation"},"191329253328":{title:"Shrek: 6-Movie Collection",format:"DVD",genre:"Family / Animation"},"786936838961":{title:"Frozen",format:"DVD",year:2013,genre:"Family / Animation"},"717951008435":{title:"A Goofy Movie",format:"DVD",year:1995,genre:"Family / Animation"},"786936856279":{title:"Coco",format:"DVD",year:2017,genre:"Family / Animation"},"191329104989":{title:"How to Train Your Dragon: 3-Movie Collection",format:"DVD",year:2019,genre:"Family / Animation"},"191329015407":{title:"An American Tail: 4-Movie Complete Collection",format:"DVD"},"786936215595":{title:"Finding Nemo",format:"DVD",year:2003},"786936786675":{title:"Up",format:"DVD",year:2009},"883929786145":{title:"Bluey: Seasons 1 & 2",format:"DVD",year:2022,genre:"TV / Series",cover:"https://i5.walmartimages.com/seo/Bluey-Season-1-2-DVD_15611014-1335-4c4b-9f3a-e8d12d73be37.ec600ad333c001f808ad92bcaa9a40fe.jpeg?odnBg=FFFFFF&odnHeight=576&odnWidth=576"},"043396650503":{title:"Toy Story 5",format:"Blu-ray + DVD + Digital",year:2026,genre:"Family / Animation",cover:"https://assets.murphysmultiverse.com/uploads/2026/08/10386958_3D-Pack-Shot_TOY-STORY-5_BD-1982x2048.jpg"}};
function normalizeGTIN(v){return String(v||"").replace(/\D/g,"").replace(/^0+/,"")}
async function movieUPCInfo(code){
 const d=await fetchJSON("https://upcmdb.com/api/v1/lookup/"+encodeURIComponent(code));
 if(d.status!=="success"||!d.data?.title)return null;
 const m=d.data;
 return {barcode:code,title:String(m.title),format:String(m.format||"DVD"),year:Number(m.year)||null,genre:String(m.genre||""),cover:/^https:\/\//.test(m.poster||m.image||"")?(m.poster||m.image):"",source:"UPCMDB (movie UPC catalog)"}
}
async function upcInfo(code){
 const known=VERIFIED_UPCS[code];
 if(known)return {barcode:code,...known,source:"Verified from your DVD photo"};
 if(tab==="movies"){try{const match=await movieUPCInfo(code);if(match)return match}catch(e){}}
 try{const ean=code.length===12?"0"+code:code;const d=await fetchJSON("https://myproduct.guru/lookup/"+ean+".json");const p=d.product||d.item||d;const foundCode=String(p.ean||p.gtin||p.barcode||d.ean||d.barcode||"").replace(/\D/g,"").replace(/^0+/,"");const title=p.name||p.title||p.product_name||"";if(foundCode===code.replace(/^0+/,"")&&typeof title==="string"&&title.trim().length>4)return {barcode:code,title:title.trim(),cover:/^https:\/\//.test(p.image_url||p.image||"")?(p.image_url||p.image):"",format:tab==="movies"?"DVD":"",source:"ProductGuru (verify product and edition)"}}catch(e){}
 try{const d=await fetchJSON("https://api.upcitemdb.com/prod/trial/lookup?upc="+encodeURIComponent(code));
 const products=(d.items||[]).filter(x=>[x.upc,x.ean,x.gtin].filter(Boolean).some(v=>normalizeGTIN(v)===normalizeGTIN(code)));
 const p=products.find(x=>x.title);if(p)return {barcode:code,title:p.title,cover:(p.images||[]).find(x=>/^https:\/\//.test(x))||"",format:tab==="movies"?"DVD":"",source:"UPCitemdb"};
 return null;
 }catch(e){if(tab==="movies"){try{const d=await fetchJSON("https://itunes.apple.com/lookup?upc="+encodeURIComponent(code)+"&country=US");const p=(d.results||[]).find(x=>x.wrapperType==="track"&&x.kind==="feature-movie"&&x.trackName);if(p)return {barcode:code,title:p.trackName,cover:p.artworkUrl100||"",format:"DVD",source:"Apple lookup (check edition)"};}catch(err){}}
 throw Error("Online UPC databases unavailable from this browser");
 }
}
function applyUPCInfo(info){const kind=tab==="games"?"Game":"Movie",found=matchingItems(info,kind),target=found.length===1?found[0]:null;if(target){if(!confirm("Update the existing entry for "+target.title+" with this scanned UPC?"))return;edit(target.id)}else edit(null,kind);$("fType").value=kind;$("fBarcode").value=info.barcode;if(info.title&&(!target||!target.title))$("fTitle").value=kind==="Movie"&&window.cleanMovieTitle?window.cleanMovieTitle(info.title):info.title;if(info.format)$("fFormat").value=info.format;if(info.year)$("fYear").value=info.year;if(info.genre&&!$("fGenre").value)$("fGenre").value=info.genre;if(info.cover&&!$("fCover").value)$("fCover").value=info.cover;$("scanClose").click();stopCamera()}
function showManualUPC(code,message,scanType=tab==="games"?"Game":"Movie"){const out=$("scanResult"),kind=scanType;
out.innerHTML='<p>'+esc(message)+'</p><label style="display:block;margin:10px 0">Already own this '+(kind==="Game"?"game":kind==="Book"?"book":"movie")+'? Search your collection:<input type="search" id="scanMatchSearch" placeholder="Type part of the title" style="display:block;width:100%;padding:10px;margin:5px 0;border:1px solid #b8a083;border-radius:6px"></label><div id="scanMatchResults"></div><p><a target="_blank" rel="noopener" href="https://www.google.com/search?q='+encodeURIComponent(code+" UPC movie DVD board game")+'">Search this barcode on Google</a></p><button id="scanManual">Add new item manually</button>';
const matchResults=$("scanMatchResults");
function showMatches(){const q=$("scanMatchSearch").value.trim().toLowerCase();matchResults.innerHTML="";if(q.length<2)return;const matches=items.filter(x=>x.type===kind&&x.title.toLowerCase().includes(q)).slice(0,9);if(!matches.length){matchResults.textContent="No matching title in your collection.";return}for(const x of matches){const b=document.createElement("button");b.type="button";b.textContent="Use existing: "+x.title;b.style="display:block;margin:5px 0;width:100%;text-align:left";b.onclick=()=>{$("scanClose").click();edit(x.id);$("fBarcode").value=code;$("lookupStatus").textContent="Scanned UPC filled in. Check the title and tap Save item.";};matchResults.appendChild(b)}}$("scanMatchSearch").addEventListener("input",showMatches);
$("scanManual").onclick=()=>{$("scanClose").click();edit(null,scanType);$("fBarcode").value=code};}
$("scanLookup").onclick=async()=>{if(scanEditionMode){const code=$("scanCode").value.trim();scanEditionMode=false;stopCamera();$("scanClose").click();$("scanLookup").textContent="Look up";$("editionISBN").value=code;lookupEdition(code);return}if(scanIntoItem){applyBarcodeToEditor($("scanCode").value);return}const raw=$("scanCode").value.trim().replace(/[\s-]/g,"").toUpperCase(), code=scanWantsBook()&&validISBN(raw)?raw:raw.replace(/\D/g,""),out=$("scanResult");out.innerHTML="";if(!/^\d{8,14}$/.test(code)&&!validISBN(code)){out.textContent="Enter a valid barcode number.";return}stopCamera();$("scanStatus").textContent="Looking up "+code+"…";const existing=items.filter(x=>x.barcode===code);
const photoMatch=VERIFIED_UPCS[code];
const byVerifiedTitle=!existing.length&&photoMatch?items.find(x=>x.type===(tab==="games"?"Game":"Movie")&&normTitle(x.title)===normTitle(photoMatch.title)):null;
if(existing.length||byVerifiedTitle){
 const x=existing[0]||byVerifiedTitle;
 out.innerHTML='<p><strong>Found in your collection:</strong> '+esc(x.title)+'. No duplicate needed.</p><p style="font-size:13px">Barcode '+esc(code)+(photoMatch?' matches a verified DVD release.':' is already saved on this entry.')+'</p><button id="openScannedItem">Open existing entry</button>';
 $("openScannedItem").onclick=()=>{$("scanClose").click();edit(x.id);if(!$("fBarcode").value)$("fBarcode").value=code;if(photoMatch?.genre&&!$("fGenre").value)$("fGenre").value=photoMatch.genre;if(photoMatch?.year&&!$("fYear").value)$("fYear").value=photoMatch.year;$("lookupStatus").textContent="UPC confirmed. Review and save to keep the barcode."};$("scanStatus").textContent="Found existing item without needing online lookup.";return
}if((scanWantsBook()&&validISBN(code))||/^97[89]\d{10}$/.test(code)){try{const info=await isbnInfo(code);const match=matchingItems(info,"Book");out.innerHTML='<p>'+esc(info.title)+' · '+esc(info.author)+' · '+esc(info.pages||"Unknown")+' pages</p><button id="scanApply">Review this edition</button>'+(match.length?'<p>Existing title: '+esc(match.map(x=>x.title).join(", "))+'</p>':"");$("scanApply").onclick=()=>applyBookInfo(info);$("scanStatus").textContent="Exact ISBN record found; review before saving.";return}catch(e){$("scanStatus").textContent="No ISBN edition record found.";showManualUPC(code,"Could not find that ISBN edition. Enter the details manually.","Book");return}}
try{const info=await upcInfo(code);if(info){const matches=matchingItems(info,tab==="games"?"Game":"Movie");out.innerHTML='<p>Possible product: '+esc(info.title)+'</p><p style="font-size:13px">Source: '+esc(info.source)+'. Confirm that the title and edition match your copy.</p><button id="scanApplyUPC">Review and save</button>'+(matches.length?'<p>Already in your collection by title: '+esc(matches.map(x=>x.title).join(", "))+'</p>':"");$("scanApplyUPC").onclick=()=>applyUPCInfo(info);$("scanStatus").textContent="Product match found. Review before saving.";return}showManualUPC(code,"No product match found for this UPC. You can search by number or add it manually.");$("scanStatus").textContent="No matching product record."}catch(e){showManualUPC(code,"The UPC lookup service could not be reached from this browser or is rate-limited. The scanner captured the number correctly.");$("scanStatus").textContent="UPC database unavailable; barcode read successfully."}};

const linkedSection = location.hash.slice(1);
if (Object.hasOwn(sections, linkedSection) && linkedSection !== tab) switchTab(linkedSection);
else render();
window.addEventListener("hashchange", () => {
  const sectionName = location.hash.slice(1);
  if (Object.hasOwn(sections, sectionName)) switchTab(sectionName);
});

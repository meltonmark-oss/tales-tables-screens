/* Game Night Builder — catalog-only recommendations. Durations are editable estimates, not complexity scores. */
(function(){
"use strict";
const GUIDE=[
["Exploding Kittens",2,5,15,"competitive"],["Zombie Kittens",2,5,15,"competitive"],["Exploding Kittens: Good vs Evil",2,5,15,"competitive"],
["Coup",2,6,15,"competitive"],["The Goonies: Never Say Die",2,5,50,"cooperative"],["Tesseract",1,4,30,"cooperative"],
["The Lord of the Rings: The Card Game",1,4,60,"cooperative"],["Pandemic",2,4,45,"cooperative"],["Pandemic: Rapid Response",2,4,20,"cooperative"],
["Pandemic Legacy: Season 1",2,4,60,"cooperative"],["T.I.M.E Stories",2,4,90,"cooperative"],["Fuse",1,5,10,"cooperative"],
["Forbidden Desert",2,5,45,"cooperative"],["Commissioned",2,6,60,"cooperative"],["King of Tokyo",2,6,30,"competitive"],
["Guesstures",4,12,25,"party"],["Clank! A Deck-Building Adventure",2,4,60,"competitive"],
["Dominion: Big Box",2,4,40,"competitive"],["Splendor",2,4,30,"competitive"],["Splendor: Marvel",2,4,30,"competitive"],
["Ticket to Ride",2,5,60,"competitive"],["Ticket to Ride: Europe",2,5,60,"competitive"],
["Dixit",3,6,30,"party"],["Concept",4,12,40,"party"],["Deception: Murder in Hong Kong",4,12,20,"party"],
["Slapzi",2,8,15,"party"],["Incohearent",2,12,20,"party"],["You Can't Say 'Umm'",2,8,20,"party"],
["Codenames",4,8,20,"party"],["Scattergories",2,6,30,"party"],["Sounds Fishy",4,10,20,"party"],
["Throw Throw Burrito",2,6,15,"party"],["The Lord of the Rings: Journeys in Middle-earth",1,5,70,"cooperative"],
["UNO",2,10,20,"family"],["Trivial Pursuit: For All Groups (partial box title)",2,8,60,"party"],
["Mancala",2,2,15,"competitive"],["Risk: The Lord of the Rings Trilogy Edition",2,4,120,"competitive"],
["Guess Who?",2,2,15,"family"],["Risk",2,6,120,"competitive"],["Monopoly",2,6,100,"family"],
["Clue",2,6,45,"competitive"],["Payday",2,6,45,"family"],["Boggle",2,8,15,"party"],
["Farkle",2,8,20,"family"],["Qwirkle",2,4,40,"competitive"],["Guess Who? Card Game",2,2,15,"family"],
["3 Up 3 Down",2,6,20,"family"],["Old Maid",2,6,15,"family"],["Crazy Eights",2,7,15,"family"],
["Family Feud Strikeout Card Game",2,8,20,"party"],["Phase 10",2,6,45,"family"],
["Hanabi",2,5,25,"cooperative"],["Onitama",2,2,15,"competitive"],
["Word Teasers: Riddles",2,8,20,"party"],["The Fox in the Forest",2,2,30,"competitive"],
["Codenames: Duet",2,4,20,"cooperative"],["Splendor Duel",2,2,30,"competitive"],
["Mad Gab",2,12,30,"party"],["Battleship",2,2,30,"competitive"],["Fog of Love",2,2,90,"competitive"],
["Double Mexican Train Dominoes",2,8,45,"family"],["Bluey Memory Game",2,6,15,"family"],
["Bluey Keepy Uppy Game",2,4,15,"family"],["Sequence",2,12,30,"competitive"],
["Candy Land",2,4,20,"family"],["Don’t Wake Daddy!",2,4,15,"family"],
["Sequence for Kids",2,4,15,"family"],["Memory Match",2,6,15,"family"],
["Go Fish",2,6,15,"family"],["Scavenger Hunt: Around the House Edition",2,6,20,"family"],
["Tenzi",2,6,10,"party"],["Unlock! Secret Adventures",2,6,60,"cooperative"],
["Unlock! Epic Adventures",2,6,60,"cooperative"],
["Sherlock Holmes Consulting Detective: Carlton House & Queen’s Park",1,8,90,"cooperative"],
["Sherlock Holmes Consulting Detective: Jack the Ripper & West End Adventures",1,8,90,"cooperative"]
];
const guideMap=new Map(GUIDE.map(([title,minPlayers,maxPlayers,playMinutes,gameMood])=>[title.toLocaleLowerCase(),{minPlayers,maxPlayers,playMinutes,gameMood}]));
const $id=id=>document.getElementById(id);
const escapeHtml=value=>String(value??"").replace(/[&<>"']/g,x=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[x]));
const gameItems=()=>typeof items==="undefined"?[]:items.filter(x=>x.type==="Game");
const numberOrEmpty=v=>Number.isFinite(Number(v))&&String(v??"").trim()!==""&&Number(v)>0?Number(v):null;
function getMeta(item){
 const base=guideMap.get(String(item.title).toLocaleLowerCase())||{};
 return {
 minPlayers:numberOrEmpty(item.minPlayers)??base.minPlayers??null,
 maxPlayers:numberOrEmpty(item.maxPlayers)??base.maxPlayers??null,
 playMinutes:numberOrEmpty(item.playMinutes)??base.playMinutes??null,
 gameMood:item.gameMood||base.gameMood||""
 };
}
window.gameNightMeta=getMeta;
function formatTime(n){return n>=60?(n%60?Math.floor(n/60)+" hr "+n%60+" min":n/60+" hr"):n+" min"}
function availableGames(players,budget,mood){
 return gameItems().filter(x=>!/lent|loan|borrow|out/i.test(x.status||"")).map(x=>({...getMeta(x),id:x.id,title:x.title}))
  .filter(g=>g.minPlayers&&g.maxPlayers&&g.playMinutes&&g.minPlayers<=players&&players<=g.maxPlayers&&g.playMinutes<=budget&&(mood==="any"||g.gameMood===mood));
}
let lastPlan=[];
function buildPlan(){
 const players=Number($id("gnPlayers").value),budget=Number($id("gnTime").value),mood=$id("gnMood").value;
 const eligible=availableGames(players,budget,mood),output=$id("gnResults");
 if(!eligible.length){
 output.innerHTML='<div class="gn-alert">I don’t have a matching player-count and time estimate for that combination yet. Try a different time or style, or open a game to add its player range and average length.</div>';
 return;
 }
 const maxCount=budget<=45?1:budget<=100?2:3;
 const planned=[],used=new Set(),setupTime=5;
 let remaining=budget;
 for(let slot=0;slot<maxCount;slot++){
  const options=eligible.filter(g=>!used.has(String(g.id))&&g.playMinutes+((slot>0)?setupTime:0)<=remaining);
  if(!options.length)break;
  const desired=slot===0?(maxCount===1?Math.max(15,budget*.75):Math.max(15,budget/maxCount)):remaining/(maxCount-slot);
  const scored=options.map(g=>({g,rank:Math.abs(g.playMinutes-desired)+Math.random()*20})).sort((a,b)=>a.rank-b.rank);
  const pick=scored[Math.floor(Math.random()*Math.min(5,scored.length))].g;
  planned.push(pick);used.add(String(pick.id));remaining-=pick.playMinutes+(slot>0?setupTime:0);
 }
 if(!planned.length){output.innerHTML='<div class="gn-alert">No games fit the selected time window.</div>';return}
 lastPlan=planned;
 const play=planned.reduce((sum,g)=>sum+g.playMinutes,0),breaks=Math.max(0,planned.length-1)*5;
 const alternatives=eligible.filter(g=>!used.has(String(g.id))).sort((a,b)=>a.playMinutes-b.playMinutes).slice(0,5);
 const cards=planned.map((g,i)=>'<article class="gn-game"><div class="gn-count">'+(i===0?'Start with':'Then play')+' · '+(i+1)+'</div><div class="gn-title">'+escapeHtml(g.title)+'</div><p class="gn-detail">'+g.minPlayers+'–'+g.maxPlayers+' players · about '+formatTime(g.playMinutes)+'<br>'+labelMood(g.gameMood)+'</p><button type="button" data-game-id="'+escapeHtml(g.id)+'">View game details</button></article>').join("");
 output.innerHTML='<div class="gn-plan-head"><h4>Your game-night lineup</h4><button type="button" id="gnShuffle" class="gn-button">🎲 Shuffle picks</button></div><div class="gn-game-list">'+cards+'</div><p class="gn-alts">Estimated play: '+formatTime(play)+(breaks?' + '+breaks+' min for switching games':'')+' · '+(remaining>0?formatTime(remaining)+' left in your window':'fills your time window')+'. Times vary by group.</p>'+(alternatives.length?'<p class="gn-alts">Other matches: '+alternatives.map(g=>escapeHtml(g.title)).join(' · ')+'</p>':'');
}
function labelMood(v){return {cooperative:"Cooperative",competitive:"Competitive",party:"Party / group",family:"Family / relaxed"}[v]||"Any style"}
window.renderGameNight=function(){
 const section=$id("gameNight");if(!section)return;
 section.hidden=typeof tab==="undefined"||tab!=="games";
 if(!section.hidden){const eligible=gameItems().filter(g=>{const m=getMeta(g);return m.minPlayers&&m.maxPlayers&&m.playMinutes}).length;
 $id("gnCoverage").textContent="Built from your own shelf: "+eligible+" games have player and time estimates. You can edit these in each game’s details.";}
};
function init(){
 const section=$id("gameNight");if(!section)return;
 $id("gnBuild").addEventListener("click",buildPlan);
 $id("gnResults").addEventListener("click",event=>{
 const editGame=event.target.closest("[data-game-id]");
 if(editGame&&typeof edit==="function"){edit(editGame.dataset.gameId);return}
 if(event.target.closest("#gnShuffle"))buildPlan();
 });
 window.renderGameNight();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();

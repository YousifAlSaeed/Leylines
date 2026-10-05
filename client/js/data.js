'use strict';
/* =====================================================================
   DATA
   ===================================================================== */
const ELEM={fire:'🔥',ice:'❄️',thunder:'⚡',earth:'⛰️',poison:'☠️',wind:'🌪️',water:'💧',holy:'✨'};
const ELEM_KEYS=Object.keys(ELEM);
// name, art, level, [top,right,bottom,left], element
const CARD_DATA=[
['Mossling','🐸',1,[1,4,2,5],''],
['Cinder Rat','🐀',1,[5,1,3,3],'fire'],
['Bog Newt','🦎',1,[2,3,5,1],'water'],
['Thornbeetle','🐞',1,[6,1,1,4],''],
['Dusk Moth','🦋',1,[2,5,3,2],'wind'],
['Sporecap','🍄',1,[3,2,4,3],'poison'],
['Candlewisp','🕯️',1,[1,3,4,4],'holy'],
['Frostpup','🐺',2,[5,3,1,6],'ice'],
['Snapjaw','🐊',2,[6,2,5,2],'water'],
['Hornet Swarm','🐝',2,[3,6,2,4],'poison'],
['Ember Sprite','🧚',2,[2,3,6,4],'fire'],
['Cliff Raptor','🐦',2,[6,5,1,3],'wind'],
['Mudcrawler','🐛',2,[4,2,6,3],'earth'],
['Rust Automaton','🤖',2,[5,4,3,3],''],
['Coral Serpent','🐍',3,[3,6,5,3],'water'],
['Volt Hare','🐇',3,[6,3,2,6],'thunder'],
['Grave Walker','🧟',3,[6,4,5,2],'poison'],
['Ashen Hound','🐕',3,[5,6,2,5],'fire'],
['Glacier Owl','🦉',3,[3,5,6,4],'ice'],
['Bramble Ent','🌳',3,[7,2,5,3],'earth'],
['Mirror Mask','🎭',3,[4,4,4,6],''],
['Night Bat','🦇',4,[7,5,2,5],'wind'],
['Iron Crab','🦀',4,[3,7,6,3],'water'],
['Venom Widow','🕷️',4,[6,3,7,3],'poison'],
['Magma Tortoise','🐢',4,[7,6,1,6],'fire'],
['Snow Wraith','👻',4,[4,7,3,6],'ice'],
['Lantern Monk','🏮',4,[5,5,5,5],'holy'],
['Dune Scorpion','🦂',4,[7,1,7,4],'earth'],
['Thunder Ox','🐂',5,[7,3,6,5],'thunder'],
['Shadow Lynx','🐆',5,[5,7,3,6],''],
['Hex Witch','🧙',5,[6,6,3,7],'poison'],
['Tidecaller','🧜',5,[3,5,7,7],'water'],
['Cinder Lion','🦁',5,[7,7,2,5],'fire'],
['Crystal Stag','🦌',5,[2,6,7,6],'ice'],
['Gale Harpy','🦅',5,[8,3,6,4],'wind'],
['Obsidian Sentinel','🗿',6,[8,4,8,3],'earth'],
['Plague Alchemist','🧪',6,[5,8,3,8],'poison'],
['Aurora Fox','🦊',6,[7,6,7,4],'holy'],
['Clockwork Titan','⚙️',6,[4,8,6,5],''],
['Deep Kraken','🐙',7,[8,5,8,4],'water'],
['Sun Phoenix','☀️',7,[7,8,3,8],'fire'],
['Stormbringer','⛈️',7,[8,8,5,4],'thunder'],
['Frostwyrm','🐉',7,[4,8,8,6],'ice'],
['Bone Monarch','💀',8,[9,6,4,8],'poison'],
['Elder Oak','🌲',8,[6,9,8,5],'earth'],
['Seraph Warden','👼',8,[8,5,9,6],'holy'],
['Tempest Roc','🦜',8,[9,8,2,8],'wind'],
['Abyss Leviathan','🐋',9,[9,6,9,5],'water'],
['Stormfang Tiger','🐯',9,[6,9,5,9],'thunder'],
['Ashen Dragon','🐲',9,[9,9,7,5],'fire'],
['Glass Chimera','🦄',9,[5,8,9,8],''],
['Astra Starborn','🌟',10,[10,7,4,9],'holy'],
['Vael the Wanderer','🗡️',10,[4,10,9,7],''],
['Mira Frostheart','💎',10,[9,7,10,4],'ice'],
['King Oryn','👑',10,[7,9,4,10],'']
];
const CARDS=CARD_DATA.map((c,i)=>({id:i,name:c[0],art:c[1],lv:c[2],rar:Math.ceil(c[2]/2),s:c[3],e:c[4]||null,sum:c[3].reduce((a,b)=>a+b,0)}));
// players see rarity, not level: levels 1–2 are 1★, 3–4 are 2★ … 9–10 are 5★ (the AI still balances on level)
const RARITY=['Common','Uncommon','Rare','Epic','Legendary'];
const rarName=r=>`${r}★ ${RARITY[r-1]}`;
// deck limits shown next to the rarity headings (the rules live in rarBlock)
const RAR_CAP={4:'2 per deck, counting 5★',5:'1 per deck'};
const RULES=[
 ['open','Open','Both hands are played face up.'],
 ['threeOpen','Three open','3 random cards in each hand are face up for both players. The other 2 stay hidden.'],
 ['same','Same','When two or more sides of the placed card equal the touching sides of adjacent cards, those enemy cards flip.'],
 ['sameWall','Same wall','The board edge counts as an X (10) for Same.'],
 ['plus','Plus','When two or more touching pairs add up to the same total, those enemy cards flip.'],
 ['combo','Combo','Cards flipped by Same or Plus then flip their weaker enemy neighbours, chaining on.'],
 ['elemental','Elemental','Some squares carry an element. A matching card gets +1 on every side; any other card gets −1.'],
 ['reverse','Reverse','Lower numbers win: a 1 beats a 2, and X (10) is the weakest. Same and Plus work as usual.'],
 ['suddenDeath','Sudden death','A draw restarts the game; each player keeps the cards they owned at the end (up to 5 extra rounds).'],
 ['random','Random','Your 5 cards are dealt at random from your collection.'],
 ['chaos','Chaos','Each turn the game picks a random card from your hand, and you must play it. You only choose the square.'],
 ['sweep','Sweep','Win owning all 9 squares and you take all 5 of the loser\'s cards, whatever the trade rule.']
];
// Sweep only means something when cards change hands (setup.js, match.js)
const sweepOn=(R,trade)=>!!R.sweep&&trade!=='none';
// the rules a match is really played with: Sweep needs a trade rule, and Open already shows what Three open would
const rulesOn=(R,trade)=>RULES.filter(([k])=>R[k]&&(k!=='sweep'||sweepOn(R,trade))&&(k!=='threeOpen'||!R.open));
// turn timer: 0 = off, otherwise 10–90 seconds in steps of 5 (older saves stored true/false)
const TIMER_MAX=90;
function timerSec(v){if(v===true)return 45;const n=Math.round(+v/5)*5;return n>=10?Math.min(TIMER_MAX,n):0}
const timerWarn=t=>Math.min(20,Math.round(t*.45)),timerCrit=t=>Math.min(10,Math.round(t*.22));
function timerDesc(t){return t?`Each turn has a ${t}-second limit. The clock turns orange at ${timerWarn(t)} seconds and red at ${timerCrit(t)}. When time runs out, a random card is played to a random empty square.`:'No time limit. Take as long as you like.'}
const RULE_SHORT={open:'Both hands are face up',threeOpen:'3 cards of each hand are face up',reverse:'Lower numbers win',sweep:'A full board takes all 5 cards',same:'Matching sides flip cards',sameWall:'The board edge counts as X for Same',plus:'Equal sums flip cards',
  combo:'Flipped cards keep flipping',elemental:'Squares boost or weaken cards',suddenDeath:'A draw replays the match',random:'Your 5 cards are dealt for you',chaos:'You must play a random card each turn'};
// the tutorial (tutorial.js): one move per lesson. board: the CPU's cards [square, card id]; your hand, with hand[pick]
// the card to play on square `cell`. The coach says intro, then place once the card is picked, then after.
// Same and Plus use different numbers on each side (8 = 8 and 6 = 6, 2 + 3 and 1 + 4), so nobody thinks every side must match.
const TUT_PACK='arcane';
const TUT=[
 {name:'Capture',rules:{},board:[[4,20]],hand:[0,22,13],pick:1,cell:3,
  intro:'Every card has 4 numbers: top, right, bottom, left. Tap <b>Iron Crab</b>.',
  place:'Now tap the glowing square, <b>left</b> of their card.',
  after:'Your <b>7</b> beat their <b>6</b>, so their card is yours now!'},
 {name:'Same',rules:{same:true},board:[[1,35],[3,9]],hand:[3,45,7],pick:1,cell:4,
  intro:'New rule: <b>Same</b>. Tap <b>Seraph Warden</b>. Look at its top <b>8</b> and left <b>6</b>.',
  place:'Put it in the <b>middle</b>. Its 8 meets an 8, and its 6 meets a 6.',
  after:'8 = 8 and 6 = 6. Two matches, so <b>both</b> flipped: <b>Same!</b>'},
 {name:'Plus',rules:{plus:true},board:[[1,1],[3,0]],hand:[13,2,6],pick:1,cell:4,
  intro:'New rule: <b>Plus</b>. Tap <b>Bog Newt</b>. Its top is 2 and its left is 1. Tiny!',
  place:'Put it in the <b>middle</b>. This time, add up each pair of touching numbers.',
  after:'Different numbers, <b>same total</b> (5 and 5), so both flipped: <b>Plus!</b>'},
 {name:'Combo',rules:{same:true,combo:true},board:[[0,0],[1,35],[2,11],[3,9]],hand:[5,45,12],pick:1,cell:4,
  intro:'Last one: <b>Combo</b>. Tap <b>Seraph Warden</b> again.',
  place:'Put it in the <b>middle</b>, then watch what the flipped cards do.',
  after:'Same flipped 2. Then <b>those</b> flipped 2 more. <b>4 cards in one move!</b>'}
];
const TRADES=[['none','None','Friendly match. No cards change hands.'],['one','One','The winner takes 1 card of their choice from the loser.'],['diff','Diff','The winner takes as many cards as the score difference (max 5), picked only from the loser\'s cards they flipped.'],['all','All','The winner takes all 5 of the loser\'s cards.']];
// Sweep was a trade rule before 0.18.0; now it's a rule card that works on top of one (save.js moves old saves over)
const DIFFS=[['easy','Easy'],['normal','Normal'],['hard','Hard']];
// best-of series: [matches, label, description]; whoever went first in one match goes second in the next
const SERIES=[[1,'Single','One match decides it.'],
 [3,'Best of 3','Up to 3 matches. Most wins takes the series.'],
 [5,'Best of 5','Up to 5 matches. Most wins takes the series.']];
const boOf=v=>SERIES.some(s=>s[0]===v)?v:1;

// player levels (profile.js): the total XP to reach level n is 0, 100, 300, 600…
const lvlXp=n=>50*n*(n-1);
function levelOf(xp){let n=1;while(lvlXp(n+1)<=xp)n++;return n}
// card packs (packs.js): odds = % chance of 1★…5★ for each card; the last card is at least min★
const PACKS={
  spark:{name:'Spark',n:3,odds:[60,28,10,1.8,.2],min:1},
  arcane:{name:'Arcane',n:4,odds:[35,35,22,7,1],min:2},
  ley:{name:'Leyline',n:5,odds:[15,30,35,16,4],min:3},
  mythic:{name:'Mythic',n:5,odds:[0,20,40,30,10],min:4},
};
// every level up gives one pack, on a road that repeats every 10 levels: a Leyline at levels ending in 5,
// a Mythic at levels ending in 0 from level 20 (level 10 is a Leyline too), both milestones whose last card
// is at least 4★, and 4 small packs between them: Spark, or Arcane from level 21
const smallPack=lv=>lv>20?'arcane':'spark';
const packForLevel=lv=>lv%10===0&&lv>=20?'mythic':lv%5===0?'ley':smallPack(lv);
const PACK_LEVELS=[['spark','to Lv 20 · daily'],['arcane','from Lv 21'],['ley','Lv 5, 10, 15, 25…'],['mythic','Lv 20, 30, 40…']];
// the 5★ guarantee: every pack opened adds points by tier, and the pack that reaches PITY ends in a 5★.
// Any 5★ starts it over. Cheap packs add little, so a pile of Sparks isn't a cheap 5★.
const PITY=50;
const PITY_PTS={spark:1,arcane:3,ley:5,mythic:10};
const pitySure=t=>SAVE.pity+PITY_PTS[t]>=PITY;
const pityPts=()=>Object.entries(PITY_PTS).map(([t,n])=>`${PACKS[t].name} +${n}`).join(' · ');

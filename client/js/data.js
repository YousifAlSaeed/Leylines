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
 ['same','Same','When two or more sides of the placed card equal the touching sides of adjacent cards, those enemy cards flip.'],
 ['sameWall','Same wall','The board edge counts as an X (10) for Same.'],
 ['plus','Plus','When two or more touching pairs add up to the same total, those enemy cards flip.'],
 ['combo','Combo','Cards flipped by Same or Plus then flip their weaker enemy neighbours, chaining on.'],
 ['elemental','Elemental','Some squares carry an element. A matching card gets +1 on every side; any other card gets −1.'],
 ['suddenDeath','Sudden death','A draw restarts the game; each player keeps the cards they owned at the end (up to 5 extra rounds).'],
 ['random','Random','Your 5 cards are dealt at random from your collection.'],
 ['chaos','Chaos','Each turn the game picks a random card from your hand, and you must play it. You only choose the square.']
];
// turn timer: 0 = off, otherwise 10–90 seconds in steps of 5 (older saves stored true/false)
const TIMER_MAX=90;
function timerSec(v){if(v===true)return 45;const n=Math.round(+v/5)*5;return n>=10?Math.min(TIMER_MAX,n):0}
const timerWarn=t=>Math.min(20,Math.round(t*.45)),timerCrit=t=>Math.min(10,Math.round(t*.22));
function timerDesc(t){return t?`Each turn has a ${t}-second limit. The clock turns orange at ${timerWarn(t)} seconds and red at ${timerCrit(t)}. When time runs out, a random card is played to a random empty square.`:'No time limit. Take as long as you like.'}
const RULE_SHORT={open:'Both hands are face up',same:'Matching sides flip cards',sameWall:'The board edge counts as X for Same',plus:'Equal sums flip cards',
  combo:'Flipped cards keep flipping',elemental:'Squares boost or weaken cards',suddenDeath:'A draw replays the match',random:'Your 5 cards are dealt for you',chaos:'You must play a random card each turn'};
const TRADES=[['none','None','Friendly match. No cards change hands.'],['one','One','The winner takes 1 card of their choice from the loser.'],['diff','Diff','The winner takes as many cards as the score difference (max 5).'],['all','All','The winner takes all 5 of the loser\'s cards.'],['sweep','Sweep','Win with every square on the board to take all 5 of the loser\'s cards. Any other win trades nothing.']];
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
// every level up gives one pack; every 5th level is a milestone whose last card is at least 4★
const packForLevel=lv=>lv>=15?'mythic':lv>=10?'ley':lv>=5?'arcane':'spark';
const PACK_LEVELS=[['spark','Lv 2–4 · daily'],['arcane','Lv 5–9'],['ley','Lv 10–14'],['mythic','Lv 15+']];
const PITY=10; // this many packs in a row without a 5★ makes the next one end in a 5★

// Generates a clean multi-page "Summer Camp Games" PDF (no deps, base-14 Helvetica, ASCII text).
const fs = require('fs');
const path = require('path');

const SECTIONS = [
  { title: 'Quick-Launch - No Setup Needed', color: [0.96,0.78,0.27], items: [
    ['Caught Peekin\'','8-30 players · 5-10 min · Any space',"Everyone stands in a circle, heads down, eyes closed. On 'Go!' look up and lock eyes with one person. If you make eye contact with someone who is also looking at you, you're both out. No talking, no pointing. The group shrinks until the last two stare each other down."],
    ['B\'gawk!','8-30 players · 10-15 min · Any space',"Stand in a circle. One player thrusts their arms forward like a chicken beak toward a neighbor and shouts 'B'GAWK!' That neighbor passes it on. Flap your elbows and squawk to reverse direction. Miss your cue, hesitate, or break the rhythm and you're out. Speeds up as it goes."],
    ['Fruit Salad','10-40 players · 10-20 min · Open space',"Everyone sits in a circle, each assigned a fruit (apple, banana, mango). The caller shouts a fruit and those players scramble to new spots while the caller steals one. 'FRUIT SALAD!' means everyone moves. Whoever is left without a spot becomes the new caller."],
    ['Evolution','10-40 players · 10-15 min · Any open space',"Everyone starts as an egg (crouch and waddle). Find another egg and play rock-paper-scissors. Winners evolve: egg to chicken to dinosaur to human. You can only challenge your own kind. The goal is to evolve to human. The whole group plays at once - beautiful chaos."],
    ['Gorilla, Person, Pistol','6-40 players · 10-20 min · Open space',"Whole-body rock-paper-scissors in two teams. Gorilla beats Person, Person beats Pistol, Pistol beats Gorilla. Teams huddle secretly, pick a move, then act it out on three. The losing team runs to their safe zone before being tagged; tagged players switch sides. Teams self-balance."],
    ['Five in Ten','5-30 players · 10-20 min · Any space',"Split into small teams. The caller shouts a category ('Breakfast foods!') and teams have 10 seconds to name five things. First team to five wins the round. Categories get silly fast - 'Things a seagull would steal.' No materials, endlessly customizable."],
    ['Group Up','10-40 players · 5-10 min · Large open space',"Everyone mills around. When the caller shouts a number, players scramble into groups of exactly that size; anyone left out sits down. Keep going until two or three remain. You can use categories too ('group up by birth month!'). A great energy-builder."],
    ['Group Juggle / Warp Speed','8-25 players · 10-15 min · Circle space',"Establish a throwing pattern (never to a neighbor) until a ball touches everyone once and returns to start. Then beat your time. Then add a second ball the other way. The group competes against itself - kids get obsessed with the record. No losers, pure team focus."],
  ]},
  { title: 'Water-Friendly Games', color: [0.23,0.62,0.88], items: [
    ['Drip, Drip, Drench','8-30 players · 10-20 min · Outdoors',"Duck Duck Goose with water. The caller taps heads saying 'drip... drip...' then dumps a cup of water and shouts 'DRENCH!' That person chases the caller around the circle. If the caller reaches the empty spot safely, the drenched player becomes the new caller."],
    ['Sponge Relay Race','10-40 players · 10-15 min · Outdoors',"Teams of 5-8 with a full bucket at one end and an empty one at the other. Soak a large sponge, run it down, squeeze it out, sprint back, tag the next person. The team with the highest bucket in 3 minutes wins. Variation: pass the soaked sponge overhead down a line."],
    ['Water Balloon Numbers','10-30 players · 10-20 min · Outdoors',"Assign everyone a number and spread out. The caller shouts a number; that player runs to the center, grabs a balloon, and tries to tag others before it pops. Everyone else sprints away. Once the balloon pops the round ends. Fast and unpredictable."],
    ['Freeze Tag with Squirt Guns','8-25 players · 15-20 min · Outdoors',"Classic freeze tag, but you unfreeze a frozen teammate by squirting them with a water gun. One or two players are 'it'. Frozen players stand with arms out waiting for rescue. If everyone is frozen, the taggers win. Swap 'it' roles so everyone gets the squirt gun."],
  ]},
  { title: 'Calm & Transition Games', color: [0.31,0.68,0.45], items: [
    ['Camouflage','6-20 players · 15-25 min · Wooded / natural space',"A spotter closes their eyes and counts to 30 while everyone hides - but only where the spotter could see them without moving their feet. The spotter scans without moving; spotted players are out. Every 30 seconds the spotter takes one step forward, shrinking the hiding spots. Last one unseen wins."],
    ['Lion\'s Cub','6-20 players · 10-20 min · Quiet outdoor space',"A blindfolded Lion sits in the center guarding keys at their feet. Others creep silently toward the keys. If the Lion hears someone and points at them, that player freezes for 10 seconds. Steal the keys uncaught and you become the Lion. Tense, quiet, and weirdly compelling."],
    ['Cloud Watching','2-30 players · 10-20 min · Outdoors, open sky',"Everyone lies on their backs and looks up. One person points to a cloud and names a shape; the group discusses; the next person picks a cloud. That's it - and it works every time. Gold for slowing a wound-up group, especially right after lunch. No losers, no setup, no noise."],
    ['How Long Is a Minute?','5-40 players · 5-10 min · Any space',"Everyone closes their eyes and stands. On 'Go', players sit down when they think a minute has passed - no counting or peeking. The facilitator notes who sits when, then reveals who came closest to 60 seconds. A calm, surprising mindfulness moment."],
    ['Crossed or Uncrossed?','8-30 players · 10-15 min · Seated circle',"Pass an object saying 'I'm passing this crossed' or 'uncrossed.' The group works out the secret rule - which is really whether your ankles or arms are crossed, not the object. Players who figure it out play along quietly, keeping the magic alive. A lovely slow-burn mystery."],
  ]},
];

// ---- layout ----
const PW = 612, PH = 792, MX = 54, RIGHT = PW - MX, TOP = 748, BOT = 60;
const pages = [];
let c = '', y = TOP;
const esc = s => String(s).replace(/[\\()]/g, m => '\\' + m).replace(/[^\x20-\x7e]/g, '-');
function newPage(){ if(c) pages.push(c); c=''; y=TOP; }
function ensure(h){ if(y - h < BOT) newPage(); }
function text(x, yy, str, font, size, color){
  const [r,g,b] = color||[0.12,0.16,0.22];
  c += `BT /${font} ${size} Tf ${r} ${g} ${b} rg 1 0 0 1 ${x} ${yy} Tm (${esc(str)}) Tj ET\n`;
}
function wrap(str, size, maxw){
  const cw = size*0.5, max = Math.floor(maxw/cw), words = str.split(' '), lines=[]; let cur='';
  for(const w of words){ if((cur+' '+w).trim().length>max){ if(cur) lines.push(cur); cur=w; } else cur=(cur?cur+' ':'')+w; }
  if(cur) lines.push(cur); return lines;
}

// title block
text(MX, y, 'Summer Games', 'F2', 24); y -= 22;
text(MX, y, 'Quick-reference card - minimal setup, maximum fun', 'F3', 11, [0.42,0.47,0.53]); y -= 16;
c += `0.23 0.62 0.88 RG 1.5 w ${MX} ${y} m ${RIGHT} ${y} l S\n`; y -= 26;

for(const sec of SECTIONS){
  ensure(60);
  // section bar
  const [r,g,b]=sec.color;
  c += `${r} ${g} ${b} rg ${MX} ${y-16} ${RIGHT-MX} 24 re f\n`;
  text(MX+10, y-9, sec.title.toUpperCase(), 'F2', 12, [0.12,0.13,0.16]);
  y -= 38;
  for(const [name, meta, desc] of sec.items){
    const lines = wrap(desc, 10.5, RIGHT-MX);
    ensure(20 + lines.length*13 + 16);
    text(MX, y, name, 'F2', 11.5); y -= 14;
    text(MX, y, meta, 'F3', 9, [0.45,0.5,0.56]); y -= 15;
    for(const ln of lines){ text(MX, y, ln, 'F1', 10.5, [0.2,0.24,0.3]); y -= 13; }
    y -= 12;
  }
  y -= 6;
}
ensure(20);
text(MX, y, 'Tip: keep this handy - you\'ll thank yourself at 11:58am before lunch.', 'F3', 9.5, [0.45,0.5,0.56]);
newPage();

// ---- assemble PDF ----
const objs = [];
const fonts = { F1:'Helvetica', F2:'Helvetica-Bold', F3:'Helvetica-Oblique' };
const kids = [];
const nPages = pages.length;
// object numbering: 1 catalog, 2 pages, 3.. per page (content+page), then fonts
let oid = 3;
const pageObjs = [], contentObjs = [];
for(let i=0;i<nPages;i++){ contentObjs.push(oid++); pageObjs.push(oid++); }
const fontObjs = { F1:oid++, F2:oid++, F3:oid++ };

objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
objs[2] = `<< /Type /Pages /Count ${nPages} /Kids [${pageObjs.map(n=>n+' 0 R').join(' ')}] >>`;
for(let i=0;i<nPages;i++){
  const stream = pages[i];
  objs[contentObjs[i]] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`;
  objs[pageObjs[i]] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 ${fontObjs.F1} 0 R /F2 ${fontObjs.F2} 0 R /F3 ${fontObjs.F3} 0 R >> >> /Contents ${contentObjs[i]} 0 R >>`;
}
for(const k of Object.keys(fonts)) objs[fontObjs[k]] = `<< /Type /Font /Subtype /Type1 /BaseFont /${fonts[k]} /Encoding /WinAnsiEncoding >>`;

let pdf = '%PDF-1.4\n';
const offsets = [];
const total = objs.length - 1;
for(let i=1;i<=total;i++){ offsets[i] = Buffer.byteLength(pdf); pdf += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${total+1}\n0000000000 65535 f \n`;
for(let i=1;i<=total;i++){ pdf += String(offsets[i]).padStart(10,'0') + ' 00000 n \n'; }
pdf += `trailer\n<< /Size ${total+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
fs.writeFileSync(path.join(__dirname,'summer-camp-games.pdf'), pdf, 'latin1');
console.log('wrote summer-camp-games.pdf ·', nPages, 'pages');

// Battlebase — improved bot AI and weapon types
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const healthEl = document.getElementById('health');
const ammoEl = document.getElementById('ammo');
const stormEl = document.getElementById('stormR');
const weaponEl = document.getElementById('weaponName');
const startBtn = document.getElementById('startBtn');
const soundBtn = document.getElementById('soundBtn');

let W = 1600, H = 900; // world size
let scale = 1;
function resize(){
  canvas.width = window.innerWidth; canvas.height = window.innerHeight;
  scale = Math.min(canvas.width / W, canvas.height / H);
}
window.addEventListener('resize', resize); resize();

// Weapons
const weapons = [
  {name:'Rifle', ammoPerShot:1, damage:20, fireRate:0.12, speed:700, pellets:1},
  {name:'Shotgun', ammoPerShot:1, damage:10, fireRate:0.9, speed:420, pellets:6, spread:0.6},
  {name:'SMG', ammoPerShot:1, damage:8, fireRate:0.06, speed:900, pellets:1},
  {name:'Sniper', ammoPerShot:1, damage:150, fireRate:1.8, speed:1600, pellets:1},
  {name:'Rocket', ammoPerShot:1, damage:90, fireRate:1.2, speed:420, isRocket:true, explosionRadius:80}
];

// Difficulty configurations (scales bot count, hp, speed, accuracy, crates, storm)
const difficultyConfigs = {
  easy:   {bots:6,  botHp:40,  botSpeed:60,  botFireRateFactor:1.6, botAccuracy:0.6, crateCount:8,  ammo:90, stormShrinkRate:6},
  normal: {bots:10, botHp:60,  botSpeed:80,  botFireRateFactor:1.0, botAccuracy:0.85,crateCount:6,  ammo:60, stormShrinkRate:8},
  hard:   {bots:14, botHp:90,  botSpeed:95,  botFireRateFactor:0.8, botAccuracy:0.98,crateCount:4,  ammo:50, stormShrinkRate:10},
  insane: {bots:18, botHp:130, botSpeed:120, botFireRateFactor:0.6, botAccuracy:1.15,crateCount:2,  ammo:40, stormShrinkRate:12}
};

const difficultySelect = document.getElementById('difficultySelect');

// Player
const player = {x: W/2, y: H/2, r: 12, speed: 220, hp:100, ammo:30, weapon:0};
let keys = {};
window.addEventListener('keydown', e=>{
  keys[e.key.toLowerCase()]=true;
  if(e.key === '1') { player.weapon = 0; weaponEl.textContent = weapons[0].name; }
  if(e.key === '2') { player.weapon = 1; weaponEl.textContent = weapons[1].name; }
  if(e.key === '3') { player.weapon = 2; weaponEl.textContent = weapons[2].name; }
  if(e.key === '4') { player.weapon = 3; weaponEl.textContent = weapons[3].name; }
  if(e.key === '5') { player.weapon = 4; weaponEl.textContent = weapons[4].name; }
});
window.addEventListener('keyup', e=>keys[e.key.toLowerCase()]=false);

// Mouse
let mouse = {x:0,y:0,down:false};
canvas.addEventListener('mousemove', e=>{
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left)/scale;
  mouse.y = (e.clientY - rect.top)/scale;
});
canvas.addEventListener('mousedown',()=>mouse.down=true);
window.addEventListener('mouseup',()=>mouse.down=false);

// Entities
let bullets = []; // {x,y,vx,vy,life,owner,damage}
let bots = [];
let crates = [];

// Storm
let storm = {x: W/2, y: H/2, r: 800, shrinkTo: 120, shrinking:true, shrinkRate: 8};
let matchRunning = false;
let lastTime=0;

// Audio + particles
let audioCtx = null;
let masterGain = null;
let soundOn = true;
function ensureAudio(){ if(audioCtx) return; audioCtx = new (window.AudioContext||window.webkitAudioContext)(); masterGain = audioCtx.createGain(); masterGain.gain.value = 0.9; masterGain.connect(audioCtx.destination); }
function playSound(type, opts={}){
  if(!soundOn || !audioCtx) return; const t = audioCtx.currentTime;
  if(type === 'fire'){
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = opts.type || 'square'; o.frequency.value = opts.freq || 900; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.6,t+0.005); g.gain.exponentialRampToValueAtTime(0.0001,t+0.12); o.connect(g); g.connect(masterGain); o.start(t); o.stop(t+0.14);
  } else if(type === 'shotgun'){
    for(let i=0;i<4;i++){ const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type = 'sawtooth'; o.frequency.value = 600 + Math.random()*800; g.gain.setValueAtTime(0.0001, t + i*0.005); g.gain.exponentialRampToValueAtTime(0.8, t+0.01 + i*0.005); g.gain.exponentialRampToValueAtTime(0.0001, t+0.25 + i*0.005); o.connect(g); g.connect(masterGain); o.start(t + i*0.005); o.stop(t + 0.26 + i*0.005); }
  } else if(type === 'impact'){
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='triangle'; o.frequency.value = 220 + Math.random()*180; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.6,t+0.002); g.gain.exponentialRampToValueAtTime(0.0001,t+0.12); o.connect(g); g.connect(masterGain); o.start(t); o.stop(t+0.14);
  } else if(type === 'pickup'){
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain(); o.type='sine'; o.frequency.value = 1200; g.gain.setValueAtTime(0.0001,t); g.gain.exponentialRampToValueAtTime(0.7,t+0.01); g.gain.exponentialRampToValueAtTime(0.0001,t+0.18); o.connect(g); g.connect(masterGain); o.start(t); o.stop(t+0.2);
  }
}
soundBtn && soundBtn.addEventListener('click', ()=>{ soundOn = !soundOn; soundBtn.textContent = 'Sound: ' + (soundOn? 'On':'Off'); if(soundOn) ensureAudio(); });

function spawnBots(n){
  bots = [];
  for(let i=0;i<n;i++){
    bots.push({x:Math.random()*W, y:Math.random()*H, r:10, hp:60, speed:80, state:'idle', stateT:0, fireCooldown: Math.random()*2});
  }
}
function spawnCrates(n){
  crates = [];
  for(let i=0;i<n;i++) crates.push({x:Math.random()*W, y:Math.random()*H, taken:false});
}

function startMatch(){
  ensureAudio();
  const diff = (difficultySelect && difficultySelect.value) ? difficultySelect.value : 'normal';
  const cfg = difficultyConfigs[diff] || difficultyConfigs.normal;
  player.x = W/2; player.y = H/2; player.hp=100; player.ammo=cfg.ammo; player.weapon=0;
  bullets = []; spawnBots(cfg.bots);
  // scale bot stats according to difficulty
  for(const bot of bots){ bot.hp = cfg.botHp; bot.speed = cfg.botSpeed; bot.fireCooldown = Math.random()*1.0; bot.accuracy = cfg.botAccuracy; bot.fireRateFactor = cfg.botFireRateFactor; }
  spawnCrates(cfg.crateCount);
  storm.r = Math.max(W,H); storm.shrinking = true; storm.shrinkRate = cfg.stormShrinkRate; matchRunning=true;
  weaponEl.textContent = weapons[player.weapon].name;
}
startBtn.addEventListener('click', ()=>{ if(!matchRunning) startMatch(); });

function update(dt){
  // always update particles even if match not running
  updateParticles(dt);
  if(!matchRunning) return;

  // movement
  let vx=0, vy=0;
  if(keys['w']||keys['arrowup']) vy-=1;
  if(keys['s']||keys['arrowdown']) vy+=1;
  if(keys['a']||keys['arrowleft']) vx-=1;
  if(keys['d']||keys['arrowright']) vx+=1;
  const mag = Math.hypot(vx,vy) || 1;
  player.x += vx/mag * player.speed * dt;
  player.y += vy/mag * player.speed * dt;
  player.x = Math.max(0, Math.min(W, player.x));
  player.y = Math.max(0, Math.min(H, player.y));

  // shooting
  const wpn = weapons[player.weapon];
  if(mouse.down && player.ammo > 0){
    if(!player._cooldown) player._cooldown = 0;
    player._cooldown -= dt;
    if(player._cooldown <= 0){
      player._cooldown = wpn.fireRate;
      const angBase = Math.atan2(mouse.y - player.y, mouse.x - player.x);
      if(wpn.pellets && wpn.pellets > 1){
        for(let p=0;p<wpn.pellets;p++){
          const spread = (wpn.spread||0) * (Math.random()-0.5);
          const ang = angBase + spread;
          bullets.push({x:player.x, y:player.y, vx:Math.cos(ang)*wpn.speed, vy:Math.sin(ang)*wpn.speed, life:1.6, owner:'player', damage: wpn.damage});
        }
        spawnMuzzle(player.x, player.y, angBase, 10, '#ffdca6');
        playSound('shotgun');
      } else {
        const ang = angBase;
        bullets.push({x:player.x, y:player.y, vx:Math.cos(ang)*wpn.speed, vy:Math.sin(ang)*wpn.speed, life:1.6, owner:'player', damage: wpn.damage});
        spawnMuzzle(player.x, player.y, ang, 6, '#fff8d0');
        playSound('fire', {freq:900});
      }
      player.ammo -= wpn.ammoPerShot;
    }
  } else player._cooldown = Math.max(-0.01, (player._cooldown||0));

  // bullets movement: update positions and life
  for(const b of bullets){ b.x += b.vx*dt; b.y += b.vy*dt; b.life -= dt; b._dead = b._dead || false; }

  // bots AI: more varied
  for(const bot of bots){
    bot.stateT -= dt;
    const dx = player.x - bot.x, dy = player.y - bot.y; const d = Math.hypot(dx,dy)||1;
    // choose state
    if(bot.stateT <= 0){
      bot.stateT = 1 + Math.random()*2;
      if(d > 300) bot.state = 'approach';
      else if(d > 120) bot.state = 'flank';
      else bot.state = Math.random()<0.6 ? 'attack' : 'retreat';
    }

    // movement based on state
    if(bot.state === 'approach'){
      bot.x += (dx/d) * bot.speed * dt;
      bot.y += (dy/d) * bot.speed * dt;
    } else if(bot.state === 'flank'){
      // circle around player
      const nx = -dy/d, ny = dx/d; // perpendicular vector
      const dir = Math.random()<0.5 ? 1 : -1;
      bot.x += (dx/d) * (bot.speed*0.4) * dt + nx * dir * bot.speed * 0.5 * dt;
      bot.y += (dy/d) * (bot.speed*0.4) * dt + ny * dir * bot.speed * 0.5 * dt;
    } else if(bot.state === 'attack'){
      // step closer slowly
      bot.x += (dx/d) * bot.speed * 0.6 * dt;
      bot.y += (dy/d) * bot.speed * 0.6 * dt;
    } else if(bot.state === 'retreat'){
      bot.x -= (dx/d) * bot.speed * 0.8 * dt;
      bot.y -= (dy/d) * bot.speed * 0.8 * dt;
    }

    // keep inside world
    bot.x = Math.max(0, Math.min(W, bot.x)); bot.y = Math.max(0, Math.min(H, bot.y));

    // bots fire occasionally
    bot.fireCooldown = (bot.fireCooldown||0) - dt;
    if(bot.fireCooldown <= 0 && d < 500){
      bot.fireCooldown = (1.0 + Math.random()*1.5) * (bot.fireRateFactor || 1.0);
      // lead shot: estimate where player will be
      const lead = 0.2 / (bot.accuracy || 1.0);
      const px = player.x + (player.x - (player._lastX||player.x)) * (lead*30);
      const py = player.y + (player.y - (player._lastY||player.y)) * (lead*30);
      const ang = Math.atan2(py - bot.y, px - bot.x);
      bullets.push({x:bot.x, y:bot.y, vx:Math.cos(ang)*450, vy:Math.sin(ang)*450, life:2.0, owner:'bot', damage:12});
      spawnMuzzle(bot.x, bot.y, ang, 5, '#ffddcf');
      playSound('fire', {freq:520});
    }
  }

  // update last player position for bot leading
  player._lastX = player.x; player._lastY = player.y;

  // bullet collisions (handle rocket explosions specially)
  for(const b of bullets){
    if(b._dead) continue;
    if(b.owner === 'player'){
      if(b.isRocket){
        // rocket hits any bot nearby -> explode
        for(const bot of bots){ const d = Math.hypot(b.x - bot.x, b.y - bot.y); if(d < bot.r + 6){ explodeRocket(b); b._dead = true; break; } }
      } else {
        for(const bot of bots){
          const d = Math.hypot(b.x - bot.x, b.y - bot.y);
          if(d < bot.r + 4){ bot.hp -= b.damage; b._dead = true; spawnImpact(b.x,b.y,'#ffd27f'); playSound('impact'); break; }
        }
      }
    } else if(b.owner === 'bot'){
      if(b.isRocket){
        const dpl = Math.hypot(b.x - player.x, b.y - player.y);
        if(dpl < player.r + 6){ explodeRocket(b); b._dead = true; }
      } else {
        const d = Math.hypot(b.x - player.x, b.y - player.y);
        if(d < player.r + 4){ player.hp -= b.damage; b._dead = true; spawnImpact(b.x,b.y,'#ffb3b3'); playSound('impact'); }
      }
    }
  }
  // remove dead bullets and handle rockets that expired out of life or bounds
  for(const b of bullets){
    if(b._dead) continue;
    if(b.life <= 0 || b.x<=0 || b.x>=W || b.y<=0 || b.y>=H){
      if(b.isRocket && !b._dead){ explodeRocket(b); b._dead = true; }
      else b._dead = true;
    }
  }
  bots = bots.filter(b=>b.hp>0);
  bullets = bullets.filter(b=>!b._dead);

  // crates pickup
  for(const c of crates){
    if(c.taken) continue;
    if(Math.hypot(player.x-c.x, player.y-c.y) < 24){ c.taken=true; player.ammo += 18; player.hp = Math.min(100, player.hp+12); spawnImpact(c.x,c.y,'#ffe7b0'); playSound('pickup'); }
  }

  // storm shrinking
  if(storm.shrinking){
    storm.r = Math.max(storm.shrinkTo, storm.r - storm.shrinkRate * dt);
    if(storm.r <= storm.shrinkTo) storm.shrinking = false;
  }

  // if outside storm, lose hp
  const dStorm = Math.hypot(player.x - storm.x, player.y - storm.y);
  if(dStorm > storm.r){ player.hp -= 25*dt; }

  if(player.hp <= 0){ matchRunning = false; }

  // auto end if bots killed or player dead
  if(bots.length === 0){ matchRunning = false; }

  // update HUD
  healthEl.textContent = Math.max(0, Math.floor(player.hp));
  ammoEl.textContent = Math.max(0, Math.max(0, player.ammo));
  stormEl.textContent = Math.floor(storm.r);
}

function draw(){
  ctx.save();
  ctx.scale(scale, scale);
  ctx.clearRect(0,0,W,H);

  // background
  ctx.fillStyle = '#0b1220'; ctx.fillRect(0,0,W,H);

  // storm overlay
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0,0,W,H);
  ctx.beginPath();
  ctx.fillStyle = 'rgba(12,18,32,0.0)';
  ctx.arc(storm.x, storm.y, storm.r, 0, Math.PI*2);
  ctx.fill();
  ctx.clip();
  ctx.clearRect(0,0,W,H);
  ctx.restore();

  // crates
  for(const c of crates){ if(c.taken) continue; ctx.fillStyle='#ffd27f'; ctx.fillRect(c.x-8,c.y-8,16,16); }

  // particles (behind entities)
  drawParticles();

  // bots
  for(const b of bots){ ctx.fillStyle='#ff6b6b'; ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); }

  // bullets
  for(const b of bullets){
    ctx.fillStyle = b.owner === 'player' ? '#fff3b0' : '#ffdddd';
    ctx.fillRect(b.x-2,b.y-2,4,4);
  }

  // player
  ctx.fillStyle = '#7fe0a8'; ctx.beginPath(); ctx.arc(player.x, player.y, player.r, 0, Math.PI*2); ctx.fill();

  // reticle line
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth=2;
  ctx.beginPath();
  ctx.moveTo(player.x, player.y);
  ctx.lineTo(Math.max(0,Math.min(W,mouse.x)), Math.max(0,Math.min(H,mouse.y)));
  ctx.stroke();

  // storm circle outline
  ctx.strokeStyle = 'rgba(120,180,255,0.6)'; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(storm.x, storm.y, storm.r, 0, Math.PI*2); ctx.stroke();

  // particles (foreground)
  drawParticles(true);

  ctx.restore();
}

function loop(ts){
  if(!lastTime) lastTime = ts;
  const dt = Math.min(0.05, (ts-lastTime)/1000);
  lastTime = ts;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

// expose simple controls for debugging
window._BB = {startMatch};

// --- particles system ---
let particles = [];
function spawnMuzzle(x,y,angle,count=8,color='#ffdca6'){
  for(let i=0;i<count;i++){
    const speed = 80 + Math.random()*180;
    const a = angle + (Math.random()-0.5)*0.6;
    particles.push({x, y, vx:Math.cos(a)*speed, vy:Math.sin(a)*speed, life:0.25 + Math.random()*0.25, color, size:2 + Math.random()*3});
  }
}
function spawnImpact(x,y,color='#ffd27f'){
  for(let i=0;i<14;i++){
    const a = Math.random()*Math.PI*2; const s = 40 + Math.random()*160;
    particles.push({x, y, vx:Math.cos(a)*s, vy:Math.sin(a)*s, life:0.4 + Math.random()*0.6, color, size:2 + Math.random()*4});
  }
}
function explodeRocket(b){
  // big impact visuals
  spawnImpact(b.x,b.y,'#ffb380');
  playSound('impact');
  const r = b.explosionRadius || 80;
  // area damage to bots (falloff)
  for(const bot of bots){
    const dist = Math.hypot(b.x - bot.x, b.y - bot.y);
    if(dist <= r){
      const factor = 1 - (dist / r);
      bot.hp -= Math.max(0, Math.round((b.damage || 80) * factor));
    }
  }
}
function updateParticles(dt){
  for(const p of particles){ p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.98; p.vy *= 0.98; }
  particles = particles.filter(p=>p.life>0);
}
function drawParticles(foreground=false){
  ctx.save();
  for(const p of particles){
    const t = Math.max(0, Math.min(1, p.life));
    const alpha = t;
    if(foreground){ if(p.life < 0.18) { ctx.fillStyle = p.color; ctx.globalAlpha = alpha; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); }}
    else { if(p.life >= 0.18) { ctx.fillStyle = p.color; ctx.globalAlpha = alpha*0.9; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill(); }}
  }
  ctx.globalAlpha = 1; ctx.restore();
}

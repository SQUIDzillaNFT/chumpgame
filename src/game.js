(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const ui = {
    score: document.getElementById('score'),
    wave: document.getElementById('wave'),
    health: document.getElementById('health'),
    actionBtn: document.getElementById('actionBtn'),
    gameOver: document.getElementById('gameOver'),
    finalScore: document.getElementById('finalScore'),
  };

  // Assets (optional)
  const assets = { bullet: null, bulletReady: false };
  const sfx = { map: {}, lastShotAt: 0, ctx: null, unlocked: false };
  function loadAudioTry(paths) {
    for (const p of paths) {
      const a = new Audio(); a.preload = 'auto'; a.src = p;
      // We return the first one to start loading; failures will be ignored at play time
      return a;
    }
    return null;
  }
  function loadSfx() {
    const C = {
      shoot: ['public/shoot.mp3','public/shoot.wav','public/gun.mp3','public/gun.wav','public/gunshot.mp3','public/gunshot.wav','public/lasergun.mp3','public/lasergun.wav','public/fire.mp3','public/fire.wav','public/banana.mp3','public/banana.wav'],
      explosion: ['public/explosion.mp3','public/explosion.wav','public/explode.mp3','public/explode.wav','public/boom.mp3','public/boom.wav'],
      enemyExplosion: ['public/enemyexplosion.mp3','public/enemyexplosion.wav'],
      powerup: ['public/powerup.mp3','public/powerup.wav','public/pickup.mp3','public/pickup.wav'],
      hurt: ['public/hurt.mp3','public/hurt.wav','public/hit.mp3','public/hit.wav','public/damage.mp3','public/damage.wav'],
      gameover: ['public/gameover.mp3','public/gameover.wav','public/death.mp3','public/death.wav','public/lose.mp3','public/lose.wav'],
      gamestart: ['public/gamestart.mp3','public/gamestart.wav','public/game_start.mp3','public/startgame.mp3','public/startgame.wav'],
      playerdie: ['public/playerdie.mp3','public/playerdie.wav','public/player_die.mp3'],
    };
    sfx.map.shoot = loadAudioTry(C.shoot);
    sfx.map.explosion = loadAudioTry(C.explosion);
    sfx.map.enemyExplosion = loadAudioTry(C.enemyExplosion);
    sfx.map.powerup = loadAudioTry(C.powerup);
    sfx.map.hurt = loadAudioTry(C.hurt);
    sfx.map.gameover = loadAudioTry(C.gameover);
    sfx.map.gamestart = loadAudioTry(C.gamestart);
    sfx.map.playerdie = loadAudioTry(C.playerdie);
    sfx.map.pickup = sfx.map.powerup;
  }
  function initAudioContext() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) sfx.ctx = new AC();
    } catch {}
  }
  function unlockAudio() {
    if (sfx.unlocked) return;
    try {
      if (sfx.ctx && sfx.ctx.state === 'suspended') {
        sfx.ctx.resume().catch(()=>{});
      }
      // also try to play a muted instance to satisfy some policies
      const a = sfx.map.shoot || sfx.map.powerup || sfx.map.explosion;
      if (a) { const i = a.cloneNode(); i.volume = 0; i.play().catch(()=>{}); }
      sfx.unlocked = true;
    } catch {}
  }
  const warnedMissing = new Set();
  function playSfx(name, { volume = 0.8, rateLimitMs = 0 } = {}) {
    const a = sfx.map[name];
    if (!a) { if (!warnedMissing.has(name)) { warnedMissing.add(name); console.warn(`[SFX] Missing sound for`, name); } return; }
    if (rateLimitMs) {
      const now = performance.now();
      if (name === 'shoot' && now - sfx.lastShotAt < rateLimitMs) return;
      if (name === 'shoot') sfx.lastShotAt = now;
    }
    try {
      const inst = a.cloneNode();
      inst.volume = volume;
      inst.play().catch(() => {});
    } catch {}
  }
  function loadAssets() {
    const img = new Image();
    img.src = 'public/bullet.png';
    img.onload = () => { assets.bullet = img; assets.bulletReady = true; };
    img.onerror = () => { /* fallback to vector bullet */ };
    loadSfx();
    initAudioContext();
  }

  // Configurable gameplay parameters
  const CONFIG = {
    player: { maxHealth: 100, baseSpeed: 230, baseReload: 0.14 },
    drops: { chanceOverall: 0.10, typeWeights: { speed: 1, firerate: 1, heart: 1 } },
    powerups: {
      speed: { multiplier: 1.6, duration: 8 },
      firerate: { multiplier: 1.8, duration: 8 },
      heart: { heal: 25 },
    },
    visuals: {
      bulletImageSize: { w: 28, h: 10 }, // pixels to draw the bullet image at
    },
  };

  // HiDPI fit and mobile scale
  function fitCanvas() {
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();
  loadAssets();

  function isMobileViewport() { return Math.min(window.innerWidth, window.innerHeight) <= 560; }

  // Helpers
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dist2 = (ax, ay, bx, by) => { const dx = ax - bx; const dy = ay - by; return dx*dx + dy*dy; };
  const angle = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
  const vw = () => canvas.clientWidth;
  const vh = () => canvas.clientHeight;

  // Input
  const keys = new Set();
  const mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };
  const touch = { active: false, x: canvas.width/2, y: canvas.height/2 };
  window.addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === ' ') e.preventDefault(); if (e.key.toLowerCase() === 'p') togglePause(); });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
  canvas.addEventListener('mousemove', (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left);
    mouse.y = (e.clientY - r.top);
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  window.addEventListener('mouseup', () => { mouse.down = false; });

  // Touch drag to move and shoot
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0]; if (!t) return; e.preventDefault();
    const r = canvas.getBoundingClientRect();
    touch.active = true; touch.x = (t.clientX - r.left); touch.y = (t.clientY - r.top);
    mouse.x = touch.x; mouse.y = touch.y; mouse.down = true;
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    const t = e.touches[0]; if (!t) return; e.preventDefault();
    const r = canvas.getBoundingClientRect();
    touch.x = (t.clientX - r.left); touch.y = (t.clientY - r.top);
    mouse.x = touch.x; mouse.y = touch.y;
  }, { passive: false });
  canvas.addEventListener('touchend', () => { touch.active = false; mouse.down = false; });

  // Game state
  const game = {
    running: false,
    paused: false,
    score: 0,
    wave: 1,
    time: 0,
    lastTs: 0,
    player: null,
    bullets: [],
    enemies: [],
    powerups: [],
    particles: [],
    hasStartedOnce: false,
  };

  class Player {
    constructor() {
      this.x = canvas.width / 2; this.y = canvas.height / 2;
      const scale = isMobileViewport() ? 0.6 : 1;
      this.r = 12 * scale; this.speed = CONFIG.player.baseSpeed; this.health = CONFIG.player.maxHealth;
      this.reload = CONFIG.player.baseReload; this.reloadT = 0; this.invT = 0;
      this.speedMultiplier = 1; this.speedTimer = 0;
      this.fireRateMultiplier = 1; this.fireTimer = 0;
      this.aimAngle = 0; // persisted aim to avoid flicker when touch is centered
    }
    update(dt) {
      // decay timed effects
      if (this.speedTimer > 0) { this.speedTimer -= dt; if (this.speedTimer <= 0) { this.speedMultiplier = 1; } }
      if (this.fireTimer > 0) { this.fireTimer -= dt; if (this.fireTimer <= 0) { this.fireRateMultiplier = 1; } }

      let mx = 0, my = 0;
      if (touch.active) {
        // Dual-mode: inside aim ring -> aim only; outside -> move toward finger
        const dx = touch.x - this.x; const dy = touch.y - this.y; const d = Math.hypot(dx, dy);
        const aimRing = Math.max(16, this.r * 1.4); // smaller ring for easier direction changes
        if (d <= aimRing) {
          // stay in place but freely rotate aim
          mx = 0; my = 0;
          this.aimAngle = Math.atan2(dy, dx);
        } else {
          mx = dx; my = dy; const len = d || 1; mx /= len; my /= len;
          this.aimAngle = Math.atan2(dy, dx);
        }
      } else {
        if (keys.has('w') || keys.has('arrowup')) my -= 1;
        if (keys.has('s') || keys.has('arrowdown')) my += 1;
        if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
        if (keys.has('d') || keys.has('arrowright')) mx += 1;
      }
      if (mx !== 0 || my !== 0) { const l = Math.hypot(mx, my); mx/=l; my/=l; }
      let currentSpeed = this.speed * this.speedMultiplier;
      if (touch.active) currentSpeed *= 1.15; // closer feel to desktop
      this.x = clamp(this.x + mx * currentSpeed * dt, this.r, vw() - this.r);
      this.y = clamp(this.y + my * currentSpeed * dt, this.r, vh() - this.r);
      // Update aim angle when using mouse/keyboard
      if (!touch.active) {
        this.aimAngle = angle(this.x, this.y, mouse.x, mouse.y);
      }

      this.reloadT -= dt; if (this.invT > 0) this.invT -= dt;
      if ((mouse.down || keys.has(' ')) && this.reloadT <= 0) {
        const currentReload = this.reload / this.fireRateMultiplier;
        this.reloadT = currentReload;
        spawnBullet(this.x, this.y, this.aimAngle);
        playSfx('shoot', { volume: 0.6, rateLimitMs: 50 });
      }
    }
    draw() {
      const blink = this.invT > 0 && Math.floor(game.time * 20) % 2 === 0;
      const face = blink ? '#ffe082' : '#f4e3c1';
      const body = blink ? '#ffe082' : '#a67c52';
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
      // banana blaster FIRST so it sits behind the head, slightly longer
      const th = this.aimAngle;
      ctx.save();
      ctx.rotate(th);
      ctx.fillStyle = '#f7d154';
      roundedRect(ctx, -2, -4, this.r + 16, 8, 4); ctx.fill();
      ctx.fillStyle = '#8d6e63'; ctx.fillRect(this.r + 16 - 3, -4, 3, 8);
      ctx.restore();

      // tail
      ctx.strokeStyle = body; ctx.lineWidth = 4; ctx.beginPath();
      ctx.moveTo(-this.r*0.2, this.r*0.2);
      ctx.quadraticCurveTo(-this.r*0.8, 0, -this.r*0.3, -this.r*0.6);
      ctx.stroke();
      // head
      ctx.fillStyle = body; ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI*2); ctx.fill();
      // ears
      ctx.beginPath(); ctx.arc(-this.r*0.8, -this.r*0.4, this.r*0.35, 0, Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.arc(this.r*0.8, -this.r*0.4, this.r*0.35, 0, Math.PI*2); ctx.fill();
      // face
      ctx.fillStyle = face; ctx.beginPath(); ctx.arc(0, this.r*0.2, this.r*0.7, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#0b1020';
      ctx.beginPath(); ctx.arc(-this.r*0.25, -this.r*0.15, 2, 0, Math.PI*2); ctx.arc(this.r*0.25, -this.r*0.15, 2, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  }

  class Bullet {
    constructor(x, y, th) { this.x = x + Math.cos(th)*18; this.y = y + Math.sin(th)*18; this.vx = Math.cos(th)*520; this.vy = Math.sin(th)*520; this.r = 4; this.life = 1.2; this.th = th; }
    update(dt){ this.x += this.vx*dt; this.y += this.vy*dt; this.life -= dt; }
    off(){ return this.x < -10 || this.x > vw() + 10 || this.y < -10 || this.y > vh() + 10 || this.life <= 0; }
    draw(){
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.th);
      if (assets.bulletReady && assets.bullet) {
        const w = CONFIG.visuals.bulletImageSize.w;
        const h = CONFIG.visuals.bulletImageSize.h;
        ctx.drawImage(assets.bullet, -w/2, -h/2, w, h);
      } else {
        // Fallback banana-shaped capsule
        const length = 16; const width = 6; const radius = width/2;
        ctx.fillStyle = '#f7d154';
        ctx.beginPath();
        ctx.moveTo(-length/2 + radius, -radius);
        ctx.lineTo(length/2 - radius, -radius);
        ctx.arc(length/2 - radius, 0, radius, -Math.PI/2, Math.PI/2);
        ctx.lineTo(-length/2 + radius, radius);
        ctx.arc(-length/2 + radius, 0, radius, Math.PI/2, -Math.PI/2);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#8d6e63';
        ctx.fillRect(length/2 - 2, -radius, 3, width);
      }
      ctx.restore();
    }
  }

  class Enemy {
    constructor(speed, r, hp){
      const scale = isMobileViewport() ? 0.7 : 1;
      const m = 20; const e = Math.floor(Math.random()*4);
      if (e===0){ this.x=-m; this.y=Math.random()*vh(); }
      else if(e===1){ this.x=vw()+m; this.y=Math.random()*vh(); }
      else if(e===2){ this.x=Math.random()*vw(); this.y=-m; }
      else { this.x=Math.random()*vw(); this.y=vh()+m; }
      this.s=speed; this.r=r * scale; this.hp=hp; this.flash=0;
      this.kind = ['grunt','runner','tank'][Math.floor(Math.random()*3)];
    }
    update(dt){ const th = angle(this.x, this.y, game.player.x, game.player.y); this.x += Math.cos(th)*this.s*dt; this.y += Math.sin(th)*this.s*dt; if (this.flash>0) this.flash -= dt; }
    draw(){
      const base = this.flash>0 ? '#ffcdd2' : '#ff6b6b';
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.shadowColor = 'rgba(0,0,0,0.4)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      if (this.kind === 'grunt') {
        // square with eyes
        const s = this.r * 1.6;
        ctx.fillStyle = base;
        ctx.fillRect(-s/2, -s/2, s, s);
        ctx.fillStyle = '#0b1020';
        ctx.fillRect(-s*0.15, -s*0.1, s*0.12, s*0.12);
        ctx.fillRect(s*0.03, -s*0.1, s*0.12, s*0.12);
      } else if (this.kind === 'runner') {
        // triangle
        const s = this.r * 2.0;
        ctx.fillStyle = base;
        ctx.beginPath();
        ctx.moveTo(-s/2, s/2);
        ctx.lineTo(s/2, s/2);
        ctx.lineTo(0, -s/2);
        ctx.closePath();
        ctx.fill();
      } else {
        // tank: rounded rect with inner ring
        const w = this.r * 2.2; const h = this.r * 2.0; const rr = Math.min(10, this.r*0.8);
        ctx.fillStyle = base;
        roundedRect(ctx, -w/2, -h/2, w, h, rr);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(0,0,this.r*0.8,0,Math.PI*2); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // PowerUps
  class PowerUp {
    // type: 'speed' | 'firerate' | 'heart'
    constructor(x, y, type) { this.x = x; this.y = y; this.type = type; this.r = 10; this.vy = 28; this.bob = Math.random() * Math.PI * 2; }
    update(dt) { this.bob += dt * 4; this.y += this.vy * dt; if (this.y > canvas.height - 20) { this.y = canvas.height - 20; this.vy = 0; } }
    draw() {
      ctx.save();
      ctx.translate(this.x, this.y + Math.sin(this.bob) * 2);
      // background glow
      ctx.fillStyle = this.type === 'heart' ? 'rgba(244,63,94,0.25)' : (this.type === 'speed' ? 'rgba(96,165,250,0.25)' : 'rgba(16,185,129,0.25)');
      ctx.beginPath(); ctx.arc(0,0,this.r+6,0,Math.PI*2); ctx.fill();
      // token
      ctx.fillStyle = '#0b1020';
      ctx.beginPath(); ctx.arc(0,0,this.r,0,Math.PI*2); ctx.fill();
      // icon
      if (this.type === 'speed') {
        ctx.fillStyle = '#60a5fa';
        ctx.beginPath();
        ctx.moveTo(-2,-6);
        ctx.lineTo(3,-6);
        ctx.lineTo(-1,0);
        ctx.lineTo(2,0);
        ctx.lineTo(-2,6);
        ctx.lineTo(-1,1);
        ctx.closePath();
        ctx.fill();
      } else if (this.type === 'firerate') {
        ctx.fillStyle = '#10b981';
        ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(0,-6); ctx.lineTo(6,0); ctx.lineTo(0,6); ctx.closePath(); ctx.fill();
      } else {
        // heart
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        const s = 0.9;
        ctx.moveTo(0,3*s);
        ctx.bezierCurveTo( -5*s, -3*s, -2*s, -6*s, 0, -3*s );
        ctx.bezierCurveTo( 2*s, -6*s, 5*s, -3*s, 0, 3*s );
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
  }

  function maybeDropPowerUp(x, y){
    if (Math.random() > CONFIG.drops.chanceOverall) return;
    const type = weightedPick(CONFIG.drops.typeWeights);
    game.powerups.push(new PowerUp(x, y, type));
  }

  function weightedPick(weights){
    const entries = Object.entries(weights);
    const sum = entries.reduce((s, [,w]) => s + w, 0);
    let r = Math.random() * sum;
    for (const [key, w] of entries){ r -= w; if (r <= 0) return key; }
    return entries[entries.length - 1][0];
  }

  function spawnBullet(x,y,th){ game.bullets.push(new Bullet(x,y,th)); }
  function spawnWave(n){ const count = 6 + Math.floor(n*1.5); for (let i=0;i<count;i++){ const s=60+n*5+Math.random()*25; const r=clamp(12 - Math.floor(n/4), 6, 12); const hp=1+Math.floor(n/4); game.enemies.push(new Enemy(s,r,hp)); } }

  // Particle explosion
  class Particle {
    constructor(x,y,ang,speed,life,color,size){ this.x=x; this.y=y; this.vx=Math.cos(ang)*speed; this.vy=Math.sin(ang)*speed; this.life=life; this.maxLife=life; this.color=color; this.size=size; }
    update(dt){ this.x+=this.vx*dt; this.y+=this.vy*dt; this.vx*=0.98; this.vy*=0.98; this.life-=dt; }
    draw(){ const a=Math.max(0,this.life/this.maxLife); ctx.fillStyle=`rgba(${this.color.r},${this.color.g},${this.color.b},${(0.25+0.75*a).toFixed(3)})`; ctx.beginPath(); ctx.arc(this.x,this.y,this.size*a,0,Math.PI*2); ctx.fill(); }
  }
  function spawnExplosion(x,y,base){ const n=16+Math.floor(Math.random()*10); for(let i=0;i<n;i++){ const ang=Math.random()*Math.PI*2; const sp=100+Math.random()*180; const life=0.35+Math.random()*0.45; const size=2+Math.random()*3; const jitter=(v)=>Math.min(255,Math.max(0,v+Math.floor((Math.random()-0.5)*30))); const c={r:jitter(base.r),g:jitter(base.g),b:jitter(base.b)}; game.particles.push(new Particle(x,y,ang,sp,life,c,size)); } }

  function collisions(){
    // bullets vs enemies
    for (let i=game.bullets.length-1;i>=0;i--){
      const b=game.bullets[i];
      for (let j=game.enemies.length-1;j>=0;j--){
        const e=game.enemies[j]; const rs=b.r+e.r;
        if (dist2(b.x,b.y,e.x,e.y) <= rs*rs){ game.bullets.splice(i,1); e.hp -= 1; e.flash = 0.1; if (e.hp<=0){ game.enemies.splice(j,1); game.score += 10; maybeDropPowerUp(e.x, e.y); spawnExplosion(e.x, e.y, { r:255, g:107, b:107 }); playSfx('enemyExplosion', { volume: 0.8 }); } break; }
      }
    }
    // enemies vs player
    for (let i=game.enemies.length-1;i>=0;i--){
      const e=game.enemies[i]; const rs=e.r+game.player.r;
      if (dist2(e.x,e.y,game.player.x,game.player.y) <= rs*rs){
        if (game.player.invT <= 0){ game.player.health -= 15; game.player.invT = 0.8; playSfx('hurt', { volume: 0.7 }); if (game.player.health <= 0) return endGame(); }
      }
    }

    // player vs powerups
    for (let i=game.powerups.length-1;i>=0;i--){
      const p = game.powerups[i];
      const rs = p.r + game.player.r;
      if (dist2(p.x,p.y,game.player.x,game.player.y) <= rs*rs){
        if (p.type === 'speed') { game.player.speedMultiplier = CONFIG.powerups.speed.multiplier; game.player.speedTimer = CONFIG.powerups.speed.duration; }
        else if (p.type === 'firerate') { game.player.fireRateMultiplier = CONFIG.powerups.firerate.multiplier; game.player.fireTimer = CONFIG.powerups.firerate.duration; }
        else if (p.type === 'heart') { game.player.health = Math.min(CONFIG.player.maxHealth, game.player.health + CONFIG.powerups.heart.heal); }
        playSfx('powerup', { volume: 0.4 });
        game.powerups.splice(i,1);
      }
    }
  }

  function updateUI(){ if (ui.score) ui.score.textContent = String(game.score); if (ui.wave) ui.wave.textContent = String(game.wave); if (ui.health) ui.health.textContent = String(Math.max(0, Math.floor(game.player?.health ?? 0))); }

  function startGame(){
    game.running=true; game.paused=false; game.score=0; game.wave=1; game.time=0; game.lastTs=0; game.bullets=[]; game.enemies=[]; game.powerups=[]; game.particles=[]; game.player=new Player(); spawnWave(game.wave); game.hasStartedOnce=true; if (ui.actionBtn) ui.actionBtn.textContent='Pause'; updateUI();
    if (ui.gameOver) ui.gameOver.classList.add('hidden');
    playSfx('gamestart', { volume: 0.6 });
  }
  function endGame(){
    game.running=false;
    if (ui.actionBtn) ui.actionBtn.textContent='Restart';
    if (ui.finalScore) ui.finalScore.textContent = String(game.score);
    if (ui.gameOver) ui.gameOver.classList.remove('hidden');
    // Player death cue, explosion + optional game over jingle
    playSfx('playerdie', { volume: 0.7 });
    playSfx('explosion', { volume: 0.8 });
    playSfx('gameover', { volume: 0.6 });
  }
  function togglePause(){ if (!game.running) return; game.paused=!game.paused; if (ui.actionBtn) ui.actionBtn.textContent = game.paused ? 'Resume' : 'Pause'; }

  function update(dt){ if (!game.running || game.paused) return; game.player.update(dt); for (let i=game.bullets.length-1;i>=0;i--){ const b=game.bullets[i]; b.update(dt); if (b.off()) game.bullets.splice(i,1);} for (const e of game.enemies) e.update(dt); for (const p of game.powerups) p.update(dt); for (let i=game.particles.length-1;i>=0;i--){ const pr=game.particles[i]; pr.update(dt); if (pr.life<=0) game.particles.splice(i,1);} collisions(); if (game.enemies.length===0){ game.wave+=1; spawnWave(game.wave);} updateUI(); }
  function drawGrid(){ ctx.save(); ctx.strokeStyle='rgba(247,209,84,0.08)'; ctx.lineWidth=1; const step=40; for(let x=0;x<=vw();x+=step){ ctx.beginPath(); ctx.moveTo(x+0.5,0); ctx.lineTo(x+0.5,vh()); ctx.stroke(); } for(let y=0;y<=vh();y+=step){ ctx.beginPath(); ctx.moveTo(0,y+0.5); ctx.lineTo(vw(),y+0.5); ctx.stroke(); } ctx.restore(); }
  function roundedRect(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r); c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); }
  function render(){ ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight); drawGrid(); for (const b of game.bullets) b.draw(); for(const e of game.enemies) e.draw(); for (const p of game.powerups) p.draw(); for (const pr of game.particles) pr.draw(); if (game.player) game.player.draw(); }
  function loop(ts){ const dt = Math.min(0.033, (ts - (game.lastTs||ts))/1000); game.lastTs=ts; if (!game.paused) game.time += dt; update(dt); render(); requestAnimationFrame(loop); }

  if (ui.actionBtn){ ui.actionBtn.addEventListener('click', () => { unlockAudio(); if (!game.hasStartedOnce) return startGame(); if (!game.running) return startGame(); togglePause(); }); }
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  canvas.addEventListener('touchstart', unlockAudio, { passive: true });

  requestAnimationFrame(loop);
})();

(() => {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const uiScore = document.getElementById('score');
  const uiWave = document.getElementById('wave');
  const uiHealth = document.getElementById('health');
  const overlay = document.getElementById('overlay');
  const startBtn = document.getElementById('startBtn');
  const restartBtn = document.getElementById('restartBtn');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlaySubtitle = document.getElementById('overlaySubtitle');
  const pauseBtn = document.getElementById('pauseBtn');

  // Coordinate helpers
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function distanceSquared(ax, ay, bx, by) { const dx = ax - bx; const dy = ay - by; return dx*dx + dy*dy; }
  function angleBetween(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax); }

  // Input
  const keys = new Set();
  const mouse = { x: canvas.width / 2, y: canvas.height / 2, down: false };
  window.addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); if (e.key === ' ') e.preventDefault(); });
  window.addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouse.x = (e.clientX - rect.left) * scaleX;
    mouse.y = (e.clientY - rect.top) * scaleY;
  });
  canvas.addEventListener('mousedown', () => { mouse.down = true; });
  window.addEventListener('mouseup', () => { mouse.down = false; });

  // Game state
  const game = {
    running: false,
    paused: false,
    score: 0,
    wave: 1,
    time: 0,
    lastTimestamp: 0,
    player: null,
    bullets: [],
    enemies: [],
    particles: [],
  };

  // Entities
  class Player {
    constructor() {
      this.positionX = canvas.width / 2;
      this.positionY = canvas.height / 2;
      this.radius = 14;
      this.moveSpeed = 230; // px/s
      this.health = 100;
      this.invincibleTimer = 0; // seconds
      this.reloadDelay = 0.14; // seconds between shots
      this.reloadTimer = 0;
    }
    update(dt) {
      let moveX = 0; let moveY = 0;
      if (keys.has('w') || keys.has('arrowup')) moveY -= 1;
      if (keys.has('s') || keys.has('arrowdown')) moveY += 1;
      if (keys.has('a') || keys.has('arrowleft')) moveX -= 1;
      if (keys.has('d') || keys.has('arrowright')) moveX += 1;
      if (moveX !== 0 || moveY !== 0) {
        const len = Math.hypot(moveX, moveY);
        moveX /= len; moveY /= len;
      }
      this.positionX = clamp(this.positionX + moveX * this.moveSpeed * dt, this.radius, canvas.width - this.radius);
      this.positionY = clamp(this.positionY + moveY * this.moveSpeed * dt, this.radius, canvas.height - this.radius);

      this.reloadTimer -= dt;
      if (this.invincibleTimer > 0) this.invincibleTimer -= dt;

      // Auto fire with mouse or Space
      if ((mouse.down || keys.has(' ')) && this.reloadTimer <= 0) {
        this.reloadTimer = this.reloadDelay;
        const theta = angleBetween(this.positionX, this.positionY, mouse.x, mouse.y);
        spawnBullet(this.positionX, this.positionY, theta);
      }
    }
    draw() {
      const isHurtBlink = this.invincibleTimer > 0 && Math.floor(game.time * 20) % 2 === 0;
      ctx.save();
      ctx.translate(this.positionX, this.positionY);
      // Body
      ctx.fillStyle = isHurtBlink ? '#ffe082' : '#4dd0e1';
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      // Gun direction
      const theta = angleBetween(this.positionX, this.positionY, mouse.x, mouse.y);
      ctx.rotate(theta);
      ctx.fillStyle = '#b2ebf2';
      ctx.fillRect(0, -4, this.radius + 10, 8);
      ctx.restore();
    }
  }

  class Bullet {
    constructor(x, y, angle) {
      this.positionX = x;
      this.positionY = y;
      this.velocityX = Math.cos(angle) * 520;
      this.velocityY = Math.sin(angle) * 520;
      this.radius = 4;
      this.life = 1.2; // seconds
    }
    update(dt) {
      this.positionX += this.velocityX * dt;
      this.positionY += this.velocityY * dt;
      this.life -= dt;
    }
    isOffscreen() {
      return this.positionX < -10 || this.positionX > canvas.width + 10 || this.positionY < -10 || this.positionY > canvas.height + 10 || this.life <= 0;
    }
    draw() {
      ctx.fillStyle = '#e3f2fd';
      ctx.beginPath();
      ctx.arc(this.positionX, this.positionY, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  class Enemy {
    constructor(speed, radius, health) {
      const edge = Math.floor(Math.random() * 4);
      const margin = 20;
      if (edge === 0) { this.positionX = -margin; this.positionY = Math.random() * canvas.height; }
      else if (edge === 1) { this.positionX = canvas.width + margin; this.positionY = Math.random() * canvas.height; }
      else if (edge === 2) { this.positionX = Math.random() * canvas.width; this.positionY = -margin; }
      else { this.positionX = Math.random() * canvas.width; this.positionY = canvas.height + margin; }
      this.speed = speed;
      this.radius = radius;
      this.health = health;
      this.hitFlash = 0;
    }
    update(dt) {
      const angleToPlayer = angleBetween(this.positionX, this.positionY, game.player.positionX, game.player.positionY);
      const velX = Math.cos(angleToPlayer) * this.speed;
      const velY = Math.sin(angleToPlayer) * this.speed;
      this.positionX += velX * dt;
      this.positionY += velY * dt;
      if (this.hitFlash > 0) this.hitFlash -= dt;
    }
    draw() {
      ctx.fillStyle = this.hitFlash > 0 ? '#ffcdd2' : '#ff6b6b';
      ctx.beginPath();
      ctx.arc(this.positionX, this.positionY, this.radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Spawners and effects
  function spawnBullet(x, y, angle) {
    const muzzleX = x + Math.cos(angle) * 18;
    const muzzleY = y + Math.sin(angle) * 18;
    game.bullets.push(new Bullet(muzzleX, muzzleY, angle));
  }

  function spawnEnemyWave(waveNumber) {
    const baseCount = 6 + Math.floor(waveNumber * 1.5);
    const enemiesToSpawn = baseCount;
    for (let i = 0; i < enemiesToSpawn; i++) {
      const speed = 60 + waveNumber * 5 + Math.random() * 25;
      const radius = clamp(12 - Math.floor(waveNumber / 4), 6, 12);
      const health = 1 + Math.floor(waveNumber / 4);
      game.enemies.push(new Enemy(speed, radius, health));
    }
  }

  // Collision and game logic
  function handleCollisions() {
    // Bullets vs Enemies
    for (let i = game.bullets.length - 1; i >= 0; i--) {
      const bullet = game.bullets[i];
      for (let j = game.enemies.length - 1; j >= 0; j--) {
        const enemy = game.enemies[j];
        const rs = bullet.radius + enemy.radius;
        if (distanceSquared(bullet.positionX, bullet.positionY, enemy.positionX, enemy.positionY) <= rs * rs) {
          game.bullets.splice(i, 1);
          enemy.health -= 1;
          enemy.hitFlash = 0.1;
          if (enemy.health <= 0) {
            game.enemies.splice(j, 1);
            game.score += 10;
          }
          break;
        }
      }
    }

    // Enemies vs Player
    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const enemy = game.enemies[i];
      const rs = enemy.radius + game.player.radius;
      if (distanceSquared(enemy.positionX, enemy.positionY, game.player.positionX, game.player.positionY) <= rs * rs) {
        if (game.player.invincibleTimer <= 0) {
          game.player.health -= 15;
          game.player.invincibleTimer = 0.8;
          if (game.player.health <= 0) {
            endGame();
          }
        }
      }
    }
  }

  // UI/state helpers
  function updateUI() {
    uiScore.textContent = String(game.score);
    uiWave.textContent = String(game.wave);
    uiHealth.textContent = String(Math.max(0, Math.floor(game.player?.health ?? 0)));
  }

  function startGame() {
    game.running = true;
    game.paused = false;
    game.score = 0;
    game.wave = 1;
    game.time = 0;
    game.lastTimestamp = 0;
    game.bullets = [];
    game.enemies = [];
    game.particles = [];
    game.player = new Player();
    spawnEnemyWave(game.wave);
    overlay.classList.add('hidden');
    restartBtn.classList.add('hidden');
  }

  function endGame() {
    game.running = false;
    overlay.classList.remove('hidden');
    restartBtn.classList.remove('hidden');
    overlayTitle.textContent = 'Game Over';
    overlaySubtitle.textContent = `Final Score: ${game.score} — Wave ${game.wave}`;
  }

  function togglePause() {
    if (!game.running) return;
    game.paused = !game.paused;
    pauseBtn.textContent = game.paused ? 'Resume' : 'Pause';
  }

  // Main loop
  function update(dt) {
    if (!game.running || game.paused) return;

    game.player.update(dt);

    for (let i = game.bullets.length - 1; i >= 0; i--) {
      const b = game.bullets[i];
      b.update(dt);
      if (b.isOffscreen()) game.bullets.splice(i, 1);
    }

    for (let i = game.enemies.length - 1; i >= 0; i--) {
      const e = game.enemies[i];
      e.update(dt);
    }

    handleCollisions();

    // Wave cleared
    if (game.enemies.length === 0) {
      game.wave += 1;
      spawnEnemyWave(game.wave);
    }

    updateUI();
  }

  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    const step = 40;
    for (let x = 0; x <= canvas.width; x += step) {
      ctx.beginPath(); ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, canvas.height); ctx.stroke();
    }
    for (let y = 0; y <= canvas.height; y += step) {
      ctx.beginPath(); ctx.moveTo(0, y + 0.5); ctx.lineTo(canvas.width, y + 0.5); ctx.stroke();
    }
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();
    for (const b of game.bullets) b.draw();
    for (const e of game.enemies) e.draw();
    if (game.player) game.player.draw();
  }

  function loop(ts) {
    const dt = Math.min(0.033, (ts - (game.lastTimestamp || ts)) / 1000);
    game.lastTimestamp = ts;
    if (!game.paused) game.time += dt;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  // UI bindings
  startBtn.addEventListener('click', startGame);
  restartBtn.addEventListener('click', startGame);
  pauseBtn.addEventListener('click', togglePause);
  window.addEventListener('keydown', (e) => { if (e.key.toLowerCase() === 'p') togglePause(); });

  // Kick off loop
  requestAnimationFrame(loop);
})();



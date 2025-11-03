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
    personalBest: document.getElementById('personalBest'),
    restartFromGameOver: document.getElementById('restartFromGameOver'),
    submitScoreBtn: document.getElementById('submitScoreBtn'),
    scoreSubmitInput: document.getElementById('scoreSubmitInput'),
  };

  // Player name and personal best storage
  const storage = {
    getPlayerName: () => localStorage.getItem('chumpPlayerName') || '',
    setPlayerName: (name) => { if (name) localStorage.setItem('chumpPlayerName', name); },
    getPersonalBest: () => parseInt(localStorage.getItem('chumpPersonalBest') || '0', 10),
    setPersonalBest: (score) => localStorage.setItem('chumpPersonalBest', String(score)),
  };
  let playerName = storage.getPlayerName();

  // Firebase Leaderboard
  const leaderboard = {
    submitScore: (name, score, wave) => {
      if (!window.firebaseDb || !window.firebasePush || !window.firebaseRef) return;
      try {
        const scoresRef = window.firebaseRef(window.firebaseDb, 'scores');
        window.firebasePush(scoresRef, {
          name: name || 'Anonymous',
          score: score,
          wave: wave,
          timestamp: Date.now(),
        });
      } catch (e) { console.warn('Failed to submit score:', e); }
    },
    fetchTopScores: async (callback, limit = 10, retries = 3) => {
      if (!window.firebaseDb || !window.firebaseRef || !window.firebaseQuery || !window.firebaseOrderBy || !window.firebaseLimit || !window.firebaseGet) {
        console.warn('Firebase not initialized yet');
        // Try to use cached scores if available
        const cached = localStorage.getItem('chumpLeaderboardCache');
        if (cached) {
          try {
            const scores = JSON.parse(cached);
            if (callback) callback(scores);
            return;
          } catch (e) {}
        }
        if (callback) callback([]);
        return;
      }
      try {
        const scoresRef = window.firebaseRef(window.firebaseDb, 'scores');
        // Get more scores than needed, then sort and take top N
        // Firebase orderBy only does ascending, so we use limitToLast to get highest scores
        const topQuery = window.firebaseQuery(scoresRef, window.firebaseOrderBy('score'), window.firebaseLimit(limit * 2));
        
        // Use get() for one-time fetch with proper timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout')), 5000);
        });
        
        try {
          const snapshot = await Promise.race([
            window.firebaseGet(topQuery),
            timeoutPromise
          ]);
          
          const data = snapshot.val();
          const scores = [];
          if (data) {
            for (const key in data) {
              scores.push({ ...data[key], id: key });
            }
            // Sort by score descending and take top N
            scores.sort((a, b) => b.score - a.score);
            scores.splice(limit); // Keep only top N
            
            // Cache the scores for offline use
            try {
              localStorage.setItem('chumpLeaderboardCache', JSON.stringify(scores));
              localStorage.setItem('chumpLeaderboardCacheTime', String(Date.now()));
            } catch (e) {}
          }
          if (callback) callback(scores);
        } catch (error) {
          // Timeout or other error
          if (error.message === 'Timeout') {
            console.warn('Leaderboard fetch timeout');
          } else {
            console.warn('Leaderboard fetch error:', error);
          }
          // Try to use cached scores
          const cached = localStorage.getItem('chumpLeaderboardCache');
          if (cached) {
            try {
              const scores = JSON.parse(cached);
              if (callback) callback(scores);
              return;
            } catch (e) {}
          }
          // Retry if we have retries left
          if (retries > 0) {
            setTimeout(() => leaderboard.fetchTopScores(callback, limit, retries - 1), 1000);
          } else {
            if (callback) callback([]);
          }
        }
      } catch (e) {
        console.warn('Failed to fetch leaderboard:', e);
        // Try to use cached scores
        const cached = localStorage.getItem('chumpLeaderboardCache');
        if (cached) {
          try {
            const scores = JSON.parse(cached);
            if (callback) callback(scores);
            return;
          } catch (e) {}
        }
        if (callback) callback([]);
      }
    },
    showLoading: (targetList = null) => {
      const list = targetList || document.getElementById('leaderboardList');
      if (!list) return;
      list.innerHTML = '<div style="opacity:0.7;padding:8px;text-align:center;">Loading leaderboard...</div>';
    },
    display: (scores, currentName, currentScore, targetList = null) => {
      const list = targetList || document.getElementById('leaderboardList');
      if (!list) {
        console.warn('Leaderboard list element not found');
        return;
      }
      list.innerHTML = '';
      if (!scores || scores.length === 0) {
        list.innerHTML = '<div style="opacity:0.6;padding:8px;">No scores yet!</div>';
        return;
      }
      scores.forEach((entry, idx) => {
        if (!entry || !entry.score) return; // Skip invalid entries
        const item = document.createElement('div');
        item.className = 'leaderboard-item' + (entry.name === currentName && entry.score === currentScore ? ' you' : '');
        item.innerHTML = `<span>${idx + 1}. ${entry.name || 'Anonymous'}</span><span>${entry.score} (Wave ${entry.wave || 1})</span>`;
        list.appendChild(item);
      });
    },
  };

  // Assets (optional)
  const assets = { bullet: null, bulletReady: false, enemySprites: {}, chump: null };
  const sfx = { map: {}, pools: {}, maxPool: 8, lastShotAt: 0, ctx: null, unlocked: false };
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
      shoot: ['public/gunshot.mp3','public/lasergun.mp3'],
      explosion: ['public/enemyexplosion.mp3'], // Using enemyexplosion for explosion sound
      enemyExplosion: ['public/enemyexplosion.mp3'],
      powerup: ['public/powerup.mp3'],
      gameover: ['public/gameover.mp3'],
      gamestart: ['public/gamestart.mp3'],
      playerdie: ['public/playerdie.mp3'],
      tap: ['public/tap.wav'],
      enhit: ['public/enhit.wav'],
    };
    sfx.map.shoot = loadAudioTry(C.shoot);
    sfx.map.explosion = loadAudioTry(C.explosion);
    sfx.map.enemyExplosion = loadAudioTry(C.enemyExplosion);
    sfx.map.powerup = loadAudioTry(C.powerup);
    sfx.map.gameover = loadAudioTry(C.gameover);
    sfx.map.gamestart = loadAudioTry(C.gamestart);
    sfx.map.playerdie = loadAudioTry(C.playerdie);
    sfx.map.tap = loadAudioTry(C.tap);
    sfx.map.enhit = loadAudioTry(C.enhit);
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
  // Re-unlock audio when returning to the tab/app
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      try { if (sfx.ctx && sfx.ctx.state === 'suspended') sfx.ctx.resume().catch(()=>{}); } catch {}
      // poke a muted sound to satisfy some policies
      if (sfx.unlocked) return;
      const a = sfx.map.shoot || sfx.map.powerup || sfx.map.explosion;
      if (a) { const i = a.cloneNode(); i.volume = 0; i.play().catch(()=>{}); }
      sfx.unlocked = true;
    }
  });
  const warnedMissing = new Set();
  function getPooledAudio(name) {
    const base = sfx.map[name]; if (!base) return null;
    let pool = sfx.pools[name];
    if (!pool) { pool = []; sfx.pools[name] = pool; }
    // find a free instance
    for (const inst of pool) {
      if (inst.ended || inst.paused) { try { inst.currentTime = 0; } catch {} return inst; }
    }
    // create new if under cap
    if (pool.length < sfx.maxPool) {
      const inst = base.cloneNode();
      pool.push(inst);
      return inst;
    }
    // fallback: reuse first
    return pool[0];
  }
  function playSfx(name, { volume = 0.8, rateLimitMs = 0 } = {}) {
    const a = getPooledAudio(name);
    if (!a) { if (!warnedMissing.has(name)) { warnedMissing.add(name); console.warn(`[SFX] Missing sound for`, name); } return; }
    if (rateLimitMs) {
      const now = performance.now();
      if (name === 'shoot' && now - sfx.lastShotAt < rateLimitMs) return;
      if (name === 'shoot') sfx.lastShotAt = now;
    }
    try {
      a.volume = volume;
      try { a.currentTime = 0; } catch {}
      a.play().catch(() => {});
    } catch {}
  }
  function loadAssets() {
    const img = new Image();
    img.src = 'public/bullet.png';
    img.onload = () => { assets.bullet = img; assets.bulletReady = true; };
    img.onerror = () => { /* fallback to vector bullet */ };
    const chump = new Image();
    chump.src = 'public/chumphead.png';
    chump.onload = () => { assets.chump = chump; };
    chump.onerror = () => { /* fallback to vector monkey */ };
    // Enemy sprites (optional)
    ['enemy1.png','enemy2.png','enemy3.png'].forEach((fname) => {
      const e = new Image();
      e.src = `public/${fname}`;
      e.onload = () => { assets.enemySprites[fname] = e; };
      e.onerror = () => {};
    });
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
    scoreSubmitted: false,
  };

  class Player {
    constructor() {
      this.x = canvas.width / 2; this.y = canvas.height / 2;
      const scale = isMobileViewport() ? 0.75 : 1;
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
        // Larger aim ring on mobile for easier direction changes
        const baseRing = isMobileViewport() ? this.r * 4.0 : this.r * 1.4;
        const aimRing = Math.max(isMobileViewport() ? 60 : 16, baseRing);
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
      const face = blink ? '#ffffff' : '#f4e3c1';
      const body = blink ? '#ffffff' : '#a67c52';
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

      // Draw chump sprite if available, otherwise fallback vector monkey
      if (assets.chump) {
        const w = this.r * 2.5;
        const aspect = assets.chump.height / assets.chump.width;
        const h = w * aspect;
        // Flash white glow when hit
        if (blink) {
          ctx.shadowColor = '#ffffff';
          ctx.shadowBlur = 25;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }
        ctx.drawImage(assets.chump, -w/2, -h/2, w, h);
        // Add white circular glow when hit (bigger than enemies)
        if (blink) {
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          const glowRadius = this.r * 1.8; // Bigger than enemy flash (enemies use r*1.0-1.2)
          ctx.beginPath();
          ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
        // Reset shadow for next draw
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 2;
      } else {
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
        // Add white circular glow when hit (bigger than enemies)
        if (blink) {
          ctx.globalCompositeOperation = 'screen';
          ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
          const glowRadius = this.r * 1.8; // Bigger than enemy flash
          ctx.beginPath();
          ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
        }
      }
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
      this.s=speed; this.r=r * scale; this.hp=hp; this.flash=0; this.dead=false;
      const kinds = ['grunt','runner','tank'];
      this.kind = kinds[Math.floor(Math.random()*kinds.length)];
      // Choose sprite by kind mapping if available
      const kindToFile = { grunt: 'enemy1.png', runner: 'enemy2.png', tank: 'enemy3.png' };
      this.sprite = assets.enemySprites[kindToFile[this.kind]] || null;
      this.angle = 0;
    }
    update(dt){ const th = angle(this.x, this.y, game.player.x, game.player.y); this.x += Math.cos(th)*this.s*dt; this.y += Math.sin(th)*this.s*dt; this.angle = th; if (this.flash>0) this.flash -= dt; }
    draw(){
      ctx.save();
      ctx.translate(this.x, this.y);
      // Flash red glow when hit (apply before drawing)
      if (this.flash > 0) {
        ctx.shadowColor = '#ff4444';
        ctx.shadowBlur = 20;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      } else {
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 2;
      }
      if (this.sprite) {
        // Draw sprite scaled around radius; rotate toward player
        ctx.rotate(this.angle);
        const w = this.r * 2.4; // slightly bigger
        const aspect = this.sprite.height / this.sprite.width;
        const h = w * aspect;
        ctx.drawImage(this.sprite, -w/2, -h/2, w, h);
        // Add red overlay when hit (more visible)
        if (this.flash > 0) {
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = 'rgba(255, 68, 68, 0.6)';
          ctx.fillRect(-w/2, -h/2, w, h);
          ctx.globalCompositeOperation = 'source-over';
        }
      } else {
        // Fallback vector styles
        const base = this.flash>0 ? '#ff4444' : '#ff6b6b';
        if (this.kind === 'grunt') {
          const s = this.r * 1.6;
          ctx.fillStyle = base;
          ctx.fillRect(-s/2, -s/2, s, s);
          ctx.fillStyle = '#0b1020';
          ctx.fillRect(-s*0.15, -s*0.1, s*0.12, s*0.12);
          ctx.fillRect(s*0.03, -s*0.1, s*0.12, s*0.12);
        } else if (this.kind === 'runner') {
          const s = this.r * 2.0;
          ctx.fillStyle = base;
          ctx.beginPath(); ctx.moveTo(-s/2, s/2); ctx.lineTo(s/2, s/2); ctx.lineTo(0, -s/2); ctx.closePath(); ctx.fill();
        } else {
          const w = this.r * 2.2; const h = this.r * 2.0; const rr = Math.min(10, this.r*0.8);
          ctx.fillStyle = base; roundedRect(ctx, -w/2, -h/2, w, h, rr); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0,0,this.r*0.8,0,Math.PI*2); ctx.stroke();
        }
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
        if (dist2(b.x,b.y,e.x,e.y) <= rs*rs){ game.bullets.splice(i,1); e.hp -= 1; e.flash = 0.2; playSfx('enhit', { volume: 0.6 }); if (e.hp<=0){ e.dead = true; game.score += 10; maybeDropPowerUp(e.x, e.y); spawnExplosion(e.x, e.y, { r:255, g:107, b:107 }); playSfx('enemyExplosion', { volume: 0.8 }); } break; }
      }
    }
    // enemies vs player
    for (let i=game.enemies.length-1;i>=0;i--){
      const e=game.enemies[i]; const rs=e.r+game.player.r;
      if (dist2(e.x,e.y,game.player.x,game.player.y) <= rs*rs){
        if (game.player.invT <= 0){ game.player.health -= 15; game.player.invT = 0.8; playSfx('tap', { volume: 0.7 }); if (game.player.health <= 0) return endGame(); }
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
    game.running=true; game.paused=false; game.score=0; game.wave=1; game.time=0; game.lastTs=0; game.bullets=[]; game.enemies=[]; game.powerups=[]; game.particles=[]; game.player=new Player(); spawnWave(game.wave); game.hasStartedOnce=true; game.scoreSubmitted=false; if (ui.actionBtn) ui.actionBtn.textContent='Pause'; updateUI();
    if (ui.gameOver) ui.gameOver.classList.add('hidden');
    playSfx('gamestart', { volume: 0.6 });
  }
  function endGame(){
    game.running=false;
    if (ui.actionBtn) ui.actionBtn.textContent='Restart';
    if (ui.finalScore) ui.finalScore.textContent = String(game.score);
    if (ui.gameOver) ui.gameOver.classList.remove('hidden');
    
    // Reset submit button for new game
    if (ui.submitScoreBtn) {
      ui.submitScoreBtn.disabled = false;
      ui.submitScoreBtn.textContent = 'Submit Score';
      ui.submitScoreBtn.style.opacity = '1';
    }
    game.scoreSubmitted = false;
    
    // Load saved name into input if available
    if (ui.scoreSubmitInput) {
      ui.scoreSubmitInput.value = playerName || '';
      ui.scoreSubmitInput.focus();
    }
    
    // Check and update personal best
    const currentBest = storage.getPersonalBest();
    const finalScore = game.score;
    if (finalScore > currentBest) {
      storage.setPersonalBest(finalScore);
      if (ui.personalBest) {
        ui.personalBest.textContent = `🎉 New Personal Best! ${finalScore} (was ${currentBest})`;
      }
    } else if (currentBest > 0) {
      if (ui.personalBest) {
        ui.personalBest.textContent = `Personal Best: ${currentBest}`;
      }
    } else {
      if (ui.personalBest) ui.personalBest.textContent = '';
    }
    
    // Fetch and display leaderboard (but don't submit score yet)
    leaderboard.showLoading();
    leaderboard.fetchTopScores((scores) => {
      leaderboard.display(scores, '', finalScore);
    }, 10);
    
    // Player death cue, explosion + optional game over jingle
    playSfx('playerdie', { volume: 0.7 });
    playSfx('explosion', { volume: 0.8 });
    playSfx('gameover', { volume: 0.6 });
  }
  function togglePause(){ if (!game.running) return; game.paused=!game.paused; if (ui.actionBtn) ui.actionBtn.textContent = game.paused ? 'Resume' : 'Pause'; }

  function update(dt){ if (!game.running || game.paused) return; for (let i=game.enemies.length-1;i>=0;i--){ if (game.enemies[i].dead) game.enemies.splice(i,1);} game.player.update(dt); for (let i=game.bullets.length-1;i>=0;i--){ const b=game.bullets[i]; b.update(dt); if (b.off()) game.bullets.splice(i,1);} for (const e of game.enemies) e.update(dt); for (const p of game.powerups) p.update(dt); for (let i=game.particles.length-1;i>=0;i--){ const pr=game.particles[i]; pr.update(dt); if (pr.life<=0) game.particles.splice(i,1);} collisions(); if (game.enemies.length===0){ game.wave+=1; spawnWave(game.wave);} updateUI(); }
  function drawGrid(){ ctx.save(); ctx.strokeStyle='rgba(247,209,84,0.08)'; ctx.lineWidth=1; const step=40; for(let x=0;x<=vw();x+=step){ ctx.beginPath(); ctx.moveTo(x+0.5,0); ctx.lineTo(x+0.5,vh()); ctx.stroke(); } for(let y=0;y<=vh();y+=step){ ctx.beginPath(); ctx.moveTo(0,y+0.5); ctx.lineTo(vw(),y+0.5); ctx.stroke(); } ctx.restore(); }
  function roundedRect(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x+r,y); c.lineTo(x+w-r,y); c.quadraticCurveTo(x+w,y,x+w,y+r); c.lineTo(x+w,y+h-r); c.quadraticCurveTo(x+w,y+h,x+w-r,y+h); c.lineTo(x+r,y+h); c.quadraticCurveTo(x,y+h,x,y+h-r); c.lineTo(x,y+r); c.quadraticCurveTo(x,y,x+r,y); }
  function render(){ ctx.clearRect(0,0,canvas.clientWidth,canvas.clientHeight); drawGrid(); for (const b of game.bullets) b.draw(); for(const e of game.enemies) e.draw(); for (const p of game.powerups) p.draw(); for (const pr of game.particles) pr.draw(); if (game.player) game.player.draw(); }
  function loop(ts){ const dt = Math.min(0.033, (ts - (game.lastTs||ts))/1000); game.lastTs=ts; if (!game.paused) game.time += dt; update(dt); render(); requestAnimationFrame(loop); }

  // Game over button handlers
  if (ui.restartFromGameOver) {
    ui.restartFromGameOver.addEventListener('click', () => {
      // Just restart, don't submit score
      startGame();
    });
  }
  
  if (ui.submitScoreBtn) {
    ui.submitScoreBtn.addEventListener('click', () => {
      // Prevent multiple submissions
      if (game.scoreSubmitted) return;
      
      const name = (ui.scoreSubmitInput?.value || '').trim();
      if (name && game.score > 0) {
        // Mark as submitted and disable button
        game.scoreSubmitted = true;
        ui.submitScoreBtn.disabled = true;
        ui.submitScoreBtn.textContent = 'Submitted!';
        ui.submitScoreBtn.style.opacity = '0.6';
        
        // Save name and submit score
        playerName = name;
        storage.setPlayerName(name);
        leaderboard.submitScore(playerName, game.score, game.wave);
        // Refresh leaderboard to show new score
        leaderboard.showLoading();
        leaderboard.fetchTopScores((scores) => {
          leaderboard.display(scores, playerName, game.score);
        }, 10);
      }
    });
  }
  
  if (ui.scoreSubmitInput) {
    ui.scoreSubmitInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter' && ui.submitScoreBtn) {
        ui.submitScoreBtn.click();
      }
    });
  }

  if (ui.actionBtn){ ui.actionBtn.addEventListener('click', () => { unlockAudio(); if (!game.hasStartedOnce) return startGame(); if (!game.running) return startGame(); togglePause(); }); }
  document.addEventListener('pointerdown', unlockAudio, { passive: true });
  canvas.addEventListener('touchstart', unlockAudio, { passive: true });

  requestAnimationFrame(loop);
})();




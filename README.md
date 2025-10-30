Scrolling Jumper (Mobile-friendly)
==================================

HTML5 Canvas vertical scrolling jumper with left/right/jump controls, touch buttons for mobile, and zero build. Host it on GitHub Pages easily.

Controls
--------
- Keyboard: Left/Right (A/D) to move, Up/W/Space to jump, P to pause
- Mobile: On-screen ◀ ⤒ ▶ buttons

Local Run
---------
Open `index.html` in your browser.

If your browser blocks local files, run a tiny server:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

Deploy to GitHub Pages
----------------------
1. Create a new GitHub repo and push this folder.
2. In the repo: Settings → Pages.
3. Source: Deploy from a branch → Branch: `main` → Folder: `/root`.
4. Save. Wait ~1–2 minutes; use the provided URL.

Customize
---------
- Physics/difficulty: edit `WORLD` constants in `src/game.js`.
- Canvas size: change `<canvas id="game" width height>` in `index.html` (CSS scales it).
- Colors/UI: edit `styles.css`.

License
-------
MIT

Top-Down Wave Shooter
======================

A lightweight HTML5 Canvas top-down wave shooter you can host for free on GitHub Pages.

Controls
--------
- WASD or Arrow Keys: Move
- Mouse: Aim
- Left Click or Space: Shoot
- P or Pause button: Pause/Resume

Local Run
---------
Just open `index.html` in your browser. No build/tools required.

Optional: Local server (for stricter browsers)
----------------------------------------------
If your browser blocks local file input, run a quick server:

```bash
# Python 3
python -m http.server 8000
# then open http://localhost:8000
```

Deploy to GitHub Pages
----------------------
1. Create a new repo and push this project to it.
2. On GitHub, go to Settings → Pages.
3. Under "Source", choose "Deploy from a branch".
4. Set Branch to `main` (or `master`) and Folder to `/root` (or `/docs` if you move files there).
5. Save. Your site will be live at the URL shown on that page in 1–2 minutes.

Using a `docs/` folder (optional)
---------------------------------
If you prefer, move all files into a `docs/` folder and set GitHub Pages folder to `/docs`.

Customize
---------
- Tune difficulty in `src/game.js` inside `spawnEnemyWave`.
- Change canvas size in `index.html` (`<canvas id="game" width height>`)
- Update colors in `styles.css`.

License
-------
MIT



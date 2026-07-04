# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A classic Tetris implementation in vanilla JavaScript using HTML5 Canvas. No dependencies, no build step, no package.json — just three files that cooperate:

- `index.html` — DOM structure: the main `<canvas id="board">` (300×600, 10×20 grid of 30px blocks) and a `<canvas id="next-canvas">` for the next-piece preview, plus the score/lines/level panel and pause/game-over overlay.
- `style.css` — dark/retro arcade visual theme.
- `game.js` — all game logic (~300 lines, single file, no modules).

## Running the game

No install or build required. Either open `index.html` directly in a browser, or serve it statically:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There is no test suite, linter, or build/bundle process in this repo.

## Architecture (game.js)

Everything lives in one file with module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) reset by `init()`.

- **Board model**: `ROWS × COLS` matrix where each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: the 7 standard tetrominoes defined as square matrices in `PIECES`, each cell value indexing into `COLORS`. Rotation (`rotateCW`) is a transpose + row-reverse, not per-piece rotation tables.
- **Collision** (`collide`): checks board bounds and existing locked cells for a shape at a given offset.
- **Wall kicks** (`tryRotate`): after rotating, tries offsets `[0, -1, 1, -2, 2]` columns until a non-colliding placement is found, else the rotation is discarded.
- **Game loop** (`loop`): driven by `requestAnimationFrame`; accumulates elapsed time in `dropAccum` and advances the piece one row once `dropInterval` is exceeded, otherwise calls `lockPiece()`.
- **Locking** (`lockPiece`): merges the current piece into `board`, clears completed lines, then spawns the next piece.
- **Line clearing** (`clearLines`): scans bottom-to-top, splices out full rows and unshifts empty rows at the top; updates score/lines/level and recalculates `dropInterval`.
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by current level; hard drop adds 2 points per cell dropped, soft drop adds 1 point per row.
- **Leveling/speed**: level increases every 10 lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row and redraws it at `globalAlpha = 0.2`.
- **Game over**: triggered in `spawn()` when a freshly spawned piece immediately collides.

Rendering (`draw`, `drawNext`, `drawGrid`, `drawBlock`) is plain Canvas 2D — no scene graph, redrawn fully every frame.

## Tunable constants (top of game.js)

`COLS`, `ROWS`, `BLOCK`, `COLORS`, `LINE_SCORES`, initial `dropInterval`. If `COLS`/`ROWS`/`BLOCK` change, update the `<canvas id="board">` `width`/`height` in `index.html` to match (`COLS × BLOCK` and `ROWS × BLOCK`).

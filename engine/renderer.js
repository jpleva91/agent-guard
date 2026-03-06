// Canvas rendering
import { drawSprite } from '../sprites/sprites.js';
import { getTileTexture, getGrassFrame, getBattleBackground } from '../sprites/tiles.js';
import { generateMonster, generateEgg } from '../sprites/monsterGen.js';

const TILE = 32;
const COLORS = {
  player: '#3498db'
};

let ctx;
let frameCount = 0;

export function initRenderer(canvas) {
  ctx = canvas.getContext('2d');
}

export function drawMap(mapData) {
  frameCount++;
  for (let y = 0; y < mapData.height; y++) {
    for (let x = 0; x < mapData.width; x++) {
      const tile = mapData.tiles[y][x];
      let texture;
      if (tile === 1) {
        texture = getTileTexture('wall');
      } else if (tile === 2) {
        texture = getGrassFrame(frameCount);
      } else {
        texture = getTileTexture('ground');
      }
      ctx.drawImage(texture, x * TILE, y * TILE);
    }
  }
}

export function drawPlayer(player) {
  const px = player.x * TILE;
  const py = player.y * TILE;

  // Try sprite first
  const spriteName = `player_${player.dir}`;
  if (drawSprite(ctx, spriteName, px, py, TILE, TILE)) return;

  // Fallback: colored square with direction triangle
  ctx.fillStyle = COLORS.player;
  ctx.fillRect(px + 4, py + 4, TILE - 8, TILE - 8);

  ctx.fillStyle = '#2980b9';
  const cx = px + TILE / 2;
  const cy = py + TILE / 2;
  ctx.beginPath();
  if (player.dir === 'up') {
    ctx.moveTo(cx, py + 2);
    ctx.lineTo(cx - 4, py + 10);
    ctx.lineTo(cx + 4, py + 10);
  } else if (player.dir === 'down') {
    ctx.moveTo(cx, py + TILE - 2);
    ctx.lineTo(cx - 4, py + TILE - 10);
    ctx.lineTo(cx + 4, py + TILE - 10);
  } else if (player.dir === 'left') {
    ctx.moveTo(px + 2, cy);
    ctx.lineTo(px + 10, cy - 4);
    ctx.lineTo(px + 10, cy + 4);
  } else {
    ctx.moveTo(px + TILE - 2, cy);
    ctx.lineTo(px + TILE - 10, cy - 4);
    ctx.lineTo(px + TILE - 10, cy + 4);
  }
  ctx.fill();
}

export function drawBattle(battle, movesData, typeColors) {
  // Background
  const bg = getBattleBackground();
  if (bg) {
    ctx.drawImage(bg, 0, 0);
  } else {
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, 480, 320);
  }

  // Enemy BugMon (top right) - wild monsters show as eggs until caught
  if (!battle.enemy.sprite || !drawSprite(ctx, battle.enemy.sprite, 320, 40, 64, 64)) {
    const enemySprite = generateEgg(battle.enemy.id, battle.enemy.color, 64);
    ctx.drawImage(enemySprite, 320, 40);
  }
  ctx.fillStyle = '#fff';
  ctx.font = '14px monospace';
  ctx.fillText(battle.enemy.name, 300, 30);
  if (typeColors && battle.enemy.type) {
    drawTypeBadge(battle.enemy.name, 300, 30, battle.enemy.type, typeColors);
  }
  drawHPBar(300, 110, 100, battle.enemy.currentHP, battle.enemy.hp);

  // Player BugMon (bottom left)
  const playerMon = battle.playerMon;
  if (!playerMon.sprite || !drawSprite(ctx, playerMon.sprite, 80, 140, 64, 64)) {
    const playerSprite = generateMonster(playerMon.id, playerMon.color, 64);
    ctx.drawImage(playerSprite, 80, 140);
  }
  ctx.fillStyle = '#fff';
  ctx.fillText(playerMon.name, 60, 130);
  if (typeColors && playerMon.type) {
    drawTypeBadge(playerMon.name, 60, 130, playerMon.type, typeColors);
  }
  drawHPBar(60, 210, 100, playerMon.currentHP, playerMon.hp);

  // Menu area
  ctx.fillStyle = '#16213e';
  ctx.fillRect(0, 240, 480, 80);
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 240, 480, 80);

  if (battle.state === 'menu') {
    const options = ['Fight', 'Capture', 'Run'];
    options.forEach((opt, i) => {
      ctx.fillStyle = i === battle.menuIndex ? '#e94560' : '#fff';
      ctx.font = '16px monospace';
      ctx.fillText(opt, 20 + i * 160, 275);
    });
  } else if (battle.state === 'fight') {
    const moves = playerMon.moves;
    moves.forEach((moveId, i) => {
      const move = movesData.find(m => m.id === moveId);
      if (move) {
        // Type color dot
        if (typeColors && move.type) {
          ctx.fillStyle = typeColors[move.type] || '#fff';
          ctx.beginPath();
          ctx.arc(14 + i * 160, 271, 4, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = i === battle.moveIndex ? '#e94560' : '#fff';
        ctx.font = '14px monospace';
        ctx.fillText(move.name, 22 + i * 160, 275);
      }
    });
  } else if (battle.state === 'message') {
    ctx.fillStyle = '#fff';
    ctx.font = '14px monospace';
    ctx.fillText(battle.message, 20, 275);
  }
}

function drawTypeBadge(name, nameX, nameY, type, typeColors) {
  ctx.font = '14px monospace';
  const nameWidth = ctx.measureText(name).width;
  const label = type.toUpperCase();
  ctx.font = '9px monospace';
  const labelWidth = ctx.measureText(label).width;
  const badgeX = nameX + nameWidth + 6;
  const badgeY = nameY - 10;
  const badgeW = labelWidth + 8;
  const badgeH = 13;

  ctx.fillStyle = typeColors[type] || '#555';
  ctx.beginPath();
  ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 3);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.fillText(label, badgeX + 4, nameY - 1);
}

function drawHPBar(x, y, width, current, max) {
  const pct = Math.max(0, current / max);
  ctx.fillStyle = '#333';
  ctx.fillRect(x, y, width, 10);
  ctx.fillStyle = pct > 0.5 ? '#2ecc71' : pct > 0.2 ? '#f39c12' : '#e74c3c';
  ctx.fillRect(x, y, width * pct, 10);
  ctx.fillStyle = '#fff';
  ctx.font = '10px monospace';
  ctx.fillText(`${Math.max(0, Math.ceil(current))}/${max}`, x + width + 5, y + 9);
}

export function clear() {
  ctx.clearRect(0, 0, 480, 320);
}

/* =========================================================
   NEON ESCAPE — script.js
   Juego 3D de supervivencia y recolección hecho con Three.js.

   Estructura del código (secciones numeradas):
     1) Configuración y constantes
     2) Inicialización de Three.js (renderizador, escena, cámara, luces)
     3) Creación de la arena (suelo, rejilla, muros, pilares)
     4) Jugador
     5) Enemigos
     6) Cristales (coleccionables)
     7) Partículas y efectos visuales
     8) Estados del juego, HUD y pantallas
     9) Entrada de datos (teclado y táctil)
    10) Bucle principal (update + render)
   ========================================================= */

import * as THREE from "three";

/* =========================================================
   1) CONFIGURACIÓN Y CONSTANTES
   Todos los números del juego están aquí para poder
   ajustar la dificultad sin tocar el resto del código.
   ========================================================= */

const CONFIG = {
  arenaHalf: 22,          // media arena: se mueve entre -22 y +22 en X y Z
  wallHeight: 2.6,        // altura de los muros
  playerSpeed: 11,        // velocidad del jugador (unidades/segundo)
  playerRadius: 0.75,     // radio de colisión del jugador
  enemySpeed: 7.4,        // velocidad de los enemigos (más lenta que el jugador)
  extraEnemySpeed: 6.9,
  extraEnemyDelay: 45,    // segundo en el que aparece el tercer enemigo
  enemyRadius: 0.85,
  crystalCount: 8,        // cristales necesarios para ganar
  pickupRadius: 1.8,      // distancia a la que se recoge un cristal
  crystalMargin: 7.5,     // separación mínima entre cristales
  crystalWallMargin: 3,   // distancia mínima de un cristal a los muros
  startLives: 3,
  timeLimit: 90,          // duración de la partida en segundos
  invulnTime: 2,          // segundos de invulnerabilidad tras recibir daño
  pillarRadius: 1.25,     // radio de los pilares decorativos (obstáculos)
};

const COLORS = {
  bg: 0x07040f,
  floor: 0x0d0a1e,
  cyan: 0x18e5ff,
  magenta: 0xff2fd6,
  violet: 0xb44bff,
  danger: 0xff3355,
  gridA: 0x00e5ff,
  gridB: 0x2b2158,
  ambient: 0x3a2f5e,
};

// Posiciones fijas del inicio de la partida
const PLAYER_SPAWN = { x: 0, z: 16 };
const ENEMY_SPAWNS = [
  { x: -14, z: -16 },
  { x: 14, z: -16 },
];
const EXTRA_ENEMY_CORNERS = [
  { x: -17, z: -17 },
  { x: 17, z: -17 },
  { x: -17, z: 17 },
  { x: 17, z: 17 },
];
// Obstáculos interiores (pilares con colisión)
const pillars = [
  { x: 8, z: 8 },
  { x: -8, z: 8 },
  { x: 8, z: -8 },
  { x: -8, z: -8 },
];

const KEYMAP = {
  KeyW: "up", ArrowUp: "up",
  KeyS: "down", ArrowDown: "down",
  KeyA: "left", ArrowLeft: "left",
  KeyD: "right", ArrowRight: "right",
};

/* =========================================================
   Estado global de la partida
   ========================================================= */

let gameState = "menu"; // "menu" | "playing" | "won" | "lost"
let lives = CONFIG.startLives;
let timeLeft = CONFIG.timeLimit;
let collected = 0;
let invulnTimer = 0;      // segundos de invulnerabilidad restantes
let shakeTimer = 0;       // sacudida de cámara restante
let flashTimer = 0;       // destello de daño restante
let msgTimer = 0;         // aviso del HUD restante
let extraEnemyTimer = CONFIG.extraEnemyDelay;
let hasTouch = false;
let hudTimeCache = "";

// Referencias a Three.js
let renderer, scene, camera, clock;
const player = { mesh: null, kbX: 0, kbZ: 0 }; // kb = velocidad de empuje al recibir daño
const enemies = [];
const crystals = [];
const particles = [];

// Entrada del jugador
const keysHeld = { up: false, down: false, left: false, right: false };
const touchDir = { up: false, down: false, left: false, right: false };

// Referencias al DOM
const dom = {};

/* =========================================================
   2) INICIALIZACIÓN DE THREE.JS
   ========================================================= */

function cacheDOM() {
  const ids = [
    "scene", "hud", "hud-time", "hud-crystals", "hud-lives",
    "message", "flash", "overlay-start", "overlay-end",
    "end-title", "end-stats", "end-best", "start-best",
    "btn-play", "btn-restart",
  ];
  for (const id of ids) {
    const key = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    dom[key] = document.getElementById(id);
  }
  dom.touchButtons = Array.from(document.querySelectorAll("#touch-controls .pad"));
}

function initThree() {
  renderer = new THREE.WebGLRenderer({ canvas: dom.scene, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;           // sombras suaves
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.bg);
  scene.fog = new THREE.Fog(COLORS.bg, 30, 85); // niebla que desvanece el fondo

  camera = new THREE.PerspectiveCamera(
    55, window.innerWidth / window.innerHeight, 0.1, 220
  );
  setupLights();
}

function setupLights() {
  // Luz base tenue para que nada quede totalmente negro
  scene.add(new THREE.AmbientLight(COLORS.ambient, 0.9));

  // Luz principal con sombras (desde arriba y un poco a un lado)
  const sun = new THREE.DirectionalLight(0xffffff, 1.1);
  sun.position.set(18, 30, 12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -30;
  sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30;
  sun.shadow.camera.bottom = -30;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  scene.add(sun);

  // Dos luces de color que "pintan" la arena (cian y magenta)
  const cy = new THREE.DirectionalLight(COLORS.cyan, 0.5);
  cy.position.set(-30, 16, -20);
  scene.add(cy);
  const mg = new THREE.DirectionalLight(COLORS.magenta, 0.4);
  mg.position.set(28, 14, 22);
  scene.add(mg);
}

/* =========================================================
   3) CREACIÓN DE LA ARENA
   ========================================================= */

function createArena() {
  // Suelo
  const floorSize = (CONFIG.arenaHalf + 2) * 2; // 48x48
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(floorSize, floorSize),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 0.85, metalness: 0.25 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Rejilla de neón sobre el suelo (decorativa)
  const grid = new THREE.GridHelper(floorSize, CONFIG.arenaHalf + 2, COLORS.gridA, COLORS.gridB);
  grid.position.y = 0.02;
  grid.material.transparent = true;
  grid.material.opacity = 0.35;
  scene.add(grid);

  // Cuatro muros que cierran la arena
  const wallOffset = CONFIG.arenaHalf + 1.2;
  const wallLen = floorSize + 2;
  const walls = [
    { x: 0, z: -wallOffset, geo: new THREE.BoxGeometry(wallLen, CONFIG.wallHeight, 1.6), color: COLORS.cyan },
    { x: 0, z: wallOffset,  geo: new THREE.BoxGeometry(wallLen, CONFIG.wallHeight, 1.6), color: COLORS.cyan },
    { x: -wallOffset, z: 0, geo: new THREE.BoxGeometry(1.6, CONFIG.wallHeight, wallLen), color: COLORS.magenta },
    { x: wallOffset,  z: 0, geo: new THREE.BoxGeometry(1.6, CONFIG.wallHeight, wallLen), color: COLORS.magenta },
  ];
  for (const w of walls) {
    const mesh = new THREE.Mesh(
      w.geo,
      new THREE.MeshStandardMaterial({
        color: 0x0a0618, emissive: w.color, emissiveIntensity: 0.55, roughness: 0.4,
      })
    );
    mesh.position.set(w.x, CONFIG.wallHeight / 2, w.z);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Pilares interiores: decorativos y con colisión de círculo
  const pillarGeo = new THREE.CylinderGeometry(CONFIG.pillarRadius, CONFIG.pillarRadius, 3.4, 18);
  pillarGeo.translate(0, 1.7, 0); // la base queda apoyada en el suelo
  for (const p of pillars) {
    const mesh = new THREE.Mesh(
      pillarGeo,
      new THREE.MeshStandardMaterial({
        color: 0x14062e, emissive: COLORS.violet, emissiveIntensity: 0.9, roughness: 0.35,
      })
    );
    mesh.position.set(p.x, 0, p.z);
    mesh.castShadow = true;
    scene.add(mesh);
    p.mesh = mesh; // guardamos la malla para animar su brillo
  }
}

function updateArenaVisual(t) {
  // Los pilares "respiran" con una onda senoidal desfasada
  for (let i = 0; i < pillars.length; i++) {
    pillars[i].mesh.material.emissiveIntensity = 0.9 + Math.sin(t * 2 + i) * 0.35;
  }
}

/* =========================================================
   4) JUGADOR
   ========================================================= */

function createPlayer() {
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.5, 0.9, 6, 14),
    new THREE.MeshStandardMaterial({
      color: 0x0b2b38, emissive: COLORS.cyan, emissiveIntensity: 1.0,
      roughness: 0.3, transparent: true, // transparent para el parpadeo de invulnerabilidad
    })
  );
  mesh.castShadow = true;
  mesh.position.set(PLAYER_SPAWN.x, 1, PLAYER_SPAWN.z);

  // Pequeña luz que acompaña al jugador (efecto de neón sobre el suelo)
  const halo = new THREE.PointLight(COLORS.cyan, 26, 13, 2);
  halo.position.y = 1.4;
  mesh.add(halo);

  scene.add(mesh);
  player.mesh = mesh;
}

function updatePlayer(dt) {
  // 1) lee la entrada (teclado + táctil a la vez)
  const ix = (keysHeld.right || touchDir.right ? 1 : 0) - (keysHeld.left || touchDir.left ? 1 : 0);
  const iz = (keysHeld.down || touchDir.down ? 1 : 0) - (keysHeld.up || touchDir.up ? 1 : 0);

  // 2) el empuje del daño decae suavemente con una exponencial
  const decay = Math.exp(-4 * dt);
  player.kbX *= decay;
  player.kbZ *= decay;

  // 3) velocidad final; si el movimiento es diagonal se normaliza
  //    para que ir en diagonal no sea más rápido
  let vx = ix * CONFIG.playerSpeed + player.kbX;
  let vz = iz * CONFIG.playerSpeed + player.kbZ;
  const inputMag = Math.hypot(ix, iz);
  if (inputMag > 1) { vx /= inputMag; vz /= inputMag; }

  // 4) integra la posición y resuelve colisiones (muros y pilares)
  const pos = { x: player.mesh.position.x + vx * dt, z: player.mesh.position.z + vz * dt };
  clampToArena(pos, CONFIG.playerRadius);
  resolvePillars(pos, CONFIG.playerRadius);
  player.mesh.position.x = pos.x;
  player.mesh.position.z = pos.z;

  // 5) inclinación visual según la velocidad
  player.mesh.rotation.x = THREE.MathUtils.clamp(vz * 0.04, -0.3, 0.3);
  player.mesh.rotation.z = THREE.MathUtils.clamp(-vx * 0.04, -0.3, 0.3);
}

function updatePlayerVisual(t) {
  // parpadeo del jugador mientras dura la invulnerabilidad
  const mat = player.mesh.material;
  mat.opacity = invulnTimer > 0 ? (Math.sin(t * 24) > 0 ? 1 : 0.35) : 1;
  // flotación sutil
  player.mesh.position.y = 1 + Math.sin(t * 3) * 0.04;
}

function resetPlayer() {
  player.kbX = 0;
  player.kbZ = 0;
  player.mesh.position.set(PLAYER_SPAWN.x, 1, PLAYER_SPAWN.z);
  player.mesh.rotation.set(0, 0, 0);
  player.mesh.material.opacity = 1;
}

/* =========================================================
   COLISIONES (círculos en el plano horizontal XZ)
   ========================================================= */

// Distancia al cuadrado entre dos puntos XZ (evita calcular raíces)
function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

// Empuja una posición {x, z} hacia dentro de los límites de la arena.
// Esto garantiza que nadie atraviese los muros.
function clampToArena(pos, radius) {
  const limit = CONFIG.arenaHalf - radius;
  pos.x = THREE.MathUtils.clamp(pos.x, -limit, limit);
  pos.z = THREE.MathUtils.clamp(pos.z, -limit, limit);
}

// Si una figura (pos, radius) se mete en un pilar, se empuja hacia fuera
// por la normal del contacto: no se puede cruzar, solo deslizar.
function resolvePillars(pos, radius) {
  for (const p of pillars) {
    const dx = pos.x - p.x;
    const dz = pos.z - p.z;
    const min = CONFIG.pillarRadius + radius;
    const d = Math.hypot(dx, dz);
    if (d < min) {
      if (d < 0.001) {
        pos.x = p.x + min; // caso degenerado: alineado en el eje
      } else {
        const s = min / d;
        pos.x = p.x + dx * s;
        pos.z = p.z + dz * s;
      }
    }
  }
}

/* =========================================================
   5) ENEMIGOS
   ========================================================= */

function createEnemies() {
  const geo = new THREE.IcosahedronGeometry(0.85, 0);
  const speeds = [CONFIG.enemySpeed, CONFIG.enemySpeed, CONFIG.extraEnemySpeed];
  for (let i = 0; i < 3; i++) {
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x2b0620, emissive: COLORS.magenta, emissiveIntensity: 1.4,
        roughness: 0.35, flatShading: true,
      })
    );
    mesh.castShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    enemies.push({ mesh, speed: speeds[i], phase: Math.random() * Math.PI * 2, active: false });
  }
}

function resetEnemies() {
  // los dos primeros nacen activos en la esquina opuesta al jugador;
  // el tercero aparece a mitad de partida (spawnExtraEnemy)
  enemies.forEach((e, i) => {
    const spawn = ENEMY_SPAWNS[i] || { x: 0, z: -18 };
    e.active = i < ENEMY_SPAWNS.length;
    e.mesh.visible = e.active;
    e.mesh.position.set(spawn.x, 1.05, spawn.z);
  });
}

function spawnExtraEnemy() {
  const e = enemies[2];
  // Aparece en la esquina más lejana al jugador en ese momento,
  // así nunca puede aparecer encima de él.
  let best = EXTRA_ENEMY_CORNERS[0];
  let bestD = -1;
  const px = player.mesh.position.x;
  const pz = player.mesh.position.z;
  for (const c of EXTRA_ENEMY_CORNERS) {
    const d = dist2(px, pz, c.x, c.z);
    if (d > bestD) { bestD = d; best = c; }
  }
  e.active = true;
  e.mesh.visible = true;
  e.mesh.position.set(best.x, 1.05, best.z);
  showMessage("¡Ha aparecido un tercer enemigo!", 2.2);
  sfx.spawn();
}

function updateEnemies(dt) {
  const px = player.mesh.position.x;
  const pz = player.mesh.position.z;

  for (const e of enemies) {
    if (!e.active) continue;
    const ex = e.mesh.position.x;
    const ez = e.mesh.position.z;

    // Persecución básica: dirígete hacia el jugador
    let dx = px - ex;
    let dz = pz - ez;
    const dist = Math.hypot(dx, dz) || 1;
    dx /= dist;
    dz /= dist;

    // Separación entre enemigos para que no se amontonen
    let sx = 0;
    let sz = 0;
    for (const o of enemies) {
      if (o === e || !o.active) continue;
      const ox = ex - o.mesh.position.x;
      const oz = ez - o.mesh.position.z;
      const od = Math.hypot(ox, oz);
      if (od < 2.6 && od > 0.001) {
        const f = (2.6 - od) / 2.6;
        sx += (ox / od) * f;
        sz += (oz / od) * f;
      }
    }

    // Mover y resolver colisiones con muros y pilares
    const pos = {
      x: ex + (dx * e.speed + sx * 6) * dt,
      z: ez + (dz * e.speed + sz * 6) * dt,
    };
    clampToArena(pos, CONFIG.enemyRadius);
    resolvePillars(pos, CONFIG.enemyRadius);
    e.mesh.position.x = pos.x;
    e.mesh.position.z = pos.z;

    // Contacto con el jugador = recibir daño
    const contact = CONFIG.playerRadius + CONFIG.enemyRadius;
    if (dist2(px, pz, pos.x, pos.z) < contact * contact) takeDamage(e);
  }
}

function updateEnemiesVisual(dt, t) {
  for (const e of enemies) {
    if (!e.active) continue;
    e.mesh.rotation.y += dt * 2.2;
    e.mesh.position.y = 1.05 + Math.sin(t * 3.5 + e.phase) * 0.1;
    e.mesh.material.emissiveIntensity = 1.4 + Math.sin(t * 5.5 + e.phase) * 0.5;
  }
}

/* =========================================================
   6) CRISTALES (COLECCIONABLES)
   ========================================================= */

function createCrystals() {
  const geo = new THREE.OctahedronGeometry(0.62);
  for (let i = 0; i < CONFIG.crystalCount; i++) {
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        color: 0x1b0736, emissive: COLORS.violet, emissiveIntensity: 2.1, roughness: 0.2,
      })
    );
    mesh.visible = false;
    scene.add(mesh);
    crystals.push({ mesh, phase: Math.random() * Math.PI * 2, collected: false });
  }
}

// Coloca los 8 cristales en posiciones válidas:
// lejos de los muros, de los pilares, del jugador y entre sí.
// Método: muestreo aleatorio con "descarte" (rejection sampling).
function placeCrystals() {
  const positions = [];
  const maxRange = CONFIG.arenaHalf - CONFIG.crystalWallMargin;
  let guard = 0;
  while (positions.length < CONFIG.crystalCount && guard < 2000) {
    guard++;
    const x = (Math.random() * 2 - 1) * maxRange;
    const z = (Math.random() * 2 - 1) * maxRange;
    if (Math.hypot(x - PLAYER_SPAWN.x, z - PLAYER_SPAWN.z) < 9) continue;
    if (pillars.some((p) => Math.hypot(x - p.x, z - p.z) < CONFIG.pillarRadius + 1.8)) continue;
    if (positions.some((q) => Math.hypot(x - q.x, z - q.z) < CONFIG.crystalMargin)) continue;
    positions.push({ x, z });
  }
  // Plan B (prácticamente improbable): anillo fijo de 8 posiciones
  if (positions.length < CONFIG.crystalCount) {
    for (let i = positions.length; i < CONFIG.crystalCount; i++) {
      const a = (i / CONFIG.crystalCount) * Math.PI * 2;
      positions.push({ x: Math.cos(a) * 16, z: Math.sin(a) * 16 });
    }
  }
  crystals.forEach((c, i) => {
    c.collected = false;
    c.mesh.visible = true;
    c.mesh.position.set(positions[i].x, 1.15, positions[i].z);
  });
}

function updateCrystalsVisual(dt, t) {
  for (const c of crystals) {
    if (c.collected) continue;
    c.mesh.rotation.y += dt * 1.6;
    c.mesh.rotation.x = Math.sin(t * 1.1 + c.phase) * 0.18;
    c.mesh.position.y = 1.15 + Math.sin(t * 2.2 + c.phase) * 0.18;
  }
}

// Se comprueba después de mover al jugador en cada fotograma
function checkCrystalPickups() {
  const px = player.mesh.position.x;
  const pz = player.mesh.position.z;
  const r2 = CONFIG.pickupRadius * CONFIG.pickupRadius;
  for (const c of crystals) {
    if (c.collected) continue;
    if (dist2(px, pz, c.mesh.position.x, c.mesh.position.z) < r2) collectCrystal(c);
  }
}

function collectCrystal(c) {
  if (gameState !== "playing" || c.collected) return;
  c.collected = true;
  c.mesh.visible = false;
  collected++;
  burstParticles(c.mesh.position.x, 1.2, c.mesh.position.z, COLORS.violet, 14);
  dom.hudCrystals.textContent = `${collected} / ${CONFIG.crystalCount}`;
  sfx.collect();
  if (collected >= CONFIG.crystalCount) {
    showMessage("¡Los 8 cristales reunidos!", 3);
    endGame(true); // condición de victoria
  }
}

/* =========================================================
   7) PARTÍCULAS Y EFECTOS VISUALES
   Partículas recicladas (pool): se crean 60 veces una sola
   vez y se reutilizan, evitando crear objetos cada fotograma.
   ========================================================= */

const particleGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);

function createParticlesPool() {
  for (let i = 0; i < 60; i++) {
    const mesh = new THREE.Mesh(
      particleGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
    );
    mesh.visible = false;
    scene.add(mesh);
    particles.push({ mesh, active: false, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0.7 });
  }
}

function burstParticles(x, y, z, color, count) {
  let spawned = 0;
  for (const p of particles) {
    if (spawned >= count) break;
    if (p.active) continue;
    p.active = true;
    spawned++;
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 4;
    p.vx = Math.cos(angle) * speed;
    p.vz = Math.sin(angle) * speed;
    p.vy = 2.5 + Math.random() * 3.5;
    p.life = p.maxLife = 0.55 + Math.random() * 0.35;
    p.mesh.visible = true;
    p.mesh.position.set(x, y, z);
    p.mesh.material.color.setHex(color);
    p.mesh.material.opacity = 0.95;
    p.mesh.scale.setScalar(0.8 + Math.random() * 0.7);
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; p.mesh.visible = false; continue; }
    p.vy -= 12 * dt; // gravedad
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    if (p.mesh.position.y < 0.05) { // rebote suave contra el suelo
      p.mesh.position.y = 0.05;
      p.vy *= -0.45;
      p.vx *= 0.6;
      p.vz *= 0.6;
    }
    const f = p.life / p.maxLife;
    p.mesh.material.opacity = 0.95 * f;
    p.mesh.scale.setScalar(Math.max(0.05, f));
  }
}

/* =========================================================
   8) ESTADOS DEL JUEGO, HUD Y PANTALLAS
   gameState controla todo: "menu", "playing", "won", "lost".
   ========================================================= */

// Empieza una partida nueva (también se usa como "reiniciar")
function startGame() {
  ensureAudio();
  resetGame();
  gameState = "playing";
  syncOverlays();
  sfx.start();
}

// Devuelve TODO el estado a sus valores iniciales
function resetGame() {
  lives = CONFIG.startLives;
  timeLeft = CONFIG.timeLimit;
  collected = 0;
  invulnTimer = 0;
  extraEnemyTimer = CONFIG.extraEnemyDelay;
  shakeTimer = 0;
  flashTimer = 0;
  msgTimer = 0;
  hudTimeCache = "";

  resetPlayer();
  resetEnemies();
  placeCrystals();
  for (const p of particles) { p.active = false; p.mesh.visible = false; }

  // Coloca la cámara de golpe detrás del jugador (sin barrido animado)
  camera.position.set(PLAYER_SPAWN.x, 16.5, PLAYER_SPAWN.z + 10.5);
  camera.lookAt(PLAYER_SPAWN.x, 1.1, PLAYER_SPAWN.z);

  dom.hudCrystals.textContent = `0 / ${CONFIG.crystalCount}`;
  dom.hudTime.textContent = formatTime(timeLeft);
  dom.hudTime.classList.remove("danger");
  renderLives();
  dom.message.style.opacity = "0";
  dom.flash.style.opacity = "0";
  dom.endTitle.classList.remove("win", "lose");
  resetInput();
  syncOverlays();
}

// Termina la partida (victoria = true / derrota = false)
function endGame(won) {
  if (gameState !== "playing") return; // solo se puede terminar desde "playing"
  gameState = won ? "won" : "lost";
  invulnTimer = 0;
  player.kbX = 0;
  player.kbZ = 0;

  const stats = `Cristales: <b>${collected} / ${CONFIG.crystalCount}</b> · Vidas restantes: <b>${lives}</b>`;
  if (won) {
    dom.endTitle.textContent = "¡VICTORIA!";
    dom.endTitle.classList.add("win");
    saveBest();
    dom.endStats.innerHTML = `${stats} · Tiempo restante: <b>${formatTime(timeLeft)}</b>`;
    sfx.win();
  } else if (timeLeft <= 0) {
    dom.endTitle.textContent = "TIEMPO AGOTADO";
    dom.endTitle.classList.add("lose");
    dom.endStats.innerHTML = `${stats} — te faltaron <b>${CONFIG.crystalCount - collected}</b> cristales`;
    sfx.lose();
  } else {
    dom.endTitle.textContent = "TE ATRAPARON";
    dom.endTitle.classList.add("lose");
    dom.endStats.innerHTML = stats;
    sfx.lose();
  }

  const best = loadBest();
  dom.endBest.textContent = best
    ? `Récord personal: ganar con ${formatTime(best.timeLeft)} restantes`
    : "";
  syncOverlays();
}

// Sincroniza clases del <body> y visibilidad de pantallas
function syncOverlays() {
  document.body.className = `state-${gameState}${hasTouch ? " has-touch" : ""}`;
  dom.overlayStart.classList.toggle("hidden", gameState !== "menu");
  dom.overlayEnd.classList.toggle("hidden", !(gameState === "won" || gameState === "lost"));
}

function takeDamage(enemy) {
  if (gameState !== "playing" || invulnTimer > 0) return;
  lives--;
  invulnTimer = CONFIG.invulnTime;
  flashTimer = 0.5;
  shakeTimer = 0.45;

  // Empuje para separarse del enemigo que golpeó
  const dx = player.mesh.position.x - enemy.mesh.position.x;
  const dz = player.mesh.position.z - enemy.mesh.position.z;
  const d = Math.hypot(dx, dz) || 1;
  player.kbX = (dx / d) * 16;
  player.kbZ = (dz / d) * 16;

  burstParticles(player.mesh.position.x, 1.2, player.mesh.position.z, COLORS.danger, 10);
  sfx.damage();
  renderLives();
  showMessage(lives === 1 ? "¡Última vida! Ten cuidado" : "¡Recibiste un golpe! −1 vida", 1.8);
  if (lives <= 0) endGame(false); // condición de derrota por vidas
}

// Temporizadores que solo corren durante la partida
function updateTimers(dt) {
  timeLeft -= dt;
  if (timeLeft <= 0) {
    timeLeft = 0;
    if (gameState === "playing") endGame(false); // derrota: se acabó el tiempo
  }
  if (extraEnemyTimer > 0) {
    extraEnemyTimer -= dt;
    if (extraEnemyTimer <= 0) spawnExtraEnemy();
  }
  if (invulnTimer > 0) invulnTimer = Math.max(0, invulnTimer - dt);
}

// Temporizadores puramente visuales que decaen siempre
function decayTimers(dt) {
  if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);
  if (msgTimer > 0) {
    msgTimer = Math.max(0, msgTimer - dt);
    dom.message.style.opacity = String(Math.min(1, msgTimer / 0.35));
  }
  if (flashTimer > 0) {
    flashTimer = Math.max(0, flashTimer - dt);
    dom.flash.style.opacity = flashTimer === 0
      ? "0"
      : String(Math.min(0.85, flashTimer / 0.4));
  }
}

function showMessage(text, seconds) {
  dom.message.textContent = text;
  msgTimer = seconds;
}

/* ---------- HUD ---------- */

function renderLives() {
  Array.from(dom.hudLives.children).forEach((el, i) => {
    el.classList.toggle("lost", i >= lives);
  });
}

function updateHUD() {
  const shown = formatTime(timeLeft);
  if (shown !== hudTimeCache) {
    hudTimeCache = shown;
    dom.hudTime.textContent = shown;
    dom.hudTime.classList.toggle("danger", timeLeft <= 10 && gameState === "playing");
  }
}

// Formato de tiempo m:ss (p. ej. 1:30)
function formatTime(t) {
  const total = Math.max(0, Math.ceil(t));
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, "0");
  return `${m}:${s}`;
}

/* ---------- Récord local (opcional) ---------- */

function loadBest() {
  try {
    const raw = localStorage.getItem("neonEscapeRecord");
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveBest() {
  try {
    const prev = loadBest();
    if (!prev || timeLeft > prev.timeLeft) {
      localStorage.setItem("neonEscapeRecord", JSON.stringify({ timeLeft: Math.round(timeLeft) }));
    }
  } catch (e) { /* sin localStorage no pasa nada */ }
}

function showStartBest() {
  const best = loadBest();
  if (best) dom.startBest.textContent = `Mejor victoria: ${formatTime(best.timeLeft)} restantes`;
}

/* =========================================================
   9) ENTRADA DE DATOS (TECLADO Y TÁCTIL)
   Los listeners se registran UNA sola vez en init(),
   al reiniciar solo se limpian los estados, nunca
   se vuelven a añadir listeners (evita duplicados).
   ========================================================= */

function bindEventsOnce() {
  window.addEventListener("keydown", (e) => {
    const dir = KEYMAP[e.code];
    if (!dir) return;
    if (e.code.startsWith("Arrow")) e.preventDefault(); // evita el scroll de la página
    keysHeld[dir] = true;
  });
  window.addEventListener("keyup", (e) => {
    const dir = KEYMAP[e.code];
    if (dir) keysHeld[dir] = false;
  });
  // Si la ventana pierde el foco, no queden teclas "pegadas"
  window.addEventListener("blur", resetInput);

  // Cruceta táctil: pointerdown/pointerup funciona en ratón y en pantalla táctil
  for (const btn of dom.touchButtons) {
    const dir = btn.dataset.dir;
    btn.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      if (btn.setPointerCapture) btn.setPointerCapture(e.pointerId);
      touchDir[dir] = true;
      btn.classList.add("pressed");
    });
    const release = () => {
      touchDir[dir] = false;
      btn.classList.remove("pressed");
    };
    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", release);
  }

  // Botones JUGAR y REINICIAR (los dos inician una partida nueva)
  dom.btnPlay.addEventListener("click", startGame);
  dom.btnRestart.addEventListener("click", startGame);

  // Adaptar el renderizador al tamaño de la ventana
  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function resetInput() {
  for (const k in keysHeld) keysHeld[k] = false;
  for (const k in touchDir) touchDir[k] = false;
  for (const btn of dom.touchButtons) btn.classList.remove("pressed");
}

/* =========================================================
   Efectos de sonido generados con Web Audio API
   (no se usan archivos externos: todo son osciladores)
   ========================================================= */

let audioCtx = null;

function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
  } catch (e) { audioCtx = null; }
}

function tone(freq, dur, type, vol = 0.14, slideTo = 0, delay = 0) {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch (e) { /* el sonido nunca debe romper el juego */ }
}

const sfx = {
  start:    () => tone(660, 0.1, "triangle", 0.16, 990),
  collect:  () => tone(760, 0.12, "sine", 0.18, 1500),
  damage:   () => tone(220, 0.25, "sawtooth", 0.2, 80),
  spawn:    () => { tone(196, 0.2, "square", 0.14, 150); tone(147, 0.25, "square", 0.14, 110, 0.12); },
  win:      () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, "triangle", 0.2, 0, i * 0.13)); },
  lose:     () => { [392, 311, 262, 196].forEach((f, i) => tone(f, 0.22, "sawtooth", 0.18, 0, i * 0.16)); },
};

/* =========================================================
   10) BUCLE PRINCIPAL
   requestAnimationFrame + delta time: la velocidad del
   juego no depende de los FPS de la pantalla.
   ========================================================= */

// Vector auxiliar para la cámara (se reutiliza, no se crea cada frame)
const camTarget = new THREE.Vector3();

function updateCamera(dt) {
  const p = player.mesh.position;
  // cámara en tercera persona: sigue al jugador con una interpolación suave
  camTarget.set(p.x, p.y + 15.5, p.z + 10.5);
  camera.position.lerp(camTarget, 1 - Math.exp(-6 * dt));
  if (shakeTimer > 0) { // sacudida al recibir daño
    const s = shakeTimer * 0.55;
    camera.position.x += (Math.random() - 0.5) * s;
    camera.position.y += (Math.random() - 0.5) * s;
    camera.position.z += (Math.random() - 0.5) * s;
  }
  camera.lookAt(p.x, 1.1, p.z);
}

function update(dt, t) {
  decayTimers(dt);
  updateCrystalsVisual(dt, t);
  updateArenaVisual(t);
  updateEnemiesVisual(dt, t);
  updateParticles(dt);
  updatePlayerVisual(t);

  if (gameState === "playing") {
    updatePlayer(dt);
    updateEnemies(dt);
    checkCrystalPickups();
    updateTimers(dt); // tiempo restante, tercer enemigo, invulnerabilidad
  }

  updateCamera(dt);
  updateHUD();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05); // delta limitado a 50 ms
  update(dt, clock.elapsedTime);
  renderer.render(scene, camera);
}

/* =========================================================
   ARRANQUE
   ========================================================= */

function init() {
  cacheDOM();
  hasTouch = "ontouchstart" in window
    || (navigator.maxTouchPoints || 0) > 0
    || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

  initThree();
  createArena();
  createPlayer();
  createEnemies();
  createCrystals();
  createParticlesPool();
  placeCrystals();          // cristales visibles también en el menú
  resetEnemies();           // enemigos visibles e inactivos en el menú

  camera.position.set(PLAYER_SPAWN.x, 16.5, PLAYER_SPAWN.z + 10.5);
  camera.lookAt(PLAYER_SPAWN.x, 1.1, PLAYER_SPAWN.z);

  bindEventsOnce();
  showStartBest();
  syncOverlays();

  clock = new THREE.Clock();
  animate();
}

try {
  init();
} catch (e) {
  console.error("Error al inicializar NEON ESCAPE:", e);
  const panel = document.querySelector("#overlay-start .panel");
  if (panel) {
    const note = document.createElement("p");
    note.className = "error-note";
    note.textContent = "Error al iniciar el juego: " + e.message;
    panel.appendChild(note);
  }
}

// Info de depuración / pruebas (también puede enseñarse en la presentación)
window.__neon = {
  start: startGame,
  info() {
    return {
      state: gameState,
      lives,
      collected,
      timeLeft: Math.round(timeLeft * 10) / 10,
      player: { x: +player.mesh.position.x.toFixed(2), z: +player.mesh.position.z.toFixed(2) },
      enemies: enemies.filter((e) => e.active).map((e) => ({
        x: +e.mesh.position.x.toFixed(2), z: +e.mesh.position.z.toFixed(2),
      })),
      crystals: crystals.map((c) => ({
        x: +c.mesh.position.x.toFixed(2), z: +c.mesh.position.z.toFixed(2), collected: c.collected,
      })),
    };
  },
};

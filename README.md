# NEON ESCAPE

Videojuego 3D de **supervivencia, recolección y evasión** hecho con **HTML5, CSS3, JavaScript puro y Three.js**. Apareces en una arena futurista oscura iluminada con neones: reúne los 8 cristales de energía antes de que acabe el tiempo mientras esquivas a los enemigos que te persiguen.

> Proyecto de informática para 11.º de BTP. Sin frameworks, sin motores de videojuegos externos y sin herramientas de compilación.

---

## Reglas del juego

- La partida dura **90 segundos**.
- Tu objetivo: recoger **8 cristales violetas** repartidos por la arena.
- **Victoria:** recoger los 8 cristales antes de que el temporizador llegue a cero.
- **Derrota 1:** quedarte sin vidas (te golpean los enemigos magenta).
- **Derrota 2:** que el temporizador llegue a 0 sin haber reunido los 8 cristales.
- Empiezas con **3 vidas**. Tras recibir un golpe tienes **2 segundos de invulnerabilidad** (el personaje parpadea) para escapar.
- Al cumplirse **45 segundos** aparece un **tercer enemigo** en la esquina más lejana a ti.
- Tu **puntuación** es el número de cristales recogidos; la pantalla final muestra cristales, vidas y tiempo.

## Controles

| Acción | Computadora | Móvil |
|---|---|---|
| Moverse | Teclas **W A S D** (también **flechas**) | Cruceta táctil abajo a la izquierda |
| Empezar / Reiniciar | Botón **JUGAR** / botón **REINICIAR** | Igual (táctil) |

La cámara sigue automáticamente al jugador en tercera persona; no necesita rotarse.

## Tecnologías

- **HTML5** (estructura, HUD y pantallas con DOM)
- **CSS3** (estética neón, HUD, responsive, animaciones)
- **JavaScript (ES Modules)** — lógica del juego, física simple y estados
- **Three.js 0.170.0** cargada como módulo ES desde el CDN [jsDelivr](https://www.jsdelivr.com/) mediante un *import map* (versión fijada, ver `index.html`)
- **Web Audio API** para los sonidos generados (no hay archivos de audio)
- Otras dependencias: **ninguna**. Sin React/Vue/npm, sin imágenes ni modelos externos.

> Nota: como Three.js se carga desde un CDN, se necesita **internet al abrir el juego por primera vez**. Si prefieres una copia 100 % offline, descarga `three.module.js` de esa versión, guárdalo en una carpeta `lib/` y cambia la URL del import map a `./lib/three.module.js`.

## Ejecutar el juego localmente

Como el juego usa módulos ES (`<script type="module" src="script.js">`), los navegadores bloquean esos archivos al abrir la página con doble clic desde `file://`. Necesitas un servidor local sencillo:

**Opción A — Python** (si está instalado):

```bash
# desde la carpeta del proyecto
python -m http.server 8000
# abre http://localhost:8000 en el navegador
```

**Opción B — Node.js** (si está instalado):

```bash
npx serve .
# o: npx http-server -p 8000
```

**Opción C — VS Code**: instala la extensión **Live Server**, clic derecho en `index.html` → *"Open with Live Server"*.

**Opción D — otros:** cualquier servidor estático sirve (IIS, XAMPP, etc.).

## Publicar en GitHub Pages

1. Crea una cuenta en [github.com](https://github.com) y un repositorio nuevo público (por ejemplo `neon-escape`).
2. Sube los 4 archivos (`index.html`, `script.js`, `style.css`, `README.md`) a la **raíz** del repositorio (con la web de GitHub, arrastrándolos; o con `git init`, `git add .`, `git commit -m "NEON ESCAPE"`, `git push`).
3. Ve a **Settings → Pages**.
4. En *Source* elige **Deploy from a branch**, rama **main** y carpeta **/(root)**, y guarda.
5. Espera 1–2 minutos: la página se publica en `https://<tu-usuario>.github.io/neon-escape/` (la URL exacta aparece en ese mismo menú; GitHub Pages entrega los archivos tal cual, sin configuración extra, por eso el proyecto ya es compatible).

> No midas la calidad por la URL: compruébala tú mismo tras desplegarla.

## Estructura de archivos

```
neon-escape/
├─ index.html   → página principal: HUD, pantallas de inicio/fin, import map de Three.js
├─ style.css    → estética neón, HUD, cruceta táctil, pantallas y responsive
├─ script.js    → toda la lógica del juego (ver mapa de secciones abajo)
└─ README.md    → este documento
```

`script.js` está dividido en secciones numeradas con comentarios grandes, para poder explicar el código por bloques:

1. **Configuración y constantes** — todos los números del juego (velocidades, vidas, tamaños…) en un solo objeto `CONFIG`.
2. **Inicialización de Three.js** — renderizador (canvas), escena con niebla, cámara en perspectiva y luces (ambiental + direccional con sombras + dos luces de color).
3. **Arena** — suelo, rejilla de neón, 4 muros luminosos y 4 pilares-obstáculo.
4. **Jugador** — cápsula con luz propia; movimiento con `delta time`, normalización de diagonales y colisiones con muros y pilares.
5. **Enemigos** — persecución directa + separación entre enemigos; el tercero aparece a los 45 s en la esquina más lejana al jugador.
6. **Cristales** — 8 octaedros con rotación/flotación; se recogen por distancia (muestreo aleatorio con descarte para posicionarlos: lejos de muros, pilares, jugador y entre sí).
7. **Partículas** — un *pool* de 60 partículas recicladas para las explosiones al recolectar o recibir daño (se crean una vez y se reutilizan, nada se crea cada frame).
8. **Estados/HUD/pantallas** — máquina de estados `menu → playing → won/lost`; reinicio completo con `resetGame()` (los listeners se registran **una sola vez**, en `init()`).
9. **Entrada** — teclado (`keydown`/`keyup` con `e.code`) y cruceta táctil con *pointer events*; al perder el foco se limpia la entrada para que no queden teclas "pegadas".
10. **Bucle principal** — `requestAnimationFrame` + `clock.getDelta()` limitado a 50 ms (el movimiento es consistente aunque cambien los FPS).

## Detalles técnicos para la defensa del proyecto

- **Delta time**: el movimiento usa segundos reales (`dt`), no "frames", así el juego va igual a 30, 60 o 144 Hz.
- **Colisiones**: por distancia (círculos en el plano XZ) contra muros (límite de arena con `clamp`), pilares (empuje radial) y enemigos (daño con periodo de invulnerabilidad + empuje hacia atrás para no perder vidas en cadena).
- **Estados sin fugas**: no hay `setInterval` para el temporizador: el tiempo se descuenta con `dt`. Al reiniciar solo se restauran valores y posiciones, nunca se añaden listeners ni temporizadores nuevos.
- **Depuración opcional**: la consola del navegador expone `window.__neon.info()` con el estado actual (posición del jugador, enemigos, cristales…). Puede borrarse sin afectar al juego.
- **Rendimiento**: `pixelRatio` limitado a 2, una sola luz con sombras, geometrías compartidas y *pool* de partículas; pensado para renderizar fluido en gráficos integrados y móviles.

## Pruebas realizadas

- Ruta de menú → partida → victoria/derrota → reinicio, probada en navegador (Chromium) sin errores de consola.
- Verificado que los 8 cristales siempre spawn en posiciones alcanzables y separados.
- Verificado daño, invulnerabilidad, aviso del tercer enemigo y condiciones de derrota por vidas y por tiempo.

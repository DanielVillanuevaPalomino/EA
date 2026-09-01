# Presentaciones anotadas — Quarto + Reveal.js Chalkboard

Flujo para dictar clase sobre una presentación limpia, anotarla en vivo y
publicar en GitHub Pages una versión donde el alumno revela las anotaciones
con un botón.

## Estructura

```
Presentacion_Quarto_GitHub/
├── _quarto.yml                 proyecto: output-dir = docs
├── presentacion_maestra.qmd    la que dictas en clase (sin notas)
├── presentacion_anotada.qmd    GENERADA por el script, no la edites
├── assets/
│   ├── boton-notas.css         estilo del botón flotante
│   └── boton-notas.js          lógica del botón (API de Chalkboard)
├── anotaciones/
│   └── sesion-01.json          los trazos de cada clase (SÍ va a git)
├── scripts/
│   └── generar_anotada.py      automatiza el post-proceso
├── descargas/                  bandeja temporal, ignorada por git
├── docs/                       salida que publica GitHub Pages
└── .gitignore
```

## Ciclo de trabajo

**1 · Antes de clase**

```bash
quarto render presentacion_maestra.qmd
```

**2 · Durante la clase**

Abre `docs/presentacion_maestra.html`. Atajos:

| Tecla | Acción |
|-------|--------|
| `C` | lienzo de notas: dibujar **sobre** la diapositiva |
| `B` | pizarra opaca en blanco |
| `A` | botón de anotaciones (equivale a hacerle clic) |
| `X` / `Y` | color siguiente / anterior |
| `SUPR` | borrar los trazos de la diapositiva |
| `D` | **descargar `chalkboard.json`** |

**3 · Al terminar**

Pulsa `D`. El navegador guarda `chalkboard.json` en Descargas.

**4 · Post-proceso (un solo comando)**

```bash
python scripts/generar_anotada.py ~/Downloads/chalkboard.json --sesion 02
```

El script valida el JSON, lo archiva en `anotaciones/sesion-02.json`, genera
`presentacion_anotada.qmd` con el YAML correcto y ejecuta `quarto render`.

**5 · Publicar**

```bash
git add docs anotaciones presentacion_anotada.qmd
git commit -m "Anotaciones de clase: sesion-02"
git push
```

## Puesta en marcha de GitHub Pages

1. `git init && git add . && git commit -m "Estructura inicial"`
2. Crea el repositorio en GitHub y haz `git push -u origin main`.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `/docs`**.
4. La presentación queda en
   `https://<usuario>.github.io/<repo>/presentacion_anotada.html`.

`docs/.nojekyll` ya está creado: impide que Jekyll descarte carpetas cuyo
nombre empieza por `_`.

## Siete cosas que conviene saber

**1 · `embed-resources` tiene que ser `false`.**
El plugin declara `self-contained: false` en su `plugin.yml` y carga el JSON
por `XMLHttpRequest` en tiempo de ejecución. Con `embed-resources: true` las
anotaciones no cargan nunca.

**2 · Quarto copia el JSON solo.**
Al detectar `chalkboard.src` lo registra como recurso y lo copia a `docs/`.
Por eso `anotaciones/` **no** puede estar en `.gitignore`.

**3 · Nunca ignores `*_files/` sin ancla.**
`docs/presentacion_*_files/` contiene reveal.js, MathJax y el propio plugin.
El `.gitignore` usa `/*_files/` (con barra inicial) para ignorar solo la raíz.

**4 · Las anotaciones están atadas al fragmento.**
El plugin empareja por `h`, `v` **y `f`** (índice de fragmento, `plugin.js`
línea 691). Si anotas con la lista incremental a medio revelar, esos trazos
solo reaparecen en ese mismo estado. Para notas que deban verse siempre,
anota antes de revelar fragmentos.

**5 · `toggleNotesCanvas()` no sirve para mostrar/ocultar notas guardadas.**
El lienzo `#notescanvas` se crea siempre visible; esa función solo alterna el
*modo de dibujo*, y además no hace nada cuando `read-only: true`. Por eso
`boton-notas.js` controla la opacidad del lienzo y reserva la API oficial
`toggleChalkboard()` para los trazos hechos en la pizarra opaca.

**6 · `width` y `height` deben coincidir** entre maestra y anotada. El JSON
guarda las dimensiones con las que se dibujó y reescala a partir de ellas.
El script avisa si detecta un desajuste.

**7 · Ábrela siempre por HTTP, nunca con doble clic.**
Con `file://` el navegador bloquea la lectura del JSON. Usa
`quarto preview`, `python -m http.server` o GitHub Pages.

## El botón: cómo se ajusta

Todo el comportamiento está en el objeto `CFG` al inicio de
`assets/boton-notas.js`:

```js
const CFG = {
  visiblesAlEntrar: false,    // true = las notas se ven al llegar al slide
  ocultarSiNoHayNotas: false, // true = el botón desaparece si no hay notas
  tecla: "A",
  codigoTecla: 65,
};
```

Los colores y la posición están en las variables CSS de
`assets/boton-notas.css` (`--bn-acento`, `--bn-margen`, `--bn-tam`…).

El botón se detecta a sí mismo en dos modos:

- **Sin `chalkboard.src`** (maestra): entra y sale del modo lápiz.
- **Con `chalkboard.src`** (anotada): lee el JSON, marca con un punto ámbar
  las diapositivas que tienen trazos y muestra u oculta las anotaciones.

## Volver a probar sin dar clase

`descargas/chalkboard.json` es un archivo de prueba con trazos en las dos
diapositivas. Para rehacer el ciclo completo:

```bash
python scripts/generar_anotada.py descargas/chalkboard.json --sesion 01
```

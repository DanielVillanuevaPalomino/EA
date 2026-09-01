# Presentaciones anotadas — Quarto + Reveal.js Chalkboard

Una sola presentación (`presentacion_maestra.qmd`) en la que siempre puedes
dibujar, y donde cada sesión de anotaciones se guarda con nombre en el propio
navegador para poder volver a ella y seguir editándola.

## Lo que necesitas saber, en una frase

Dibujas libremente sobre `docs/presentacion_maestra.html`, le pones nombre a
lo que dibujaste con el botón de la carpeta (esquina inferior derecha), y
queda guardado en tu navegador — puedes cerrar la pestaña, volver otro día, y
cargarlo de nuevo para seguir editando. Nada de scripts ni de `git` para el
día a día; eso solo hace falta si quieres publicar un cambio en GitHub Pages.

## Estructura

```
Presentacion_Quarto_GitHub/
├── _quarto.yml                    proyecto: output-dir = docs
├── presentacion_maestra.qmd       la presentación (única, siempre editable)
├── assets/
│   ├── hojas-anotaciones.css/.js     botón "Hojas": guardar, cargar, ver original, grosor
│   └── imagenes-anotaciones.css/.js  pegar/subir imágenes sobre la diapositiva
├── docs/                          salida que publica GitHub Pages
│
│   --- lo siguiente es un flujo aparte, opcional (ver más abajo) ---
├── presentacion_anotada.qmd       snapshot de solo lectura, GENERADO
├── anotaciones/                   JSON de cada snapshot publicado
├── scripts/generar_anotada.py     arma un snapshot de solo lectura
├── descargas/                     bandeja temporal, ignorada por git
└── .gitignore
```

## Uso diario — dar clase y guardar tus anotaciones

**1 · Abre la presentación**

```bash
quarto preview presentacion_maestra.qmd
```

(o, si ya está renderizada, abre `docs/presentacion_maestra.html` sirviéndola
por HTTP — ver la nota al final sobre por qué no vale el doble clic).

**2 · Dibuja**

Hay **un solo** icono para entrar en modo anotación: el lápiz abajo a la
izquierda (o la tecla `C`). Mientras dibujas, el botón de la carpeta (abajo
a la derecha) muestra un punto rojo avisando que hay trazos sin guardar.

**3 · Guarda con nombre**

Clic en el botón de la carpeta → escribe un nombre (o deja el sugerido,
p. ej. "Sesión 03") → **Guardar anotación**. Queda guardado en tu navegador,
en esta misma máquina.

**4 · Vuelve a una hoja anterior**

En ese mismo panel verás la lista de hojas guardadas. Clic en **Cargar**
sobre cualquiera: la página se recarga con esos trazos ya puestos, listos
para seguir dibujando encima. Guardar de nuevo con el mismo nombre la
actualiza (te pregunta antes de reemplazarla).

**5 · Ver la diapositiva original (sin anotaciones)**

Arriba del panel hay un interruptor **"Mostrar anotaciones"**. Apágalo para
ver la diapositiva tal como está en el `.qmd`, sin ningún trazo **ni
imagen** — nada se borra, es solo una vista. Vuelve a encenderlo (o toca
el lápiz para seguir dibujando) y todo reaparece exactamente igual.

**6 · Empezar de cero**

**+ Hoja en blanco**, al pie del panel, limpia el lienzo sin tocar ninguna
hoja guardada. A diferencia del interruptor de arriba, esto sí borra —
pide confirmación antes de hacerlo.

**7 · Grosor del lápiz**

El deslizador **"Grosor"**, en el mismo panel, cambia el trazo al instante
— ideal para anotaciones finas y precisas. Se recuerda entre sesiones (es
una preferencia del navegador, no de una hoja en particular).

**8 · Agregar imágenes**

**"Agregar imagen"**, arriba del panel, abre el explorador de archivos.
También puedes **pegar con Ctrl+V** (una captura de pantalla, o algo
copiado) o **soltar un archivo** sobre la ventana — funciona en cualquier
momento, sin abrir el panel. Cada imagen se puede:

- **Mover**: arrástrala (con el modo lápiz apagado — mientras dibujas, el
  lienzo tapa las imágenes, así que primero sal del modo lápiz).
- **Redimensionar**: arrastra la esquina inferior derecha (mantiene
  proporción).
- **Eliminar**: el botón ⓧ que aparece al pasar el mouse, o la tecla
  `Supr`/`Backspace` con la imagen seleccionada.

Las imágenes son **por diapositiva** (no aparecen en las demás) y viajan
junto con el dibujo al guardar/cargar una hoja — pero **no** se incluyen en
la descarga ⬇ de una hoja (esa descarga es JSON puro de Chalkboard, para
compatibilidad con el flujo opcional de más abajo). Las imágenes tampoco
tienen límite de tamaño estricto, pero se redimensionan automáticamente a
un máximo de 1600px de lado antes de guardarse, para no llenar el
almacenamiento del navegador con fotos pesadas.

### Si dibujas y cierras sin guardar

No pasa nada: cada ~8 segundos (y también justo antes de cerrar la pestaña)
tu trabajo se resguarda solo en una hoja especial llamada
**"◐ Borrador automático"**, marcada "sin nombre" en la lista. Ábrela para
recuperarlo, o dale un nombre propio con **Guardar anotación** — al hacerlo,
el borrador se reemplaza por tu hoja con nombre.

### Un límite importante que debes conocer

Las hojas guardadas (con nombre o el borrador automático) viven en el
**almacenamiento del navegador de esa computadora** (`localStorage`), no en
GitHub ni en la nube. Si:

- limpias el historial/datos de navegación de ese navegador, o
- presentas desde otra computadora,

no verás las hojas que guardaste antes. Para protegerlas, cada hoja tiene un
botón de **descarga** (⬇) en la lista: te da un `.json` que puedes guardar
donde quieras — es el mismo formato que produce la tecla `D` de Chalkboard.

## Puesta en marcha de GitHub Pages (una sola vez)

1. `git init && git add . && git commit -m "Estructura inicial"`
2. Crea el repositorio vacío en GitHub y haz `git push -u origin main`.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `/docs`**.
4. La presentación queda en
   `https://<usuario>.github.io/<repo>/presentacion_maestra.html`.

`docs/.nojekyll` ya está creado: impide que Jekyll descarte carpetas cuyo
nombre empieza por `_`. Publicar solo hace falta cuando cambias el
**contenido** de las diapositivas (texto, fórmulas) — las anotaciones que
guardas con el botón de la carpeta no requieren volver a publicar, viven en
tu navegador.

## Once cosas que conviene saber

**1 · `embed-resources` tiene que ser `false`.**
El plugin declara `self-contained: false` en su `plugin.yml`. Con
`embed-resources: true` el JSON y el guardado en sesión dejan de funcionar.

**2 · `chalkboard.storage` es la clave de todo el gestor de hojas.**
Chalkboard ya sabe autoguardar su dibujo en `sessionStorage` bajo esa clave
(con ~1s de espera tras cada trazo) y recuperarlo al recargar. El botón
"Cargar" de una hoja no hace magia: escribe el JSON de esa hoja en esa misma
clave y recarga la página — el plugin la recoge solo. Por eso la clave en el
YAML (`chalkboard.storage: "amawa-hoja-activa"`) y `CLAVE_ACTIVA` en
`assets/hojas-anotaciones.js` **deben coincidir exactamente**.

**3 · Nunca ignores `*_files/` sin ancla en el `.gitignore`.**
`docs/presentacion_*_files/` contiene reveal.js, MathJax y el propio plugin.
El `.gitignore` usa `/*_files/` (con barra inicial) para ignorar solo la raíz.

**4 · Las anotaciones están atadas al fragmento.**
El plugin empareja por `h`, `v` **y `f`** (índice de fragmento). Si dibujas
con una lista incremental a medio revelar, esos trazos solo reaparecen en ese
mismo estado. Para notas que deban verse siempre, dibuja antes de revelar
fragmentos.

**5 · Cada archivo `.html` tiene su propia librería de hojas.**
`hojas-anotaciones.js` namespacea `localStorage` por `location.pathname`, así
que las hojas de `presentacion_maestra.html` nunca se mezclan con las de
ningún otro archivo que abras en el mismo navegador.

**6 · El diálogo de confirmación es nativo del navegador.**
"Cargar", "Eliminar" y "Hoja en blanco" usan `confirm()` para no perder
trabajo sin querer. Si automatizas pruebas con un navegador headless, esos
diálogos suelen autocancelarse — es una limitación del entorno de pruebas,
no del código.

**7 · `width` y `height` no deben cambiar** una vez que empieces a guardar
hojas. El JSON guarda las dimensiones con las que se dibujó y reescala los
trazos a partir de ellas.

**8 · Ábrela siempre por HTTP, nunca con doble clic.**
Con `file://` el navegador bloquea `sessionStorage`/`localStorage` en
algunos casos y el plugin no puede leer nada. Usa `quarto preview`,
`python -m http.server` o GitHub Pages.

**9 · El plugin trae DOS lienzos; ocultamos uno.**
Chalkboard soporta dibujar sobre el slide (`notescanvas`) y, aparte, abrir
una pizarra opaca en blanco (`chalkboard`, tecla `B`). Tener dos iconos
nativos para "entrar en modo anotación" confundía, así que
`assets/hojas-anotaciones.css` oculta con CSS el botón de la pizarra
opaca (`span[title="Toggle Chalkboard (b)"]`) y deja solo el de dibujar
sobre el slide. La tecla `B` sigue funcionando si alguna vez la necesitas;
solo el botón desaparece.

**10 · El zoom de Reveal.js (Alt+clic) NO sirve para dibujar con precisión.**
Lo probamos a fondo: al hacer zoom, el navegador reporta la posición del
clic en coordenadas de PANTALLA, no las de la diapositiva ampliada — un
trazo hecho con zoom activado queda en el lugar donde hiciste clic en la
pantalla, no sobre lo que veías ampliado. Por eso no hay ningún botón de
zoom en este proyecto: para anotaciones finas, usa el deslizador de
**grosor** en su lugar.

**11 · `getData()` del plugin siempre reescribe `sessionStorage`, incluso
solo para leer.** Es un efecto secundario documentado en el propio
`plugin.js` (`getData` → `updateStorage` → `sessionStorage.setItem`), pero
fácil de pasar por alto: nuestro chequeo periódico de "¿hay cambios sin
guardar?" llama a `getData()`, así que si esa llamada ocurriera justo
después de que "Cargar una hoja" escribe la hoja elegida — pero antes de
que la página realmente recargue — pisaría lo recién escrito con el dibujo
viejo de la página. `recargarConHoja()` en `hojas-anotaciones.js` se
protege con una bandera (`recargando`) que pausa ese chequeo, más un
margen de ~1.1s antes de escribir el valor final (más que el autoguardado
de ~1s del propio Chalkboard), para que cualquier escritura vieja ya
pendiente se resuelva antes de que la nuestra sea la última palabra. Si
alguna vez tocas ese código, cualquier llamada nueva a `getData()`
—directa o via `firma()`— necesita ese mismo resguardo.

## Flujo opcional: publicar un snapshot de solo lectura

Si alguna vez quieres compartir una versión donde el público solo puede
**ver** tus anotaciones (sin poder dibujar ni tocar nada), existe un segundo
flujo, independiente del de arriba:

1. En `presentacion_maestra.html`, descarga una hoja con el botón ⬇ (o la
   tecla `D`) — te da un `.json`.
2. Corre el script:
   ```bash
   python scripts/generar_anotada.py ruta/al/archivo.json --sesion 02
   ```
   Esto genera `presentacion_anotada.qmd` (con `read-only: true`, sin el
   gestor de hojas) y lo renderiza.
3. Publica:
   ```bash
   git add docs anotaciones presentacion_anotada.qmd
   git commit -m "Publica anotaciones: sesion-02"
   git push
   ```

El botón flotante de esa versión publicada (azul, `assets/boton-notas.js`)
muestra u oculta esas anotaciones ya grabadas — lo que en versiones
anteriores de este proyecto era el único mecanismo. Sigue funcionando igual,
pero ya no es necesario para tu flujo del día a día.

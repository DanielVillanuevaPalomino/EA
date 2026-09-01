/* ============================================================
   Imágenes sobre la pizarra — Chalkboard / Reveal.js / Quarto
   ------------------------------------------------------------
   Chalkboard solo dibuja líneas (eventos draw/erase); no tiene
   ningún soporte para imágenes. Este archivo agrega una capa
   PROPIA e independiente: pegar (Ctrl+V), soltar un archivo, o
   elegirlo con el botón "Agregar imagen" del panel de hojas.

   COORDENADAS: igual que Chalkboard (plugin.js, función resize())
   ---------------------------------------------------------------
   Guardamos cada imagen en el mismo espacio lógico de la
   diapositiva (1050×700, o lo que digan `width`/`height` del
   YAML) y, para dibujarla en pantalla, replicamos EXACTAMENTE la
   fórmula del plugin:
       scale   = min(innerWidth/1050, innerHeight/700)
       xOffset = (innerWidth  - 1050*scale) / 2
       yOffset = (innerHeight - 700 *scale) / 2
   Así una imagen queda en el mismo lugar relativo sea cual sea el
   tamaño de la ventana, tal como los trazos del lápiz.

   PERSISTENCIA: coordina con hojas-anotaciones.js por una CLAVE
   ---------------------------------------------------------------
   Igual que Chalkboard usa `chalkboard.storage` (sessionStorage)
   para autoguardar y hojas-anotaciones.js lee/escribe esa misma
   clave al cargar una hoja, esta capa hace lo mismo con su propia
   clave CLAVE_ACTIVA. hojas-anotaciones.js la conoce por su nombre
   literal (ver comentario allá) para guardar/cargar/limpiar las
   imágenes junto con el dibujo, sin que ambos scripts se llamen
   funciones entre sí — más simple y no depende del orden de carga.
   ============================================================ */

(function () {
  "use strict";

  const CLAVE_ACTIVA = "amawa-imagenes-activas"; // sessionStorage
  const MAX_LADO = 1600;     // redimensiona antes de guardar: cuida el cupo de sessionStorage/localStorage
  const CALIDAD_JPEG = 0.85;
  const ANCHO_INICIAL = 380; // px en espacio de diapositiva (de 1050)

  let deck = null;
  let capaEl = null;
  let soltarEl = null;
  let anchoSlide = 1050, altoSlide = 700;
  let estado = {};          // { "h.v": [ {id,src,x,y,w,h}, ... ] }
  let seleccionadaId = null;

  function esperarReveal(cb) {
    if (window.Reveal && typeof window.Reveal.isReady === "function") {
      if (window.Reveal.isReady()) return cb(window.Reveal);
      return window.Reveal.on("ready", () => cb(window.Reveal));
    }
    setTimeout(() => esperarReveal(cb), 50);
  }

  function nuevoId() {
    return (crypto.randomUUID ? crypto.randomUUID() : "img-" + Date.now() + "-" + Math.random().toString(36).slice(2));
  }

  function claveSlide(indices) {
    indices = indices || deck.getIndices();
    return indices.h + "." + indices.v;
  }

  /* ------------------------- Persistencia ------------------------- */
  function cargarEstado() {
    try {
      const datos = JSON.parse(sessionStorage.getItem(CLAVE_ACTIVA) || "{}");
      return datos && typeof datos === "object" ? datos : {};
    } catch {
      return {};
    }
  }

  function guardarEstado() {
    try {
      sessionStorage.setItem(CLAVE_ACTIVA, JSON.stringify(estado));
    } catch (err) {
      alert(
        "No se pudo guardar la imagen: se llenó el almacenamiento del " +
        "navegador. Elimina alguna imagen o usa imágenes más livianas."
      );
    }
  }

  /* --------------------- Geometría (igual que Chalkboard) --------------------- */
  function medidas() {
    const scale = Math.min(window.innerWidth / anchoSlide, window.innerHeight / altoSlide);
    const xOffset = (window.innerWidth - anchoSlide * scale) / 2;
    const yOffset = (window.innerHeight - altoSlide * scale) / 2;
    return { scale, xOffset, yOffset };
  }

  /* ------------------------------ Render ------------------------------ */
  function render() {
    if (!capaEl) return;
    capaEl.innerHTML = "";
    const lista = estado[claveSlide()] || [];
    const { scale, xOffset, yOffset } = medidas();

    lista.forEach((img) => {
      const el = document.createElement("div");
      el.className = "imagen-item" + (img.id === seleccionadaId ? " seleccionada" : "");
      el.style.left = xOffset + img.x * scale + "px";
      el.style.top = yOffset + img.y * scale + "px";
      el.style.width = img.w * scale + "px";
      el.style.height = img.h * scale + "px";
      el.dataset.id = img.id;

      const imgEl = document.createElement("img");
      imgEl.src = img.src;
      imgEl.alt = "";
      imgEl.draggable = false;

      const btnBorrar = document.createElement("button");
      btnBorrar.type = "button";
      btnBorrar.className = "imagen-borrar";
      btnBorrar.title = "Eliminar imagen";
      btnBorrar.innerHTML =
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" ' +
        'stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
      btnBorrar.addEventListener("click", (e) => {
        e.stopPropagation();
        eliminar(img.id);
      });

      const asa = document.createElement("div");
      asa.className = "imagen-asa";

      el.append(imgEl, btnBorrar, asa);
      capaEl.appendChild(el);

      el.addEventListener("pointerdown", (e) => iniciarArrastre(e, img, el));
      asa.addEventListener("pointerdown", (e) => iniciarRedimension(e, img, el));
    });
  }

  /* ------------------------------ Arrastrar / redimensionar ------------------------------ */
  function iniciarArrastre(e, img, el) {
    if (e.button !== undefined && e.button !== 0) return;
    // Sin esto, capturar el puntero aquí (más abajo) le roba el clic al
    // botón de borrar: usa 'click', que se dispara después de pointerup,
    // y con el puntero capturado por `el` ese pointerup ya no le llega.
    if (e.target.closest(".imagen-borrar, .imagen-asa")) return;
    e.preventDefault();
    e.stopPropagation();
    seleccionar(img.id);

    const { scale } = medidas();
    const inicioX = e.clientX, inicioY = e.clientY;
    const origenX = img.x, origenY = img.y;
    el.setPointerCapture(e.pointerId);

    function mover(ev) {
      img.x = origenX + (ev.clientX - inicioX) / scale;
      img.y = origenY + (ev.clientY - inicioY) / scale;
      const m = medidas();
      el.style.left = m.xOffset + img.x * m.scale + "px";
      el.style.top = m.yOffset + img.y * m.scale + "px";
    }
    function soltar() {
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", soltar);
      guardarEstado();
    }
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", soltar);
  }

  function iniciarRedimension(e, img, el) {
    e.preventDefault();
    e.stopPropagation();
    seleccionar(img.id);

    const { scale } = medidas();
    const inicioX = e.clientX;
    const origenW = img.w, origenH = img.h;
    const proporcion = origenH / origenW;
    el.setPointerCapture(e.pointerId);

    function mover(ev) {
      const deltaSlide = (ev.clientX - inicioX) / scale;
      img.w = Math.max(30, origenW + deltaSlide);
      img.h = img.w * proporcion;
      const m = medidas();
      el.style.width = img.w * m.scale + "px";
      el.style.height = img.h * m.scale + "px";
    }
    function soltar() {
      el.removeEventListener("pointermove", mover);
      el.removeEventListener("pointerup", soltar);
      guardarEstado();
    }
    el.addEventListener("pointermove", mover);
    el.addEventListener("pointerup", soltar);
  }

  function seleccionar(id) {
    seleccionadaId = id;
    capaEl.querySelectorAll(".imagen-item").forEach((el) => {
      el.classList.toggle("seleccionada", el.dataset.id === id);
    });
  }

  function eliminar(id) {
    const lista = estado[claveSlide()] || [];
    const i = lista.findIndex((im) => im.id === id);
    if (i === -1) return;
    lista.splice(i, 1);
    if (seleccionadaId === id) seleccionadaId = null;
    guardarEstado();
    render();
  }

  /* ------------------------------ Agregar imagen ------------------------------ */
  function redimensionarSiHaceFalta(dataUrl, tipoOriginal) {
    return new Promise((resolve) => {
      const im = new Image();
      im.onload = () => {
        let { width, height } = im;
        if (width <= MAX_LADO && height <= MAX_LADO) {
          resolve({ src: dataUrl, width, height });
          return;
        }
        const factor = MAX_LADO / Math.max(width, height);
        width = Math.round(width * factor);
        height = Math.round(height * factor);
        const cv = document.createElement("canvas");
        cv.width = width;
        cv.height = height;
        cv.getContext("2d").drawImage(im, 0, 0, width, height);
        const tipo = tipoOriginal === "image/png" ? "image/png" : "image/jpeg";
        resolve({ src: cv.toDataURL(tipo, CALIDAD_JPEG), width, height });
      };
      im.onerror = () => resolve(null);
      im.src = dataUrl;
    });
  }

  async function agregarImagenDesdeArchivo(file) {
    if (!file || !file.type || !file.type.startsWith("image/")) return;
    const lector = new FileReader();
    lector.onload = async () => {
      const resultado = await redimensionarSiHaceFalta(lector.result, file.type);
      if (!resultado) return;
      agregarImagen(resultado.src, resultado.width, resultado.height);
    };
    lector.readAsDataURL(file);
  }

  function agregarImagen(src, anchoNatural, altoNatural) {
    // Tamaño inicial: ANCHO_INICIAL en espacio de diapositiva, proporción real.
    const w = Math.min(ANCHO_INICIAL, anchoSlide * 0.7);
    const h = w * (altoNatural / anchoNatural || 0.75);
    const registro = {
      id: nuevoId(),
      src,
      x: (anchoSlide - w) / 2,
      y: (altoSlide - h) / 2,
      w, h,
    };
    const clave = claveSlide();
    if (!estado[clave]) estado[clave] = [];
    estado[clave].push(registro);
    seleccionadaId = registro.id;
    guardarEstado();
    render();
  }

  /* ------------------------------ Entradas ------------------------------ */
  function conectarEntradas() {
    // Pegar (Ctrl+V) — funciona en cualquier momento, sin abrir ningún panel.
    document.addEventListener("paste", (e) => {
      const items = (e.clipboardData || {}).items || [];
      for (const item of items) {
        if (item.type && item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) { e.preventDefault(); agregarImagenDesdeArchivo(file); }
          return;
        }
      }
    });

    // Soltar un archivo sobre la ventana.
    let contadorArrastre = 0;
    window.addEventListener("dragenter", (e) => {
      if (!e.dataTransfer || !e.dataTransfer.types.includes("Files")) return;
      contadorArrastre++;
      soltarEl.classList.add("activa");
    });
    window.addEventListener("dragleave", () => {
      contadorArrastre = Math.max(0, contadorArrastre - 1);
      if (contadorArrastre === 0) soltarEl.classList.remove("activa");
    });
    window.addEventListener("dragover", (e) => e.preventDefault());
    window.addEventListener("drop", (e) => {
      e.preventDefault();
      contadorArrastre = 0;
      soltarEl.classList.remove("activa");
      const files = (e.dataTransfer || {}).files || [];
      [...files].forEach(agregarImagenDesdeArchivo);
    });

    // Deseleccionar al hacer clic en un área vacía de la capa.
    capaEl.addEventListener("pointerdown", (e) => {
      if (e.target === capaEl) seleccionar(null);
    });

    // Suprimir/Delete: borra la imagen seleccionada (si el foco no está
    // escribiendo en un campo de texto, p. ej. el nombre de la hoja).
    document.addEventListener("keydown", (e) => {
      if ((e.key === "Delete" || e.key === "Backspace") && seleccionadaId) {
        const activo = document.activeElement;
        const escribiendo = activo && (activo.tagName === "INPUT" || activo.tagName === "TEXTAREA");
        if (!escribiendo) { e.preventDefault(); eliminar(seleccionadaId); }
      }
    });
  }

  /* ---------------- Botón "Agregar imagen" (se inserta en el panel de hojas) ---------------- */
  function insertarBotonAgregar() {
    const panel = document.querySelector(".hojas-panel");
    if (!panel) return; // hojas-anotaciones.js no cargó: seguimos funcionando solo con pegar/soltar

    const fila = document.createElement("div");
    fila.className = "ha-original"; // reutiliza el estilo de fila del otro panel
    fila.innerHTML =
      '<span class="ha-original-texto">Agregar imagen' +
      '<span class="ha-original-sub">O pega con Ctrl+V, o suelta un archivo</span></span>' +
      '<button type="button" class="ha-btn" style="flex:0 0 auto;">Elegir…</button>';

    const cabecera = panel.querySelector(".ha-cabecera");
    cabecera.insertAdjacentElement("afterend", fila);

    const inputArchivo = document.createElement("input");
    inputArchivo.type = "file";
    inputArchivo.accept = "image/*";
    inputArchivo.style.display = "none";
    fila.appendChild(inputArchivo);

    fila.querySelector(".ha-btn").addEventListener("click", () => inputArchivo.click());
    inputArchivo.addEventListener("change", () => {
      [...inputArchivo.files].forEach(agregarImagenDesdeArchivo);
      inputArchivo.value = "";
    });
  }

  /* --------------------------- Init --------------------------- */
  esperarReveal(function (Reveal) {
    deck = Reveal;
    const cfg = deck.getConfig();
    anchoSlide = cfg.width || 1050;
    altoSlide = cfg.height || 700;

    capaEl = document.createElement("div");
    capaEl.className = "imagenes-capa";
    document.body.appendChild(capaEl);

    soltarEl = document.createElement("div");
    soltarEl.className = "imagenes-soltar";
    soltarEl.innerHTML = "<span>Suelta la imagen aquí</span>";
    document.body.appendChild(soltarEl);

    estado = cargarEstado();
    conectarEntradas();
    insertarBotonAgregar();
    render();

    deck.on("slidechanged", () => { seleccionadaId = null; render(); });
    window.addEventListener("resize", render);
  });
})();

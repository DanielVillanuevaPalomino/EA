/* ============================================================
   Botón flotante de anotaciones — Chalkboard / Reveal.js / Quarto
   ------------------------------------------------------------
   Funciona en DOS modos, detectados automáticamente:

   1) MODO MAESTRA  (el YAML NO define `chalkboard.src`)
      El botón entra y sale del modo lápiz llamando a la API
      nativa `RevealChalkboard.toggleNotesCanvas()`.

   2) MODO ANOTADA  (el YAML SÍ define `chalkboard.src`)
      El botón muestra/oculta las anotaciones ya grabadas del
      slide actual. Lee el JSON para saber qué diapositivas
      tienen trazos y sólo se activa en ésas.

   POR QUÉ NO BASTA CON toggleNotesCanvas() EN EL MODO 2
   -----------------------------------------------------
   En el plugin (plugin.js), el lienzo de notas #notescanvas se
   crea SIEMPRE visible (opacity:1, visibility:visible) y
   toggleNotesCanvas() sólo alterna el MODO DE DIBUJO
   (pointerEvents + paleta), no la visibilidad de los trazos.
   Además su cuerpo entero está dentro de un if (!readOnly),
   así que con `read-only: true` no hace absolutamente nada.
   Por eso, para "mostrar/ocultar notas guardadas" controlamos la
   opacidad del propio lienzo, y delegamos en la API oficial
   toggleChalkboard() cuando los trazos están en la pizarra.
   ============================================================ */

(function () {
  "use strict";

  /* ------------------------- Ajustes ------------------------- */
  const CFG = {
    // Estado de las anotaciones al entrar a cada slide (modo anotada).
    // false = la diapositiva se ve limpia y el botón revela las notas.
    visiblesAlEntrar: false,
    // true  = el botón desaparece en slides sin anotaciones.
    // false = queda atenuado (así el público sabe que existe).
    ocultarSiNoHayNotas: false,
    tecla: "A",
    codigoTecla: 65,
  };

  const ICONO = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"',
    '     stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"',
    '     aria-hidden="true" focusable="false">',
    '  <path d="M12 20h9"></path>',
    '  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"></path>',
    "</svg>",
  ].join("\n");

  /* ------------------------- Estado -------------------------- */
  let deck = null;        // instancia de Reveal
  let plugin = null;      // RevealChalkboard
  let modoAnotada = false;
  let indice = null;      // Map<"h.v", {notas:bool, pizarra:bool}>
  let visible = false;
  let boton = null;
  let etiqueta = null;

  /* ------------------------ Utilidades ----------------------- */
  const clave = (i) => i.h + "." + i.v;
  const lienzoNotas = () => document.getElementById("notescanvas");
  const lienzoPizarra = () => document.getElementById("chalkboard");
  const pizarraAbierta = () => {
    const el = lienzoPizarra();
    return !!el && el.style.visibility === "visible";
  };

  function esperarReveal(cb) {
    if (window.Reveal && typeof window.Reveal.isReady === "function") {
      if (window.Reveal.isReady()) return cb(window.Reveal);
      return window.Reveal.on("ready", () => cb(window.Reveal));
    }
    setTimeout(() => esperarReveal(cb), 50);
  }

  /* ---------- Índice de diapositivas con anotaciones ---------- */
  async function construirIndice(src) {
    const resp = await fetch(src, { cache: "no-store" });
    if (!resp.ok) throw new Error("HTTP " + resp.status + " al leer " + src);
    const datos = await resp.json();
    if (!Array.isArray(datos)) throw new Error("El JSON no tiene formato de chalkboard");

    const idx = new Map();
    const marcar = (lista, campo) => {
      (lista || []).forEach((d) => {
        if (!d || !d.slide || !Array.isArray(d.events) || d.events.length === 0) return;
        const k = clave(d.slide);
        const reg = idx.get(k) || { notas: false, pizarra: false };
        reg[campo] = true;
        idx.set(k, reg);
      });
    };
    marcar(datos[0] && datos[0].data, "notas");
    marcar(datos[1] && datos[1].data, "pizarra");
    return idx;
  }

  function anotacionesDelSlide() {
    if (!modoAnotada) return { notas: true, pizarra: false };
    // Si el índice no se pudo cargar, dejamos el botón utilizable.
    if (!indice) return { notas: true, pizarra: true };
    return indice.get(clave(deck.getIndices())) || { notas: false, pizarra: false };
  }

  /* --------------------- Construir el botón ------------------ */
  function construirBoton() {
    boton = document.createElement("button");
    boton.id = "botonNotas";
    boton.className = "boton-notas";
    boton.type = "button";
    boton.setAttribute("aria-pressed", "false");
    boton.setAttribute("data-prevent-swipe", "true"); // que Reveal no lo lea como swipe

    const icono = document.createElement("span");
    icono.className = "bn-icono";
    icono.innerHTML = ICONO;

    etiqueta = document.createElement("span");
    etiqueta.className = "bn-etiqueta";

    const punto = document.createElement("span");
    punto.className = "bn-punto";

    boton.append(icono, etiqueta, punto);
    boton.addEventListener("click", (e) => {
      e.preventDefault();
      alternar();
      // Devolver el foco al deck: si se queda en el botón, las flechas
      // dejan de pasar diapositivas y el ponente se queda atascado.
      boton.blur();
      const cont = deck && deck.getRevealElement && deck.getRevealElement();
      if (cont && typeof cont.focus === "function") cont.focus({ preventScroll: true });
    });
    document.body.appendChild(boton);
  }

  /* ------------------------- Acciones ------------------------ */
  function aplicarVisibilidad(mostrar) {
    const info = anotacionesDelSlide();
    const cn = lienzoNotas();

    if (cn) {
      cn.style.transition = "opacity .25s ease";
      // Sólo la opacidad: si tocáramos `visibility` romperíamos
      // el redibujado que el plugin hace en cada cambio de slide.
      cn.style.opacity = mostrar && info.notas ? "1" : "0";
    }

    // Los trazos hechos sobre la pizarra opaca sí usan la API oficial.
    if (info.pizarra && plugin && pizarraAbierta() !== mostrar) {
      plugin.toggleChalkboard();
    }

    visible = mostrar;
    refrescarBoton();
  }

  function alternar() {
    if (!modoAnotada) {
      // MODO MAESTRA: API nativa, entra/sale del modo lápiz.
      if (plugin) plugin.toggleNotesCanvas();
      setTimeout(refrescarBoton, 0);
      return;
    }
    const info = anotacionesDelSlide();
    if (!info.notas && !info.pizarra) return; // slide sin anotaciones
    aplicarVisibilidad(!visible);
  }

  /* ------------------------ Refrescar UI --------------------- */
  function refrescarBoton() {
    if (!boton) return;

    if (!modoAnotada) {
      const cn = lienzoNotas();
      const dibujando = !!cn && cn.style.pointerEvents === "auto";
      boton.classList.toggle("activo", dibujando);
      boton.classList.remove("sin-notas", "oculto", "tiene-notas");
      boton.disabled = false;
      boton.setAttribute("aria-pressed", String(dibujando));
      etiqueta.textContent = dibujando ? "Salir del modo lápiz" : "Anotar sobre el slide";
    } else {
      const info = anotacionesDelSlide();
      const hay = info.notas || info.pizarra;

      boton.classList.toggle("tiene-notas", hay && !visible);
      boton.classList.toggle("sin-notas", !hay);
      boton.classList.toggle("activo", hay && visible);
      boton.classList.toggle("oculto", !hay && CFG.ocultarSiNoHayNotas);
      boton.disabled = !hay;
      boton.setAttribute("aria-pressed", String(hay && visible));

      etiqueta.textContent = !hay
        ? "Sin anotaciones en este slide"
        : visible
        ? "Ocultar anotaciones"
        : "Ver anotaciones de clase";
    }

    const txt = etiqueta.textContent;
    boton.title = txt + " (tecla " + CFG.tecla + ")";
    boton.setAttribute("aria-label", txt);
  }

  /* --------------------------- Init -------------------------- */
  esperarReveal(async function (Reveal) {
    deck = Reveal;
    plugin = deck.getPlugin("RevealChalkboard");
    if (!plugin) {
      console.warn("[boton-notas] Chalkboard no está activo; no se crea el botón.");
      return;
    }

    const cfg = deck.getConfig().chalkboard;
    const src = cfg && typeof cfg === "object" ? cfg.src : null;
    modoAnotada = !!src;

    construirBoton();

    if (modoAnotada) {
      try {
        indice = await construirIndice(src);
        console.log("[boton-notas] " + indice.size + " diapositiva(s) con anotaciones en " + src);
      } catch (err) {
        // Caso típico: abrir el HTML con doble clic (file://) bloquea fetch.
        indice = null;
        console.warn(
          "[boton-notas] No se pudo indexar el JSON: " + err.message +
          " — el botón queda activo en todos los slides."
        );
      }
      aplicarVisibilidad(CFG.visiblesAlEntrar);
    }

    refrescarBoton();

    deck.on("slidechanged", () => {
      if (modoAnotada) aplicarVisibilidad(CFG.visiblesAlEntrar);
      else refrescarBoton();
    });

    // Atajo de teclado: A de anotaciones. Está libre: Chalkboard usa
    // B, C, X, Y, D, DEL y BACKSPACE; Reveal usa N, P, F, S, O, ESC.
    deck.addKeyBinding(
      { keyCode: CFG.codigoTecla, key: CFG.tecla, description: "Mostrar/ocultar anotaciones" },
      alternar
    );
  });
})();

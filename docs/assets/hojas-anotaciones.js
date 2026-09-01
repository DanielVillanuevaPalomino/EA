/* ============================================================
   Gestor de hojas de anotaciones — Chalkboard / Reveal.js / Quarto
   ------------------------------------------------------------
   Permite guardar el dibujo actual con un nombre, listar hojas
   guardadas y volver a cargar cualquiera de ellas para seguir
   editándola. Todo vive en el navegador (localStorage): cada
   hoja es un objeto independiente, así que "cargar" nunca borra
   las demás.

   CÓMO SE CONECTA CON EL PLUGIN (verificado contra plugin.js)
   -------------------------------------------------------------
   Chalkboard ya sabe persistir su dibujo actual en sessionStorage
   si se configura `chalkboard.storage: "<clave>"` en el YAML:
   en cada trazo llama a storageChanged() -> (~1s después)
   updateStorage(), que escribe JSON.stringify(storage) en
   sessionStorage[clave]; y al iniciar, initChalkboard() hace
   initStorage(sessionStorage.getItem(clave)) ANTES de intentar
   cargar `chalkboard.src`.

   El plugin no expone ninguna función para reemplazar ese dibujo
   por otro ya en marcha (no hay "setData"). Por eso "cargar una
   hoja" se hace así: escribimos el JSON de la hoja elegida en esa
   MISMA clave de sessionStorage y recargamos la página; el plugin
   la recoge solo, tal como lo hace con su propio autoguardado.
   ============================================================ */

(function () {
  "use strict";

  // Debe coincidir exactamente con `chalkboard.storage` en el YAML.
  const CLAVE_ACTIVA = "amawa-hoja-activa";
  // Vitrina de hojas guardadas, aparte por cada presentación (pathname).
  const CLAVE_LIBRERIA = "amawa_hojas::" + location.pathname;

  const ICONO_CARPETA = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"',
    '     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"></path>',
    "</svg>",
  ].join("\n");

  const ICONO_CARGAR = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"',
    '     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '  <path d="M21 12a9 9 0 1 1-3-6.7"></path><path d="M21 3v6h-6"></path>',
    "</svg>",
  ].join("\n");

  const ICONO_DESCARGAR = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"',
    '     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '  <path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path>',
    '  <path d="M5 21h14"></path>',
    "</svg>",
  ].join("\n");

  const ICONO_BORRAR = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"',
    '     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
    '  <path d="M3 6h18"></path>',
    '  <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>',
    '  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>',
    "</svg>",
  ].join("\n");

  let deck = null;
  let plugin = null;
  let botonEl, panelEl, listaEl, inputEl;
  let ultimoGuardado = null; // JSON de referencia: así sabemos si hay cambios sin guardar

  function esperarReveal(cb) {
    if (window.Reveal && typeof window.Reveal.isReady === "function") {
      if (window.Reveal.isReady()) return cb(window.Reveal);
      return window.Reveal.on("ready", () => cb(window.Reveal));
    }
    setTimeout(() => esperarReveal(cb), 50);
  }

  /* ---------------------- Almacén (localStorage) ---------------------- */
  function leerLibreria() {
    try {
      const datos = JSON.parse(localStorage.getItem(CLAVE_LIBRERIA) || "{}");
      return datos && typeof datos === "object" ? datos : {};
    } catch (err) {
      console.warn("[hojas-anotaciones] Librería local dañada, se reinicia:", err.message);
      return {};
    }
  }

  function escribirLibreria(lib) {
    try {
      localStorage.setItem(CLAVE_LIBRERIA, JSON.stringify(lib));
      return true;
    } catch (err) {
      // Típicamente QuotaExceededError: el navegador no tiene más espacio.
      alert(
        "No se pudo guardar: el almacenamiento del navegador está lleno.\n" +
        "Borra alguna hoja antigua o descarga tus hojas importantes con el " +
        "botón de descarga antes de seguir."
      );
      return false;
    }
  }

  function nombreSugerido() {
    const n = Object.keys(leerLibreria()).length + 1;
    return "Sesión " + String(n).padStart(2, "0");
  }

  function fechaLegible(iso) {
    try {
      return new Date(iso).toLocaleString("es-PE", {
        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
      });
    } catch { return ""; }
  }

  /* --------------------------- Acciones --------------------------- */
  function guardarComo(nombre) {
    nombre = (nombre || "").trim();
    if (!nombre) { inputEl.focus(); return; }

    const lib = leerLibreria();
    if (lib[nombre] && !confirm('Ya existe una hoja llamada "' + nombre + '". ¿Reemplazarla con el dibujo actual?')) {
      return;
    }

    const json = plugin.getData(); // getData() ya limpia entradas vacías (plugin.js:642)
    lib[nombre] = { json, fecha: new Date().toISOString() };
    if (!escribirLibreria(lib)) return;

    marcarActiva(nombre);
    ultimoGuardado = json;
    marcarSucio(false);
    inputEl.value = "";
    render();
  }

  function cargar(nombre) {
    const hoja = leerLibreria()[nombre];
    if (!hoja) return;
    if (!confirm('¿Cargar "' + nombre + '"? Los trazos sin guardar de ahora se perderán.')) return;

    sessionStorage.setItem(CLAVE_ACTIVA, hoja.json);
    sessionStorage.setItem(CLAVE_ACTIVA + "::nombre", nombre);
    location.reload();
  }

  function hojaEnBlanco() {
    if (!confirm("¿Empezar una hoja en blanco? Los trazos sin guardar de ahora se perderán.")) return;
    sessionStorage.removeItem(CLAVE_ACTIVA);
    sessionStorage.removeItem(CLAVE_ACTIVA + "::nombre");
    location.reload();
  }

  function eliminar(nombre, ev) {
    ev.stopPropagation();
    if (!confirm('¿Eliminar la hoja "' + nombre + '"? Esto no se puede deshacer.')) return;
    const lib = leerLibreria();
    delete lib[nombre];
    escribirLibreria(lib);
    if (nombreActivo() === nombre) marcarActiva(null);
    render();
  }

  function descargar(nombre, ev) {
    ev.stopPropagation();
    const hoja = leerLibreria()[nombre];
    if (!hoja) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([hoja.json], { type: "application/json" }));
    a.download = nombre.replace(/[\\/:*?"<>|]+/g, "-") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  /* -------------------- Hoja "activa" (la cargada ahora) -------------------- */
  function nombreActivo() {
    return sessionStorage.getItem(CLAVE_ACTIVA + "::nombre");
  }
  function marcarActiva(nombre) {
    if (nombre) sessionStorage.setItem(CLAVE_ACTIVA + "::nombre", nombre);
    else sessionStorage.removeItem(CLAVE_ACTIVA + "::nombre");
  }
  function marcarSucio(sucio) {
    if (botonEl) botonEl.classList.toggle("sucio", !!sucio);
  }

  /* ------------------------------ UI ------------------------------ */
  function construirUI() {
    botonEl = document.createElement("button");
    botonEl.type = "button";
    botonEl.className = "hojas-boton";
    botonEl.setAttribute("aria-label", "Hojas de anotaciones");
    botonEl.title = "Hojas de anotaciones";
    botonEl.innerHTML = ICONO_CARPETA + '<span class="ha-punto"></span>';
    botonEl.addEventListener("click", (e) => {
      e.preventDefault();
      alternarPanel();
    });

    panelEl = document.createElement("div");
    panelEl.className = "hojas-panel";
    panelEl.innerHTML = [
      '<div class="ha-cabecera">',
      "  <span>Hojas de anotaciones</span>",
      '  <button type="button" class="ha-cerrar" aria-label="Cerrar">&times;</button>',
      "</div>",
      '<div class="ha-guardar">',
      '  <input type="text" placeholder="Nombre de la hoja…" maxlength="80">',
      '  <button type="button" class="ha-btn">Guardar anotación</button>',
      "</div>",
      '<div class="ha-lista"></div>',
      '<div class="ha-pie">',
      '  <button type="button" class="ha-blanco">+ Hoja en blanco</button>',
      "</div>",
    ].join("\n");

    document.body.append(botonEl, panelEl);

    listaEl = panelEl.querySelector(".ha-lista");
    inputEl = panelEl.querySelector('input[type="text"]');

    panelEl.querySelector(".ha-cerrar").addEventListener("click", () => alternarPanel(false));
    panelEl.querySelector(".ha-blanco").addEventListener("click", hojaEnBlanco);
    panelEl.querySelector(".ha-btn").addEventListener("click", () => guardarComo(inputEl.value));
    inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") guardarComo(inputEl.value);
    });

    // Cerrar al hacer clic fuera. `e.isTrusted` excluye el clic sintético
    // que "descargar()" dispara sobre su <a> temporal: ese <a> vive fuera
    // del panel, así que sin este filtro cada descarga cerraría el panel.
    document.addEventListener("click", (e) => {
      if (!e.isTrusted) return;
      if (!panelEl.classList.contains("visible")) return;
      if (panelEl.contains(e.target) || botonEl.contains(e.target)) return;
      alternarPanel(false);
    });

    render();
  }

  function alternarPanel(forzar) {
    const abrir = typeof forzar === "boolean" ? forzar : !panelEl.classList.contains("visible");
    panelEl.classList.toggle("visible", abrir);
    botonEl.classList.toggle("abierto", abrir);
    if (abrir) {
      render();
      inputEl.value = inputEl.value || nombreSugerido();
      setTimeout(() => inputEl.select(), 50);
    }
  }

  function render() {
    if (!listaEl) return;
    const lib = leerLibreria();
    const nombres = Object.keys(lib).sort(
      (a, b) => new Date(lib[b].fecha) - new Date(lib[a].fecha)
    );
    const activa = nombreActivo();

    if (nombres.length === 0) {
      listaEl.innerHTML = '<div class="ha-vacio">Todavía no has guardado ninguna hoja.</div>';
      return;
    }

    listaEl.innerHTML = "";
    nombres.forEach((nombre) => {
      const hoja = lib[nombre];
      const item = document.createElement("div");
      item.className = "ha-item" + (nombre === activa ? " activa" : "");

      const info = document.createElement("div");
      info.className = "ha-info";
      info.innerHTML =
        '<div class="ha-nombre"></div><div class="ha-fecha"></div>';
      info.querySelector(".ha-nombre").textContent = nombre;
      info.querySelector(".ha-fecha").textContent =
        (nombre === activa ? "Cargada ahora · " : "") + fechaLegible(hoja.fecha);
      info.addEventListener("click", () => cargar(nombre));

      const acciones = document.createElement("div");
      acciones.className = "ha-acciones";

      const btnCargar = document.createElement("button");
      btnCargar.type = "button";
      btnCargar.className = "ha-icono-btn";
      btnCargar.title = "Cargar y seguir editando";
      btnCargar.innerHTML = ICONO_CARGAR;
      btnCargar.addEventListener("click", (e) => { e.stopPropagation(); cargar(nombre); });

      const btnDescargar = document.createElement("button");
      btnDescargar.type = "button";
      btnDescargar.className = "ha-icono-btn";
      btnDescargar.title = "Descargar como archivo .json";
      btnDescargar.innerHTML = ICONO_DESCARGAR;
      btnDescargar.addEventListener("click", (e) => descargar(nombre, e));

      const btnBorrar = document.createElement("button");
      btnBorrar.type = "button";
      btnBorrar.className = "ha-icono-btn ha-eliminar";
      btnBorrar.title = "Eliminar";
      btnBorrar.innerHTML = ICONO_BORRAR;
      btnBorrar.addEventListener("click", (e) => eliminar(nombre, e));

      acciones.append(btnCargar, btnDescargar, btnBorrar);
      item.append(info, acciones);
      listaEl.appendChild(item);
    });
  }

  /* --------------------------- Init --------------------------- */
  esperarReveal(function (Reveal) {
    deck = Reveal;
    plugin = deck.getPlugin("RevealChalkboard");
    if (!plugin) {
      console.warn("[hojas-anotaciones] Chalkboard no está activo; no se crea el gestor.");
      return;
    }

    const cfg = deck.getConfig().chalkboard || {};
    if (!cfg.storage) {
      console.warn(
        "[hojas-anotaciones] Falta `chalkboard.storage` en el YAML: " +
        "cargar una hoja guardada no funcionará sin esa clave."
      );
    }

    construirUI();

    // Punto de referencia: lo que ya está guardado (la hoja recién cargada,
    // o "vacío" si es una hoja en blanco). Así el punto rojo compara contra
    // algo real en vez de activarse una sola vez y quedarse pegado.
    ultimoGuardado = plugin.getData();
    if (nombreActivo() && botonEl) {
      botonEl.title = "Hojas de anotaciones — activa: " + nombreActivo();
    }

    // Cada 2s comparamos el dibujo actual contra la última versión guardada.
    // Barato (JSON.stringify ya está cacheado por getData) y siempre correcto,
    // a diferencia de intentar adivinar "¿acaba de dibujar algo?" por evento.
    setInterval(() => {
      const actual = plugin.getData();
      marcarSucio(actual !== ultimoGuardado);
    }, 2000);
  });
})();

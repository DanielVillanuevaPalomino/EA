#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
generar_anotada.py — Automatiza el post-proceso de una clase.

Toma el .qmd maestro y el chalkboard.json descargado al final de la
sesión (tecla D en la presentación) y:

  1. Valida que el JSON sea realmente de chalkboard y resume qué
     diapositivas tienen trazos.
  2. Copia el JSON a anotaciones/ con un nombre limpio y estable.
  3. Genera presentacion_anotada.qmd duplicando el maestro y
     reescribiendo SOLO el bloque `chalkboard:` del YAML para
     enlazar el JSON (src), bloquear la edición (read-only) y
     ocultar los iconos nativos (buttons: false).
  4. Ejecuta `quarto render` sobre la copia.

Sin dependencias externas: solo biblioteca estándar de Python 3.9+.

Uso típico
----------
    python scripts/generar_anotada.py ~/Downloads/chalkboard.json --sesion 01

Otras opciones
--------------
    --maestra RUTA     .qmd de origen (por defecto presentacion_maestra.qmd)
    --salida RUTA      .qmd a generar (por defecto presentacion_anotada.qmd)
    --sesion ETIQUETA  nombra el JSON como anotaciones/sesion-<ETIQUETA>.json
    --no-render        genera los archivos pero no llama a Quarto
    --sin-retitular    no toca el subtitle del documento
"""

from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path

# La consola de Windows usa cp1252 por defecto y destroza los acentos.
for _flujo in (sys.stdout, sys.stderr):
    try:
        _flujo.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, OSError):
        pass

RAIZ = Path(__file__).resolve().parent.parent
DIR_ANOTACIONES = RAIZ / "anotaciones"

# Opciones que el script fuerza en la copia anotada. El resto de
# claves del bloque chalkboard del maestro se conservan tal cual.
SUFIJO_SUBTITULO = " · con anotaciones de clase"

RE_CHALKBOARD = re.compile(r"^(\s*)chalkboard\s*:\s*(.*?)\s*$")
RE_CLAVE = re.compile(r"^(\s*)([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$")


# --------------------------------------------------------------------
# Utilidades de consola
# --------------------------------------------------------------------
def info(msg: str) -> None:
    print(f"  {msg}")


def paso(msg: str) -> None:
    print(f"\n[*] {msg}")


def aviso(msg: str) -> None:
    print(f"  /!\\ {msg}")


def error(msg: str) -> None:
    print(f"\n[X] {msg}", file=sys.stderr)


# --------------------------------------------------------------------
# 1. Localizar el ejecutable de Quarto
# --------------------------------------------------------------------
def localizar_quarto() -> str | None:
    """Busca `quarto` en el PATH y, si no está, en rutas conocidas."""
    hallado = shutil.which("quarto")
    if hallado:
        return hallado

    candidatos = [
        Path(r"C:\Program Files\Quarto\bin\quarto.cmd"),
        Path.home() / "AppData/Local/Programs/Quarto/bin/quarto.cmd",
        # Quarto incrustado dentro de RStudio (respaldo)
        Path(r"C:\Program Files\RStudio\resources\app\bin\quarto\bin\quarto.cmd"),
        Path("/usr/local/bin/quarto"),
        Path("/opt/quarto/bin/quarto"),
    ]
    for c in candidatos:
        if c.exists():
            return str(c)
    return None


# --------------------------------------------------------------------
# 2. Validar y resumir el JSON de chalkboard
# --------------------------------------------------------------------
def resumir_json(ruta: Path) -> dict:
    """Comprueba el formato del JSON y devuelve un resumen legible."""
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ValueError(f"{ruta.name} no es JSON válido: {exc}") from exc

    if not isinstance(datos, list) or not datos:
        raise ValueError(
            f"{ruta.name} no tiene el formato de chalkboard. Se esperaba una "
            "lista con dos lienzos (notas y pizarra). ¿Descargaste el archivo "
            "correcto con la tecla D?"
        )

    def slides_con_trazos(lienzo) -> set[str]:
        encontrados: set[str] = set()
        if not isinstance(lienzo, dict):
            return encontrados
        for reg in lienzo.get("data") or []:
            if not isinstance(reg, dict):
                continue
            sl = reg.get("slide") or {}
            eventos = reg.get("events") or []
            if eventos:
                encontrados.add(f"{sl.get('h', 0)}.{sl.get('v', 0)}")
        return encontrados

    notas = slides_con_trazos(datos[0])
    pizarra = slides_con_trazos(datos[1]) if len(datos) > 1 else set()

    return {
        "notas": sorted(notas),
        "pizarra": sorted(pizarra),
        "todas": sorted(notas | pizarra),
        "width": (datos[0] or {}).get("width"),
        "height": (datos[0] or {}).get("height"),
    }


# --------------------------------------------------------------------
# 3. Cirugía sobre el front matter YAML
# --------------------------------------------------------------------
def separar_front_matter(texto: str) -> tuple[list[str], list[str]]:
    """Devuelve (lineas_yaml_incluidos_los_---, lineas_del_cuerpo)."""
    lineas = texto.splitlines(keepends=True)
    if not lineas or lineas[0].strip() != "---":
        raise ValueError("El .qmd no empieza con un bloque YAML delimitado por ---")
    for i in range(1, len(lineas)):
        if lineas[i].strip() in ("---", "..."):
            return lineas[: i + 1], lineas[i + 1 :]
    raise ValueError("No se encontró el cierre (---) del front matter YAML")


def localizar_bloque_chalkboard(yaml_lineas: list[str]) -> tuple[int, int, str, dict]:
    """
    Encuentra el bloque `chalkboard:` y devuelve
    (inicio, fin_exclusivo, sangria, opciones_actuales).

    Reconoce tanto el bloque anidado como la forma corta `chalkboard: true`.
    """
    for i, linea in enumerate(yaml_lineas):
        m = RE_CHALKBOARD.match(linea)
        if not m:
            continue
        sangria, valor = m.group(1), m.group(2)

        # Forma corta: `chalkboard: true`
        if valor and not valor.startswith("#"):
            return i, i + 1, sangria, {}

        # Forma larga: consumir las líneas con más sangría.
        opciones: dict[str, str] = {}
        j = i + 1
        while j < len(yaml_lineas):
            actual = yaml_lineas[j]
            if not actual.strip():                       # línea en blanco
                j += 1
                continue
            sangria_actual = len(actual) - len(actual.lstrip())
            if sangria_actual <= len(sangria):           # salimos del bloque
                break
            if actual.lstrip().startswith("#"):          # comentario interno
                j += 1
                continue
            mk = RE_CLAVE.match(actual)
            if mk:
                opciones[mk.group(2)] = mk.group(3)
            j += 1
        return i, j, sangria, opciones

    raise ValueError(
        "El maestro no define un bloque `chalkboard:` en su YAML. "
        "Añádelo antes de generar la versión anotada."
    )


def leer_dimensiones(yaml_lineas: list[str]) -> tuple[int | None, int | None]:
    """Lee width/height del YAML para contrastarlos con los del JSON."""
    dims: dict[str, int] = {}
    for linea in yaml_lineas:
        m = RE_CLAVE.match(linea)
        if m and m.group(2) in ("width", "height"):
            try:
                dims[m.group(2)] = int(m.group(3))
            except ValueError:
                pass
    return dims.get("width"), dims.get("height")


def retitular(yaml_lineas: list[str]) -> list[str]:
    """Marca el subtítulo para distinguir la versión publicada."""
    salida = list(yaml_lineas)
    for i, linea in enumerate(salida):
        m = RE_CLAVE.match(linea)
        if not m or m.group(2) != "subtitle" or m.group(1):
            continue  # solo el subtitle de primer nivel
        valor = m.group(3).strip().strip('"').strip("'")
        if SUFIJO_SUBTITULO.strip() in valor:
            return salida
        salida[i] = f'subtitle: "{valor}{SUFIJO_SUBTITULO}"\n'
        return salida
    return salida


def construir_qmd_anotado(
    texto_maestro: str, ruta_json_relativa: str, retitular_doc: bool,
    nombre_maestro: str = "presentacion_maestra.qmd",
) -> tuple[str, tuple[int | None, int | None]]:
    yaml_lineas, cuerpo = separar_front_matter(texto_maestro)
    inicio, fin, sangria, opciones = localizar_bloque_chalkboard(yaml_lineas)

    ancho, alto = leer_dimensiones(yaml_lineas)

    # El maestro manda en todo salvo en estas tres claves.
    opciones.pop("src", None)
    opciones["src"] = ruta_json_relativa
    opciones["read-only"] = "true"   # nadie puede alterar los trazos publicados
    opciones["buttons"] = "false"    # fuera los iconos nativos: manda nuestro botón
    # Estas dos van en camelCase A PROPOSITO: no están en la lista de
    # opciones que Quarto convierte de kebab a camel, así que se pasan
    # tal cual al plugin. Quitan la paleta de colores y el asa lateral,
    # que son UI de dibujo y sobran en una versión de solo lectura.
    opciones["colorButtons"] = "false"
    opciones["boardHandle"] = "false"

    orden = ["src", "theme", "boardmarker-width", "chalk-width",
             "transition", "read-only", "buttons", "colorButtons", "boardHandle"]
    claves = [k for k in orden if k in opciones]
    claves += [k for k in opciones if k not in orden]

    sangria_hija = sangria + "  "
    bloque = [f"{sangria}chalkboard:\n"]
    for k in claves:
        bloque.append(f"{sangria_hija}{k}: {opciones[k]}\n")

    nuevo_yaml = yaml_lineas[:inicio] + bloque + yaml_lineas[fin:]

    if retitular_doc:
        nuevo_yaml = retitular(nuevo_yaml)

    # Aviso dentro del propio YAML (comentario válido en YAML).
    cabecera = [
        "---\n",
        "# ==========================================================\n",
        "#  ARCHIVO GENERADO POR scripts/generar_anotada.py\n",
        f"#  Origen : presentacion_maestra.qmd\n",
        f"#  Notas  : {ruta_json_relativa}\n",
        f"#  Fecha  : {date.today().isoformat()}\n",
        "#  No lo edites a mano: se sobrescribe en la próxima clase.\n",
        "# ==========================================================\n",
    ]
    nuevo_yaml = cabecera + nuevo_yaml[1:]

    return "".join(nuevo_yaml) + "".join(cuerpo), (ancho, alto)


# --------------------------------------------------------------------
# 4. Programa principal
# --------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(
        description="Genera presentacion_anotada.qmd a partir del maestro y el JSON de chalkboard.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    ap.add_argument("json", type=Path, help="chalkboard.json descargado tras la clase")
    ap.add_argument("--maestra", type=Path, default=RAIZ / "presentacion_maestra.qmd")
    ap.add_argument("--salida", type=Path, default=RAIZ / "presentacion_anotada.qmd")
    ap.add_argument("--sesion", default=None,
                    help="etiqueta para el JSON: anotaciones/sesion-<ETIQUETA>.json")
    ap.add_argument("--no-render", action="store_true", help="no ejecutar quarto render")
    ap.add_argument("--sin-retitular", action="store_true", help="no modificar el subtitle")
    args = ap.parse_args()

    print("=" * 62)
    print("  Generador de presentación anotada — Quarto + Chalkboard")
    print("=" * 62)

    # --- Comprobaciones de entrada -----------------------------------
    if not args.json.exists():
        error(f"No existe el JSON: {args.json}")
        return 1
    if not args.maestra.exists():
        error(f"No existe el maestro: {args.maestra}")
        return 1

    # --- 1) Validar el JSON ------------------------------------------
    paso("Validando el archivo de anotaciones")
    try:
        resumen = resumir_json(args.json)
    except ValueError as exc:
        error(str(exc))
        return 1

    if not resumen["todas"]:
        aviso("El JSON no contiene ningún trazo. ¿Seguro que es el de esta clase?")
    else:
        info(f"Diapositivas con notas sobre el slide : {resumen['notas'] or '—'}")
        info(f"Diapositivas con trazos en la pizarra : {resumen['pizarra'] or '—'}")
        info(f"Total de diapositivas anotadas        : {len(resumen['todas'])}")

    # --- 2) Copiar el JSON a anotaciones/ ----------------------------
    paso("Archivando el JSON en anotaciones/")
    DIR_ANOTACIONES.mkdir(parents=True, exist_ok=True)
    etiqueta = f"sesion-{args.sesion}" if args.sesion else date.today().isoformat()
    destino_json = DIR_ANOTACIONES / f"{etiqueta}.json"

    if destino_json.exists() and destino_json.resolve() != args.json.resolve():
        aviso(f"Se sobrescribe {destino_json.name} (ya existía)")
    if destino_json.resolve() != args.json.resolve():
        shutil.copy2(args.json, destino_json)
    info(f"-> {destino_json.relative_to(RAIZ).as_posix()}")

    # --- 3) Generar el .qmd anotado ----------------------------------
    paso("Generando la copia anotada del .qmd")
    ruta_rel = destino_json.relative_to(RAIZ).as_posix()
    try:
        contenido, (ancho, alto) = construir_qmd_anotado(
            args.maestra.read_text(encoding="utf-8"),
            ruta_rel,
            not args.sin_retitular,
            args.maestra.name,
        )
    except ValueError as exc:
        error(str(exc))
        return 1

    if ancho and resumen["width"] and ancho != resumen["width"]:
        aviso(
            f"El maestro usa width: {ancho} pero el JSON se grabó con "
            f"{resumen['width']}. Los trazos se reescalarán y pueden desalinearse."
        )
    if alto and resumen["height"] and alto != resumen["height"]:
        aviso(
            f"El maestro usa height: {alto} pero el JSON se grabó con "
            f"{resumen['height']}."
        )

    args.salida.write_text(contenido, encoding="utf-8")
    info(f"-> {args.salida.relative_to(RAIZ).as_posix()}")
    info(f"   chalkboard.src = {ruta_rel}  |  read-only: true  |  buttons: false")

    # --- 4) Renderizar ------------------------------------------------
    if args.no_render:
        paso("Render omitido (--no-render)")
        return 0

    paso("Renderizando con Quarto")
    quarto = localizar_quarto()
    if not quarto:
        error(
            "No se encontró el ejecutable `quarto`.\n"
            "    Instálalo desde https://quarto.org/docs/get-started/ y "
            "reinicia la terminal,\n"
            "    o vuelve a ejecutar con --no-render y renderiza a mano."
        )
        return 1
    info(f"Ejecutable: {quarto}")

    proc = subprocess.run(
        [quarto, "render", str(args.salida.relative_to(RAIZ))],
        cwd=RAIZ,
    )
    if proc.returncode != 0:
        error(f"`quarto render` terminó con código {proc.returncode}")
        return proc.returncode

    # --- Siguientes pasos ---------------------------------------------
    print("\n" + "=" * 62)
    print("  Listo. Para publicar en GitHub Pages:")
    print("=" * 62)
    print(f"    git add docs {ruta_rel} {args.salida.name}")
    print(f'    git commit -m "Anotaciones de clase: {etiqueta}"')
    print("    git push")
    print()
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
test_api.py — prueba integral del backend de Alyra.

Levanta contra un servidor PHP ya corriendo (por defecto http://127.0.0.1:8790)
y recorre TODO el circuito: registro, sesión por cookie, publicar, subir foto,
impactar, rebloguear, perfil, contraseña, sesión compartida con el juego y
cierre de sesión.

Uso:
    1. php -S 127.0.0.1:8790        (o tu servidor de siempre)
    2. mysql < database.sql          (base limpia recomendada)
    3. python test_api.py

Se escribe en Python (y no en curl) porque en Windows el curl de la terminal
convierte los argumentos con acentos a Latin-1 y la prueba fallaría por la
herramienta, no por el código.
"""
import http.cookiejar
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

# La consola de Windows usa cp1252 y no sabe imprimir emojis: se cambia a
# UTF-8 para que un fallo con emojis en los datos se pueda leer.
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

BASE = os.environ.get("ALYRA_URL", "http://127.0.0.1:8790")
fallos = []
pasos = 0


def cookiejar():
    return http.cookiejar.CookieJar()


def pedir(jar, metodo, ruta, cuerpo=None, archivo=None, origen=None):
    """Devuelve (status, objeto_json_o_None)."""
    url = BASE + ruta
    data = None
    headers = {}
    if archivo:
        frontera = "----alyraTest" + str(os.getpid())
        nombre = os.path.basename(archivo)
        with open(archivo, "rb") as f:
            contenido = f.read()
        data = (
            ("--%s\r\nContent-Disposition: form-data; name=\"archivo\"; "
             "filename=\"%s\"\r\nContent-Type: image/png\r\n\r\n" % (frontera, nombre)).encode()
            + contenido
            + ("\r\n--%s--\r\n" % frontera).encode()
        )
        headers["Content-Type"] = "multipart/form-data; boundary=%s" % frontera
    elif cuerpo is not None:
        data = json.dumps(cuerpo, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json; charset=utf-8"
    if origen:
        headers["Origin"] = origen

    req = urllib.request.Request(url, data=data, headers=headers, method=metodo)
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    def a_objeto(texto):
        # La API contesta JSON; las páginas (juego/index.php) contestan HTML:
        # se devuelve el texto tal cual para poder revisarlo con `in`.
        if not texto:
            return None
        try:
            return json.loads(texto)
        except Exception:
            return texto

    try:
        respuesta = opener.open(req, timeout=15)
        return respuesta.status, a_objeto(respuesta.read().decode("utf-8", "replace"))
    except urllib.error.HTTPError as e:
        return e.code, a_objeto(e.read().decode("utf-8", "replace"))
    except Exception as e:  # red caída
        return 0, {"error": str(e)}


def comprobar(nombre, condicion, detalle=""):
    global pasos
    pasos += 1
    if condicion:
        print("  OK   %s" % nombre)
    else:
        print("  FALLO %s  %s" % (nombre, detalle))
        fallos.append(nombre)


def png_de_prueba(ruta):
    """Escribe un PNG de 2x2 válido, sin depender de librerías de imágenes."""
    import struct
    import zlib

    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)

    png = (b"\x89PNG\r\n\x1a\n"
           + chunk(b"IHDR", struct.pack(">IIBBBBB", 2, 2, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00\x00\xff\x00\x00\x00\xff\x00\x00\x00\xff\x00\x00"))
           + chunk(b"IEND", b""))
    with open(ruta, "wb") as f:
        f.write(png)


print("== Alyra · prueba integral contra %s ==" % BASE)

ana = cookiejar()
luis = cookiejar()

# ---------------------------------------------------------------- 1. auth
print("\n-- autenticación --")
c, r = pedir(ana, "POST", "/api/registro.php",
             {"nombre": "Ana Reyes", "correo": "ana@alyra.test", "contrasena": "clave123"})
comprobar("registro crea cuenta y sesión", c == 200 and r and r.get("ok"), str(r))
comprobar("handle autogenerado", r and r["usuario"]["handle"].startswith("@"), str(r))

c, r = pedir(ana, "GET", "/api/sesion.php")
comprobar("la cookie restaura la sesión", r and r.get("usuario") and r["usuario"]["name"] == "Ana Reyes", str(r))

c, r = pedir(ana, "POST", "/api/registro.php",
             {"nombre": "Ana Reyes", "correo": "ana@alyra.test", "contrasena": "clave123"})
comprobar("registro repetido entra como login", r and "Bienvenido" in (r.get("mensaje") or ""), str(r))

c, r = pedir(ana, "POST", "/api/login.php", {"correo": "ana@alyra.test", "contrasena": "mala"})
comprobar("contraseña mala -> 401", c == 401, str(c))

c, r = pedir(ana, "POST", "/api/login.php",
             {"correo": "ana@alyra.test", "contrasena": "clave123"})
comprobar("login correcto", c == 200 and r.get("ok"), str(r))

c, r = pedir(cookiejar(), "POST", "/api/registro.php",
             {"nombre": "Corto", "correo": "no-es-correo", "contrasena": "123"})
comprobar("registro inválido -> 400", c == 400, str(c))

# ------------------------------------------------------- 2. publicar y media
print("\n-- publicaciones --")
c, r = pedir(ana, "POST", "/api/publicaciones.php", {
    "texto": "Le di segunda vida a estas latas: ahora son macetas del balcón. 🪴",
    "etiquetas": ["upcycling", "jardin"],
    "tipo_media": "emoji",
    "valor_media": "🪴",
})
comprobar("publicar con acentos y emoji", c == 200 and r.get("ok"), str(r))
id1 = r["publicacion"]["id"] if r and r.get("publicacion") else None
comprobar("devuelve la publicación armada", id1 is not None, str(r))
comprobar("etiquetas guardadas", r and sorted(r["publicacion"]["tags"]) == ["jardin", "upcycling"], str(r))

c, r = pedir(cookiejar(), "GET", "/api/publicaciones.php")
comprobar("feed legible SIN sesión", c == 200 and len(r["publicaciones"]) == 1, str(r))
comprobar("el tiempo relativo es creíble", r and "hace" in r["publicaciones"][0]["time"] or
          r["publicaciones"][0]["time"] == "ahora", str(r))

ruta_png = os.path.join(tempfile.gettempdir(), "alyra_foto_prueba.png")
png_de_prueba(ruta_png)
c, r = pedir(ana, "POST", "/api/subir_media.php", archivo=ruta_png)
comprobar("subida de imagen aceptada", c == 200 and r.get("ok"), str(r))
url_subida = r["url"] if r and r.get("url") else ""
comprobar("el archivo existe en disco", os.path.isfile(os.path.join(os.path.dirname(__file__), url_subida)), url_subida)

c, r = pedir(ana, "POST", "/api/publicaciones.php", {
    "texto": "Mi balcón después del repinte con bote reciclado.",
    "etiquetas": ["reciclaje"],
    "tipo_media": "imagen",
    "valor_media": url_subida,
})
comprobar("publicar con la foto subida", c == 200 and r.get("ok"), str(r))
id2 = r["publicacion"]["id"] if r and r.get("publicacion") else None

c, r = pedir(ana, "POST", "/api/publicaciones.php", {
    "texto": "truquito", "tipo_media": "imagen", "valor_media": "uploads/no-existe.jpg",
})
comprobar("rechaza ruta de media que no subió el servidor", c == 400, str(c))

c, r = pedir(ana, "POST", "/api/publicaciones.php", {"texto": "<script>alert(1)</script>"})
comprobar("guarda el texto tal cual (lo escapa el navegador)",
          c == 200 and r.get("ok") and "<script>" in r["publicacion"]["text"], str(r))

c, r = pedir(cookiejar(), "POST", "/api/publicaciones.php", {"texto": "anónimo"})
comprobar("sin sesión no publica -> 401", c == 401, str(c))

c, r = pedir(ana, "POST", "/api/publicaciones.php",
             cuerpo={"texto": "x"}, origen="https://ejemplo-malo.com")
comprobar("Origin ajeno -> 403", c == 403, str(c))

# --------------------------------------------------- 3. impactos y reblogs
print("\n-- impactos y reblogs --")
c, r = pedir(luis, "POST", "/api/registro.php",
             {"nombre": "Luis Rueda", "correo": "luis@alyra.test", "contrasena": "clave123"})
comprobar("segundo usuario registrado", c == 200 and r.get("ok"), str(r))

c, r = pedir(luis, "POST", "/api/impacto.php", {"publicacion_id": id1})
comprobar("dar impacto", r and r.get("impact") == 1 and r.get("reacted") is True, str(r))
c, r = pedir(luis, "POST", "/api/impacto.php", {"publicacion_id": id1})
comprobar("quitar impacto (contador no baja de 0)", r and r.get("impact") == 0 and r.get("reacted") is False, str(r))
c, r = pedir(luis, "POST", "/api/impacto.php", {"publicacion_id": id1})
comprobar("tercer clic vuelve a darlo", r and r.get("impact") == 1, str(r))

c, r = pedir(luis, "POST", "/api/reblog.php", {"publicacion_id": id1})
comprobar("reblog", r and r.get("reblogs") == 1 and r.get("reblogged") is True, str(r))

c, r = pedir(ana, "GET", "/api/publicaciones.php")
p1 = [x for x in r["publicaciones"] if x["id"] == id1][0]
comprobar("Ana ve el impacto y el reblog de Luis",
          p1["impact"] == 1 and p1["reblogs"] == 1 and p1["reacted"] is False and p1["rebloggedByMe"] is False,
          str(p1))

c, r = pedir(luis, "POST", "/api/impacto.php", {"publicacion_id": 999999})
comprobar("impacto sobre publicación inexistente -> 404", c == 404, str(c))

# ------------------------------------------------- 4. perfil y contraseña
print("\n-- perfil y contraseña --")
c, r = pedir(ana, "POST", "/api/perfil.php", {
    "nombre": "Ana Reyes", "usuario": "@ana_balcon", "bio": "Reciclo en Medellín.",
    "color_acento": "terracota", "es_privado": 0,
})
comprobar("actualizar perfil", r and r["usuario"]["handle"] == "@ana_balcon", str(r))
comprobar("acento guardado", r and r["usuario"]["accent"] == "terracota", str(r))

c, r = pedir(luis, "POST", "/api/perfil.php", {"usuario": "@ana_balcon"})
comprobar("@tomado por otro -> 400", c == 400, str(c))

c, r = pedir(ana, "POST", "/api/perfil.php", {"usuario": "sin-arroba"})
comprobar("handle sin @ se normaliza", r and r["usuario"]["handle"] == "@sin-arroba", str(r))

c, r = pedir(ana, "POST", "/api/password.php", {"actual": "equivocada", "nueva": "nuevaclave1"})
comprobar("contraseña actual mala -> 401", c == 401, str(c))
c, r = pedir(ana, "POST", "/api/password.php", {"actual": "clave123", "nueva": "nuevaclave1"})
comprobar("cambiar contraseña", r and r.get("ok"), str(r))
c, r = pedir(cookiejar(), "POST", "/api/login.php",
             {"correo": "ana@alyra.test", "contrasena": "nuevaclave1"})
comprobar("entrar con la contraseña nueva", c == 200 and r.get("ok"), str(r))

c, r = pedir(cookiejar(), "GET", "/api/comunidad.php")
comprobar("contador de miembros real", r and r["miembros"] == 2, str(r))
# Visitante sin sesión: se sugieren las dos cuentas existentes.
comprobar("cuentas sugeridas para la barra lateral", r and len(r["sugeridos"]) == 2, str(r))
c, r = pedir(luis, "GET", "/api/comunidad.php")
comprobar("con sesión no te sugieres a ti mismo",
          r and len(r["sugeridos"]) == 1 and r["sugeridos"][0]["name"] == "Ana Reyes", str(r))

# --------------------------------------------------------- 5. el juego
print("\n-- sesión compartida con el juego --")
c, r = pedir(ana, "POST", "/juego/save_progress.php",
             {"especie_id": "condor", "salud": 40, "gano": True, "extinto": False})
comprobar("guardar progreso con la cuenta del blog", r and r.get("ok"), str(r))
c, r = pedir(ana, "GET", "/juego/get_progress.php")
comprobar("leer progreso", r and "condor" in (r.get("progreso") or {}), str(r))
c, r = pedir(ana, "GET", "/juego/index.php?embed=1")
comprobar("index.php del juego responde HTML con sesión",
          c == 200 and "id=\"mapa\"" in (r if isinstance(r, str) else ""), str(c))

# registro del juego -> misma cuenta unificada
guardian = cookiejar()
c, r = pedir(guardian, "POST", "/juego/register.php",
             {"nombre_usuario": "Guardian Andino", "correo": "guardian@alyra.test",
              "contrasena": "clave123"})
comprobar("registro desde el juego", r and r.get("ok"), str(r))
c, r = pedir(guardian, "GET", "/api/sesion.php")
comprobar("esa cuenta vale también para el blog",
          r and r["usuario"] and r["usuario"]["name"] == "Guardian Andino", str(r))

c, r = pedir(guardian, "GET", "/juego/get_progress.php")
comprobar("cuenta nueva sin progreso devuelve vacío",
          r and r.get("ok") is True and r.get("progreso") == {}, str(r))

# --------------------------------------------------------- 6. privacidad
print("\n-- privacidad y cierre --")
c, r = pedir(ana, "POST", "/api/perfil.php", {"es_privado": 1})
    comprobar("activar perfil privado", r and r["usuario"]["isPrivate"] is True, str(r))
c, r = pedir(luis, "GET", "/api/publicaciones.php")
ids_luis = [x["id"] for x in r["publicaciones"]]
    comprobar("el feed público muestra posts de perfiles privados", id2 in ids_luis, str(ids_luis))
c, r = pedir(ana, "GET", "/api/publicaciones.php")
comprobar("su propia lista sí las muestra", id2 in [x["id"] for x in r["publicaciones"]], str(r))
pedir(ana, "POST", "/api/perfil.php", {"es_privado": 0})

c, r = pedir(luis, "GET", "/juego/get_progress.php")
c, r = pedir(cookiejar(), "GET", "/juego/get_progress.php")
comprobar("juego sin sesión no expone progreso", r and r.get("ok") is False, str(r))

c, r = pedir(ana, "POST", "/api/logout.php", {})
comprobar("logout responde ok", r and r.get("ok"), str(r))
c, r = pedir(ana, "GET", "/api/sesion.php")
comprobar("la cookie ya no da sesión", r and r.get("usuario") is None, str(r))
c, r = pedir(ana, "POST", "/api/publicaciones.php", {"texto": "ya no debo poder"})
comprobar("tras logout no publica -> 401", c == 401, str(c))

# --------------------------------------------------------- 7. eliminar
print("\n-- eliminar cuenta --")
c, r = pedir(luis, "POST", "/api/eliminar_cuenta.php", {})
comprobar("eliminar cuenta", r and r.get("ok"), str(r))
c, r = pedir(cookiejar(), "GET", "/api/comunidad.php")
comprobar("los miembros bajan", r and r["miembros"] == 2, str(r))
# ON DELETE CASCADE: al borrar a Luis deben desaparecer SU impacto y SU
# reblog de la publicación de Ana (y sus sesiones, y su progreso del juego).
c, r = pedir(cookiejar(), "GET", "/api/publicaciones.php")
p1 = [x for x in r["publicaciones"] if x["id"] == id1][0]
comprobar("sus impactos y reblogs se borran en cascada",
          p1["impact"] == 0 and p1["reblogs"] == 0, str(p1))
c, r = pedir(cookiejar(), "GET", "/juego/get_progress.php")
comprobar("su progreso del juego ya no existe (nadie con esa sesión)",
          r and r.get("ok") is False, str(r))

print("\n%d comprobaciones, %d fallos" % (pasos, len(fallos)))
if fallos:
    print("FALLARON: " + ", ".join(fallos))
    sys.exit(1)
print("TODAS LAS PRUEBAS PASARON")


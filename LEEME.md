# Arca

Gestor de archivos web para los discos del servidor de casa: un «Drive» propio,
sin dependencias y sin base de datos. Trabaja directamente sobre las carpetas de
los discos, así que lo que ves en Arca es exactamente lo que hay en el disco.

## Qué hace

- **Navegar** por varios discos a la vez, con el espacio libre de cada uno.
  Vista de lista o cuadrícula (con miniaturas de las fotos), orden por nombre,
  tamaño o fecha, y buscador que mira en la carpeta y en todas las de dentro.
- **Ver sin descargar**: fotos, vídeo y audio (se puede saltar a cualquier
  punto del vídeo), PDF y textos. Con flechas para pasar al siguiente.
- **Subir** archivos o carpetas enteras, arrastrándolos a la página o con los
  botones. Con barra de progreso; si ya existe un archivo con ese nombre se
  guarda como «nombre (2)», nunca se pisa nada.
- **Descargar** un archivo, o varios / carpetas enteras en un ZIP que se va
  generando mientras se descarga (sirve para carpetas de cientos de GB).
- **Mover, copiar, renombrar** y crear carpetas. También entre discos: dentro
  del mismo disco mover es instantáneo; entre discos se copia y luego se borra
  el original, en segundo plano y con progreso. Se puede arrastrar una fila
  sobre una carpeta para moverla.
- **Papelera** por disco: lo borrado va a `.papelera-arca/` del propio disco
  (no ocupa espacio en otro sitio) y se puede restaurar a su sitio. Se vacía
  sola a los 30 días.
- **Carpetas de solo lectura**: se pueden ver, descargar y copiar a otro sitio,
  pero no cambiar, borrar ni meter nada. Pensado para las fotos que gestiona
  Immich.
- Se instala como app en el móvil y en el ordenador. Tema claro y oscuro.

Atajos: `Supr` borra, `F2` renombra, `Ctrl+A` elige todo, `Esc` deselecciona.

## Arrancar

```bash
ARCA_DISCOS="datos=/mnt/datos;fotos=/mnt/fotos" ARCA_USUARIO=yo ARCA_CLAVE=algo node server.js
# http://localhost:9995
```

No tiene dependencias: no hace falta `npm install`. Con Docker hay un
`docker-compose.yml` de prueba que usa la carpeta `prueba-discos/`.

## Configuración (variables de entorno)

| Variable | Para qué | Por defecto |
|----------|----------|-------------|
| `PORT` | Puerto | `9995` |
| `ARCA_DISCOS` | Discos que se ven, `nombre=/ruta;nombre=/ruta` | `prueba=./prueba-discos` |
| `ARCA_SOLO_LECTURA` | Carpetas protegidas, `disco/carpeta;disco/otra` (también todo lo que tienen dentro) | ninguna |
| `ARCA_USUARIO` | Usuario | `arca` |
| `ARCA_CLAVE` | Contraseña **inicial** | una al azar (sale en el log) |
| `ARCA_PAPELERA_DIAS` | Días que se guarda lo borrado | `30` |
| `ARCA_DATOS` | Dónde guarda la contraseña y las sesiones | `./datos` (`/datos` en Docker) |

La contraseña de `ARCA_CLAVE` solo se usa la primera vez: se guarda cifrada
(scrypt) en `ARCA_DATOS/acceso.json` y desde ese momento se cambia desde el
menú de la app («Cambiar contraseña»), lo que cierra las demás sesiones. Si se
olvida, se borra `acceso.json` y al arrancar vuelve a valer la de `ARCA_CLAVE`.

## Seguridad

- Sesión con cookie `HttpOnly` y `SameSite=Strict` (dura 30 días); todas las
  peticiones que cambian algo llevan además una cabecera propia, así que otra
  web no puede hacerlas en tu nombre.
- Tras 5 intentos fallidos de entrar, cada nuevo intento espera más.
- Ninguna ruta puede salir de su disco (se comprueba también siguiendo los
  enlaces simbólicos).
- Los HTML, SVG y XML de los discos se enseñan como texto, nunca se ejecutan.
- No está pensada para estar abierta a internet: en casa se usa por la red
  local y por Tailscale.

## Despliegue en el homelab

Se monta desde el repositorio HomeLabDockers (carpeta `arca/`, puerto 9995;
por Tailscale, 8885). El contenedor corre como el usuario 33 (www-data), que es
el dueño de los discos NTFS del servidor. Cada push a `main` se aplica solo,
igual que en Mutare: el workflow `.github/workflows/desplegar.yml` avisa a
HomeLabDockers (necesita el secreto `HOMELAB_TOKEN`, el mismo token que Mutare)
y, si el aviso no llega, el servidor revisa este repositorio cada 5 minutos.

## Cómo está hecho

- `server.js`: servidor y API JSON en un solo archivo, solo con módulos de
  Node. Las subidas se escriben en un archivo temporal oculto y se renombran
  al terminar (si se corta, no queda un archivo a medias). El ZIP se escribe
  en flujo (con ZIP64 para archivos de más de 4 GB). Las miniaturas salen de
  la que lleva dentro cada foto JPG (EXIF), sin procesar la imagen.
- `public/`: la web (`app.js`, `styles.css`, `index.html`), el service worker
  (`sw.js`, que nunca guarda respuestas de la API) y los iconos.

## Fuentes

`public/fuentes/` lleva Newsreader e Instrument Sans (de Fontsource), ambas con
licencia SIL Open Font License.

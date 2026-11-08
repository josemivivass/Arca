# Arca

Gestor de archivos web para los discos del servidor de casa: un «Drive» propio,
sin dependencias y sin base de datos. Trabaja directamente sobre las carpetas de
los discos, así que lo que ves en Arca es exactamente lo que hay en el disco.

## Qué hace

- **Navegar** por varios discos a la vez, con el espacio libre de cada uno.
  Vista de lista o cuadrícula (con miniaturas de las fotos), orden por nombre,
  tamaño o fecha, y buscador que mira en la carpeta y en todas las de dentro.
- **Tamaño de las carpetas**: en la lista y en la cuadrícula. El servidor las
  recorre enteras (de dos en dos), lo recuerda media hora y lo olvida en cuanto
  Arca cambia algo.
- **Miniaturas de todo**: fotos (también HEIC, TIFF, RAW…), vídeos, PDF,
  carátulas de discos, el principio de textos, Word, Excel, presentaciones y
  ZIP, y las carpetas con hasta cuatro cosas de dentro. Sin recortar: cada
  miniatura conserva la forma del original. Se generan en el servidor la
  primera vez y se guardan (caché de 3 GB como mucho, `ARCA_CACHE_MB`).
- **Ver sin descargar cualquier archivo**: fotos con zoom, PDF página a página,
  Word, hojas de cálculo (con sus pestañas), Markdown, textos y código, ZIP,
  audio y vídeo.
- **Películas enteras**, aunque pesen 15 GB: se reproducen tal cual y se salta
  a cualquier punto al momento. Si el navegador no entiende el formato (MKV con
  HEVC, audio AC3/DTS, AVI…), el servidor lo convierte al vuelo («modo
  compatible»), sin recomprimir la imagen cuando no hace falta. Con elección de
  pista de audio, subtítulos (los de dentro del vídeo y los `.srt`/`.ass`
  sueltos con el mismo nombre), y recuerda por dónde ibas.
- **Subir** archivos o carpetas enteras, arrastrándolos a la página o con los
  botones. Con barra de progreso. Antes de empezar mira qué hay ya: si algunos
  archivos ya están (mismo nombre y tamaño) pregunta si omitirlos (lo normal
  al repetir una subida que se cortó) o subirlos como copia; y si hay alguno
  con el mismo nombre pero distinto tamaño, si guardarlo como «nombre (2)»,
  reemplazar el antiguo (que va a la papelera) u omitirlo.
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
| `ARCA_SOLO_LECTURA` | Carpetas protegidas, `disco/carpeta;disco/otra` (también todo lo que tienen dentro). Un disco entero también vale: `disco` | ninguna |
| `ARCA_EXTRAIBLES` | Discos que se enchufan y desenchufan (USB), `disco;otro`: solo se ven mientras están montados. Para que el contenedor vea el disco al montarlo, se monta la carpeta de encima con `rslave` (`/mnt:/discos:rslave`) | ninguno |
| `ARCA_USUARIO` | Usuario | `arca` |
| `ARCA_CLAVE` | Contraseña **inicial** | una al azar (sale en el log) |
| `ARCA_PAPELERA_DIAS` | Días que se guarda lo borrado | `30` |
| `ARCA_CACHE_MB` | Tamaño máximo de la caché de miniaturas y subtítulos | `3000` |
| `ARCA_TRABAJOS` | Miniaturas que se generan a la vez | `2` |
| `ARCA_DIRECTOS` | Vídeos convertidos al vuelo a la vez (todo el servidor) | `3` |
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

- `server.js`: servidor y API JSON, solo con módulos de Node.
- `medios.js`: miniaturas, vistas, información de vídeos y audios, conversión
  al vuelo y subtítulos. Usa `ffmpeg`, `vipsthumbnail` y `pdftoppm` si están
  (en Docker van en la imagen); si falta alguno, esas miniaturas no se hacen. Las subidas se escriben en un archivo temporal oculto y se renombran
  al terminar (si se corta, no queda un archivo a medias; los restos se borran al día siguiente, en cualquier subcarpeta). El ZIP se escribe
  en flujo (con ZIP64 para archivos de más de 4 GB). Las miniaturas salen de
  la que lleva dentro cada foto JPG (EXIF), sin procesar la imagen.
- `public/`: la web (`app.js`, `visor.js` para abrir los archivos, `styles.css`, `index.html`), el service worker
  (`sw.js`, que nunca guarda respuestas de la API) y los iconos.

## Librerías del visor (en `public/vendor/`, se cargan solo al abrir ese tipo de archivo)

| Librería | Versión | Para qué | Licencia |
|----------|---------|----------|----------|
| pdf.js | 6.2.108 | PDF | Apache 2.0 |
| SheetJS (xlsx) | 0.20.3 | Hojas de cálculo | Apache 2.0 |
| mammoth | 1.8.0 | Word (en `aislado.html`, sin acceso a la red) | BSD-2 |
| marked | 18.0.10 | Markdown | MIT |
| DOMPurify | 3.4.14 | Limpiar el HTML antes de enseñarlo | MPL 2.0 / Apache 2.0 |

## Fuentes

`public/fuentes/` lleva Newsreader e Instrument Sans (de Fontsource), ambas con
licencia SIL Open Font License.

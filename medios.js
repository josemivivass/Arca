'use strict';
// Medios: miniaturas, vistas de imágenes que el navegador no abre, información
// de vídeos y audios, reproducción en «modo compatible» (ffmpeg en directo),
// subtítulos y extractos de documentos para las miniaturas.
//
// Usa programas del sistema si están (en Docker van en la imagen):
//   vipsthumbnail (libvips)  fotos de cualquier tamaño con muy poca memoria, HEIC, TIFF, SVG
//   ffmpeg / ffprobe         vídeo, audio, carátulas y, si no hay vips, también fotos
//   pdftoppm (poppler)       primera página de los PDF
//   heif-convert (libheif)   HEIC si vips no lo sabe abrir
// Si falta alguno, esa miniatura simplemente no se hace y se ve el icono.

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawn } = require('child_process');

const extDe = (n) => path.extname(n).slice(1).toLowerCase();
const CLASES = {
  imagen: 'jpg jpeg png gif webp avif bmp ico',
  imagenRara: 'heic heif tif tiff svg jxl psd dng cr2 cr3 nef arw orf rw2 raf',
  video: 'mp4 m4v webm mov mkv avi wmv mpg mpeg ts m2ts mts 3gp flv ogv vob divx asf',
  audio: 'mp3 m4a m4b aac ogg oga opus flac wav wma aiff aif ac3 eac3 dts ape mka amr',
  pdf: 'pdf',
  texto: 'txt md markdown log json xml ini cfg conf yml yaml toml srt vtt ass sh bat ps1 js mjs ts py java c h cpp cs go rs php rb sql html htm css scss csv tsv env gitignore dockerfile properties',
  oficina: 'docx xlsx pptx odt ods odp',
  zip: 'zip',
};
const CLASE_DE = new Map();
for (const [c, l] of Object.entries(CLASES)) for (const e of l.split(' ')) CLASE_DE.set(e, c);
const claseDe = (nombre) => CLASE_DE.get(extDe(nombre)) || 'otro';

const SUBS_TEXTO = new Set(['subrip', 'ass', 'ssa', 'webvtt', 'mov_text', 'text', 'srt']);

module.exports = function crearMedios({ DATOS, fallo }) {
  const CACHE = path.join(DATOS, 'cache');
  const TMP = path.join(DATOS, 'tmp');
  const LIMITE_CACHE = (Number(process.env.ARCA_CACHE_MB) || 3000) * 1024 * 1024;
  for (const d of ['miniaturas', 'vistas', 'subtitulos', 'info']) fs.mkdirSync(path.join(CACHE, d), { recursive: true });
  fs.rmSync(TMP, { recursive: true, force: true }); fs.mkdirSync(TMP, { recursive: true });
  const ENV = { ...process.env, TMPDIR: TMP };

  // -------------------------------------------------------------------------
  // Programas disponibles
  // -------------------------------------------------------------------------
  const hay = {};
  const comprobar = (cmd, arg) => new Promise((ok) => {
    const p = spawn(cmd, [arg], { stdio: 'ignore', env: ENV });
    p.on('error', () => ok(false)); p.on('exit', () => ok(true));
  });
  const listo = Promise.all([
    ['vips', 'vipsthumbnail', '--version'], ['ffmpeg', 'ffmpeg', '-version'], ['ffprobe', 'ffprobe', '-version'],
    ['pdftoppm', 'pdftoppm', '-v'], ['heif', 'heif-convert', '--version'],
  ].map(async ([k, c, a]) => { hay[k] = await comprobar(c, a); })).then(() => {
    console.log('Medios:', Object.entries(hay).map(([k, v]) => `${k} ${v ? 'sí' : 'no'}`).join(', '));
  });

  // Ejecuta un programa; devuelve su salida (Buffer). Sin shell: los nombres
  // de archivo nunca se interpretan.
  function ejecutar(cmd, args, { tiempo = 60000, max = 64 << 20 } = {}) {
    return new Promise((ok, mal) => {
      const p = spawn(cmd, args, { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
      const salida = [], errores = []; let n = 0;
      const t = setTimeout(() => p.kill('SIGKILL'), tiempo);
      p.stdout.on('data', (d) => { n += d.length; if (n > max) p.kill('SIGKILL'); else salida.push(d); });
      p.stderr.on('data', (d) => { if (errores.length < 50) errores.push(d); });
      p.on('error', (e) => { clearTimeout(t); mal(e); });
      p.on('close', (c) => {
        clearTimeout(t);
        if (c === 0) ok(Buffer.concat(salida));
        else mal(new Error(`${cmd}: ${Buffer.concat(errores).toString().trim().split('\n').pop() || `salió con ${c}`}`));
      });
    });
  }

  // Cola: como mucho N trabajos pesados a la vez (y uno solo por clave)
  // Si quien la pidió ya se fue (cambió de carpeta, cerró…), la miniatura
  // que aún no ha empezado no se hace: así lo nuevo sale antes
  function cola(n) {
    let activos = 0; const espera = []; const enCurso = new Map();
    const siguiente = () => {
      while (activos < n && espera.length) {
        const t = espera.shift();
        if (t.senales.length && t.senales.every((x) => x.cancelado)) { t.mal(Object.assign(new Error('cancelado'), { cancelado: true })); continue; }
        activos++;
        t.fn().then(t.ok, t.mal).finally(() => { activos--; siguiente(); });
      }
    };
    return (clave, fn, senal) => {
      const ya = enCurso.get(clave);
      if (ya) { if (senal) ya.trabajo.senales.push(senal); else ya.trabajo.senales.length = 0; return ya.pr; }
      const trabajo = { fn, senales: senal ? [senal] : [] };
      const pr = new Promise((ok, mal) => { Object.assign(trabajo, { ok, mal }); espera.push(trabajo); siguiente(); })
        .finally(() => enCurso.delete(clave));
      enCurso.set(clave, { pr, trabajo });
      return pr;
    };
  }
  const pesada = cola(Math.max(1, Number(process.env.ARCA_TRABAJOS) || Math.min(4, require('os').cpus().length || 2)));

  const claveDe = (abs, st, extra = '') => crypto.createHash('sha1').update(`${abs}\0${st.size}\0${Math.floor(st.mtimeMs)}\0${extra}`).digest('hex');
  const enCache = (tipo, clave, ext) => path.join(CACHE, tipo, clave.slice(0, 2), `${clave}.${ext}`);
  async function leerCache(tipo, clave) {
    for (const ext of ['webp', 'jpg', 'png', 'nada', 'vtt', 'json']) {
      const f = enCache(tipo, clave, ext);
      try { const st = await fsp.stat(f); return { archivo: f, ext, tam: st.size }; } catch {}
    }
    return null;
  }
  async function guardarCache(tipo, clave, ext, datos) {
    const f = enCache(tipo, clave, ext);
    await fsp.mkdir(path.dirname(f), { recursive: true });
    const tmp = `${f}.${process.pid}.${Date.now()}.tmp`;
    await fsp.writeFile(tmp, datos); await fsp.rename(tmp, f);
    return { archivo: f, ext, tam: datos.length };
  }
  const tmpNombre = (ext) => path.join(TMP, `${crypto.randomBytes(8).toString('hex')}.${ext}`);
  // vips lee opciones entre corchetes al final del nombre («a[1].jpg»): se le
  // pasa un enlace con un nombre limpio
  async function conEnlace(abs, fn) {
    const enlace = tmpNombre(extDe(abs) || 'x');
    await fsp.symlink(abs, enlace);
    try { return await fn(enlace); } finally { fsp.rm(enlace, { force: true }).catch(() => {}); }
  }
  async function leerYBorrar(f) { try { return await fsp.readFile(f); } finally { fsp.rm(f, { force: true }).catch(() => {}); } }

  // -------------------------------------------------------------------------
  // Generadores
  // -------------------------------------------------------------------------
  async function vips(abs, lado, ext, q) {
    const out = tmpNombre(ext);
    await conEnlace(abs, (e) => ejecutar('vipsthumbnail', [e, '--size', `${lado}x${lado}>`, '-o', `${out}[Q=${q}]`], { tiempo: 60000 }));
    return leerYBorrar(out);
  }
  async function ffmpegImagen(entrada, lado, extraAntes = [], extraDespues = []) {
    return ejecutar('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...extraAntes, '-i', `file:${entrada}`, ...extraDespues,
      '-frames:v', '1', '-vf', `scale=${lado}:${lado}:force_original_aspect_ratio=decrease:flags=bicubic`, '-q:v', '4', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1'], { tiempo: 45000 });
  }
  async function pdfPrimera(abs, lado) {
    const base = tmpNombre('x').slice(0, -2);
    await ejecutar('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-scale-to', String(lado), '-jpeg', '-jpegopt', 'quality=82', abs, base], { tiempo: 45000 });
    return leerYBorrar(`${base}.jpg`);
  }
  async function heifAJpeg(abs) {
    const out = tmpNombre('jpg');
    await ejecutar('heif-convert', ['-q', '90', abs, out], { tiempo: 60000 });
    return out;
  }

  // Imagen reducida (miniatura o vista grande) de cualquier foto
  async function imagenReducida(abs, lado, q) {
    const x = extDe(abs);
    const errores = [];
    if (hay.vips) { try { return { datos: await vips(abs, lado, 'webp', q), ext: 'webp' }; } catch (e) { errores.push(e.message); } }
    if ((x === 'heic' || x === 'heif') && hay.heif) {
      let tmp; try { tmp = await heifAJpeg(abs); return { datos: hay.vips ? await vips(tmp, lado, 'webp', q) : await ffmpegImagen(tmp, lado), ext: hay.vips ? 'webp' : 'jpg' }; }
      catch (e) { errores.push(e.message); } finally { if (tmp) fsp.rm(tmp, { force: true }).catch(() => {}); }
    }
    if (hay.ffmpeg && x !== 'svg' && x !== 'heic' && x !== 'heif') {
      try { return { datos: await ffmpegImagen(abs, lado), ext: 'jpg' }; } catch (e) { errores.push(e.message); }
    }
    throw new Error(errores.join(' · ') || 'No hay con qué abrir esta imagen');
  }

  async function generarMiniatura(abs, st, lado = 320) {
    const c = claseDe(abs), x = extDe(abs);
    if (c === 'imagen' || c === 'imagenRara') {
      if (!hay.vips && /^jpe?g$/.test(x)) { const m = await miniaturaExif(abs).catch(() => null); if (m && !hay.ffmpeg) return { datos: m, ext: 'jpg' }; }
      return imagenReducida(abs, lado, 62);
    }
    if (c === 'pdf') {
      if (hay.pdftoppm) return { datos: await pdfPrimera(abs, lado), ext: 'jpg' };
      if (hay.vips) return { datos: await vips(abs, lado, 'webp', 75), ext: 'webp' };
      return null;
    }
    if (c === 'video') {
      if (!hay.ffmpeg) return null;
      const i = await informacion(abs, st).catch(() => null);
      const dur = i?.duracion || 0;
      const t = dur > 0 ? Math.min(dur * 0.12, 240) : 0;
      try { return { datos: await ffmpegImagen(abs, lado, t ? ['-ss', t.toFixed(2)] : [], ['-map', '0:v:0']), ext: 'jpg' }; }
      catch { return { datos: await ffmpegImagen(abs, lado, [], ['-map', '0:v:0']), ext: 'jpg' }; }
    }
    if (c === 'audio') {
      if (hay.ffmpeg) { try { const d = await ffmpegImagen(abs, lado, [], ['-map', '0:v:0', '-an']); if (d.length) return { datos: d, ext: 'jpg' }; } catch {} }
      // Si no lleva carátula, la de la carpeta (cover.jpg, folder.jpg…)
      const dir = path.dirname(abs);
      const ents = await fsp.readdir(dir).catch(() => []);
      const portada = ents.find((n) => /^(cover|folder|front|portada|album)\.(jpe?g|png|webp)$/i.test(n));
      if (portada) return imagenReducida(path.join(dir, portada), lado, 72);
      return null;
    }
    if (c === 'oficina') {
      const ents = await zipEntradas(abs).catch(() => null); if (!ents) return null;
      const e = ents.find((z) => /^Thumbnails\/thumbnail\.png$|^docProps\/thumbnail\.(jpe?g|png)$/i.test(z.nombre));
      if (!e) return null;
      return { datos: await zipLeer(abs, e, 4 << 20), ext: /png$/i.test(e.nombre) ? 'png' : 'jpg' };
    }
    return null;
  }

  // Miniatura en caché (o null si ese archivo no tiene)
  // Dos tamaños: «p» (lista y mosaicos de carpetas) y «m» (cuadrícula). Las
  // pequeñas pesan poco y salen enseguida.
  const LADOS = { p: 160, m: 320 };
  async function miniatura(abs, st, tam = 'm', senal) {
    await listo;
    const lado = LADOS[tam] || LADOS.m;
    const clave = claveDe(abs, st, `m3-${lado}`);
    const c = await leerCache('miniaturas', clave);
    if (c) return c.ext === 'nada' ? null : c;
    return pesada(clave, async () => {
      let r = null;
      try { r = await generarMiniatura(abs, st, lado); } catch (e) { console.log(`miniatura de ${abs}: ${e.message}`); }
      if (!r || !r.datos?.length) { await guardarCache('miniaturas', clave, 'nada', Buffer.alloc(0)); return null; }
      return guardarCache('miniaturas', clave, r.ext, r.datos);
    });
  }

  // Imagen grande para ver en pantalla (HEIC, TIFF, RAW, PSD… o fotos enormes)
  async function vista(abs, st) {
    await listo;
    const clave = claveDe(abs, st, 'v1');
    const c = await leerCache('vistas', clave);
    if (c && c.ext !== 'nada') return c;
    return pesada(clave, async () => {
      const r = await imagenReducida(abs, 2560, 86);
      return guardarCache('vistas', clave, r.ext, r.datos);
    });
  }

  // -------------------------------------------------------------------------
  // Información de vídeos y audios (ffprobe)
  // -------------------------------------------------------------------------
  const infoMem = new Map();
  async function informacion(abs, st) {
    await listo;
    if (!hay.ffprobe) fallo(501, 'Falta ffprobe en el servidor');
    const clave = claveDe(abs, st, 'i2');
    if (infoMem.has(clave)) return infoMem.get(clave);
    const c = await leerCache('info', clave);
    if (c) { const j = JSON.parse(await fsp.readFile(c.archivo, 'utf8')); infoMem.set(clave, j); return j; }
    const salida = await ejecutar('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', `file:${abs}`], { tiempo: 30000 });
    const j = JSON.parse(salida.toString('utf8'));
    const tags = (o) => Object.fromEntries(Object.entries(o?.tags || {}).map(([k, v]) => [k.toLowerCase(), v]));
    const streams = j.streams || [];
    const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
    const info = {
      duracion: Number(j.format?.duration) || 0,
      formato: j.format?.format_name || '',
      bits: Number(j.format?.bit_rate) || 0,
      video: v ? {
        codec: v.codec_name, perfil: v.profile || '', ancho: v.width, alto: v.height, pix: v.pix_fmt || '',
        hdr: /smpte2084|arib-std-b67/.test(v.color_transfer || ''),
      } : null,
      audios: streams.filter((s) => s.codec_type === 'audio').map((s, n) => ({
        n, codec: s.codec_name, canales: s.channels || 0, idioma: tags(s).language || '', titulo: tags(s).title || '', defecto: !!s.disposition?.default,
      })),
      subtitulos: streams.filter((s) => s.codec_type === 'subtitle').map((s, n) => ({
        n, codec: s.codec_name, idioma: tags(s).language || '', titulo: tags(s).title || '', texto: SUBS_TEXTO.has(s.codec_name),
        defecto: !!s.disposition?.default, forzado: !!s.disposition?.forced,
      })),
      etiquetas: (({ title, artist, album, album_artist: aa, date }) => ({ titulo: title, artista: artist || aa, album, fecha: date }))(tags(j.format)),
    };
    infoMem.set(clave, info); if (infoMem.size > 500) infoMem.delete(infoMem.keys().next().value);
    await guardarCache('info', clave, 'json', Buffer.from(JSON.stringify(info)));
    return info;
  }
  // Subtítulos sueltos junto al vídeo: «peli.srt», «peli.es.srt», «peli.spa.forced.ass»…
  async function subtitulosExternos(abs) {
    const dir = path.dirname(abs), base = path.basename(abs, path.extname(abs)).normalize('NFC').toLowerCase();
    const ents = await fsp.readdir(dir).catch(() => []);
    return ents.filter((n) => /\.(srt|vtt|ass|ssa)$/i.test(n) && n.normalize('NFC').toLowerCase().startsWith(base + '.'))
      .map((n) => ({ nombre: n, etiqueta: n.slice(base.length + 1).replace(/\.(srt|vtt|ass|ssa)$/i, '') || 'externo' }));
  }

  // Fotograma clave en o antes de t (para empezar ahí sin recomprimir el vídeo)
  async function claveAntes(abs, t) {
    if (t <= 0) return 0;
    try {
      const s = await ejecutar('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey', '-show_entries', 'frame=pts_time,best_effort_timestamp_time',
        '-of', 'csv=p=0', '-read_intervals', `${Math.max(0, t - 30).toFixed(2)}%${(t + 0.2).toFixed(2)}`, `file:${abs}`], { tiempo: 20000 });
      const tiempos = s.toString().split('\n').map((l) => Number(l.split(',').find((x) => x && x !== 'N/A'))).filter((x) => Number.isFinite(x) && x <= t + 0.05);
      return tiempos.length ? Math.max(0, tiempos.at(-1)) : t;
    } catch { return t; }
  }

  // -------------------------------------------------------------------------
  // Reproducción en «modo compatible»: ffmpeg en directo a MP4 fragmentado.
  // Una sola reproducción por sesión: al pedir otra (saltar, cambiar de
  // pista…) se corta la anterior.
  // -------------------------------------------------------------------------
  const enMarcha = new Map(); // sesión → proceso
  const MAX_DIRECTOS = Math.max(1, Number(process.env.ARCA_DIRECTOS) || 3);
  function cortar(sesion) { const p = enMarcha.get(sesion); if (p) { p.kill('SIGKILL'); enMarcha.delete(sesion); } }

  async function emitir(req, res, sesion, args, tipo) {
    await listo;
    if (!hay.ffmpeg) fallo(501, 'Falta ffmpeg en el servidor');
    cortar(sesion);
    if (enMarcha.size >= MAX_DIRECTOS) fallo(503, 'Hay demasiadas reproducciones a la vez');
    const p = spawn('ffmpeg', args, { env: ENV, stdio: ['ignore', 'pipe', 'pipe'] });
    enMarcha.set(sesion, p);
    let err = '';
    p.stderr.on('data', (d) => { if (err.length < 4000) err += d; });
    p.on('error', () => {});
    p.on('close', (c) => { if (enMarcha.get(sesion) === p) enMarcha.delete(sesion); if (c && c !== 255 && !res.writableEnded && err) console.log('ffmpeg:', err.trim().split('\n').slice(-2).join(' | ')); });
    res.writeHead(200, { 'Content-Type': tipo, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    req.on('close', () => { if (enMarcha.get(sesion) === p) cortar(sesion); else p.kill('SIGKILL'); });
    p.stdout.pipe(res);
  }

  // Al copiar el vídeo sin recomprimir, ffmpeg empieza en un fotograma clave
  // anterior al punto pedido. Para que imagen y sonido vayan a la par, los dos
  // empiezan ahí (-noaccurate_seek), y esta función averigua dónde cae
  // exactamente, para que el reproductor sepa qué minuto está viendo.
  const inicios = new Map();
  async function inicioReal(abs, t, audio) {
    if (t <= 0) return 0;
    const clave = `${abs}\0${t.toFixed(3)}\0${audio}`;
    if (inicios.has(clave)) return inicios.get(clave);
    const tmp = tmpNombre('nut');
    let r = t;
    try {
      await ejecutar('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-noaccurate_seek', '-ss', t.toFixed(3), '-t', '0.4', '-i', `file:${abs}`,
        '-map', '0:v:0', '-map', `0:a:${audio}?`, '-c', 'copy', '-copyts', '-f', 'nut', tmp], { tiempo: 20000 });
      const s2 = await ejecutar('ffprobe', ['-v', 'error', '-show_entries', 'packet=dts_time,pts_time', '-of', 'csv=p=0', tmp], { tiempo: 10000 });
      const n = s2.toString().split(/[\n,]/).map((x) => (x.trim() ? Number(x) : NaN)).filter(Number.isFinite);
      if (n.length) r = Math.max(0, Math.min(...n));
    } catch {} finally { fsp.rm(tmp, { force: true }).catch(() => {}); }
    inicios.set(clave, r); if (inicios.size > 200) inicios.delete(inicios.keys().next().value);
    return r;
  }
  const copiable = (info) => info.video && /^(h264|hevc|av1|vp9)$/.test(info.video.codec);

  async function video(req, res, sesion, abs, st, o) {
    const info = await informacion(abs, st);
    const copia = o.copia && copiable(info);
    const t = o.t;
    const alto = [480, 720, 1080].includes(o.alto) ? o.alto : 1080;
    const audio = Math.max(0, Math.min(o.audio || 0, info.audios.length - 1));
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (copia) args.push('-noaccurate_seek');
    if (t > 0) args.push('-ss', t.toFixed(3));
    args.push('-i', `file:${abs}`, '-map', '0:v:0?');
    if (info.audios.length) args.push('-map', `0:a:${audio}`);
    args.push('-sn', '-dn', '-map_metadata', '-1', '-map_chapters', '-1');
    if (copia) { args.push('-c:v', 'copy'); if (info.video.codec === 'hevc') args.push('-tag:v', 'hvc1'); }
    else args.push('-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-vf', `scale=-2:'min(${alto},ih)'`, '-g', '50', '-threads', '4');
    // Audio a estéreo, con el reloj del vídeo: si hay huecos o saltos en el
    // original se rellenan, para que no se descompase
    if (info.audios.length) args.push('-af', 'aresample=async=1000', '-c:a', 'aac', '-ac', '2', '-ar', '48000', '-b:a', '192k');
    args.push('-avoid_negative_ts', 'make_zero', '-max_muxing_queue_size', '4096',
      '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-frag_duration', '1000000', 'pipe:1');
    return emitir(req, res, sesion, args, 'video/mp4');
  }
  async function audio(req, res, sesion, abs, st, o) {
    const args = ['-hide_banner', '-loglevel', 'error', '-nostdin'];
    if (o.t > 0) args.push('-ss', o.t.toFixed(3));
    args.push('-i', `file:${abs}`, '-map', '0:a:0', '-vn', '-c:a', 'libmp3lame', '-q:a', '2', '-f', 'mp3', 'pipe:1');
    return emitir(req, res, sesion, args, 'audio/mpeg');
  }

  // Subtítulos a WebVTT (los de dentro del vídeo o los sueltos). Sacar los de
  // dentro obliga a leer el archivo entero: se guardan para la próxima vez.
  async function subtitulos(abs, st, { pista, externo }) {
    await listo;
    if (!hay.ffmpeg) fallo(501, 'Falta ffmpeg en el servidor');
    let entrada = abs, est = st, mapa = `0:s:${pista}`, previos = [];
    if (externo != null) {
      const ext = (await subtitulosExternos(abs)).find((x) => x.nombre === externo); if (!ext) fallo(404, 'No existe ese subtítulo');
      entrada = path.join(path.dirname(abs), ext.nombre); est = await fsp.stat(entrada); mapa = '0:s:0';
      const muestra = await leerTrozo(entrada, 0, 256 * 1024);
      if (!esUtf8(muestra)) previos = ['-sub_charenc', 'CP1252'];
    }
    const clave = claveDe(entrada, est, `s1:${mapa}`);
    const c = await leerCache('subtitulos', clave);
    if (c) return fsp.readFile(c.archivo);
    return pesada(`sub:${clave}`, async () => {
      const vtt = await ejecutar('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', ...previos, '-i', `file:${entrada}`, '-map', mapa, '-vn', '-an', '-f', 'webvtt', 'pipe:1'], { tiempo: 15 * 60000 });
      await guardarCache('subtitulos', clave, 'vtt', vtt);
      return vtt;
    });
  }

  // -------------------------------------------------------------------------
  // Extractos para las miniaturas de textos, documentos y ZIP
  // -------------------------------------------------------------------------
  async function leerTrozo(abs, ini, n) {
    const fh = await fsp.open(abs, 'r');
    try { const b = Buffer.alloc(n); const { bytesRead } = await fh.read(b, 0, n, ini); return b.subarray(0, bytesRead); } finally { await fh.close(); }
  }
  function esUtf8(b) { try { new TextDecoder('utf-8', { fatal: true }).decode(b.length > 4 ? b.subarray(0, b.length - 4) : b); return true; } catch { return false; } }
  const decodificar = (b) => (esUtf8(b) ? b.toString('utf8') : new TextDecoder('windows-1252').decode(b)).replace(/^﻿/, '');
  const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const desXml = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(parseInt(e[1] === 'x' ? e.slice(2) : e.slice(1), e[1] === 'x' ? 16 : 10)) : ENTIDADES[e] ?? m));
  const textoXml = (xml, parrafo) => desXml(xml.replace(parrafo, '\n').replace(/<[^>]+>/g, '')).replace(/\n{3,}/g, '\n\n').trim();

  function filasCsv(texto, max = 8) {
    const lineas = texto.split(/\r?\n/).filter(Boolean).slice(0, max);
    const sep = [';', '\t', ','].sort((a, b) => (lineas[0]?.split(b).length || 0) - (lineas[0]?.split(a).length || 0))[0];
    return lineas.map((l) => l.split(sep).slice(0, 6).map((x) => x.replace(/^"|"$/g, '').slice(0, 40)));
  }

  async function extracto(abs, st, completo = false) {
    const c = claseDe(abs), x = extDe(abs);
    const L = completo ? 400000 : 1200;
    if (c === 'texto') {
      const t = decodificar(await leerTrozo(abs, 0, 6000));
      if (x === 'csv' || x === 'tsv') return { tipo: 'tabla', filas: filasCsv(t) };
      return { tipo: 'texto', texto: t.slice(0, 1200) };
    }
    if (c === 'oficina' || c === 'zip') {
      const ents = await zipEntradas(abs);
      const leer = async (re) => { const e = ents.find((z) => re.test(z.nombre)); return e ? (await zipLeer(abs, e, 8 << 20)).toString('utf8') : null; };
      if (x === 'docx') return { tipo: 'texto', texto: textoXml((await leer(/^word\/document\.xml$/)) || '', /<\/w:p>/g).slice(0, L) };
      if (x === 'odt' || x === 'odp') return { tipo: 'texto', texto: textoXml((await leer(/^content\.xml$/)) || '', /<\/text:(p|h)>/g).slice(0, L) };
      if (x === 'pptx') {
        const s = ents.filter((z) => /^ppt\/slides\/slide\d+\.xml$/.test(z.nombre)).sort((a, b) => a.nombre.localeCompare(b.nombre, 'en', { numeric: true }));
        const textos = [];
        for (const [k, e] of s.slice(0, completo ? 500 : 3).entries()) textos.push((completo ? `— Diapositiva ${k + 1} —\n` : '') + textoXml((await zipLeer(abs, e, 4 << 20)).toString('utf8'), /<\/a:p>/g));
        return { tipo: 'diapositiva', texto: textos.join('\n\n').slice(0, completo ? L : 800), total: s.length };
      }
      if (x === 'xlsx') return { tipo: 'tabla', filas: hojaXlsx((await leer(/^xl\/worksheets\/sheet1\.xml$/)) || '', (await leer(/^xl\/sharedStrings\.xml$/)) || '') };
      if (x === 'ods') {
        const xml = (await leer(/^content\.xml$/)) || '';
        const filas = [...xml.matchAll(/<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g)].slice(0, 8)
          .map((f) => [...f[1].matchAll(/<table:table-cell[^>]*?(?:\/>|>([\s\S]*?)<\/table:table-cell>)/g)].slice(0, 6).map((cc) => desXml((cc[1] || '').replace(/<[^>]+>/g, '')).slice(0, 40)));
        return { tipo: 'tabla', filas };
      }
      return { tipo: 'lista', items: ents.filter((z) => !z.nombre.endsWith('/')).slice(0, 14).map((z) => z.nombre), total: ents.filter((z) => !z.nombre.endsWith('/')).length };
    }
    return null;
  }
  function hojaXlsx(hoja, compartidas) {
    const textos = [...compartidas.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => desXml(m[1].replace(/<[^>]+>/g, '')));
    return [...hoja.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)].slice(0, 8).map((f) => [...f[1].matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)].slice(0, 6).map((cc) => {
      const v = /<v>([\s\S]*?)<\/v>/.exec(cc[2] || '')?.[1] ?? /<t[^>]*>([\s\S]*?)<\/t>/.exec(cc[2] || '')?.[1] ?? '';
      return (/t="s"/.test(cc[1]) ? textos[Number(v)] ?? '' : desXml(v)).slice(0, 40);
    }));
  }

  // Lista completa de un ZIP (para verlo sin descargarlo)
  async function contenidoZip(abs) {
    const ents = await zipEntradas(abs);
    return ents.map((z) => ({ nombre: z.nombre, tam: z.tam, comprimido: z.comp, dir: z.nombre.endsWith('/') }));
  }

  // -------------------------------------------------------------------------
  // ZIP: leer el índice y una entrada (sirve para docx, xlsx, odt…)
  // -------------------------------------------------------------------------
  async function zipEntradas(abs) {
    const fh = await fsp.open(abs, 'r');
    try {
      const { size } = await fh.stat();
      const n = Math.min(size, 65557);
      const cola = Buffer.alloc(n); await fh.read(cola, 0, n, size - n);
      let p = cola.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
      if (p < 0) throw new Error('No es un ZIP');
      let total = cola.readUInt16LE(p + 10), tamCd = cola.readUInt32LE(p + 12), iniCd = cola.readUInt32LE(p + 16);
      if (iniCd === 0xffffffff || total === 0xffff) {
        const loc = cola.lastIndexOf(Buffer.from([0x50, 0x4b, 0x06, 0x07]));
        if (loc >= 0) {
          const off64 = Number(cola.readBigUInt64LE(loc + 8));
          const r = Buffer.alloc(56); await fh.read(r, 0, 56, off64);
          total = Number(r.readBigUInt64LE(32)); tamCd = Number(r.readBigUInt64LE(40)); iniCd = Number(r.readBigUInt64LE(48));
        }
      }
      tamCd = Math.min(tamCd, 16 << 20);
      const cd = Buffer.alloc(tamCd); await fh.read(cd, 0, tamCd, iniCd);
      const ents = [];
      for (let i = 0, q = 0; i < total && q + 46 <= cd.length && cd.readUInt32LE(q) === 0x02014b50; i++) {
        const flags = cd.readUInt16LE(q + 8), metodo = cd.readUInt16LE(q + 10);
        let comp = cd.readUInt32LE(q + 20), tam = cd.readUInt32LE(q + 24);
        const ln = cd.readUInt16LE(q + 28), le = cd.readUInt16LE(q + 30), lc = cd.readUInt16LE(q + 32);
        let off = cd.readUInt32LE(q + 42);
        const nombre = cd.subarray(q + 46, q + 46 + ln).toString(flags & 0x800 ? 'utf8' : 'latin1');
        // ZIP64: tamaños y posición en el campo extra
        let e = q + 46 + ln; const fe = e + le;
        while (e + 4 <= fe) {
          const id = cd.readUInt16LE(e), l = cd.readUInt16LE(e + 2);
          if (id === 1) { let k = e + 4; if (tam === 0xffffffff) { tam = Number(cd.readBigUInt64LE(k)); k += 8; } if (comp === 0xffffffff) { comp = Number(cd.readBigUInt64LE(k)); k += 8; } if (off === 0xffffffff) off = Number(cd.readBigUInt64LE(k)); }
          e += 4 + l;
        }
        ents.push({ nombre, metodo, comp, tam, off });
        q = fe + lc;
      }
      return ents;
    } finally { await fh.close(); }
  }
  async function zipLeer(abs, e, max) {
    if (e.tam > max || e.comp > max) throw new Error('Entrada demasiado grande');
    const fh = await fsp.open(abs, 'r');
    try {
      const cab = Buffer.alloc(30); await fh.read(cab, 0, 30, e.off);
      if (cab.readUInt32LE(0) !== 0x04034b50) throw new Error('ZIP dañado');
      const ini = e.off + 30 + cab.readUInt16LE(26) + cab.readUInt16LE(28);
      const datos = Buffer.alloc(e.comp); await fh.read(datos, 0, e.comp, ini);
      if (e.metodo === 0) return datos;
      if (e.metodo === 8) return zlib.inflateRawSync(datos, { maxOutputLength: max });
      throw new Error('Compresión no soportada');
    } finally { await fh.close(); }
  }

  // -------------------------------------------------------------------------
  // Miniatura de una carpeta: hasta 4 cosas con imagen de dentro
  // -------------------------------------------------------------------------
  const muestras = new Map();
  const conImagen = (n) => ['imagen', 'imagenRara', 'video', 'pdf', 'audio'].includes(claseDe(n));
  async function muestraCarpeta(abs, rel, oculto) {
    const st = await fsp.stat(abs);
    const clave = `${abs}\0${st.mtimeMs}`;
    if (muestras.has(clave)) return muestras.get(clave);
    const res = []; let directos = 0;
    const cola2 = [[abs, rel, 0]]; let vistas = 0;
    while (cola2.length && res.length < 4 && vistas < 12) {
      const [d, r, nivel] = cola2.shift(); vistas++;
      let ents; try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { continue; }
      ents = ents.filter((e) => !oculto(e.name)).sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
      if (nivel === 0) directos = ents.length;
      const prio = (n) => ({ imagen: 0, imagenRara: 1, video: 2, pdf: 3, audio: 4 }[claseDe(n)] ?? 9);
      const cand = ents.filter((e) => e.isFile() && conImagen(e.name)).sort((a, b) => prio(a.name) - prio(b.name));
      for (const e of cand) { if (res.length >= 4) break; res.push(`${r}/${e.name.normalize('NFC')}`); }
      if (nivel < 2) for (const e of ents) if (e.isDirectory()) cola2.push([path.join(d, e.name), `${r}/${e.name.normalize('NFC')}`, nivel + 1]);
    }
    const out = { rutas: res, elementos: directos };
    muestras.set(clave, out); if (muestras.size > 2000) muestras.delete(muestras.keys().next().value);
    return out;
  }

  // -------------------------------------------------------------------------
  // Miniatura EXIF (la que llevan dentro las fotos JPG)
  // -------------------------------------------------------------------------
  async function miniaturaExif(abs) {
    const b = await leerTrozo(abs, 0, 128 * 1024);
    if (b[0] !== 0xff || b[1] !== 0xd8) return null;
    let p = 2;
    while (p + 4 < b.length && b[p] === 0xff) {
      const m = b[p + 1], n = b.readUInt16BE(p + 2);
      if (m === 0xe1 && b.toString('latin1', p + 4, p + 8) === 'Exif') {
        const t = b.subarray(p + 10, p + 2 + n);
        const le = t.readUInt16BE(0) === 0x4949;
        const u16 = (o) => (le ? t.readUInt16LE(o) : t.readUInt16BE(o)), u32 = (o) => (le ? t.readUInt32LE(o) : t.readUInt32BE(o));
        const ifd0 = u32(4); if (ifd0 + 2 > t.length) return null;
        const ifd1 = u32(ifd0 + 2 + u16(ifd0) * 12); if (!ifd1 || ifd1 + 2 > t.length) return null;
        let ini = 0, lon = 0;
        for (let k = 0, c = u16(ifd1); k < c; k++) {
          const e = ifd1 + 2 + k * 12; if (e + 12 > t.length) break;
          const tag = u16(e);
          if (tag === 0x0201) ini = u32(e + 8);
          if (tag === 0x0202) lon = u32(e + 8);
        }
        if (!ini || !lon || ini + lon > t.length) return null;
        return Buffer.from(t.subarray(ini, ini + lon));
      }
      if (m === 0xda) break;
      p += 2 + n;
    }
    return null;
  }

  // -------------------------------------------------------------------------
  // La caché no crece sin fin: si pasa del límite se borra lo más antiguo
  // -------------------------------------------------------------------------
  async function podarCache() {
    const archivos = [];
    const recorrer = async (d) => {
      for (const e of await fsp.readdir(d, { withFileTypes: true }).catch(() => [])) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) await recorrer(p);
        else { try { const s = await fsp.stat(p); archivos.push([p, s.size, s.mtimeMs]); } catch {} }
      }
    };
    await recorrer(CACHE);
    let total = archivos.reduce((a, [, s]) => a + s, 0);
    if (total <= LIMITE_CACHE) return;
    archivos.sort((a, b) => a[2] - b[2]);
    for (const [p, s] of archivos) { if (total <= LIMITE_CACHE * 0.8) break; await fsp.rm(p, { force: true }).catch(() => {}); total -= s; }
  }
  setTimeout(podarCache, 60000).unref();
  setInterval(podarCache, 12 * 3600 * 1000).unref();

  return { claseDe, hay, listo, claveAntes, inicioReal, copiable, miniatura, vista, informacion, subtitulosExternos, video, audio, subtitulos, extracto, contenidoZip, muestraCarpeta, cortar };
};

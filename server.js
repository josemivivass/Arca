'use strict';

// =============================================================================
// Arca: los archivos de los discos del servidor, desde el navegador.
// Navegar, subir, descargar, mover, copiar, renombrar y borrar (a una papelera).
// Node sin dependencias. Arranque: node server.js  →  http://localhost:9995
//
// Variables de entorno:
//   PORT              puerto (9995)
//   ARCA_DISCOS       discos que se ven: "nombre=/ruta;nombre2=/ruta2"
//   ARCA_SOLO_LECTURA carpetas protegidas (se ven y se copian, pero no se tocan):
//                     "disco/carpeta;disco/otra/carpeta"
//   ARCA_DATOS        donde guarda la contraseña y las sesiones (/datos)
//   ARCA_USUARIO, ARCA_CLAVE   usuario y contraseña iniciales (solo se usan si
//                     aún no hay contraseña guardada; luego se cambia en la app)
//   ARCA_PAPELERA_DIAS días que se guarda lo borrado (30)
// =============================================================================

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { pipeline } = require('stream/promises');

const PORT = Number(process.env.PORT) || 9995;
const PUBLICO = path.join(__dirname, 'public');
const DATOS = process.env.ARCA_DATOS || path.join(__dirname, 'datos');
const DIAS_PAPELERA = Number(process.env.ARCA_PAPELERA_DIAS) || 30;
const PAPELERA = '.papelera-arca';
const SUBIENDO = '.arca-subiendo-';
// Lo que no se enseña nunca (papelera, subidas a medias y carpetas del sistema de Windows)
const OCULTOS = new Set([PAPELERA, '$RECYCLE.BIN', 'System Volume Information', '.Trash-1000', 'lost+found']);
const oculto = (n) => OCULTOS.has(n) || n.startsWith(SUBIENDO);

const normal = (s) => String(s).normalize('NFC');
const DISCOS = new Map(
  (process.env.ARCA_DISCOS || `prueba=${path.join(__dirname, 'prueba-discos')}`)
    .split(';').map((x) => x.trim()).filter(Boolean)
    .map((x) => { const i = x.indexOf('='); return [x.slice(0, i).trim(), path.resolve(x.slice(i + 1).trim())]; }),
);
const SOLO_LECTURA = (process.env.ARCA_SOLO_LECTURA || '').split(';').map((x) => normal(x.trim().replace(/^\/+|\/+$/g, '')).toLowerCase()).filter(Boolean);

// ---------------------------------------------------------------------------
// Utilidades de respuesta
// ---------------------------------------------------------------------------
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:", "media-src 'self' blob:", "frame-src 'self'", "connect-src 'self'",
  "font-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'", "frame-ancestors 'self'",
].join('; ');
const COMUNES = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

class ErrorArca extends Error { constructor(codigo, msg) { super(msg); this.codigo = codigo; } }
const fallo = (codigo, msg) => { throw new ErrorArca(codigo, msg); };

function json(res, codigo, datos, extra = {}) {
  const cuerpo = Buffer.from(JSON.stringify(datos));
  res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': cuerpo.length, 'Cache-Control': 'no-store', ...COMUNES, ...extra });
  res.end(cuerpo);
}
async function leerJson(req, max = 1 << 20) {
  let n = 0; const trozos = [];
  for await (const t of req) { n += t.length; if (n > max) fallo(413, 'Petición demasiado grande'); trozos.push(t); }
  try { return JSON.parse(Buffer.concat(trozos).toString('utf8') || '{}'); } catch { fallo(400, 'JSON no válido'); }
}

const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.heic': 'image/heic', '.woff2': 'font/woff2',
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.m4b': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg', '.flac': 'audio/flac', '.wav': 'audio/wav',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/plain; charset=utf-8', '.log': 'text/plain; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8', '.xml': 'text/plain; charset=utf-8', '.ini': 'text/plain; charset=utf-8', '.yml': 'text/plain; charset=utf-8', '.yaml': 'text/plain; charset=utf-8',
  '.zip': 'application/zip',
};
const tipoDe = (n) => TIPOS[path.extname(n).toLowerCase()] || 'application/octet-stream';

// ---------------------------------------------------------------------------
// Acceso: usuario y contraseña (scrypt), sesiones en cookie de 30 días
// ---------------------------------------------------------------------------
const ARCHIVO_ACCESO = path.join(DATOS, 'acceso.json');
const ARCHIVO_SESIONES = path.join(DATOS, 'sesiones.json');
const DURACION = 30 * 24 * 3600 * 1000;
let acceso = null;
let sesiones = new Map();

const hashClave = (clave, sal) => crypto.scryptSync(String(clave), sal, 64).toString('hex');
function cargarAcceso() {
  fs.mkdirSync(DATOS, { recursive: true });
  try { acceso = JSON.parse(fs.readFileSync(ARCHIVO_ACCESO, 'utf8')); } catch {
    const sal = crypto.randomBytes(16).toString('hex');
    acceso = { usuario: process.env.ARCA_USUARIO || 'arca', sal, hash: hashClave(process.env.ARCA_CLAVE || crypto.randomBytes(9).toString('base64url'), sal) };
    fs.writeFileSync(ARCHIVO_ACCESO, JSON.stringify(acceso), { mode: 0o600 });
    if (!process.env.ARCA_CLAVE) console.log('!! Sin ARCA_CLAVE: se ha creado una contraseña al azar. Ponla en ARCA_CLAVE y borra', ARCHIVO_ACCESO);
  }
  try { sesiones = new Map(Object.entries(JSON.parse(fs.readFileSync(ARCHIVO_SESIONES, 'utf8'))).filter(([, v]) => v > Date.now())); } catch {}
}
let tGuardar = null;
const guardarSesiones = () => { clearTimeout(tGuardar); tGuardar = setTimeout(() => fs.writeFile(ARCHIVO_SESIONES, JSON.stringify(Object.fromEntries(sesiones)), { mode: 0o600 }, () => {}), 500); };

function cookieDe(req) { return /(?:^|;\s*)arca=([A-Za-z0-9_-]{20,})/.exec(req.headers.cookie || '')?.[1]; }
function autenticado(req) {
  const t = cookieDe(req); if (!t) return false;
  const exp = sesiones.get(t);
  if (!exp || exp < Date.now()) { sesiones.delete(t); return false; }
  return true;
}
// Freno a los intentos: tras 5 fallos seguidos desde la misma IP, espera creciente
const intentos = new Map();
function frenoIntentos(ip) {
  const r = intentos.get(ip); if (!r) return 0;
  return Math.max(0, r.hasta - Date.now());
}
function apuntarFallo(ip) {
  const r = intentos.get(ip) || { n: 0, hasta: 0 }; r.n++;
  if (r.n >= 5) r.hasta = Date.now() + Math.min(15 * 60, 30 * 2 ** (r.n - 5)) * 1000;
  intentos.set(ip, r);
}
function iguales(a, b) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); }

// ---------------------------------------------------------------------------
// Rutas: «disco/carpeta/archivo» → ruta real, sin poder salirse del disco
// ---------------------------------------------------------------------------
function partes(rel) {
  const p = normal(String(rel || '')).replace(/\\/g, '/').split('/').filter(Boolean);
  if (p.some((x) => x === '.' || x === '..' || x.includes('\0'))) fallo(400, 'Ruta no válida');
  return p;
}
async function resolver(rel, { existe = true } = {}) {
  const p = partes(rel);
  if (!p.length) fallo(400, 'Falta el disco');
  const raiz = DISCOS.get(p[0]); if (!raiz) fallo(404, 'Ese disco no existe');
  if (p.slice(1).some(oculto)) fallo(404, 'No encontrado');
  const abs = path.join(raiz, ...p.slice(1));
  if (abs !== raiz && !abs.startsWith(raiz + path.sep)) fallo(400, 'Ruta no válida');
  if (existe) {
    let real;
    try { real = await fsp.realpath(abs); } catch { fallo(404, 'No encontrado'); }
    const raizReal = await fsp.realpath(raiz);
    if (real !== raizReal && !real.startsWith(raizReal + path.sep)) fallo(403, 'Fuera del disco');
  }
  return { rel: p.join('/'), disco: p[0], raiz, abs };
}
// ¿Esta ruta está protegida, o contiene algo protegido?
function protegida(rel, { contenido = true } = {}) {
  const r = normal(rel).toLowerCase();
  return SOLO_LECTURA.some((s) => r === s || r.startsWith(s + '/') || (contenido && s.startsWith(r + '/')));
}
// contenido: true para mover, renombrar o borrar (si dentro hay algo protegido,
// tampoco se puede); false para crear o subir dentro de una carpeta
function exigirEscritura(rel, que = 'cambiar', contenido = false) {
  if (protegida(rel, { contenido })) fallo(403, `Es una carpeta de solo lectura (la usa Immich): no se puede ${que}`);
}
const validarNombre = (n) => {
  n = normal(String(n || '').trim());
  if (!n || n === '.' || n === '..' || /[\/\\\0]/.test(n) || n.length > 240 || oculto(n)) fallo(400, 'Nombre no válido');
  return n;
};
// «foto.jpg» → «foto (2).jpg» si ya existe
async function libre(dir, nombre) {
  const ext = path.extname(nombre), baseN = nombre.slice(0, nombre.length - ext.length);
  for (let k = 1; ; k++) {
    const n = k === 1 ? nombre : `${baseN} (${k})${ext}`;
    try { await fsp.lstat(path.join(dir, n)); } catch { return n; }
  }
}

// ---------------------------------------------------------------------------
// Listar, buscar, espacio
// ---------------------------------------------------------------------------
async function listar(rel) {
  const { abs, rel: r } = await resolver(rel);
  const ents = await fsp.readdir(abs, { withFileTypes: true });
  const salida = [];
  await Promise.all(ents.filter((e) => !oculto(e.name)).map(async (e) => {
    try {
      const st = await fsp.stat(path.join(abs, e.name));
      salida.push({ nombre: normal(e.name), dir: st.isDirectory(), tam: st.isDirectory() ? null : st.size, mod: st.mtimeMs, protegida: protegida(`${r}/${e.name}`, { contenido: false }) });
    } catch {}
  }));
  return { ruta: r, protegida: protegida(r, { contenido: false }), entradas: salida };
}

async function buscar(rel, q, max = 300) {
  const { abs, rel: r } = await resolver(rel);
  const palabras = normal(q).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/\s+/).filter(Boolean);
  if (!palabras.length) return [];
  const res = [], cola = [[abs, r]];
  let vistas = 0;
  const t0 = Date.now();
  while (cola.length && res.length < max && vistas < 40000 && Date.now() - t0 < 8000) {
    const [d, dr] = cola.shift(); vistas++;
    let ents; try { ents = await fsp.readdir(d, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      if (oculto(e.name)) continue;
      const n = normal(e.name), er = `${dr}/${n}`;
      const plano = n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      if (palabras.every((w) => plano.includes(w))) {
        let st; try { st = await fsp.stat(path.join(d, e.name)); } catch { continue; }
        res.push({ nombre: n, ruta: er, dir: st.isDirectory(), tam: st.isDirectory() ? null : st.size, mod: st.mtimeMs, protegida: protegida(er, { contenido: false }) });
        if (res.length >= max) break;
      }
      if (e.isDirectory()) cola.push([path.join(d, e.name), er]);
    }
  }
  return res;
}

async function espacio() {
  const out = [];
  for (const [nombre, raiz] of DISCOS) {
    try { const s = await fsp.statfs(raiz); out.push({ nombre, total: s.blocks * s.bsize, libre: s.bavail * s.bsize }); }
    catch { out.push({ nombre, total: 0, libre: 0, error: 'No disponible' }); }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Miniaturas: la que llevan dentro las fotos JPG (EXIF), sin procesar nada
// ---------------------------------------------------------------------------
async function miniaturaExif(abs) {
  const fh = await fsp.open(abs, 'r');
  try {
    const buf = Buffer.alloc(128 * 1024);
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const b = buf.subarray(0, bytesRead);
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
  } finally { await fh.close(); }
}

// ---------------------------------------------------------------------------
// Enviar un archivo, con rangos (para saltar dentro de vídeos y audios)
// ---------------------------------------------------------------------------
async function enviarArchivo(req, res, abs, nombre, descargar) {
  const st = await fsp.stat(abs);
  if (st.isDirectory()) fallo(400, 'Es una carpeta');
  const cab = {
    'Content-Type': tipoDe(nombre), 'Accept-Ranges': 'bytes', 'Cache-Control': 'private, no-cache',
    'Last-Modified': new Date(st.mtimeMs).toUTCString(),
    'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(nombre)}`,
    ...COMUNES,
  };
  // Un HTML o SVG del disco no debe poder ejecutar nada dentro de Arca
  if (/\.(html?|svg|xml)$/i.test(nombre) && !descargar) { cab['Content-Type'] = 'text/plain; charset=utf-8'; cab['Content-Security-Policy'] = "default-src 'none'; sandbox"; }
  const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  let ini = 0, fin = st.size - 1, codigo = 200;
  if (rango && st.size) {
    if (rango[1] === '') { ini = Math.max(0, st.size - Number(rango[2])); }
    else { ini = Number(rango[1]); if (rango[2] !== '') fin = Math.min(fin, Number(rango[2])); }
    if (ini > fin || ini >= st.size) { res.writeHead(416, { 'Content-Range': `bytes */${st.size}`, ...COMUNES }); return res.end(); }
    codigo = 206; cab['Content-Range'] = `bytes ${ini}-${fin}/${st.size}`;
  }
  cab['Content-Length'] = st.size ? fin - ini + 1 : 0;
  res.writeHead(codigo, cab);
  if (req.method === 'HEAD' || !st.size) return res.end();
  await pipeline(fs.createReadStream(abs, { start: ini, end: fin }), res).catch(() => {});
}

// ---------------------------------------------------------------------------
// ZIP en flujo (sin comprimir, con ZIP64 para lo que pase de 4 GB): se va
// generando mientras se descarga, sin guardar nada en memoria ni en disco.
// ---------------------------------------------------------------------------
const CRC_TABLA = (() => { const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return t; })();
function crc32(c, buf) { c = ~c; for (let i = 0; i < buf.length; i++) c = CRC_TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return ~c >>> 0; }
const ZIP64_UMBRAL = Number(process.env.ARCA_ZIP64_UMBRAL) || 0xffffffff;

async function recogerArchivos(abs, relZip, lista) {
  const st = await fsp.stat(abs);
  if (st.isDirectory()) {
    lista.push({ dir: true, nombre: relZip + '/', mod: st.mtimeMs });
    for (const e of await fsp.readdir(abs, { withFileTypes: true })) {
      if (oculto(e.name)) continue;
      await recogerArchivos(path.join(abs, e.name), `${relZip}/${normal(e.name)}`, lista);
    }
  } else lista.push({ abs, nombre: relZip, tam: st.size, mod: st.mtimeMs });
}
function fechaDos(ms) {
  const d = new Date(ms);
  return { hora: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), fecha: (Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() };
}
async function enviarZip(res, entradas, nombreZip) {
  res.writeHead(200, { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(nombreZip)}`, 'Cache-Control': 'no-store', ...COMUNES });
  let desp = 0;
  const central = [];
  const escribir = (b) => new Promise((ok, mal) => { desp += b.length; if (res.write(b)) ok(); else { res.once('drain', ok); res.once('close', () => mal(new Error('cerrado'))); } });
  for (const e of entradas) {
    const nombre = Buffer.from(e.nombre, 'utf8');
    const { hora, fecha } = fechaDos(e.mod);
    const grande = !e.dir && e.tam >= ZIP64_UMBRAL;
    const inicio = desp;
    // Cabecera local: CRC y tamaños van en el descriptor de datos (bit 3)
    const ex = grande ? Buffer.alloc(20) : Buffer.alloc(0);
    if (grande) { ex.writeUInt16LE(1, 0); ex.writeUInt16LE(16, 2); }
    const loc = Buffer.alloc(30);
    loc.writeUInt32LE(0x04034b50, 0); loc.writeUInt16LE(grande ? 45 : 20, 4); loc.writeUInt16LE(0x0808, 6); loc.writeUInt16LE(0, 8);
    loc.writeUInt16LE(hora, 10); loc.writeUInt16LE(fecha, 12);
    if (grande) { loc.writeUInt32LE(0xffffffff, 18); loc.writeUInt32LE(0xffffffff, 22); }
    loc.writeUInt16LE(nombre.length, 26); loc.writeUInt16LE(ex.length, 28);
    await escribir(Buffer.concat([loc, nombre, ex]));
    let crc = 0, tam = 0;
    if (!e.dir) {
      for await (const trozo of fs.createReadStream(e.abs, { highWaterMark: 1 << 20 })) { crc = crc32(crc, trozo); tam += trozo.length; await escribir(trozo); }
    }
    const desc = Buffer.alloc(grande ? 24 : 16);
    desc.writeUInt32LE(0x08074b50, 0); desc.writeUInt32LE(crc, 4);
    if (grande) { desc.writeBigUInt64LE(BigInt(tam), 8); desc.writeBigUInt64LE(BigInt(tam), 16); } else { desc.writeUInt32LE(tam, 8); desc.writeUInt32LE(tam, 12); }
    await escribir(desc);
    central.push({ nombre, hora, fecha, crc, tam, inicio, dir: e.dir });
  }
  const iniCentral = desp;
  for (const c of central) {
    const z64 = [];
    if (c.tam >= ZIP64_UMBRAL) z64.push(c.tam, c.tam);
    if (c.inicio >= ZIP64_UMBRAL) z64.push(c.inicio);
    const ex = z64.length ? Buffer.alloc(4 + 8 * z64.length) : Buffer.alloc(0);
    if (z64.length) { ex.writeUInt16LE(1, 0); ex.writeUInt16LE(8 * z64.length, 2); z64.forEach((v, k) => ex.writeBigUInt64LE(BigInt(v), 4 + 8 * k)); }
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(0x033f, 4); cen.writeUInt16LE(z64.length ? 45 : 20, 6); cen.writeUInt16LE(0x0808, 8);
    cen.writeUInt16LE(c.hora, 12); cen.writeUInt16LE(c.fecha, 14); cen.writeUInt32LE(c.crc, 16);
    const t32 = c.tam >= ZIP64_UMBRAL ? 0xffffffff : c.tam;
    cen.writeUInt32LE(t32, 20); cen.writeUInt32LE(t32, 24);
    cen.writeUInt16LE(c.nombre.length, 28); cen.writeUInt16LE(ex.length, 30);
    cen.writeUInt32LE(c.dir ? 0x41ed0010 : 0x81a40000, 38);
    cen.writeUInt32LE(c.inicio >= ZIP64_UMBRAL ? 0xffffffff : c.inicio, 42);
    await escribir(Buffer.concat([cen, c.nombre, ex]));
  }
  const tamCentral = desp - iniCentral;
  const necesita64 = central.length >= 0xffff || iniCentral >= ZIP64_UMBRAL || tamCentral >= ZIP64_UMBRAL;
  if (necesita64) {
    const r = Buffer.alloc(56), iniR = desp;
    r.writeUInt32LE(0x06064b50, 0); r.writeBigUInt64LE(44n, 4); r.writeUInt16LE(45, 12); r.writeUInt16LE(45, 14);
    r.writeBigUInt64LE(BigInt(central.length), 24); r.writeBigUInt64LE(BigInt(central.length), 32);
    r.writeBigUInt64LE(BigInt(tamCentral), 40); r.writeBigUInt64LE(BigInt(iniCentral), 48);
    const loc = Buffer.alloc(20);
    loc.writeUInt32LE(0x07064b50, 0); loc.writeBigUInt64LE(BigInt(iniR), 8); loc.writeUInt32LE(1, 16);
    await escribir(Buffer.concat([r, loc]));
  }
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Math.min(central.length, 0xffff), 8); fin.writeUInt16LE(Math.min(central.length, 0xffff), 10);
  fin.writeUInt32LE(necesita64 ? 0xffffffff : tamCentral, 12); fin.writeUInt32LE(necesita64 ? 0xffffffff : iniCentral, 16);
  await escribir(fin);
  res.end();
}

// ---------------------------------------------------------------------------
// Tareas largas (mover y copiar): en segundo plano y con progreso
// ---------------------------------------------------------------------------
const tareas = new Map();
let colaTareas = Promise.resolve();

async function tamanoTotal(abs) {
  const st = await fsp.lstat(abs);
  if (!st.isDirectory()) return { bytes: st.size, archivos: 1 };
  let bytes = 0, archivos = 0;
  for (const e of await fsp.readdir(abs, { withFileTypes: true })) {
    const r = await tamanoTotal(path.join(abs, e.name)); bytes += r.bytes; archivos += r.archivos;
  }
  return { bytes, archivos };
}
async function copiarRec(origen, destino, t) {
  const st = await fsp.lstat(origen);
  if (st.isDirectory()) {
    await fsp.mkdir(destino);
    for (const e of await fsp.readdir(origen, { withFileTypes: true })) await copiarRec(path.join(origen, e.name), path.join(destino, e.name), t);
    await fsp.utimes(destino, st.atime, st.mtime).catch(() => {});
    return;
  }
  t.actual = normal(path.basename(origen));
  const lector = fs.createReadStream(origen, { highWaterMark: 1 << 20 });
  lector.on('data', (b) => { t.hechos += b.length; });
  await pipeline(lector, fs.createWriteStream(destino, { flags: 'wx' }));
  await fsp.utimes(destino, st.atime, st.mtime).catch(() => {});
}

function nuevaTarea(tipo, fn, descripcion) {
  const t = { id: crypto.randomUUID(), tipo, descripcion, estado: 'esperando', total: 0, hechos: 0, actual: '', error: null, inicio: Date.now(), fin: null };
  tareas.set(t.id, t);
  colaTareas = colaTareas.then(async () => {
    t.estado = 'en marcha';
    try { await fn(t); t.estado = 'hecho'; } catch (e) { t.estado = 'error'; t.error = e.message; }
    t.fin = Date.now(); t.hechos = Math.max(t.hechos, t.total);
  });
  return t;
}
setInterval(() => { for (const [id, t] of tareas) if (t.fin && Date.now() - t.fin > 10 * 60 * 1000) tareas.delete(id); }, 60 * 1000).unref();

// Mover o copiar varias rutas a una carpeta. Si ya existe un nombre, «(2)».
async function moverCopiar(rutas, destinoRel, copiar) {
  const destino = await resolver(destinoRel);
  if (!(await fsp.stat(destino.abs)).isDirectory()) fallo(400, 'El destino no es una carpeta');
  exigirEscritura(destino.rel, copiar ? 'copiar ahí' : 'mover ahí');
  const origenes = [];
  for (const r of rutas) {
    const o = await resolver(r);
    if (o.rel.split('/').length < 2) fallo(400, 'No se puede mover un disco entero');
    if (!copiar) exigirEscritura(o.rel, 'mover', true);
    if ((destino.rel + '/').startsWith(o.rel + '/')) fallo(400, 'No se puede meter una carpeta dentro de sí misma');
    origenes.push(o);
  }
  const nombres = origenes.map((o) => path.basename(o.abs));
  const desc = `${copiar ? 'Copiar' : 'Mover'} ${nombres.length === 1 ? `«${normal(nombres[0])}»` : `${nombres.length} elementos`} a «${destino.rel}»`;
  return nuevaTarea(copiar ? 'copiar' : 'mover', async (t) => {
    for (const o of origenes) { const s = await tamanoTotal(o.abs); t.total += s.bytes; }
    for (const o of origenes) {
      if (path.dirname(o.abs) === destino.abs && !copiar) continue; // ya estaba ahí
      const nombre = await libre(destino.abs, path.basename(o.abs));
      const dst = path.join(destino.abs, nombre);
      if (!copiar && o.disco === destino.disco) {
        await fsp.rename(o.abs, dst); // mismo disco: instantáneo
        t.hechos += (await tamanoTotal(dst)).bytes;
        continue;
      }
      try { await copiarRec(o.abs, dst, t); }
      catch (e) { await fsp.rm(dst, { recursive: true, force: true }).catch(() => {}); throw e; }
      if (!copiar) await fsp.rm(o.abs, { recursive: true, force: true });
    }
  }, desc);
}

// ---------------------------------------------------------------------------
// Papelera: una por disco, en <disco>/.papelera-arca/<id>/<nombre> + info.json
// ---------------------------------------------------------------------------
async function aPapelera(rutas) {
  const hechos = [];
  for (const r of rutas) {
    const o = await resolver(r);
    if (o.rel.split('/').length < 2) fallo(400, 'No se puede borrar un disco');
    exigirEscritura(o.rel, 'borrar', true);
    const id = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const caja = path.join(o.raiz, PAPELERA, id);
    await fsp.mkdir(caja, { recursive: true });
    const st = await fsp.lstat(o.abs);
    await fsp.rename(o.abs, path.join(caja, path.basename(o.abs)));
    await fsp.writeFile(path.join(caja, 'info.json'), JSON.stringify({ ruta: o.rel, fecha: Date.now(), dir: st.isDirectory() }));
    hechos.push(o.rel);
  }
  return hechos;
}
async function listarPapelera(disco) {
  const raiz = DISCOS.get(disco); if (!raiz) fallo(404, 'Ese disco no existe');
  const dir = path.join(raiz, PAPELERA);
  let ids; try { ids = await fsp.readdir(dir); } catch { return []; }
  const out = [];
  for (const id of ids) {
    try {
      const info = JSON.parse(await fsp.readFile(path.join(dir, id, 'info.json'), 'utf8'));
      const nombre = (await fsp.readdir(path.join(dir, id))).find((n) => n !== 'info.json');
      const st = nombre ? await fsp.lstat(path.join(dir, id, nombre)) : null;
      out.push({ id, nombre: normal(nombre || ''), ruta: info.ruta, fecha: info.fecha, dir: info.dir, tam: st && !st.isDirectory() ? st.size : null, caduca: info.fecha + DIAS_PAPELERA * 86400000 });
    } catch {}
  }
  return out.sort((a, b) => b.fecha - a.fecha);
}
const idValido = (id) => /^\d+-[0-9a-f]{8}$/.test(id) || fallo(400, 'Elemento no válido');
async function restaurar(disco, ids) {
  const raiz = DISCOS.get(disco); if (!raiz) fallo(404, 'Ese disco no existe');
  const hechos = [];
  for (const id of ids) {
    idValido(id);
    const caja = path.join(raiz, PAPELERA, id);
    const info = JSON.parse(await fsp.readFile(path.join(caja, 'info.json'), 'utf8'));
    const nombre = (await fsp.readdir(caja)).find((n) => n !== 'info.json');
    const destinoRel = partes(info.ruta);
    const carpeta = path.join(raiz, ...destinoRel.slice(1, -1));
    await fsp.mkdir(carpeta, { recursive: true });
    const final = await libre(carpeta, nombre);
    await fsp.rename(path.join(caja, nombre), path.join(carpeta, final));
    await fsp.rm(caja, { recursive: true, force: true });
    hechos.push([...destinoRel.slice(0, -1), final].join('/'));
  }
  return hechos;
}
async function vaciar(disco, ids = null) {
  const raiz = DISCOS.get(disco); if (!raiz) fallo(404, 'Ese disco no existe');
  const dir = path.join(raiz, PAPELERA);
  let lista; try { lista = await fsp.readdir(dir); } catch { return 0; }
  if (ids) { ids.forEach(idValido); lista = lista.filter((x) => ids.includes(x)); }
  for (const id of lista) await fsp.rm(path.join(dir, id), { recursive: true, force: true });
  return lista.length;
}
async function purgarPapeleras() {
  for (const disco of DISCOS.keys()) {
    try {
      const viejos = (await listarPapelera(disco)).filter((x) => x.caduca < Date.now()).map((x) => x.id);
      if (viejos.length) { await vaciar(disco, viejos); console.log(`papelera de ${disco}: ${viejos.length} elemento(s) caducado(s) eliminado(s)`); }
    } catch {}
  }
}

// ---------------------------------------------------------------------------
// Subidas: el cuerpo de la petición va directo al disco (PUT, en flujo)
// ---------------------------------------------------------------------------
async function subir(req, url) {
  const carpeta = await resolver(url.searchParams.get('carpeta'));
  const sub = partes(url.searchParams.get('subcarpeta') || '').map(validarNombre);
  const nombre = validarNombre(url.searchParams.get('nombre'));
  exigirEscritura(carpeta.rel + (sub.length ? '/' + sub.join('/') : ''), 'subir ahí');
  const dir = path.join(carpeta.abs, ...sub);
  await fsp.mkdir(dir, { recursive: true });
  const lon = Number(req.headers['content-length'] || 0);
  if (lon) { const s = await fsp.statfs(dir); if (s.bavail * s.bsize < lon + 64 * 1024 * 1024) fallo(507, 'No queda espacio en ese disco'); }
  const temporal = path.join(dir, `${SUBIENDO}${crypto.randomBytes(6).toString('hex')}`);
  try {
    await pipeline(req, fs.createWriteStream(temporal, { flags: 'wx' }));
    if (lon && (await fsp.stat(temporal)).size !== lon) fallo(400, 'La subida llegó incompleta');
    const final = await libre(dir, nombre);
    await fsp.rename(temporal, path.join(dir, final));
    return [carpeta.rel, ...sub, final].join('/');
  } catch (e) { await fsp.rm(temporal, { force: true }).catch(() => {}); throw e; }
}
// Restos de subidas cortadas (más de un día)
async function limpiarSubidas(dir, nivel = 0) {
  if (nivel > 6) return;
  let ents; try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.name.startsWith(SUBIENDO)) { try { if (Date.now() - (await fsp.stat(p)).mtimeMs > 86400000) await fsp.rm(p, { force: true }); } catch {} }
  }
}

// ---------------------------------------------------------------------------
// Archivos de la interfaz (comprimidos en memoria la primera vez)
// ---------------------------------------------------------------------------
const cacheGz = new Map();
async function estatico(req, res, rel) {
  if (rel === '/') rel = '/index.html';
  const abs = path.normalize(path.join(PUBLICO, rel));
  if (!abs.startsWith(PUBLICO + path.sep)) fallo(404, 'No encontrado');
  let st; try { st = await fsp.stat(abs); } catch { fallo(404, 'No encontrado'); }
  if (!st.isFile()) fallo(404, 'No encontrado');
  const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
  const inmutable = /^\/(fuentes|iconos)\//.test(rel);
  const cab = { 'Content-Type': tipoDe(abs), ETag: etag, 'Cache-Control': inmutable ? 'public, max-age=31536000, immutable' : 'no-cache', ...COMUNES };
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, cab); return res.end(); }
  if (/\.(html|css|js|json|webmanifest|svg)$/.test(abs) && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    let c = cacheGz.get(abs);
    if (!c || c.etag !== etag) { c = { etag, gz: zlib.gzipSync(await fsp.readFile(abs), { level: 9 }) }; cacheGz.set(abs, c); }
    res.writeHead(200, { ...cab, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': c.gz.length });
    return res.end(req.method === 'HEAD' ? undefined : c.gz);
  }
  res.writeHead(200, { ...cab, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(abs).pipe(res);
}

// ---------------------------------------------------------------------------
// Rutas de la API
// ---------------------------------------------------------------------------
async function api(req, res, url) {
  const ruta = url.pathname, m = req.method;
  const ip = req.socket.remoteAddress;

  if (ruta === '/api/entrar' && m === 'POST') {
    const espera = frenoIntentos(ip);
    if (espera) fallo(429, `Demasiados intentos. Espera ${Math.ceil(espera / 1000)} s`);
    const { usuario, clave } = await leerJson(req);
    const ok = iguales(String(usuario || ''), acceso.usuario) && iguales(hashClave(clave || '', acceso.sal), acceso.hash);
    if (!ok) { apuntarFallo(ip); fallo(401, 'Usuario o contraseña incorrectos'); }
    intentos.delete(ip);
    const token = crypto.randomBytes(32).toString('base64url');
    sesiones.set(token, Date.now() + DURACION); guardarSesiones();
    return json(res, 200, { ok: true, usuario: acceso.usuario }, { 'Set-Cookie': `arca=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${DURACION / 1000}` });
  }
  if (!autenticado(req)) fallo(401, 'Hay que entrar');
  // Todo lo que cambia algo exige esta cabecera: otra web no puede enviarla
  if (m !== 'GET' && m !== 'HEAD' && req.headers['x-arca'] !== '1') fallo(403, 'Petición no permitida');

  if (ruta === '/api/salir' && m === 'POST') { sesiones.delete(cookieDe(req)); guardarSesiones(); return json(res, 200, { ok: true }, { 'Set-Cookie': 'arca=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); }
  if (ruta === '/api/yo') return json(res, 200, { usuario: acceso.usuario, discos: [...DISCOS.keys()], diasPapelera: DIAS_PAPELERA });
  if (ruta === '/api/clave' && m === 'POST') {
    const { actual, nueva } = await leerJson(req);
    if (!iguales(hashClave(actual || '', acceso.sal), acceso.hash)) fallo(403, 'La contraseña actual no es correcta');
    if (String(nueva || '').length < 4) fallo(400, 'La nueva contraseña es demasiado corta');
    const sal = crypto.randomBytes(16).toString('hex');
    acceso = { ...acceso, sal, hash: hashClave(nueva, sal) };
    await fsp.writeFile(ARCHIVO_ACCESO, JSON.stringify(acceso), { mode: 0o600 });
    const yo = cookieDe(req); sesiones = new Map([...sesiones].filter(([t]) => t === yo)); guardarSesiones(); // cierra las demás sesiones
    return json(res, 200, { ok: true });
  }
  if (ruta === '/api/espacio') return json(res, 200, await espacio());
  if (ruta === '/api/lista') return json(res, 200, await listar(url.searchParams.get('ruta')));
  if (ruta === '/api/buscar') return json(res, 200, await buscar(url.searchParams.get('ruta'), url.searchParams.get('q') || ''));
  if (ruta === '/api/archivo') { const o = await resolver(url.searchParams.get('ruta')); return enviarArchivo(req, res, o.abs, path.basename(o.abs), url.searchParams.get('descargar') === '1'); }
  if (ruta === '/api/miniatura') {
    const o = await resolver(url.searchParams.get('ruta'));
    const mini = /\.jpe?g$/i.test(o.abs) ? await miniaturaExif(o.abs).catch(() => null) : null;
    if (!mini) { res.writeHead(204, COMUNES); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': mini.length, 'Cache-Control': 'private, max-age=86400', ...COMUNES });
    return res.end(mini);
  }
  if (ruta === '/api/zip') {
    const rutas = JSON.parse(url.searchParams.get('rutas') || '[]');
    if (!Array.isArray(rutas) || !rutas.length) fallo(400, 'Nada que descargar');
    const lista = [];
    for (const r of rutas) { const o = await resolver(r); await recogerArchivos(o.abs, normal(path.basename(o.abs)), lista); }
    const nombre = rutas.length === 1 ? `${normal(path.basename(partes(rutas[0]).at(-1)))}.zip` : 'arca.zip';
    return enviarZip(res, lista, nombre);
  }
  if (ruta === '/api/subir' && m === 'PUT') return json(res, 200, { ruta: await subir(req, url) });
  if (ruta === '/api/carpeta' && m === 'POST') {
    const { ruta: r, nombre } = await leerJson(req);
    const o = await resolver(r); exigirEscritura(o.rel, 'crear carpetas ahí');
    const n = validarNombre(nombre);
    try { await fsp.mkdir(path.join(o.abs, n)); } catch (e) { if (e.code === 'EEXIST') fallo(409, 'Ya hay algo con ese nombre'); throw e; }
    return json(res, 200, { ruta: `${o.rel}/${n}` });
  }
  if (ruta === '/api/renombrar' && m === 'POST') {
    const { ruta: r, nombre } = await leerJson(req);
    const o = await resolver(r);
    if (o.rel.split('/').length < 2) fallo(400, 'No se puede renombrar un disco');
    exigirEscritura(o.rel, 'renombrar', true);
    const n = validarNombre(nombre), dst = path.join(path.dirname(o.abs), n);
    if (dst !== o.abs) {
      let existe = false; try { await fsp.lstat(dst); existe = true; } catch {}
      if (existe && dst.toLowerCase() !== o.abs.toLowerCase()) fallo(409, 'Ya hay algo con ese nombre');
      await fsp.rename(o.abs, dst);
    }
    return json(res, 200, { ruta: [...o.rel.split('/').slice(0, -1), n].join('/') });
  }
  if ((ruta === '/api/mover' || ruta === '/api/copiar') && m === 'POST') {
    const { rutas, destino } = await leerJson(req);
    if (!Array.isArray(rutas) || !rutas.length) fallo(400, 'No hay nada elegido');
    const t = await moverCopiar(rutas, destino, ruta === '/api/copiar');
    return json(res, 200, t);
  }
  if (ruta === '/api/tareas') return json(res, 200, [...tareas.values()]);
  if (ruta === '/api/borrar' && m === 'POST') { const { rutas } = await leerJson(req); return json(res, 200, { borrados: await aPapelera(rutas || []) }); }
  if (ruta === '/api/papelera') return json(res, 200, await listarPapelera(url.searchParams.get('disco')));
  if (ruta === '/api/restaurar' && m === 'POST') { const { disco, ids } = await leerJson(req); return json(res, 200, { restaurados: await restaurar(disco, ids || []) }); }
  if (ruta === '/api/vaciar' && m === 'POST') { const { disco, ids } = await leerJson(req); return json(res, 200, { eliminados: await vaciar(disco, ids || null) }); }
  fallo(404, 'No existe');
}

// ---------------------------------------------------------------------------
cargarAcceso();
const servidor = http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url, 'http://arca'); } catch { return json(res, 400, { error: 'Ruta no válida' }); }
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') fallo(405, 'Método no permitido');
    return await estatico(req, res, decodeURIComponent(url.pathname));
  } catch (e) {
    if (res.headersSent) return res.destroy();
    const codigo = e instanceof ErrorArca ? e.codigo : e.code === 'ENOENT' ? 404 : e.code === 'EACCES' || e.code === 'EPERM' ? 403 : e.code === 'ENOSPC' ? 507 : 500;
    const mensaje = e instanceof ErrorArca ? e.message : codigo === 404 ? 'No encontrado' : codigo === 403 ? 'Sin permiso en el disco' : codigo === 507 ? 'No queda espacio en el disco' : 'Error en el servidor';
    if (codigo === 500) console.error(e);
    json(res, codigo, { error: mensaje });
  }
});
servidor.requestTimeout = 0;      // las subidas grandes pueden tardar horas
servidor.headersTimeout = 60000;
servidor.keepAliveTimeout = 5000;
servidor.listen(PORT, '0.0.0.0', () => {
  console.log(`Arca en http://localhost:${PORT} · discos: ${[...DISCOS].map(([n, r]) => `${n}=${r}`).join(', ')}`);
  purgarPapeleras();
  for (const r of DISCOS.values()) limpiarSubidas(r);
});
setInterval(purgarPapeleras, 6 * 3600 * 1000).unref();
for (const s of ['SIGTERM', 'SIGINT']) process.on(s, () => servidor.close(() => process.exit(0)));

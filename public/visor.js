// Visor: abre cualquier archivo dentro de Arca, sin descargarlo.
//   Fotos (también HEIC, TIFF, SVG…), vídeo y audio (películas enteras, con
//   pistas de audio y subtítulos), PDF, textos y código, Markdown, hojas de
//   cálculo, Word, presentaciones y ZIP. Lo que no se puede abrir enseña su
//   información y el botón de descargar.

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const enc = encodeURIComponent;
const ext = (n) => (n.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
const archivo = (r, extra = '') => `/api/archivo?ruta=${enc(r)}${extra}`;
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const IC = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>',
  pausa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>',
  volumen: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>'),
  mudo: svg('<path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="m16 9.5 5 5M21 9.5l-5 5"/>'),
  completa: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  salirCompleta: svg('<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>'),
  subtitulos: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 12.5h3M12.5 12.5H17M7 15.5h6M15 15.5h2"/>'),
  ajustes: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  atras10: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4.5v4h4"/><text x="12" y="15.2" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-weight="600">10</text>'),
  adelante10: svg('<path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4.5v4h-4"/><text x="12" y="15.2" font-size="7" text-anchor="middle" fill="currentColor" stroke="none" font-family="sans-serif" font-weight="600">10</text>'),
  mas: svg('<path d="M12 5v14M5 12h14"/>'), menos: svg('<path d="M5 12h14"/>'),
  ajustar: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
};

function tiempo(s) {
  if (!Number.isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
function tamano(b) {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
  return `${b.toLocaleString('es-ES', { maximumFractionDigits: b < 10 ? 1 : 0 })} ${u[i]}`;
}
const IDIOMAS = { spa: 'Español', es: 'Español', esp: 'Español', eng: 'Inglés', en: 'Inglés', fre: 'Francés', fra: 'Francés', fr: 'Francés', ger: 'Alemán', deu: 'Alemán', de: 'Alemán', ita: 'Italiano', it: 'Italiano', por: 'Portugués', pt: 'Portugués', jpn: 'Japonés', ja: 'Japonés', cat: 'Catalán', ca: 'Catalán', glg: 'Gallego', baq: 'Euskera', eus: 'Euskera', kor: 'Coreano', chi: 'Chino', zho: 'Chino', rus: 'Ruso', und: '' };
const idioma = (c) => IDIOMAS[(c || '').toLowerCase()] ?? (c || '');
const esEspanol = (c) => /^(spa|es|esp|es-.*|spanish|español|castellano|lat|es_.*)$/i.test(c || '');

// Qué es cada archivo para el visor
const TIPOS_VISOR = {
  imagen: 'jpg jpeg png gif webp avif bmp ico jfif',
  imagenServidor: 'heic heif tif tiff svg jxl psd dng cr2 cr3 nef arw orf rw2 raf',
  video: 'mp4 m4v webm mov mkv avi wmv mpg mpeg ts m2ts mts 3gp flv ogv vob divx asf',
  audio: 'mp3 m4a m4b aac ogg oga opus flac wav wma aiff aif ac3 eac3 dts ape mka amr',
  pdf: 'pdf',
  markdown: 'md markdown',
  tabla: 'csv tsv xlsx xls xlsm ods',
  word: 'docx',
  documento: 'odt pptx odp',
  zip: 'zip',
  texto: 'txt log json xml ini cfg conf yml yaml toml srt vtt ass sh bat ps1 js mjs ts py java c h cpp cs go rs php rb sql html htm css scss env gitignore dockerfile properties nfo cue m3u m3u8 plist',
};
const TIPO_DE = new Map();
for (const [t, l] of Object.entries(TIPOS_VISOR)) for (const e of l.split(' ')) TIPO_DE.set(e, t);
export const tipoVisor = (nombre) => TIPO_DE.get(ext(nombre)) || 'otro';

// ---------------------------------------------------------------------------
// El visor
// ---------------------------------------------------------------------------
export function abrirVisor(ents, k, { rutaDe, icono, aviso }) {
  const lista = ents.map((e, i) => [e, i]).filter(([e]) => !e.dir);
  let pos = lista.findIndex(([, i]) => i === k);
  const capa = document.createElement('div');
  capa.className = 'previa';
  capa.setAttribute('role', 'dialog'); capa.setAttribute('aria-modal', 'true');
  document.body.appendChild(capa);
  document.documentElement.classList.add('con-visor');
  let limpiar = null;
  const cerrar = () => { limpiar?.(); capa.remove(); removeEventListener('keydown', tecla, true); document.documentElement.classList.remove('con-visor'); if (history.state?.visor) history.back(); };
  // El botón «atrás» del móvil cierra el visor en vez de salir de la carpeta
  history.pushState({ visor: true }, '');
  const alVolver = () => { removeEventListener('popstate', alVolver); if (capa.isConnected) { limpiar?.(); capa.remove(); removeEventListener('keydown', tecla, true); document.documentElement.classList.remove('con-visor'); } };
  addEventListener('popstate', alVolver);

  const tecla = (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'Escape') { if (document.fullscreenElement) return; e.preventDefault(); cerrar(); return; }
    if (capa.querySelector('.reproductor') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return; // el reproductor salta 10 s
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); mover(1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); mover(-1); }
  };
  addEventListener('keydown', tecla, true);
  const mover = (p) => { const n = pos + p; if (n >= 0 && n < lista.length) { pos = n; pintar(); } };

  function pintar() {
    limpiar?.(); limpiar = null;
    const [e] = lista[pos], r = rutaDe(e), t = tipoVisor(e.nombre);
    capa.innerHTML = `<header><b title="${esc(e.nombre)}">${esc(e.nombre)}</b><small>${tamano(e.tam)}${lista.length > 1 ? ` · ${pos + 1} de ${lista.length}` : ''}</small>
      <a class="btn pequeno" href="${esc(archivo(r, '&descargar=1'))}" download>${svg('<path d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>')}<span class="txt">Descargar</span></a>
      <button type="button" class="btn-icono" data-p="cerrar" aria-label="Cerrar" title="Cerrar (Esc)">${svg('<path d="M6 6l12 12M18 6 6 18"/>')}</button></header>
      <div class="escena" data-tipo="${t}"></div>`;
    const escena = $('.escena', capa);
    const ctx = { e, r, escena, aviso, icono, alCerrar: (f) => { limpiar = f; } };
    const abrir = { imagen: verImagen, imagenServidor: verImagen, video: (c) => reproductor(c, 'video'), audio: (c) => reproductor(c, 'audio'), pdf: verPdf, markdown: verMarkdown, tabla: verTabla, word: verWord, documento: verDocumento, zip: verZip, texto: verTexto }[t] || verOtro;
    Promise.resolve(abrir(ctx)).catch((err) => { escena.innerHTML = sinVista(e, icono, `No se pudo abrir: ${err.message}`); });
    if (pos > 0) escena.insertAdjacentHTML('beforeend', `<button type="button" class="paso ant" data-p="-1" aria-label="Anterior">${svg('<path d="m15 18-6-6 6-6"/>')}</button>`);
    if (pos < lista.length - 1) escena.insertAdjacentHTML('beforeend', `<button type="button" class="paso sig" data-p="1" aria-label="Siguiente">${svg('<path d="m9 18 6-6-6-6"/>')}</button>`);
  }
  capa.addEventListener('click', (ev) => {
    const p = ev.target.closest('[data-p]')?.dataset.p;
    if (p === 'cerrar') cerrar(); else if (p) mover(Number(p));
    else if (ev.target.classList.contains('escena') && !ev.target.querySelector('.reproductor, .documento, .pdf, .tabla-hoja, .texto-visor, .zip-visor')) cerrar();
  });
  // Deslizar con el dedo a los lados: siguiente / anterior (en fotos)
  let x0 = null;
  capa.addEventListener('touchstart', (ev) => { x0 = ev.touches.length === 1 && capa.querySelector('.escena[data-tipo^=imagen]') && !capa.querySelector('.imagen-visor.zoom') ? ev.touches[0].clientX : null; }, { passive: true });
  capa.addEventListener('touchend', (ev) => { if (x0 == null) return; const dx = ev.changedTouches[0].clientX - x0; if (Math.abs(dx) > 60) mover(dx < 0 ? 1 : -1); x0 = null; });
  pintar();
}

function sinVista(e, icono, texto = 'Este tipo de archivo no se puede ver aquí.') {
  return `<div class="sin-previa">${icono(e)}<p>${esc(texto)}</p><p class="detalle">${esc(e.nombre)} · ${tamano(e.tam)}</p></div>`;
}

// ---------------------------------------------------------------------------
// Fotos: ajustadas a la pantalla; doble clic o doble toque para verlas a
// tamaño real y moverse por ellas
// ---------------------------------------------------------------------------
function verImagen({ e, r, escena }) {
  const nativa = tipoVisor(e.nombre) === 'imagen' && e.tam < 40 * 1024 * 1024;
  const src = nativa ? archivo(r) : `/api/vista?ruta=${enc(r)}&v=${Math.floor(e.mod)}-${e.tam}`;
  escena.innerHTML = `<div class="imagen-visor"><img alt="${esc(e.nombre)}" src="${esc(src)}" draggable="false"></div><div class="cargando-visor"><span class="girando"></span></div>`;
  const caja = $('.imagen-visor', escena), img = $('img', caja);
  img.addEventListener('load', () => { $('.cargando-visor', escena)?.remove(); img.title = `${img.naturalWidth} × ${img.naturalHeight}`; });
  img.addEventListener('error', () => { $('.cargando-visor', escena)?.remove(); if (nativa && !img.dataset.otra) { img.dataset.otra = '1'; img.src = `/api/vista?ruta=${enc(r)}&v=${Math.floor(e.mod)}-${e.tam}`; } else caja.innerHTML = '<p class="sin-previa">No se pudo abrir esta imagen.</p>'; });
  const alternar = (ev) => {
    const zoom = caja.classList.toggle('zoom');
    if (zoom) {
      const rx = (ev.clientX - img.getBoundingClientRect().left) / img.getBoundingClientRect().width;
      const ry = (ev.clientY - img.getBoundingClientRect().top) / img.getBoundingClientRect().height;
      requestAnimationFrame(() => { caja.scrollLeft = rx * caja.scrollWidth - caja.clientWidth / 2; caja.scrollTop = ry * caja.scrollHeight - caja.clientHeight / 2; });
    }
  };
  img.addEventListener('dblclick', alternar);
  let ultimo = 0;
  img.addEventListener('touchend', (ev) => { const ahora = Date.now(); if (ahora - ultimo < 300) { ev.preventDefault(); alternar(ev.changedTouches[0]); } ultimo = ahora; });
}

// ---------------------------------------------------------------------------
// Vídeo y audio. Primero se intenta reproducir el archivo tal cual (con
// saltos al instante aunque pese 15 GB); si el navegador no entiende su
// formato (MKV con HEVC, audio AC3/DTS, AVI…), el servidor lo convierte en
// directo («modo compatible»), y se puede saltar a cualquier punto igual.
// ---------------------------------------------------------------------------
const soporta = (() => {
  const v = document.createElement('video'), a = document.createElement('audio');
  const ms = (t) => { try { return !!window.MediaSource?.isTypeSupported?.(t); } catch { return false; } };
  const cp = (el, t) => el.canPlayType(t) !== '';
  return {
    webm: cp(v, 'video/webm; codecs="vp9"'),
    hevc: ms('video/mp4; codecs="hvc1.1.6.L120.90"') || cp(v, 'video/mp4; codecs="hvc1.1.6.L120.90"'),
    av1: ms('video/mp4; codecs="av01.0.05M.08"') || cp(v, 'video/mp4; codecs="av01.0.05M.08"'),
    ac3: ms('audio/mp4; codecs="ac-3"') || cp(a, 'audio/mp4; codecs="ac-3"'),
    eac3: ms('audio/mp4; codecs="ec-3"') || cp(a, 'audio/mp4; codecs="ec-3"'),
    flac: cp(a, 'audio/flac'), ogg: cp(a, 'audio/ogg; codecs="vorbis"'), opus: cp(a, 'audio/ogg; codecs="opus"'),
    wav: cp(a, 'audio/wav'), aac: cp(a, 'audio/mp4; codecs="mp4a.40.2"'), mp3: cp(a, 'audio/mpeg'),
  };
})();
function videoDirecto(info) {
  if (!info.video) return true;
  const v = info.video;
  const diez = /10|12/.test(v.pix || '') || /High 10|4:2:2|4:4:4/.test(v.perfil || '');
  const ok = { h264: !diez, vp8: true, vp9: soporta.webm, av1: soporta.av1, hevc: soporta.hevc, mpeg4: false }[v.codec];
  return !!ok;
}
function audioDirecto(codec) {
  return !!({ aac: soporta.aac, mp3: soporta.mp3, opus: soporta.opus, vorbis: soporta.ogg, flac: soporta.flac, ac3: soporta.ac3, eac3: soporta.eac3, pcm_s16le: soporta.wav, pcm_s24le: soporta.wav, pcm_u8: soporta.wav, pcm_f32le: soporta.wav, alac: false }[codec]);
}
function contenedorDirecto(info, nombre) {
  const f = info.formato || '';
  if (/mp4|mov/.test(f)) return true;
  if (/matroska|webm/.test(f)) return soporta.webm;
  if (/^(mp3|flac|wav|ogg|aac)$/.test(f) || /^(mp3|flac|wav|ogg|oga|opus|aac|m4a|m4b)$/.test(ext(nombre))) return true;
  return false;
}

const POSICIONES = 'arca.posiciones';
function leerPosiciones() { try { return JSON.parse(localStorage.getItem(POSICIONES) || '{}'); } catch { return {}; } }
function guardarPosicion(r, t, dur) {
  try {
    const p = leerPosiciones();
    if (t > 60 && dur && t < dur - 90) p[r] = { t: Math.floor(t), f: Date.now() }; else delete p[r];
    const claves = Object.keys(p).sort((a, b) => p[b].f - p[a].f).slice(0, 200);
    localStorage.setItem(POSICIONES, JSON.stringify(Object.fromEntries(claves.map((k) => [k, p[k]]))));
  } catch {}
}

async function reproductor({ e, r, escena, aviso, alCerrar }, tipo) {
  escena.innerHTML = `<div class="reproductor ${tipo}" tabindex="-1">
    ${tipo === 'audio' ? `<div class="portada-audio"><img alt="" src="/api/miniatura?ruta=${enc(r)}&v=${Math.floor(e.mod)}-${e.tam}"><div class="datos-audio"><b>${esc(e.nombre.replace(/\.[^.]+$/, ''))}</b><span></span></div></div>` : ''}
    <div class="lienzo"><div class="subtitulo-visor" aria-live="off"></div><div class="estado-medio"><span class="girando"></span><span class="txt">Cargando…</span></div>
      <button type="button" class="play-grande" data-c="play" aria-label="Reproducir">${IC.play}</button></div>
    <div class="controles">
      <input type="range" class="barra-tiempo" min="0" max="1000" value="0" step="1" aria-label="Posición">
      <div class="fila-controles">
        <button type="button" class="ctl" data-c="play" aria-label="Reproducir">${IC.play}</button>
        <button type="button" class="ctl solo-ancho" data-c="-10" aria-label="Atrás 10 segundos">${IC.atras10}</button>
        <button type="button" class="ctl solo-ancho" data-c="+10" aria-label="Adelante 10 segundos">${IC.adelante10}</button>
        <span class="tiempo-medio">0:00 / 0:00</span><span class="hueco"></span>
        <button type="button" class="ctl" data-c="mudo" aria-label="Silenciar">${IC.volumen}</button>
        <input type="range" class="barra-volumen" min="0" max="1" step="0.05" value="1" aria-label="Volumen">
        <button type="button" class="ctl" data-c="subs" aria-label="Subtítulos" hidden>${IC.subtitulos}</button>
        <button type="button" class="ctl" data-c="ajustes" aria-label="Audio y calidad">${IC.ajustes}</button>
        ${tipo === 'video' ? `<button type="button" class="ctl" data-c="completa" aria-label="Pantalla completa">${IC.completa}</button>` : ''}
      </div>
    </div>
    <div class="menu-medio" hidden></div>
  </div>`;
  const caja = $('.reproductor', escena), lienzo = $('.lienzo', caja), barra = $('.barra-tiempo', caja), etiqueta = $('.tiempo-medio', caja);
  const estadoEl = $('.estado-medio', caja), menu = $('.menu-medio', caja), subEl = $('.subtitulo-visor', caja);
  const el = document.createElement(tipo);
  el.playsInline = true; el.preload = 'metadata';
  lienzo.prepend(el);
  if (tipo === 'audio') { const img = $('.portada-audio img', caja); img.addEventListener('error', () => img.replaceWith(Object.assign(document.createElement('div'), { className: 'sin-portada', innerHTML: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>') }))); }

  let info = null;
  try { const res = await fetch(`/api/medio?ruta=${enc(r)}`); if (res.ok) info = await res.json(); } catch {}
  if (!caja.isConnected) return;
  if (tipo === 'audio' && info?.etiquetas) {
    const et = info.etiquetas; if (et.titulo) $('.datos-audio b', caja).textContent = et.titulo;
    $('.datos-audio span', caja).textContent = [et.artista, et.album].filter(Boolean).join(' · ');
  }

  const s = {
    modo: 'directo', offset: 0, duracion: info?.duracion || 0, audio: 0, alto: 1080, sub: null, cues: [],
    arrastrando: false, quieto: null, comprobado: false,
  };
  // Pista de audio: la marcada por defecto o la primera en español
  if (info?.audios?.length > 1) {
    const es = info.audios.findIndex((a) => esEspanol(a.idioma)), def = info.audios.findIndex((a) => a.defecto);
    s.audio = es >= 0 ? es : def >= 0 ? def : 0;
  }
  const directoPosible = () => !info || (contenedorDirecto(info, e.nombre) && videoDirecto(info) && (!info.audios?.length || audioDirecto(info.audios[s.audio]?.codec)) && (s.audio === (info.audios.findIndex((a) => a.defecto) >= 0 ? info.audios.findIndex((a) => a.defecto) : 0)));
  const copiaPosible = () => tipo === 'video' && info?.video && videoDirecto(info);
  s.modo = directoPosible() ? 'directo' : 'compatible';

  const ahora = () => s.offset + (el.currentTime || 0);
  const dur = () => s.duracion || (Number.isFinite(el.duration) ? el.duration : 0);
  function pintarTiempo() {
    const t = ahora(), d = dur();
    etiqueta.textContent = `${tiempo(t)} / ${tiempo(d)}`;
    if (!s.arrastrando && d) barra.value = String(Math.round((t / d) * 1000));
    barra.style.setProperty('--p', `${d ? (t / d) * 100 : 0}%`);
  }
  function pintarPlay() {
    const p = el.paused;
    caja.querySelectorAll('[data-c=play]').forEach((b) => { b.innerHTML = p ? IC.play : IC.pausa; b.ariaLabel = p ? 'Reproducir' : 'Pausa'; });
    caja.classList.toggle('pausado', p);
  }
  const ocupado = (txt) => { estadoEl.hidden = !txt; if (txt) $('.txt', estadoEl).textContent = txt; };

  async function cargar(t, reproducir) {
    ocupado(s.modo === 'compatible' ? (copiaPosible() ? 'Preparando…' : 'Convirtiendo en el servidor…') : 'Cargando…');
    s.comprobado = false;
    if (s.modo === 'directo') {
      s.offset = 0;
      if (!el.src.includes('/api/archivo')) el.src = archivo(r);
      if (t) { if (el.readyState >= 1) el.currentTime = t; else el.addEventListener('loadedmetadata', () => { el.currentTime = t; }, { once: true }); }
    } else {
      // Sin recomprimir, el vídeo empieza en el fotograma clave anterior: el
      // servidor dice cuál es para que el contador y los subtítulos cuadren
      const pedido = t.toFixed(3);
      let inicio = t;
      const copia = copiaPosible();
      if (copia && t > 0) { try { inicio = (await (await fetch(`/api/punto?ruta=${enc(r)}&t=${pedido}&audio=${s.audio}`)).json()).t; } catch {} }
      if (!caja.isConnected) return;
      s.offset = inicio;
      const q = new URLSearchParams({ ruta: r, t: pedido, audio: String(s.audio), alto: String(s.alto) });
      if (copia) q.set('copia', '1');
      el.src = tipo === 'video' ? `/api/video?${q}` : `/api/audio?${q}`;
      // (empieza en el fotograma clave de justo antes del punto pedido: como mucho unos segundos antes)
    }
    if (reproducir) el.play().catch(() => pintarPlay());
    pintarTiempo();
  }
  function saltar(t) {
    const d = dur(); t = Math.max(0, d ? Math.min(t, d - 0.5) : t);
    if (s.modo === 'directo') { el.currentTime = t; pintarTiempo(); return; }
    // En modo compatible solo se puede saltar dentro de lo ya convertido; si no, se vuelve a pedir desde ahí
    const rel = t - s.offset;
    const buf = el.buffered;
    for (let i = 0; i < buf.length; i++) if (rel >= buf.start(i) && rel <= buf.end(i) - 1) { el.currentTime = rel; pintarTiempo(); return; }
    cargar(t, !el.paused || true);
  }
  function aCompatible(motivo) {
    if (s.modo === 'compatible') return;
    const t = ahora();
    s.modo = 'compatible';
    if (motivo) aviso(motivo);
    cargar(t, true);
  }

  el.addEventListener('timeupdate', () => { pintarTiempo(); pintarSub(); });
  el.addEventListener('play', pintarPlay); el.addEventListener('pause', () => { pintarPlay(); guardarPosicion(r, ahora(), dur()); });
  el.addEventListener('waiting', () => ocupado(s.modo === 'compatible' && !copiaPosible() ? 'Convirtiendo en el servidor…' : 'Cargando…'));
  el.addEventListener('playing', () => ocupado(''));
  el.addEventListener('canplay', () => ocupado(''));
  el.addEventListener('loadedmetadata', () => { if (!s.duracion && Number.isFinite(el.duration)) s.duracion = el.duration; pintarTiempo(); });
  el.addEventListener('ended', () => { guardarPosicion(r, 0, 0); pintarPlay(); });
  el.addEventListener('error', () => {
    if (!el.getAttribute('src')) return;
    if (s.modo === 'directo') aCompatible('Este formato no lo abre el navegador: el servidor lo convierte al vuelo');
    else { ocupado(''); estadoEl.hidden = false; $('.txt', estadoEl).textContent = 'No se pudo reproducir'; $('.girando', estadoEl).hidden = true; }
  });
  // El navegador a veces «abre» el archivo pero no sabe decodificar el vídeo
  // o el audio: se comprueba al poco de empezar
  el.addEventListener('timeupdate', () => {
    if (s.modo !== 'directo' || s.comprobado || el.currentTime < 1.5) return;
    s.comprobado = true;
    if (tipo === 'video' && info?.video && !el.videoWidth) return aCompatible('El navegador no sabe mostrar este vídeo: se convierte en el servidor');
    if (info?.audios?.length && typeof el.webkitAudioDecodedByteCount === 'number' && el.webkitAudioDecodedByteCount === 0 && !el.muted && el.volume > 0) return aCompatible('El navegador no sabe sonar este audio: se convierte en el servidor');
  });

  // Barra de tiempo
  barra.addEventListener('input', () => { s.arrastrando = true; const d = dur(); etiqueta.textContent = `${tiempo((barra.value / 1000) * d)} / ${tiempo(d)}`; barra.style.setProperty('--p', `${barra.value / 10}%`); });
  barra.addEventListener('change', () => { s.arrastrando = false; saltar((barra.value / 1000) * dur()); });

  // Volumen
  const vol = $('.barra-volumen', caja);
  try { const v = Number(localStorage.getItem('arca.volumen')); if (v >= 0 && v <= 1 && localStorage.getItem('arca.volumen') != null) el.volume = v; } catch {}
  vol.value = String(el.volume);
  vol.addEventListener('input', () => { el.volume = Number(vol.value); el.muted = el.volume === 0; try { localStorage.setItem('arca.volumen', vol.value); } catch {} });
  el.addEventListener('volumechange', () => { $('[data-c=mudo]', caja).innerHTML = el.muted || !el.volume ? IC.mudo : IC.volumen; });

  // Subtítulos (los de dentro del vídeo que son texto y los sueltos)
  const opcionesSub = [
    ...(info?.subtitulos || []).map((x) => ({ id: `p${x.n}`, nombre: [idioma(x.idioma), x.titulo, x.forzado ? 'forzados' : ''].filter(Boolean).join(' · ') || `Pista ${x.n + 1}`, texto: x.texto, q: `pista=${x.n}`, idioma: x.idioma, forzado: x.forzado })),
    ...(info?.externos || []).map((x) => ({ id: `e${x.nombre}`, nombre: `${idioma(x.etiqueta.split('.')[0]) || x.etiqueta} (archivo)`, texto: true, q: `externo=${enc(x.nombre)}`, idioma: x.etiqueta.split('.')[0] })),
  ];
  $('[data-c=subs]', caja).hidden = !opcionesSub.length;
  async function ponerSub(op) {
    s.sub = op; s.cues = []; subEl.innerHTML = '';
    $('[data-c=subs]', caja).classList.toggle('activo', !!op);
    if (!op) return;
    subEl.innerHTML = '<span class="cargando-sub">Cargando subtítulos…</span>';
    try {
      const res = await fetch(`/api/subtitulos?ruta=${enc(r)}&${op.q}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
      if (s.sub !== op) return;
      s.cues = leerVtt(await res.text());
      pintarSub();
    } catch (err) { aviso(`No se pudieron cargar los subtítulos: ${err.message}`, true); s.sub = null; $('[data-c=subs]', caja).classList.remove('activo'); }
  }
  let subActual = '';
  function pintarSub() {
    if (!s.cues.length) { if (subActual) { subEl.innerHTML = ''; subActual = ''; } return; }
    const t = ahora();
    const html = s.cues.filter((c) => t >= c.a && t <= c.b).map((c) => c.html).join('<br>');
    if (html !== subActual) { subEl.innerHTML = html ? `<span>${html}</span>` : ''; subActual = html; }
  }
  // Más fino que timeupdate (4 veces por segundo)
  let raf = 0;
  const bucle = () => { pintarSub(); if (!s.arrastrando) pintarTiempo(); raf = requestAnimationFrame(bucle); };
  el.addEventListener('play', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(bucle); });
  el.addEventListener('pause', () => cancelAnimationFrame(raf));
  // Los subtítulos empiezan siempre apagados: se ponen desde el botón (o con la tecla C)

  // Menús: subtítulos / audio, calidad y modo
  function abrirMenu(cual) {
    if (!menu.hidden && menu.dataset.cual === cual) { menu.hidden = true; return; }
    menu.dataset.cual = cual;
    if (cual === 'subs') {
      menu.innerHTML = `<h4>Subtítulos</h4><button type="button" data-m="sub:" class="${!s.sub ? 'activo' : ''}">Sin subtítulos</button>
        ${opcionesSub.map((o) => `<button type="button" data-m="sub:${esc(o.id)}" class="${s.sub?.id === o.id ? 'activo' : ''}" ${o.texto ? '' : 'disabled title="Son imágenes, no texto: no se pueden enseñar aquí"'}>${esc(o.nombre)}${o.texto ? '' : ' (imagen)'}</button>`).join('')}`;
    } else {
      const audios = info?.audios || [];
      menu.innerHTML = `${audios.length > 1 ? `<h4>Audio</h4>${audios.map((a) => `<button type="button" data-m="audio:${a.n}" class="${s.audio === a.n ? 'activo' : ''}">${esc([idioma(a.idioma) || `Pista ${a.n + 1}`, a.titulo, (a.codec || '').toUpperCase(), a.canales > 2 ? `${a.canales} canales` : ''].filter(Boolean).join(' · '))}</button>`).join('')}` : ''}
        ${tipo === 'video' && s.modo === 'compatible' && !copiaPosible() ? `<h4>Calidad</h4>${[1080, 720, 480].map((h) => `<button type="button" data-m="alto:${h}" class="${s.alto === h ? 'activo' : ''}">${h}p${h === 720 ? ' (menos datos)' : h === 480 ? ' (conexión lenta)' : ''}</button>`).join('')}` : ''}
        <h4>Reproducción</h4>
        <button type="button" data-m="modo:directo" class="${s.modo === 'directo' ? 'activo' : ''}" ${directoPosible() || s.modo === 'directo' ? '' : 'disabled'}>Original (sin convertir)</button>
        <button type="button" data-m="modo:compatible" class="${s.modo === 'compatible' ? 'activo' : ''}">Compatible (el servidor la adapta)</button>
        ${info?.video ? `<p class="info-medio">${esc([info.video.codec?.toUpperCase(), `${info.video.ancho}×${info.video.alto}`, info.video.hdr ? 'HDR' : '', tamano(e.tam)].filter(Boolean).join(' · '))}</p>` : ''}`;
    }
    menu.hidden = false;
  }
  menu.addEventListener('click', (ev) => {
    const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return;
    const [k, v] = [m.slice(0, m.indexOf(':')), m.slice(m.indexOf(':') + 1)];
    menu.hidden = true;
    const t = ahora(), seguir = !el.paused;
    if (k === 'sub') ponerSub(opcionesSub.find((o) => o.id === v) || null);
    if (k === 'audio') { s.audio = Number(v); s.modo = directoPosible() ? 'directo' : 'compatible'; if (s.modo === 'directo') el.removeAttribute('src'); cargar(t, seguir); }
    if (k === 'alto') { s.alto = Number(v); cargar(t, seguir); }
    if (k === 'modo') { s.modo = v; el.removeAttribute('src'); cargar(t, seguir); }
  });

  // Botones
  caja.addEventListener('click', (ev) => {
    const c = ev.target.closest('[data-c]')?.dataset.c;
    if (!c) {
      if (ev.target.closest('.menu-medio')) return;
      if (!menu.hidden) { menu.hidden = true; return; }
      if (ev.target === el || ev.target.closest('.lienzo')) { if (matchMedia('(hover: hover)').matches) alternarPlay(); else mostrarControles(); }
      return;
    }
    if (c === 'play') alternarPlay();
    if (c === '-10' || c === '+10') saltar(ahora() + Number(c));
    if (c === 'mudo') el.muted = !el.muted;
    if (c === 'subs' || c === 'ajustes') abrirMenu(c);
    if (c === 'completa') pantallaCompleta();
  });
  const alternarPlay = () => (el.paused ? el.play().catch(() => {}) : el.pause());
  el.addEventListener('dblclick', () => tipo === 'video' && pantallaCompleta());
  async function pantallaCompleta() {
    if (document.fullscreenElement) { await document.exitFullscreen().catch(() => {}); return; }
    try { await caja.requestFullscreen({ navigationUI: 'hide' }); await screen.orientation?.lock?.('landscape').catch(() => {}); }
    catch { el.webkitEnterFullscreen?.(); }
  }
  const alCambiarCompleta = () => { const b = $('[data-c=completa]', caja); if (b) b.innerHTML = document.fullscreenElement ? IC.salirCompleta : IC.completa; };
  document.addEventListener('fullscreenchange', alCambiarCompleta);
  // En el móvil, doble toque a un lado: ±10 s
  let toque = 0;
  lienzo.addEventListener('touchend', (ev) => {
    if (ev.target.closest('button')) return;
    const ahoraT = Date.now();
    if (ahoraT - toque < 300) {
      ev.preventDefault();
      const x = ev.changedTouches[0].clientX, rc = lienzo.getBoundingClientRect();
      if (x < rc.left + rc.width / 3) saltar(ahora() - 10); else if (x > rc.right - rc.width / 3) saltar(ahora() + 10); else alternarPlay();
    }
    toque = ahoraT;
  });
  // Los controles se esconden solos mientras se ve
  function mostrarControles() {
    caja.classList.add('activo'); clearTimeout(s.quieto);
    s.quieto = setTimeout(() => { if (!el.paused && menu.hidden) caja.classList.remove('activo'); }, 2800);
  }
  caja.addEventListener('pointermove', mostrarControles);
  mostrarControles();

  // Teclado
  const teclas = (ev) => {
    if (ev.target.closest('input[type=text], textarea') || !caja.isConnected) return;
    const k = ev.key;
    if (k === ' ' || k === 'k') { ev.preventDefault(); alternarPlay(); }
    else if (k === 'ArrowRight' || k === 'l') { ev.preventDefault(); saltar(ahora() + 10); }
    else if (k === 'ArrowLeft' || k === 'j') { ev.preventDefault(); saltar(ahora() - 10); }
    else if (k === 'ArrowUp') { ev.preventDefault(); el.volume = Math.min(1, el.volume + 0.1); vol.value = String(el.volume); }
    else if (k === 'ArrowDown') { ev.preventDefault(); el.volume = Math.max(0, el.volume - 0.1); vol.value = String(el.volume); }
    else if (k === 'm') el.muted = !el.muted;
    else if (k === 'f' && tipo === 'video') pantallaCompleta();
    else if (k === 'c' && opcionesSub.length) ponerSub(s.sub ? null : opcionesSub.find((o) => o.texto) || null);
    else return;
    mostrarControles();
  };
  addEventListener('keydown', teclas);

  alCerrar(() => {
    guardarPosicion(r, ahora(), dur());
    cancelAnimationFrame(raf); clearTimeout(s.quieto);
    removeEventListener('keydown', teclas); document.removeEventListener('fullscreenchange', alCambiarCompleta);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    el.pause(); el.removeAttribute('src'); el.load(); // corta la descarga (y la conversión en el servidor)
  });

  // ¿Seguir donde se dejó?
  const guardada = leerPosiciones()[r];
  if (guardada?.t) {
    estadoEl.hidden = true;
    lienzo.insertAdjacentHTML('beforeend', `<div class="seguir"><button type="button" class="btn acento" data-seguir="1">Seguir desde ${tiempo(guardada.t)}</button><button type="button" class="btn" data-seguir="0">Desde el principio</button></div>`);
    lienzo.addEventListener('click', function elegir(ev) {
      const b = ev.target.closest('[data-seguir]'); if (!b) return;
      ev.stopPropagation(); $('.seguir', lienzo)?.remove(); lienzo.removeEventListener('click', elegir);
      cargar(b.dataset.seguir === '1' ? guardada.t : 0, true);
    });
    pintarPlay(); s.offset = 0; etiqueta.textContent = `${tiempo(0)} / ${tiempo(dur())}`;
    return;
  }
  pintarPlay();
  cargar(0, true);
  caja.focus({ preventScroll: true });
}

// WebVTT → [{a, b, html}] (solo cursiva, negrita y subrayado; el resto, texto)
function leerVtt(txt) {
  const seg = (h) => { const p = h.trim().split(':').map(Number); return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; };
  const cues = [];
  for (const bloque of txt.replace(/\r/g, '').split(/\n{2,}/)) {
    const lineas = bloque.split('\n');
    const i = lineas.findIndex((l) => l.includes('-->')); if (i < 0) continue;
    const [a, b] = lineas[i].split('-->').map((x) => seg(x.trim().split(/\s+/)[0].replace(',', '.')));
    const texto = lineas.slice(i + 1).join('\n').trim(); if (!texto) continue;
    const html = esc(texto).replace(/&lt;(\/?)(i|b|u)&gt;/g, '<$1$2>').replace(/&lt;[^&]*?&gt;/g, '').replace(/\{\\[^}]*\}/g, '').replace(/\n/g, '<br>');
    cues.push({ a, b, html });
  }
  return cues;
}

// ---------------------------------------------------------------------------
// PDF (pdf.js): páginas dibujadas según se llega a ellas, con zoom
// ---------------------------------------------------------------------------
const PDFJS = '/vendor/pdfjs-6.2.108/';
let pdfjsLib = null;
async function pdfjs() {
  if (!pdfjsLib) pdfjsLib = import(PDFJS + 'pdf.min.mjs').then((m) => { m.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs'; return m; });
  return pdfjsLib;
}
async function verPdf({ e, r, escena, alCerrar }) {
  escena.innerHTML = `<div class="pdf"><div class="pdf-barra"><button type="button" class="btn-icono" data-z="-" aria-label="Alejar">${IC.menos}</button><span class="pdf-zoom">100 %</span><button type="button" class="btn-icono" data-z="+" aria-label="Acercar">${IC.mas}</button><button type="button" class="btn-icono" data-z="ajustar" aria-label="Ajustar al ancho">${IC.ajustar}</button><span class="pdf-pagina"></span></div><div class="pdf-paginas"><div class="cargando-visor"><span class="girando"></span></div></div></div>`;
  const lib = await pdfjs();
  const tarea = lib.getDocument({ url: archivo(r), wasmUrl: PDFJS + 'wasm/', standardFontDataUrl: PDFJS + 'standard_fonts/', cMapUrl: PDFJS + 'cmaps/', cMapPacked: true, iccUrl: PDFJS + 'iccs/', enableXfa: false, isEvalSupported: false, rangeChunkSize: 262144, disableAutoFetch: true });
  let cerrado = false;
  alCerrar(() => { cerrado = true; tarea.destroy(); });
  let doc;
  try { doc = await tarea.promise; } catch (err) { if (/password/i.test(err?.name || err?.message)) throw new Error('el PDF tiene contraseña'); throw err; }
  if (cerrado) return;
  const cont = $('.pdf-paginas', escena), zoomEl = $('.pdf-zoom', escena), paginaEl = $('.pdf-pagina', escena);
  cont.innerHTML = '';
  const p1 = await doc.getPage(1);
  const base = p1.getViewport({ scale: 1 });
  const anchoDisponible = () => Math.max(200, cont.clientWidth - 24);
  let escala = Math.min(anchoDisponible(), 980) / base.width;
  const hojas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const d = document.createElement('div'); d.className = 'pdf-hoja'; d.dataset.n = n;
    cont.appendChild(d); hojas.push(d);
  }
  const tamanos = new Map([[1, base]]);
  function medir() {
    for (const h of hojas) {
      const vp = tamanos.get(Number(h.dataset.n)) || base;
      h.style.width = `${vp.width * escala}px`; h.style.height = `${vp.height * escala}px`;
      h.dataset.escala = ''; // obliga a redibujar
    }
    zoomEl.textContent = `${Math.round(escala * 100)} %`;
  }
  const dibujando = new Set();
  async function dibujar(h) {
    const n = Number(h.dataset.n);
    if (h.dataset.escala === String(escala) || dibujando.has(n) || cerrado) return;
    dibujando.add(n);
    try {
      const pag = await doc.getPage(n);
      if (!tamanos.has(n)) { tamanos.set(n, pag.getViewport({ scale: 1 })); const vp0 = tamanos.get(n); h.style.width = `${vp0.width * escala}px`; h.style.height = `${vp0.height * escala}px`; }
      const ppp = Math.min(window.devicePixelRatio || 1, 2);
      const vp = pag.getViewport({ scale: escala * ppp });
      const c = document.createElement('canvas'); c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      await pag.render({ canvas: c, canvasContext: c.getContext('2d'), viewport: vp }).promise;
      if (cerrado) return;
      h.replaceChildren(c); h.dataset.escala = String(escala);
    } catch {} finally { dibujando.delete(n); }
  }
  const visibles = new Set();
  const io = new IntersectionObserver((ents) => {
    for (const x of ents) { if (x.isIntersecting) { visibles.add(x.target); dibujar(x.target); } else visibles.delete(x.target); }
    const prim = [...visibles].sort((a, b) => a.dataset.n - b.dataset.n)[0];
    if (prim) paginaEl.textContent = `Página ${prim.dataset.n} de ${doc.numPages}`;
  }, { root: cont, rootMargin: '600px 0px' });
  hojas.forEach((h) => io.observe(h));
  medir();
  paginaEl.textContent = `Página 1 de ${doc.numPages}`;
  const zoom = (nueva) => {
    const rel = cont.scrollTop / Math.max(1, cont.scrollHeight);
    escala = Math.max(0.25, Math.min(5, nueva)); medir();
    cont.scrollTop = rel * cont.scrollHeight;
    visibles.forEach(dibujar);
  };
  $('.pdf-barra', escena).addEventListener('click', (ev) => {
    const z = ev.target.closest('[data-z]')?.dataset.z; if (!z) return;
    zoom(z === '+' ? escala * 1.25 : z === '-' ? escala / 1.25 : anchoDisponible() / base.width);
  });
  cont.addEventListener('wheel', (ev) => { if (ev.ctrlKey) { ev.preventDefault(); zoom(escala * (ev.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
  alCerrar(() => { cerrado = true; io.disconnect(); tarea.destroy(); });
}

// ---------------------------------------------------------------------------
// Textos, Markdown, hojas de cálculo, Word, presentaciones y ZIP
// ---------------------------------------------------------------------------
const MAX_TEXTO = 2 * 1024 * 1024;
async function leerTexto(r, tam) {
  const res = await fetch(archivo(r), tam > MAX_TEXTO ? { headers: { Range: `bytes=0-${MAX_TEXTO - 1}` } } : {});
  if (!res.ok && res.status !== 206) throw new Error(`Error ${res.status}`);
  const b = new Uint8Array(await res.arrayBuffer());
  try { return new TextDecoder('utf-8', { fatal: true }).decode(tam > MAX_TEXTO ? b.subarray(0, b.length - 4) : b); }
  catch { return new TextDecoder('windows-1252').decode(b); }
}
async function verTexto({ e, r, escena }) {
  escena.innerHTML = '<div class="texto-visor"><pre>Cargando…</pre></div>';
  let t = await leerTexto(r, e.tam);
  if (ext(e.nombre) === 'json' && e.tam < MAX_TEXTO) { try { t = JSON.stringify(JSON.parse(t), null, 2); } catch {} }
  const pre = $('pre', escena);
  pre.textContent = t.replace(/^﻿/, '');
  if (e.tam > MAX_TEXTO) pre.insertAdjacentHTML('afterend', `<p class="aviso-visor">Solo se enseñan los primeros 2 MB de ${tamano(e.tam)}. Descárgalo para verlo entero.</p>`);
}
let libMd = null;
async function verMarkdown({ e, r, escena }) {
  escena.innerHTML = '<div class="documento"><div class="hoja-doc">Cargando…</div></div>';
  libMd ||= Promise.all([import('/vendor/marked-18.0.10/marked.mjs'), import('/vendor/dompurify-3.4.14/dompurify.mjs')]);
  const [{ marked }, { default: purificar }] = await libMd;
  const html = purificar.sanitize(marked.parse(await leerTexto(r, e.tam), { gfm: true }), { USE_PROFILES: { html: true } });
  $('.hoja-doc', escena).innerHTML = html;
  enlacesFuera(escena);
}
let libXlsx = null;
async function verTabla({ e, r, escena }) {
  escena.innerHTML = '<div class="tabla-hoja"><div class="cargando-visor"><span class="girando"></span></div></div>';
  if (e.tam > 60 * 1024 * 1024) throw new Error('es demasiado grande para verla aquí (más de 60 MB)');
  libXlsx ||= import('/vendor/xlsx-0.20.3/xlsx.mjs');
  const X = await libXlsx;
  const bytes = new Uint8Array(await (await fetch(archivo(r))).arrayBuffer());
  const x = ext(e.nombre);
  let libro;
  if (x === 'csv' || x === 'tsv') {
    let txt; try { txt = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { txt = new TextDecoder('windows-1252').decode(bytes); }
    const primera = txt.split(/\r?\n/, 1)[0] || '';
    const sep = x === 'tsv' ? '\t' : [';', '\t', ','].sort((a, b) => primera.split(b).length - primera.split(a).length)[0];
    libro = X.read(txt.replace(/^﻿/, ''), { type: 'string', FS: sep, raw: true, dense: true });
  } else libro = X.read(bytes, { type: 'array', dense: true, cellDates: true });
  const caja = $('.tabla-hoja', escena);
  const pintarHoja = (i) => {
    const hoja = libro.Sheets[libro.SheetNames[i]];
    const filas = X.utils.sheet_to_json(hoja, { header: 1, raw: false, defval: '', blankrows: false });
    const max = 3000, ancho = Math.min(80, filas.reduce((m, f) => Math.max(m, f.length), 0));
    const col = (n) => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
    caja.innerHTML = `${libro.SheetNames.length > 1 ? `<div class="pestanas-hoja">${libro.SheetNames.map((n, k) => `<button type="button" data-h="${k}" class="${k === i ? 'activa' : ''}">${esc(n)}</button>`).join('')}</div>` : ''}
      <div class="tabla-scroll"><table><thead><tr><th></th>${Array.from({ length: ancho }, (_, c) => `<th>${col(c)}</th>`).join('')}</tr></thead><tbody>
      ${filas.slice(0, max).map((f, k) => `<tr><th>${k + 1}</th>${Array.from({ length: ancho }, (_, c) => `<td>${esc(f[c] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      ${filas.length > max ? `<p class="aviso-visor">Se enseñan las primeras ${max} filas de ${filas.length}.</p>` : ''}`;
  };
  caja.addEventListener('click', (ev) => { const h = ev.target.closest('[data-h]'); if (h) pintarHoja(Number(h.dataset.h)); });
  pintarHoja(0);
}
// Word: mammoth necesita evaluar código, así que va en una página aislada
let marcoAislado = null;
function aislado() {
  return (marcoAislado ||= new Promise((ok, mal) => {
    const f = document.createElement('iframe');
    f.src = '/aislado.html'; f.hidden = true; f.title = 'Lector de Word';
    const t = setTimeout(() => mal(new Error('No se pudo preparar el lector de Word')), 20000);
    addEventListener('message', function h(ev) { if (ev.source === f.contentWindow && ev.data?.listo) { clearTimeout(t); removeEventListener('message', h); ok(f); } });
    document.body.appendChild(f);
  }).catch((err) => { marcoAislado = null; throw err; }));
}
async function verWord({ e, r, escena }) {
  escena.innerHTML = '<div class="documento"><div class="hoja-doc"><div class="cargando-visor"><span class="girando"></span></div></div></div>';
  if (e.tam > 80 * 1024 * 1024) throw new Error('es demasiado grande para verlo aquí');
  const [bytes, f] = await Promise.all([fetch(archivo(r)).then((x) => x.arrayBuffer()), aislado()]);
  const id = Math.random().toString(36).slice(2);
  const html = await new Promise((ok, mal) => {
    addEventListener('message', function h(ev) { if (ev.source !== f.contentWindow || ev.data?.id !== id) return; removeEventListener('message', h); ev.data.ok ? ok(ev.data.html) : mal(new Error(ev.data.error)); });
    f.contentWindow.postMessage({ id, bytes }, location.origin, [bytes]);
  });
  libMd ||= Promise.all([import('/vendor/marked-18.0.10/marked.mjs'), import('/vendor/dompurify-3.4.14/dompurify.mjs')]);
  const [, { default: purificar }] = await libMd;
  $('.hoja-doc', escena).innerHTML = purificar.sanitize(html, { USE_PROFILES: { html: true } }) || '<p><i>Documento vacío</i></p>';
  enlacesFuera(escena);
}
async function verDocumento({ e, r, escena, icono }) {
  const res = await fetch(`/api/extracto?ruta=${enc(r)}&completo=1`);
  const x = res.status === 200 ? await res.json() : null;
  const mini = `/api/miniatura?ruta=${enc(r)}&v=${Math.floor(e.mod)}-${e.tam}`;
  escena.innerHTML = `<div class="documento"><div class="hoja-doc"><p class="aviso-visor">Vista simplificada: el texto${ext(e.nombre).startsWith('pp') || ext(e.nombre) === 'odp' ? ' de las diapositivas' : ''}, sin el diseño. Para verlo tal cual, descárgalo.</p>
    <img class="miniatura-doc" alt="" src="${esc(mini)}">
    <div class="texto-doc"></div></div></div>`;
  $('.miniatura-doc', escena).addEventListener('error', (ev) => ev.target.remove());
  $('.texto-doc', escena).textContent = x?.texto || '(Sin texto)';
  if (!x) $('.documento', escena).innerHTML = sinVista(e, icono);
}
async function verZip({ e, r, escena }) {
  escena.innerHTML = '<div class="zip-visor"><div class="cargando-visor"><span class="girando"></span></div></div>';
  const res = await fetch(`/api/contenido-zip?ruta=${enc(r)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `Error ${res.status}`);
  const ents = (await res.json()).filter((x) => !x.dir);
  const total = ents.reduce((a, x) => a + x.tam, 0);
  $('.zip-visor', escena).innerHTML = `<h3>${ents.length} archivo${ents.length === 1 ? '' : 's'} · ${tamano(total)} sin comprimir</h3>
    <ul>${ents.slice(0, 5000).map((x) => `<li><span>${esc(x.nombre)}</span><small>${tamano(x.tam)}</small></li>`).join('')}</ul>
    ${ents.length > 5000 ? `<p class="aviso-visor">Y ${ents.length - 5000} más.</p>` : ''}`;
}
async function verOtro({ e, r, escena, icono }) {
  escena.innerHTML = `<div class="sin-previa">${icono(e)}<p>Este tipo de archivo no se puede ver aquí.</p><p class="detalle">${esc(e.nombre)} · ${tamano(e.tam)} · ${new Date(e.mod).toLocaleString('es-ES')}</p>
    <div class="botones-sin"><a class="btn acento" href="${esc(archivo(r, '&descargar=1'))}" download>Descargar</a>${e.tam < MAX_TEXTO * 4 ? '<button type="button" class="btn" data-como-texto="1">Ver como texto</button>' : ''}</div></div>`;
  $('[data-como-texto]', escena)?.addEventListener('click', () => verTexto({ e, r, escena }));
}
function enlacesFuera(el) { el.querySelectorAll('a[href]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; }); }

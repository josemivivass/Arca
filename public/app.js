// Arca: interfaz. Sin librerías (el visor carga las suyas solo al abrir PDF,
// hojas de cálculo, Word o Markdown).
import { abrirVisor } from './visor.js';
// Rutas (#): #/disco/carpeta/…  ·  #papelera/disco  ·  vacío = primer disco

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const contenido = $('#contenido');

// ---------------------------------------------------------------------------
// Iconos
// ---------------------------------------------------------------------------
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const I = {
  carpeta: svg('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" fill="currentColor" fill-opacity=".14"/>'),
  archivo: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>'),
  imagen: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m21 16-5-5-8 9"/>'),
  video: svg('<rect x="2.5" y="5" width="14" height="14" rx="2"/><path d="m16.5 10 5-3v10l-5-3"/>'),
  audio: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  pdf: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 13h6M9 16.5h4"/>'),
  texto: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 11h6M9 14h6M9 17h4"/>'),
  hoja: svg('<rect x="4" y="3" width="16" height="18" rx="1.5"/><path d="M4 8.5h16M4 14h16M10 3v18"/>'),
  documento: svg('<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 15h6M9 18h3"/>'),
  presentacion: svg('<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M12 16v4M8 20h8M7 8h6M7 11h9"/>'),
  zip: svg('<path d="M6 3h12v18H6z"/><path d="M11 3v2h2v2h-2v2h2v2h-2v2h2"/><rect x="10" y="14" width="4" height="4" rx="1"/>'),
  disco: svg('<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 14h18M7 16.5h.01M10 16.5h.01"/>'),
  papelera: svg('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>'),
  subir: svg('<path d="M12 16V4m0 0-4.5 4.5M12 4l4.5 4.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  subirCarpeta: svg('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M12 17v-6m0 0-2.5 2.5M12 11l2.5 2.5"/>'),
  nuevaCarpeta: svg('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M12 11v6M9 14h6"/>'),
  descargar: svg('<path d="M12 4v12m0 0-4.5-4.5M12 16l4.5-4.5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3"/>'),
  copiar: svg('<rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>'),
  mover: svg('<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/><path d="M8.5 13.5h7m0 0-2.5-2.5m2.5 2.5L13 16"/>'),
  renombrar: svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>'),
  borrar: svg('<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>'),
  restaurar: svg('<path d="M4 12a8 8 0 1 0 2.3-5.6"/><path d="M4 4v5h5"/>'),
  cerrar: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  candado: svg('<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>'),
  lista: svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  ojo: svg('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
  ojoCerrado: svg('<path d="M3 3l18 18M10.6 5.6A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-3 3.8M6.3 6.4C3.9 8.1 2.5 12 2.5 12S6 18.5 12 18.5a9 9 0 0 0 4.6-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  cuadricula: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>'),
  izquierda: svg('<path d="m15 18-6-6 6-6"/>'),
  derecha: svg('<path d="m9 18 6-6-6-6"/>'),
  arriba: svg('<path d="m18 15-6-6-6 6"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  clave: svg('<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>'),
  salir: svg('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3"/>'),
  quitar: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  luna: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="9.5" r="2"/><circle cx="15" cy="14.5" r="2.6"/><circle cx="9.2" cy="16" r="1"/></svg>`,
  sol: `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>`,
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
function tamano(b) {
  if (b == null) return '';
  if (b < 1024) return `${b} B`;
  const u = ['KB', 'MB', 'GB', 'TB']; let i = -1;
  do { b /= 1024; i++; } while (b >= 1024 && i < u.length - 1);
  return `${b.toLocaleString('es-ES', { maximumFractionDigits: b < 10 ? 1 : 0 })} ${u[i]}`;
}
const fecha = (ms) => new Date(ms).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fechaCorta = (ms) => new Date(ms).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' });
const ext = (n) => (n.match(/\.([^.]+)$/)?.[1] || '').toLowerCase();
function claseDe(e) {
  if (e.dir) return 'carpeta';
  const x = ext(e.nombre);
  if (/^(jpe?g|jfif|png|gif|webp|avif|bmp|ico|svg|heic|heif|tiff?|jxl|psd|dng|cr2|cr3|nef|arw|orf|rw2|raf)$/.test(x)) return 'imagen';
  if (/^(mp4|m4v|webm|mov|mkv|avi|wmv|mpe?g|ts|m2ts|mts|3gp|flv|ogv|vob|divx|asf)$/.test(x)) return 'video';
  if (/^(mp3|m4a|m4b|aac|ogg|oga|opus|flac|wav|wma|aiff?|ac3|eac3|dts|ape|mka|amr)$/.test(x)) return 'audio';
  if (x === 'pdf') return 'pdf';
  if (/^(xlsx|xls|xlsm|ods|csv|tsv)$/.test(x)) return 'hoja';
  if (/^(docx?|odt|rtf)$/.test(x)) return 'documento';
  if (/^(pptx?|odp|key)$/.test(x)) return 'presentacion';
  if (/^(zip|rar|7z|tar|gz|bz2|xz|tgz)$/.test(x)) return 'zip';
  if (/^(txt|md|markdown|log|json|xml|ini|cfg|conf|ya?ml|toml|srt|vtt|ass|sh|bat|ps1|m?js|ts|py|java|c|h|cpp|cs|go|rs|php|rb|sql|html?|s?css|env|nfo|properties)$/.test(x)) return 'texto';
  return 'archivo';
}
// Qué miniatura lleva cada cosa: imagen (la genera el servidor), extracto
// (el principio del texto o de la tabla) o nada (icono)
const conMiniatura = (e) => ['imagen', 'video', 'pdf', 'audio'].includes(claseDe(e)) || /^(odt|ods|odp|docx|xlsx|pptx)$/.test(ext(e.nombre));
const conExtracto = (e) => (['texto', 'hoja', 'documento', 'presentacion'].includes(claseDe(e)) && !/^(doc|xls|ppt|rtf|key)$/.test(ext(e.nombre))) || ext(e.nombre) === 'zip';
const version = (e) => `${Math.floor(e.mod)}-${e.tam}`;
const url = (ruta, extra = '') => `/api/archivo?ruta=${encodeURIComponent(ruta)}${extra}`;

function aviso(msg, error = false) {
  const d = document.createElement('div');
  d.className = 'aviso' + (error ? ' error' : '');
  d.textContent = msg; $('#avisos').appendChild(d);
  setTimeout(() => d.remove(), error ? 6000 : 3500);
}

async function api(ruta, { metodo = 'GET', datos } = {}) {
  const cambia = metodo !== 'GET';
  if (cambia) { marcarGuardando(1); tamDir.clear(); }
  try {
  const r = await fetch(ruta, {
    method: metodo, credentials: 'same-origin',
    headers: datos !== undefined ? { 'Content-Type': 'application/json', 'X-Arca': '1' } : metodo !== 'GET' ? { 'X-Arca': '1' } : {},
    body: datos !== undefined ? JSON.stringify(datos) : undefined,
  });
  if (r.status === 401 && ruta !== '/api/entrar') { pantallaAcceso(); throw new Error('Hay que entrar'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
  } finally { if (cambia) marcarGuardando(-1); }
}

// ---------------------------------------------------------------------------
// Una sola vez: mientras se guarda algo (cualquier petición que cambia datos),
// los botones no responden y se ven en gris, y un formulario no se puede
// enviar dos veces seguidas. Así un doble (o triple) clic en «Guardar» no
// crea la misma cosa dos veces.
// ---------------------------------------------------------------------------
let guardando = 0;
function marcarGuardando(d) {
  guardando = Math.max(0, guardando + d);
  document.documentElement.classList.toggle('guardando', guardando > 0);
}
const ultimoEnvio = new WeakMap();
for (const tipo of ['submit', 'click']) {
  document.addEventListener(tipo, (e) => {
    const el = tipo === 'submit' ? e.target : e.target.closest?.('button, [role="button"], a.btn');
    if (!el) return;
    const esEnvio = tipo === 'submit' || el.matches('form button:not([type="button"]), [data-restaurar]');
    const repetido = esEnvio && Date.now() - (ultimoEnvio.get(el) || 0) < 900;
    if (guardando || repetido) { e.preventDefault(); e.stopImmediatePropagation(); return; }
    if (esEnvio) ultimoEnvio.set(el, Date.now());
  }, true);
}
// Lo mismo con el teclado: Enter (guarda), Supr (borra) y F2 (renombra)
// esperan a que acabe lo que se está guardando
document.addEventListener('keydown', (e) => {
  if (guardando && ['Enter', 'Delete', 'F2'].includes(e.key)) { e.preventDefault(); e.stopImmediatePropagation(); }
}, true);

// Diálogo genérico: devuelve una promesa con el valor o null
function dialogo({ titulo, texto = '', cuerpo = '', botones = [['Cancelar', null], ['Aceptar', true, 'acento']], alMontar }) {
  return new Promise((ok) => {
    const velo = document.createElement('div');
    velo.className = 'velo';
    velo.innerHTML = `<div class="dialogo" role="dialog" aria-modal="true"><header><h2>${esc(titulo)}</h2>${texto ? `<p>${esc(texto)}</p>` : ''}</header>
      ${cuerpo ? `<div class="cuerpo">${cuerpo}</div>` : ''}<footer>${botones.map(([t, v, c], k) => `<button type="button" class="btn ${c || ''}" data-k="${k}">${esc(t)}</button>`).join('')}</footer></div>`;
    const cerrar = (v) => { velo.remove(); removeEventListener('keydown', tecla); ok(v); };
    const tecla = (e) => { if (e.key === 'Escape') cerrar(null); };
    addEventListener('keydown', tecla);
    velo.addEventListener('click', (e) => {
      if (e.target === velo) return cerrar(null);
      const b = e.target.closest('footer [data-k]'); if (!b) return;
      const v = botones[Number(b.dataset.k)][1];
      cerrar(typeof v === 'function' ? v(velo) : v);
    });
    document.body.appendChild(velo);
    alMontar?.(velo, cerrar);
    ($('input', velo) || $('footer .acento', velo))?.focus();
  });
}
async function pedirTexto(titulo, valor = '', texto = '') {
  return dialogo({
    titulo, texto, cuerpo: `<input type="text" class="campo-texto" style="width:100%" value="${esc(valor)}">`,
    botones: [['Cancelar', null], ['Aceptar', (v) => $('input', v).value.trim() || null, 'acento']],
    alMontar: (v, cerrar) => {
      const i = $('input', v);
      const punto = valor.lastIndexOf('.');
      i.setSelectionRange(0, punto > 0 ? punto : valor.length);
      i.addEventListener('keydown', (e) => { if (e.key === 'Enter') cerrar(i.value.trim() || null); });
    },
  });
}

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------
const estado = {
  discos: [], ruta: '', entradas: [], protegida: false, sel: new Set(), ultimo: null,
  orden: leerPref('orden', 'nombre'), asc: leerPref('asc', '1') === '1', vista: leerPref('vista', 'lista'), verOcultos: leerPref('ocultos', '0') === '1', ocultas: 0,
  busqueda: '', resultados: null,
};
function leerPref(k, d) { try { return localStorage.getItem('arca.' + k) ?? d; } catch { return d; } }
function guardarPref(k, v) { try { localStorage.setItem('arca.' + k, v); } catch {} }

// ---------------------------------------------------------------------------
// Tema y menú
// ---------------------------------------------------------------------------
const btnTema = $('#btn-tema');
function pintarTema() {
  const o = document.documentElement.dataset.theme === 'dark';
  btnTema.innerHTML = o ? I.sol : I.luna;
  btnTema.title = btnTema.ariaLabel = o ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro';
}
btnTema.addEventListener('click', () => {
  const n = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = n;
  try { localStorage.setItem('arca.tema', n); } catch {}
  pintarTema();
});
pintarTema();

const menu = $('#menu');
$('#btn-menu').innerHTML = I.menu;
$('#btn-menu').addEventListener('click', (e) => {
  e.stopPropagation();
  if (!menu.hidden) { menu.hidden = true; return; }
  menu.innerHTML = `<small>Conectado como <b>${esc(estado.usuario || '')}</b></small>
    ${estado.discos.map((d) => `<button type="button" data-m="papelera:${esc(d.nombre)}">${I.papelera}Papelera de ${esc(d.nombre)}</button>`).join('')}
    <button type="button" data-m="clave">${I.clave}Cambiar la contraseña</button>
    <button type="button" data-m="salir">${I.salir}Salir</button>`;
  menu.hidden = false;
});
addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target)) menu.hidden = true; });
menu.addEventListener('click', async (e) => {
  const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
  menu.hidden = true;
  if (m.startsWith('papelera:')) location.hash = `#papelera/${encodeURIComponent(m.slice(9))}`;
  if (m === 'salir') { await api('/api/salir', { metodo: 'POST', datos: {} }).catch(() => {}); pantallaAcceso(); }
  if (m === 'clave') {
    const r = await dialogo({
      titulo: 'Cambiar la contraseña', texto: 'Se cerrará la sesión en los demás dispositivos.',
      cuerpo: `<label class="campo">Contraseña actual <input type="password" name="actual" autocomplete="current-password"></label>
        <label class="campo">Contraseña nueva <input type="password" name="nueva" autocomplete="new-password"></label>
        <label class="campo">Repítela <input type="password" name="otra" autocomplete="new-password"></label>`,
      botones: [['Cancelar', null], ['Cambiar', (v) => ({ actual: $('[name=actual]', v).value, nueva: $('[name=nueva]', v).value, otra: $('[name=otra]', v).value }), 'acento']],
    });
    if (!r) return;
    if (r.nueva !== r.otra) return aviso('Las dos contraseñas nuevas no coinciden', true);
    try { await api('/api/clave', { metodo: 'POST', datos: { actual: r.actual, nueva: r.nueva } }); aviso('Contraseña cambiada'); }
    catch (err) { aviso(err.message, true); }
  }
});

// ---------------------------------------------------------------------------
// Entrar
// ---------------------------------------------------------------------------
function pantallaAcceso() {
  $('#acciones-top').hidden = true; $('#miga').hidden = true; $('#tareas').hidden = true;
  contenido.innerHTML = `<form class="acceso" autocomplete="on">
    <h1>Arca</h1><p>Los archivos de los discos del servidor.</p>
    <label class="campo">Usuario <input name="usuario" autocomplete="username" autocapitalize="none" required></label>
    <label class="campo">Contraseña <input name="clave" type="password" autocomplete="current-password" required></label>
    <p class="error-acceso"></p>
    <button class="btn acento grande" type="submit">Entrar</button></form>`;
  const f = $('form', contenido);
  $('[name=usuario]', f).focus();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = $('button', f); b.disabled = true;
    try {
      await api('/api/entrar', { metodo: 'POST', datos: { usuario: f.usuario.value.trim(), clave: f.clave.value } });
      await arrancar();
    } catch (err) { $('.error-acceso', f).textContent = err.message; b.disabled = false; }
  });
}

// ---------------------------------------------------------------------------
// Arranque y rutas
// ---------------------------------------------------------------------------
async function arrancar() {
  try {
    const yo = await api('/api/yo');
    estado.usuario = yo.usuario; estado.diasPapelera = yo.diasPapelera;
  } catch { return; }
  $('#acciones-top').hidden = false;
  await cargarDiscos();
  rutar();
}
async function cargarDiscos() {
  try { estado.discos = await api('/api/espacio'); } catch (e) { aviso(e.message, true); }
}
function rutaDelHash() {
  const h = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  if (h.startsWith('papelera/')) return { papelera: h.slice(9) };
  return { ruta: h.replace(/\/+$/, '') || estado.discos[0]?.nombre || '' };
}
const irA = (ruta) => { location.hash = '#/' + ruta.split('/').map(encodeURIComponent).join('/'); };
addEventListener('hashchange', () => { if (estado.usuario) rutar(); });

async function rutar() {
  const r = rutaDelHash();
  estado.sel.clear(); estado.busqueda = ''; estado.resultados = null; $('#buscar').value = '';
  if (r.papelera) return verPapelera(r.papelera);
  await abrirCarpeta(r.ruta);
}

// ---------------------------------------------------------------------------
// Explorador
// ---------------------------------------------------------------------------
function marco() {
  if (!$('.arca', contenido)) {
    contenido.innerHTML = `<div class="arca"><aside class="lateral"></aside><section class="explorador"></section></div>`;
  }
  pintarLateral();
  return $('.explorador', contenido);
}
function pintarLateral() {
  const lat = $('.lateral', contenido); if (!lat) return;
  const r = rutaDelHash();
  const actual = (r.ruta || '').split('/')[0];
  lat.innerHTML = `<h3>Discos</h3>${estado.discos.map((d) => {
    const usado = d.total ? (d.total - d.libre) / d.total : 0;
    return `<a class="disco ${!r.papelera && d.nombre === actual ? 'activo' : ''}" href="#/${encodeURIComponent(d.nombre)}" data-soltar="${esc(d.nombre)}">
      <b>${I.disco}${esc(d.nombre)}</b><div class="barra"><i class="${usado > 0.92 ? 'lleno' : ''}" style="width:${(usado * 100).toFixed(1)}%"></i></div>
      <small>${d.error ? esc(d.error) : `${tamano(d.total - d.libre)} ocupados de ${tamano(d.total)}`}</small></a>`;
  }).join('')}
  ${estado.discos.map((d) => `<a class="enlace-lateral ${r.papelera === d.nombre ? 'activo' : ''}" href="#papelera/${encodeURIComponent(d.nombre)}">${I.papelera}Papelera de ${esc(d.nombre)}</a>`).join('')}`;
}

async function abrirCarpeta(ruta) {
  const ex = marco();
  cancelarMiniaturas(ex);
  try {
    const r = await api(`/api/lista?ruta=${encodeURIComponent(ruta)}${estado.verOcultos ? '&ocultos=1' : ''}`);
    estado.ruta = r.ruta; estado.entradas = r.entradas; estado.protegida = r.protegida; estado.ocultas = r.ocultas || 0;
  } catch (e) {
    ex.innerHTML = `<div class="vacio">${esc(e.message)}<small><a href="#">Volver al inicio</a></small></div>`;
    return;
  }
  const miga = $('#miga'); miga.hidden = false; miga.textContent = estado.ruta.split('/').at(-1);
  document.title = 'Arca';
  pintarExplorador();
}

function ordenadas(lista) {
  const f = { nombre: (a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true, sensitivity: 'base' }), tam: (a, b) => (a.tam || 0) - (b.tam || 0), mod: (a, b) => a.mod - b.mod }[estado.orden];
  return [...lista].sort((a, b) => (b.dir - a.dir) || (estado.asc ? 1 : -1) * f(a, b) || a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
}
const rutaDe = (e) => e.ruta || `${estado.ruta}/${e.nombre}`;
const visibles = () => (estado.resultados ? estado.resultados : ordenadas(estado.entradas));

function pintarExplorador() {
  const ex = $('.explorador', contenido); if (!ex) return;
  cancelarMiniaturas(ex);
  const partes = estado.ruta.split('/');
  const soloLectura = estado.protegida;
  ex.innerHTML = `
    <nav class="ruta-barra" aria-label="Ruta">${partes.map((p, k) => `${k ? '<span class="sep">/</span>' : ''}<a href="#/${partes.slice(0, k + 1).map(encodeURIComponent).join('/')}" data-soltar="${esc(partes.slice(0, k + 1).join('/'))}">${esc(p)}</a>`).join('')}
      ${soloLectura ? `<span class="candado" title="La usa Immich: se puede ver, descargar y copiar a otro sitio">${I.candado}Solo lectura</span>` : ''}</nav>
    <div class="herr-barra">
      <button type="button" class="btn" data-a="subir" ${soloLectura ? 'disabled' : ''}>${I.subir}<span class="txt">Subir archivos</span></button>
      <button type="button" class="btn" data-a="subir-carpeta" ${soloLectura ? 'disabled' : ''}>${I.subirCarpeta}<span class="txt">Subir carpeta</span></button>
      <button type="button" class="btn" data-a="nueva" ${soloLectura ? 'disabled' : ''}>${I.nuevaCarpeta}<span class="txt">Nueva carpeta</span></button>
      <span class="hueco"></span>
      <select data-a="orden" aria-label="Ordenar por">
        ${[['nombre', 'Nombre'], ['mod', 'Fecha'], ['tam', 'Tamaño']].map(([v, t]) => `<option value="${v}" ${estado.orden === v ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
      <button type="button" class="btn-icono" data-a="sentido" title="${estado.asc ? 'Ascendente' : 'Descendente'}" aria-label="Cambiar el sentido">${estado.asc ? I.arriba : `<span style="display:inline-flex;transform:rotate(180deg)">${I.arriba}</span>`}</button>
      ${estado.ocultas || estado.verOcultos ? `<button type="button" class="btn-icono ${estado.verOcultos ? 'activo' : ''}" data-a="ver-ocultos" title="${estado.verOcultos ? 'No enseñar lo oculto' : `Ver lo oculto (${estado.ocultas})`}" aria-label="${estado.verOcultos ? 'No enseñar lo oculto' : 'Ver lo oculto'}" aria-pressed="${estado.verOcultos}">${estado.verOcultos ? I.ojo : I.ojoCerrado}</button>` : ''}
      <button type="button" class="btn-icono" data-a="vista" title="${estado.vista === 'lista' ? 'Ver en cuadrícula' : 'Ver en lista'}" aria-label="Cambiar la vista">${estado.vista === 'lista' ? I.cuadricula : I.lista}</button>
      <input type="file" multiple hidden data-entrada="archivos"><input type="file" multiple hidden webkitdirectory data-entrada="carpeta">
    </div>
    <div class="seleccion-barra" hidden></div>
    <div class="lista ${estado.vista === 'cuadricula' ? 'cuadricula' : ''}"></div>`;
  pintarLista();
}

function iconoFila(e) {
  const c = claseDe(e), r = rutaDe(e), icono = I[c] || I.archivo;
  const cuadricula = estado.vista === 'cuadricula';
  if (e.dir) return cuadricula ? `${icono}<span class="mosaico" data-muestra="${esc(r)}"></span>` : icono;
  const fuente = ext(e.nombre) === 'svg' && e.tam < 2 << 20 ? '/api/vista' : '/api/miniatura'; // los SVG pequeños, tal cual
  const img = conMiniatura(e) ? `<img loading="lazy" decoding="async" alt="" src="${fuente}?ruta=${encodeURIComponent(r)}&v=${version(e)}${cuadricula ? '' : '&t=p'}">` : '';
  const extracto = cuadricula && conExtracto(e) ? `<span class="extracto" data-extracto="${esc(r)}" data-v="${version(e)}"></span>` : '';
  const insignia = c === 'video' || c === 'audio' ? `<span class="insignia">${c === 'video' ? I.video : I.audio}</span>` : '';
  return `${icono}${img}${extracto}${insignia}`;
}

// Tamaño de las carpetas: el servidor las recorre enteras, así que se piden de
// dos en dos (para no dejar sin conexiones a las miniaturas) y se recuerdan
// hasta que algo cambia.
const tamDir = new Map();
let pidiendoTam = 0; const colaTam = [];
function tamDirDe(r) {
  if (!tamDir.has(r)) {
    tamDir.set(r, (async () => {
      while (pidiendoTam >= 2) await new Promise((ok) => colaTam.push(ok));
      pidiendoTam++;
      try { return await api(`/api/tamano?ruta=${encodeURIComponent(r)}`); }
      finally { pidiendoTam--; colaTam.shift()?.(); }
    })());
    tamDir.get(r).catch(() => tamDir.delete(r));
  }
  return tamDir.get(r);
}

// Miniaturas que se rellenan al verse: mosaicos de carpetas, extractos de textos y tamaño de carpetas
const observador = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
  for (const x of ents) if (x.isIntersecting) { observador.unobserve(x.target); rellenar(x.target); }
}, { rootMargin: '300px 0px' }) : null;
async function rellenar(el) {
  try {
    if (el.dataset.tamdir) {
      const t = await tamDirDe(el.dataset.tamdir);
      el.textContent = tamano(t.bytes) + (el.dataset.sep ? '\u00a0·\u00a0' : ''); // espacios duros: en una caja inline-block el último se perdería
      el.title = `${t.archivos.toLocaleString('es-ES')} archivo${t.archivos === 1 ? '' : 's'}`;
      return;
    }
    if (el.dataset.muestra) {
      const m = await api(`/api/muestra?ruta=${encodeURIComponent(el.dataset.muestra)}`);
      const ico = el.closest('.ico');
      ico?.insertAdjacentHTML('beforeend', `<small class="cuantos">${m.elementos ? `${m.elementos} elemento${m.elementos === 1 ? '' : 's'}` : 'Vacía'}</small>`);
      if (!m.rutas.length) return;
      el.dataset.n = m.rutas.length;
      el.innerHTML = m.rutas.map((r) => `<img loading="lazy" decoding="async" alt="" src="/api/miniatura?ruta=${encodeURIComponent(r)}&t=p">`).join('');
      el.querySelectorAll('img').forEach((i) => i.addEventListener('error', () => { i.remove(); el.dataset.n = el.children.length; if (!el.children.length) ico?.classList.remove('con-mosaico'); }));
      ico?.classList.add('con-mosaico');
      return;
    }
    if (el.dataset.extracto) {
      const res = await fetch(`/api/extracto?ruta=${encodeURIComponent(el.dataset.extracto)}&v=${el.dataset.v}`);
      if (res.status !== 200) return;
      const x = await res.json();
      if (x.tipo === 'tabla') el.innerHTML = `<table>${x.filas.map((f) => `<tr>${f.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
      else if (x.tipo === 'lista') el.innerHTML = `<ul>${x.items.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`;
      else el.textContent = x.texto || '';
      if (!el.textContent.trim()) return;
      el.classList.add('lleno', x.tipo);
      el.closest('.ico')?.classList.add('con-extracto');
    }
  } catch {}
}
// Al cambiar de carpeta, las miniaturas que aún no han llegado se cancelan:
// el navegador deja libre la conexión y el servidor no las genera
function cancelarMiniaturas(raiz) {
  raiz.querySelectorAll('img').forEach((i) => { if (!i.complete) { i.removeAttribute('src'); } });
  raiz.querySelectorAll('[data-muestra], [data-extracto], [data-tamdir]').forEach((el) => observador?.unobserve(el));
}
function prepararMiniaturas(raiz) {
  raiz.querySelectorAll('.ico > img').forEach((img) => {
    const ok = () => { if (img.naturalWidth) img.closest('.ico')?.classList.add('con-imagen'); };
    img.addEventListener('load', ok, { once: true });
    img.addEventListener('error', () => img.remove(), { once: true });
    if (img.complete) ok();
  });
  raiz.querySelectorAll('[data-muestra], [data-extracto], [data-tamdir]').forEach((el) => (observador ? observador.observe(el) : rellenar(el)));
}

function pintarLista() {
  const lista = $('.lista', contenido); if (!lista) return;
  cancelarMiniaturas(lista);
  const ents = visibles();
  const cab = estado.resultados ? '' : `<div class="fila-arch cab"><span class="marcar"><input type="checkbox" data-a="todo" aria-label="Elegir todo" ${ents.length && estado.sel.size === ents.length ? 'checked' : ''}></span><span></span>
    <button type="button" data-ordenar="nombre">Nombre</button><button type="button" data-ordenar="tam" style="text-align:right">Tamaño</button><button type="button" data-ordenar="mod" style="text-align:right">Modificado</button></div>`;
  if (!ents.length) {
    lista.innerHTML = cab + `<div class="vacio">${estado.resultados ? 'No hay nada con ese nombre' : 'Carpeta vacía'}${!estado.resultados && !estado.protegida ? '<small>Arrastra archivos aquí o usa «Subir archivos»</small>' : ''}</div>`;
  } else {
    lista.innerHTML = cab + ents.map((e, k) => {
      const r = rutaDe(e);
      return `<div class="fila-arch ${estado.sel.has(r) ? 'sel' : ''} ${e.oculta ? 'oculta' : ''}" data-k="${k}" draggable="true" ${e.dir ? `data-soltar="${esc(r)}"` : ''}>
        <span class="marcar"><input type="checkbox" ${estado.sel.has(r) ? 'checked' : ''} aria-label="Elegir ${esc(e.nombre)}"></span>
        <span class="ico ${claseDe(e)}">${iconoFila(e)}</span>
        <span class="nombre"><b title="${esc(e.nombre)}">${esc(e.nombre)}${e.protegida ? `<span class="solo-lectura" title="Solo lectura">${I.candado}</span>` : ''}${e.oculta ? `<span class="solo-lectura" title="Oculto">${I.ojoCerrado}</span>` : ''}</b>
          ${estado.resultados ? `<small>${esc(r.split('/').slice(0, -1).join(' / '))}</small>` : `<small class="solo-movil">${e.dir ? `<span data-tamdir="${esc(r)}" data-sep="1"></span>` : tamano(e.tam) + ' · '}${fecha(e.mod)}</small>`}</span>
        <span class="tam">${e.dir ? `<span data-tamdir="${esc(r)}"></span>` : tamano(e.tam)}</span><span class="fecha">${fecha(e.mod)}</span>
        <small class="meta-cuadricula"><span>${fechaCorta(e.mod)}</span>${e.dir ? `<span data-tamdir="${esc(r)}"></span>` : `<span>${tamano(e.tam)}</span>`}</small></div>`;
    }).join('');
  }
  lista.classList.toggle('seleccionando', estado.sel.size > 0);
  prepararMiniaturas(lista);
  pintarSeleccion();
}
// En pantallas grandes la línea pequeña bajo el nombre sobra (hay columnas)
document.head.insertAdjacentHTML('beforeend', '<style>@media (min-width: 901px) { .lista:not(.cuadricula) .fila-arch .solo-movil { display: none; } }</style>');

function elegidas() { return visibles().filter((e) => estado.sel.has(rutaDe(e))); }
function pintarSeleccion() {
  const barra = $('.seleccion-barra', contenido); if (!barra) return;
  const n = estado.sel.size;
  barra.hidden = !n;
  if (!n) return;
  const sel = elegidas();
  const bloqueada = sel.some((e) => e.protegida) || estado.protegida;
  barra.innerHTML = `<span class="cuenta">${n} elegido${n === 1 ? '' : 's'}</span>
    <button type="button" class="btn" data-s="descargar">${I.descargar}<span class="txt">Descargar</span></button>
    <button type="button" class="btn" data-s="copiar">${I.copiar}<span class="txt">Copiar a…</span></button>
    <button type="button" class="btn" data-s="mover" ${bloqueada ? 'disabled' : ''}>${I.mover}<span class="txt">Mover a…</span></button>
    ${n === 1 ? `<button type="button" class="btn" data-s="renombrar" ${bloqueada ? 'disabled' : ''}>${I.renombrar}<span class="txt">Renombrar</span></button>` : ''}
    ${sel.every((e) => e.oculta) ? `<button type="button" class="btn" data-s="mostrar">${I.ojo}<span class="txt">Dejar de ocultar</span></button>` : `<button type="button" class="btn" data-s="ocultar">${I.ojoCerrado}<span class="txt">Ocultar</span></button>`}
    <button type="button" class="btn peligro" data-s="borrar" ${bloqueada ? 'disabled' : ''}>${I.borrar}<span class="txt">Borrar</span></button>
    <button type="button" class="btn-icono" data-s="nada" title="Quitar la selección" aria-label="Quitar la selección" style="color:inherit">${I.quitar}</button>`;
}

// Clics en el explorador
contenido.addEventListener('click', async (e) => {
  const ex = e.target.closest('.explorador'); if (!ex) return;
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'subir') return $('[data-entrada=archivos]', ex).click();
  if (a === 'subir-carpeta') return $('[data-entrada=carpeta]', ex).click();
  if (a === 'nueva') {
    const n = await pedirTexto('Nueva carpeta', '', `Dentro de «${estado.ruta}»`);
    if (!n) return;
    try { await api('/api/carpeta', { metodo: 'POST', datos: { ruta: estado.ruta, nombre: n } }); await recargar(); }
    catch (err) { aviso(err.message, true); }
    return;
  }
  if (a === 'sentido') { estado.asc = !estado.asc; guardarPref('asc', estado.asc ? '1' : '0'); return pintarExplorador(); }
  if (a === 'ver-ocultos') { estado.verOcultos = !estado.verOcultos; guardarPref('ocultos', estado.verOcultos ? '1' : '0'); return abrirCarpeta(estado.ruta); }
  if (a === 'vista') { estado.vista = estado.vista === 'lista' ? 'cuadricula' : 'lista'; guardarPref('vista', estado.vista); return pintarExplorador(); }
  if (a === 'todo') {
    const ents = visibles();
    estado.sel = e.target.checked ? new Set(ents.map(rutaDe)) : new Set();
    return pintarLista();
  }
  const ord = e.target.closest('[data-ordenar]')?.dataset.ordenar;
  if (ord) { if (estado.orden === ord) estado.asc = !estado.asc; else { estado.orden = ord; estado.asc = true; } guardarPref('orden', estado.orden); guardarPref('asc', estado.asc ? '1' : '0'); return pintarExplorador(); }

  const s = e.target.closest('[data-s]')?.dataset.s;
  if (s) return accionSeleccion(s);

  const fila = e.target.closest('.fila-arch[data-k]'); if (!fila) return;
  const ents = visibles(), k = Number(fila.dataset.k), ent = ents[k], r = rutaDe(ent);
  // Casilla, Ctrl/Cmd o Mayús: elegir. Si no: abrir.
  if (e.target.closest('.marcar') || e.ctrlKey || e.metaKey || e.shiftKey || estado.sel.size && e.target.closest('.marcar')) {
    if (e.shiftKey && estado.ultimo != null) {
      const [i, j] = [Math.min(estado.ultimo, k), Math.max(estado.ultimo, k)];
      for (let x = i; x <= j; x++) estado.sel.add(rutaDe(ents[x]));
    } else if (estado.sel.has(r)) estado.sel.delete(r); else estado.sel.add(r);
    estado.ultimo = k;
    return pintarLista();
  }
  if (ent.dir) return irA(r);
  abrirPrevia(ents, k);
});
contenido.addEventListener('change', (e) => {
  if (e.target.matches('[data-a=orden]')) { estado.orden = e.target.value; guardarPref('orden', estado.orden); return pintarExplorador(); }
  if (e.target.matches('[data-entrada]')) {
    const files = [...e.target.files];
    subirArchivos(files.map((f) => ({ archivo: f, sub: (f.webkitRelativePath || '').split('/').slice(0, -1).join('/') })), estado.ruta);
    e.target.value = '';
  }
});

async function recargar() { tamDir.clear(); await Promise.all([cargarDiscos(), abrirCarpeta(estado.ruta)]); }

async function accionSeleccion(s) {
  const sel = elegidas(), rutas = sel.map(rutaDe);
  if (s === 'nada') { estado.sel.clear(); return pintarLista(); }
  if (s === 'descargar') {
    if (sel.length === 1 && !sel[0].dir) return descargar(url(rutas[0], '&descargar=1'));
    return descargar(`/api/zip?rutas=${encodeURIComponent(JSON.stringify(rutas))}`);
  }
  if (s === 'renombrar') {
    const n = await pedirTexto('Renombrar', sel[0].nombre);
    if (!n || n === sel[0].nombre) return;
    try { await api('/api/renombrar', { metodo: 'POST', datos: { ruta: rutas[0], nombre: n } }); estado.sel.clear(); await recargar(); }
    catch (err) { aviso(err.message, true); }
  }
  if (s === 'ocultar' || s === 'mostrar') {
    try {
      await api('/api/ocultar', { metodo: 'POST', datos: { rutas, ocultar: s === 'ocultar' } });
      const n = rutas.length;
      aviso(s === 'ocultar' ? `${n === 1 ? 'Oculto' : `${n} elementos ocultos`}${estado.verOcultos ? '' : '. Para verlo, pulsa el ojo de la barra'}` : (n === 1 ? 'Ya no está oculto' : `${n} elementos ya no están ocultos`));
      estado.sel.clear(); await recargar();
    } catch (err) { aviso(err.message, true); }
    return;
  }
  if (s === 'borrar') {
    const n = sel.length;
    const ok = await dialogo({ titulo: `¿Borrar ${n === 1 ? `«${sel[0].nombre}»` : `${n} elementos`}?`, texto: `Van a la papelera de su disco y se pueden recuperar durante ${estado.diasPapelera} días.`, botones: [['Cancelar', null], ['Borrar', true, 'acento']] });
    if (!ok) return;
    try { await api('/api/borrar', { metodo: 'POST', datos: { rutas } }); aviso(n === 1 ? 'Enviado a la papelera' : `${n} elementos enviados a la papelera`); estado.sel.clear(); await recargar(); }
    catch (err) { aviso(err.message, true); }
  }
  if (s === 'copiar' || s === 'mover') {
    const destino = await elegirDestino(s === 'copiar' ? 'Copiar a…' : 'Mover a…', rutas, s);
    if (destino) lanzarTarea(s, rutas, destino);
  }
}
function descargar(href) {
  const a = document.createElement('a'); a.href = href; a.download = ''; document.body.appendChild(a); a.click(); a.remove();
}

// Elegir carpeta de destino (navegando por los discos)
async function elegirDestino(titulo, rutas, tipo) {
  let actual = estado.ruta;
  return dialogo({
    titulo, texto: `${rutas.length === 1 ? `«${rutas[0].split('/').at(-1)}»` : `${rutas.length} elementos`}`,
    cuerpo: '<div class="selector-ruta"></div><div class="selector"></div>',
    botones: [['Cancelar', null], [tipo === 'copiar' ? 'Copiar aquí' : 'Mover aquí', () => actual, 'acento']],
    alMontar: (v) => {
      const pintar = async () => {
        const btn = $('footer .acento', v);
        $('.selector-ruta', v).innerHTML = `${actual ? `<button type="button" class="btn-icono" data-ir=".." title="Subir un nivel" aria-label="Subir un nivel">${I.izquierda}</button>` : ''}<span>${esc(actual || 'Discos')}</span>`;
        if (!actual) {
          $('.selector', v).innerHTML = estado.discos.map((d) => `<div class="sitio" data-ir="${esc(d.nombre)}">${I.disco}${esc(d.nombre)}</div>`).join('');
          btn.disabled = true; return;
        }
        let r; try { r = await api(`/api/lista?ruta=${encodeURIComponent(actual)}`); } catch (e) { aviso(e.message, true); return; }
        const dentro = (x) => rutas.some((o) => x === o || x.startsWith(o + '/'));
        const carpetas = r.entradas.filter((x) => x.dir).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));
        $('.selector', v).innerHTML = carpetas.length
          ? carpetas.map((c) => { const cr = `${actual}/${c.nombre}`; return `<div class="sitio ${dentro(cr) ? 'no' : ''}" data-ir="${dentro(cr) ? '' : esc(cr)}">${I.carpeta}${esc(c.nombre)}${c.protegida ? ` ${I.candado}` : ''}</div>`; }).join('')
          : '<div class="vacio" style="padding:20px">Sin carpetas dentro</div>';
        const mismo = tipo === 'mover' && rutas.every((o) => o.split('/').slice(0, -1).join('/') === actual);
        btn.disabled = r.protegida || dentro(actual) || mismo;
        btn.title = r.protegida ? 'Carpeta de solo lectura' : mismo ? 'Ya está aquí' : '';
      };
      v.addEventListener('click', (e) => {
        const ir = e.target.closest('[data-ir]')?.dataset.ir; if (ir === undefined || ir === '') return;
        actual = ir === '..' ? actual.split('/').slice(0, -1).join('/') : ir;
        pintar();
      });
      pintar();
    },
  });
}

// ---------------------------------------------------------------------------
// Tareas: subidas (en el navegador) y mover/copiar (en el servidor)
// ---------------------------------------------------------------------------
const panelTareas = $('#tareas');
const subidas = []; // { id, nombre, total, hechos, estado, xhr, error }
let tareasServidor = [];
let tCerrarTareas = null;
let sondeo = null;

function pintarTareas() {
  const lista = [
    ...subidas.map((s) => ({ ...s, tipo: 'subir', descripcion: `Subir «${s.nombre}»` })),
    ...tareasServidor,
  ];
  if (!lista.length) { panelTareas.hidden = true; return; }
  const activas = lista.filter((t) => t.estado === 'en marcha' || t.estado === 'esperando').length;
  // Si todo ha ido bien, el panel se cierra solo al rato
  clearTimeout(tCerrarTareas);
  if (!activas && !lista.some((t) => t.estado === 'error')) tCerrarTareas = setTimeout(() => { subidas.length = 0; tareasServidor = []; vistas.clear(); panelTareas.hidden = true; }, 5000);
  panelTareas.hidden = false;
  const plegado = panelTareas.classList.contains('plegado');
  panelTareas.innerHTML = `<header><span>${activas ? `${activas} en marcha` : 'Terminado'}</span>
    <button type="button" class="btn-icono" data-t="plegar" aria-label="${plegado ? 'Desplegar' : 'Plegar'}">${plegado ? I.arriba : `<span style="display:inline-flex;transform:rotate(180deg)">${I.arriba}</span>`}</button>
    ${activas ? '' : `<button type="button" class="btn-icono" data-t="cerrar" aria-label="Cerrar">${I.cerrar}</button>`}</header>
    <div class="lista-tareas">${lista.slice().reverse().map((t) => {
      const pct = t.total ? Math.min(100, (t.hechos / t.total) * 100) : t.estado === 'hecho' ? 100 : 0;
      const info = t.estado === 'error' ? t.error : t.estado === 'hecho' ? 'Hecho' : t.estado === 'esperando' ? 'En espera' : `${tamano(t.hechos)} de ${tamano(t.total)}${t.actual ? ` · ${t.actual}` : ''}`;
      return `<div class="tarea ${t.estado === 'error' ? 'error' : ''}"><div class="linea"><span title="${esc(t.descripcion)}">${esc(t.descripcion)}</span>
        ${t.tipo === 'subir' && (t.estado === 'en marcha' || t.estado === 'esperando') ? `<button type="button" class="btn-icono" data-t="cancelar:${t.id}" aria-label="Cancelar">${I.cerrar}</button>` : ''}</div>
        <small>${esc(info)}</small>${t.estado === 'en marcha' || t.estado === 'esperando' ? `<progress max="100" value="${pct.toFixed(1)}"></progress>` : ''}</div>`;
    }).join('')}</div>`;
}
panelTareas.addEventListener('click', (e) => {
  const t = e.target.closest('[data-t]')?.dataset.t; if (!t) return;
  if (t === 'plegar') { panelTareas.classList.toggle('plegado'); pintarTareas(); }
  if (t === 'cerrar') { subidas.length = 0; tareasServidor = []; vistas.clear(); pintarTareas(); }
  if (t.startsWith('cancelar:')) { const s = subidas.find((x) => x.id === t.slice(9)); if (s) { s.cancelada = true; s.xhr?.abort(); s.estado = 'error'; s.error = 'Cancelada'; pintarTareas(); } }
});

// Sube en orden, de dos en dos
let subiendo = 0;
function subirArchivos(items, carpeta) {
  if (!items.length) return;
  if (estado.protegida && carpeta === estado.ruta) return aviso('Esta carpeta es de solo lectura', true);
  for (const it of items) subidas.push({ id: Math.random().toString(36).slice(2), nombre: it.sub ? `${it.sub}/${it.archivo.name}` : it.archivo.name, total: it.archivo.size, hechos: 0, estado: 'esperando', archivo: it.archivo, sub: it.sub, carpeta });
  pintarTareas();
  siguienteSubida();
}
function siguienteSubida() {
  while (subiendo < 2) {
    const s = subidas.find((x) => x.estado === 'esperando'); if (!s) break;
    subiendo++; s.estado = 'en marcha';
    const xhr = new XMLHttpRequest(); s.xhr = xhr;
    const q = new URLSearchParams({ carpeta: s.carpeta, nombre: s.archivo.name }); if (s.sub) q.set('subcarpeta', s.sub);
    xhr.open('PUT', `/api/subir?${q}`);
    xhr.setRequestHeader('X-Arca', '1');
    xhr.upload.onprogress = (e) => { s.hechos = e.loaded; pintarTareasPronto(); };
    xhr.onloadend = () => {
      subiendo--;
      if (!s.cancelada) {
        if (xhr.status === 200) { s.estado = 'hecho'; s.hechos = s.total; }
        else { s.estado = 'error'; try { s.error = JSON.parse(xhr.responseText).error; } catch { s.error = xhr.status ? `Error ${xhr.status}` : 'Se cortó la conexión'; } }
        if (xhr.status === 401) pantallaAcceso();
      }
      pintarTareas();
      if (!subidas.some((x) => x.estado === 'esperando' || x.estado === 'en marcha')) {
        const mal = subidas.filter((x) => x.estado === 'error' && !x.cancelada).length;
        aviso(mal ? `${mal} subida(s) con error` : 'Subida terminada', !!mal);
        if (s.carpeta === estado.ruta || estado.ruta.startsWith(s.carpeta)) recargar();
      }
      siguienteSubida();
    };
    xhr.send(s.archivo);
  }
}
let tPintar = null;
const pintarTareasPronto = () => { if (!tPintar) tPintar = setTimeout(() => { tPintar = null; pintarTareas(); }, 250); };

const vistas = new Set();
async function lanzarTarea(tipo, rutas, destino) {
  try {
    const t = await api(`/api/${tipo}`, { metodo: 'POST', datos: { rutas, destino } });
    tareasServidor.push(t); vistas.add(t.id); estado.sel.clear(); pintarLista(); pintarTareas();
    vigilarTareas();
  } catch (err) { aviso(err.message, true); }
}
function vigilarTareas() {
  if (sondeo) return;
  sondeo = setInterval(async () => {
    let todas; try { todas = await api('/api/tareas'); } catch { return; }
    const antes = new Map(tareasServidor.map((t) => [t.id, t.estado]));
    tareasServidor = todas.filter((t) => vistas.has(t.id));
    pintarTareas();
    const acabadas = tareasServidor.filter((t) => (t.estado === 'hecho' || t.estado === 'error') && antes.get(t.id) !== t.estado);
    for (const t of acabadas) aviso(t.estado === 'hecho' ? `${t.tipo === 'copiar' ? 'Copia' : 'Movimiento'} terminado` : `Error: ${t.error}`, t.estado === 'error');
    if (acabadas.length) recargar();
    if (!tareasServidor.some((t) => t.estado === 'en marcha' || t.estado === 'esperando')) { clearInterval(sondeo); sondeo = null; }
  }, 800);
}

// ---------------------------------------------------------------------------
// Arrastrar: archivos del ordenador → subir; filas → mover a una carpeta
// ---------------------------------------------------------------------------
let arrastrando = null;
contenido.addEventListener('dragstart', (e) => {
  const fila = e.target.closest('.fila-arch[data-k]'); if (!fila) return;
  const ent = visibles()[Number(fila.dataset.k)], r = rutaDe(ent);
  arrastrando = estado.sel.has(r) ? [...estado.sel] : [r];
  e.dataTransfer.effectAllowed = 'copyMove';
  e.dataTransfer.setData('text/x-arca', JSON.stringify(arrastrando));
});
contenido.addEventListener('dragend', () => { arrastrando = null; $$('.soltar, .soltar-aqui', contenido).forEach((x) => x.classList.remove('soltar', 'soltar-aqui')); });
contenido.addEventListener('dragover', (e) => {
  const desdeFuera = e.dataTransfer.types.includes('Files');
  const objetivo = e.target.closest('[data-soltar]');
  $$('.soltar, .soltar-aqui', contenido).forEach((x) => x.classList.remove('soltar', 'soltar-aqui'));
  if (arrastrando && objetivo && !arrastrando.includes(objetivo.dataset.soltar)) { e.preventDefault(); objetivo.classList.add('soltar'); e.dataTransfer.dropEffect = e.ctrlKey || e.altKey ? 'copy' : 'move'; return; }
  if (desdeFuera && e.target.closest('.explorador') && !estado.protegida) { e.preventDefault(); $('.lista', contenido)?.classList.add('soltar-aqui'); e.dataTransfer.dropEffect = 'copy'; }
});
contenido.addEventListener('drop', async (e) => {
  const objetivo = e.target.closest('[data-soltar]');
  $$('.soltar, .soltar-aqui', contenido).forEach((x) => x.classList.remove('soltar', 'soltar-aqui'));
  if (arrastrando && objetivo) {
    e.preventDefault();
    const destino = objetivo.dataset.soltar, rutas = arrastrando; arrastrando = null;
    if (!destino.includes('/') && !estado.discos.find((d) => d.nombre === destino)) return;
    return lanzarTarea(e.ctrlKey || e.altKey ? 'copiar' : 'mover', rutas, destino);
  }
  if (!e.dataTransfer.types.includes('Files') || !e.target.closest('.explorador')) return;
  e.preventDefault();
  const items = await leerSoltados(e.dataTransfer);
  subirArchivos(items, estado.ruta);
});
// Archivos y carpetas soltados (con sus subcarpetas)
async function leerSoltados(dt) {
  const entradas = [...dt.items].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entradas.length) return [...dt.files].map((f) => ({ archivo: f, sub: '' }));
  const out = [];
  const leer = async (en, sub) => {
    if (en.isFile) { out.push({ archivo: await new Promise((ok, mal) => en.file(ok, mal)), sub }); return; }
    const lector = en.createReader();
    for (;;) {
      const lote = await new Promise((ok, mal) => lector.readEntries(ok, mal));
      if (!lote.length) break;
      for (const h of lote) await leer(h, sub ? `${sub}/${en.name}` : en.name);
    }
  };
  for (const en of entradas) await leer(en, '');
  return out;
}

// ---------------------------------------------------------------------------
// Buscar (en la carpeta actual y sus subcarpetas)
// ---------------------------------------------------------------------------
let tBuscar = null;
$('#buscar').addEventListener('input', (e) => {
  clearTimeout(tBuscar);
  const q = e.target.value.trim();
  tBuscar = setTimeout(async () => {
    if (!$('.explorador', contenido)) return;
    estado.sel.clear();
    if (!q) { estado.resultados = null; return pintarLista(); }
    try { estado.resultados = await api(`/api/buscar?ruta=${encodeURIComponent(estado.ruta)}&q=${encodeURIComponent(q)}${estado.verOcultos ? '&ocultos=1' : ''}`); }
    catch (err) { aviso(err.message, true); return; }
    pintarLista();
  }, 350);
});
$('#buscar').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; e.target.dispatchEvent(new Event('input')); } });

// ---------------------------------------------------------------------------
// Vista previa (visor.js)
// ---------------------------------------------------------------------------
function abrirPrevia(ents, k) { abrirVisor(ents, k, { rutaDe, icono: (e) => I[claseDe(e)] || I.archivo, aviso }); }

// ---------------------------------------------------------------------------
// Papelera
// ---------------------------------------------------------------------------
async function verPapelera(disco) {
  const ex = marco();
  $('#miga').hidden = false; $('#miga').textContent = `Papelera de ${disco}`;
  document.title = 'Arca';
  let items;
  try { items = await api(`/api/papelera?disco=${encodeURIComponent(disco)}`); } catch (e) { ex.innerHTML = `<div class="vacio">${esc(e.message)}</div>`; return; }
  const sel = new Set();
  const pintar = () => {
    ex.innerHTML = `<div class="papelera-cab"><h2>Papelera de ${esc(disco)}</h2>
      <button type="button" class="btn" data-p="restaurar" ${sel.size ? '' : 'disabled'}>${I.restaurar}Recuperar${sel.size ? ` (${sel.size})` : ''}</button>
      <button type="button" class="btn peligro" data-p="eliminar" ${sel.size ? '' : 'disabled'}>${I.borrar}Eliminar para siempre</button>
      <button type="button" class="btn peligro" data-p="vaciar" ${items.length ? '' : 'disabled'}>Vaciar</button></div>
      <p class="ayuda">Lo borrado se guarda ${estado.diasPapelera} días y luego se elimina solo.</p>
      <div class="lista">${items.length ? items.map((it) => `<div class="fila-arch papel ${sel.has(it.id) ? 'sel' : ''}" data-id="${esc(it.id)}">
        <span class="marcar"><input type="checkbox" ${sel.has(it.id) ? 'checked' : ''} aria-label="Elegir ${esc(it.nombre)}"></span>
        <span class="ico ${it.dir ? 'carpeta' : ''}">${it.dir ? I.carpeta : I[claseDe(it)] || I.archivo}</span>
        <span class="nombre"><b>${esc(it.nombre)}</b><small>Estaba en ${esc(it.ruta.split('/').slice(0, -1).join(' / '))} · borrado el ${fecha(it.fecha)} · se elimina el ${new Date(it.caduca).toLocaleDateString('es-ES')}</small></span>
        <span class="tam">${tamano(it.tam)}</span><span></span></div>`).join('') : '<div class="vacio">La papelera está vacía</div>'}</div>`;
  };
  pintar();
  ex.onclick = async (e) => {
    const fila = e.target.closest('.fila-arch[data-id]');
    if (fila) { const id = fila.dataset.id; sel.has(id) ? sel.delete(id) : sel.add(id); return pintar(); }
    const p = e.target.closest('[data-p]')?.dataset.p; if (!p) return;
    try {
      if (p === 'restaurar') { const r = await api('/api/restaurar', { metodo: 'POST', datos: { disco, ids: [...sel] } }); aviso(`${r.restaurados.length} recuperado(s) a su sitio`); }
      if (p === 'eliminar' || p === 'vaciar') {
        const n = p === 'vaciar' ? items.length : sel.size;
        const ok = await dialogo({ titulo: p === 'vaciar' ? '¿Vaciar la papelera?' : `¿Eliminar ${n} elemento(s) para siempre?`, texto: 'Esto no se puede deshacer.', botones: [['Cancelar', null], ['Eliminar', true, 'acento']] });
        if (!ok) return;
        await api('/api/vaciar', { metodo: 'POST', datos: { disco, ids: p === 'vaciar' ? null : [...sel] } });
        aviso('Eliminado');
      }
      ex.onclick = null; await cargarDiscos(); verPapelera(disco);
    } catch (err) { aviso(err.message, true); }
  };
}
// Al salir de la papelera, el explorador vuelve a usar sus propios clics
addEventListener('hashchange', () => { const ex = $('.explorador', contenido); if (ex && !location.hash.startsWith('#papelera')) ex.onclick = null; });

// ---------------------------------------------------------------------------
// Teclado
// ---------------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (!$('.explorador', contenido) || e.target.closest('input, textarea, select') || $('.velo, .previa')) return;
  if (e.key === 'Delete' && estado.sel.size) accionSeleccion('borrar');
  if (e.key === 'F2' && estado.sel.size === 1) { e.preventDefault(); accionSeleccion('renombrar'); }
  if (e.key === 'Escape' && estado.sel.size) { estado.sel.clear(); pintarLista(); }
  if ((e.ctrlKey || e.metaKey) && e.key === 'a' && $('.lista', contenido)) { e.preventDefault(); estado.sel = new Set(visibles().map(rutaDe)); pintarLista(); }
});

if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
arrancar().catch(() => pantallaAcceso());

// ---------------------------------------------------------------------------
// Teclado del móvil: los diálogos se ajustan al hueco que deja libre y el
// campo en el que se escribe queda siempre a la vista (también en iPhone, que
// no encoge la página al sacar el teclado)
// ---------------------------------------------------------------------------
(() => {
  const vv = window.visualViewport;
  const raiz = document.documentElement;
  let maximo = 0, ancho = innerWidth;
  const enDialogo = (el) => el && el.closest && el.closest('dialog, [role=dialog], .velo');
  const aLaVista = () => {
    const c = document.activeElement;
    if (!c || !c.matches || !c.matches('input, textarea, select, [contenteditable]') || !enDialogo(c)) return;
    c.scrollIntoView({ block: 'center', inline: 'nearest' });
  };
  const ajustar = () => {
    if (!vv) return;
    if (innerWidth !== ancho) { ancho = innerWidth; maximo = 0; } // al girar el móvil
    raiz.style.setProperty('--alto-visible', `${Math.round(vv.height)}px`);
    raiz.style.setProperty('--arriba-visible', `${Math.round(vv.offsetTop)}px`);
    maximo = Math.max(maximo, vv.height);
    const teclado = vv.height < maximo * 0.78;
    raiz.classList.toggle('con-teclado', teclado);
    if (teclado) requestAnimationFrame(aLaVista);
  };
  if (vv) { vv.addEventListener('resize', ajustar); vv.addEventListener('scroll', ajustar); ajustar(); }
  document.addEventListener('focusin', (e) => { if (enDialogo(e.target)) setTimeout(aLaVista, 350); });
})();

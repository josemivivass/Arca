'use strict';
// Abre documentos de Word con mammoth, dentro de la página aislada
(function () {
  let cargado = null;
  const cargar = (src) => (cargado ||= new Promise((ok, mal) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se pudo cargar el lector de Word'));
    document.head.appendChild(s);
  }));
  addEventListener('message', async (e) => {
    if (e.origin !== location.origin || e.source !== parent) return;
    const { id, bytes } = e.data || {};
    try {
      await cargar('/vendor/mammoth-1.8.0/mammoth.browser.min.js');
      const r = await self.mammoth.convertToHtml({ arrayBuffer: bytes });
      parent.postMessage({ id, ok: true, html: r.value }, location.origin);
    } catch (err) { parent.postMessage({ id, ok: false, error: String((err && err.message) || err) }, location.origin); }
  });
  parent.postMessage({ listo: true }, location.origin);
})();

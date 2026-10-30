// Tema antes de pintar: el elegido en este navegador o, si no hay, el del sistema.
// Va en un archivo aparte (y no dentro de index.html) porque la política de
// seguridad de la página no permite scripts en línea.
(function () {
  var t = null;
  try { t = localStorage.getItem('arca.tema'); } catch (e) {}
  if (t !== 'light' && t !== 'dark') t = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = t;
})();

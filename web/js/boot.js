/* Red de seguridad del arranque.
   app.js es un módulo ES: si su dependencia de CDN no llega, el módulo nunca
   se ejecuta y la pantalla se quedaría en blanco. Este script clásico (que sí
   se ejecuta siempre) cambia el mensaje pasados unos segundos. Va en un
   fichero aparte, y no en línea, para no tener que abrir la CSP a
   script-src 'unsafe-inline'. */
(function () {
  'use strict';
  setTimeout(function () {
    var b = document.getElementById('boot');
    if (b && !b.classList.contains('hidden')) {
      var m = document.getElementById('bootMsg');
      if (m) {
        m.textContent = 'No se ha podido cargar la app. '
          + 'Comprueba la conexión y vuelve a abrirla.';
      }
    }
  }, 12000);
}());

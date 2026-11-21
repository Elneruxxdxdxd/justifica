// JustiFica · justificante imprimible (se abre con el enlace del correo o desde «Mis solicitudes»)
(function () {
  'use strict';
  var $ = JF.$, el = JF.el;
  var folio = JF.param('folio').toUpperCase(), codigo = JF.param('codigo');
  if (!/^JF-[0-9]{4}-[0-9]{4,7}$/.test(folio) || (codigo && !/^[0-9a-f]{32}$/.test(codigo))) {
    JF.mostrar('j-cargando', false);
    return JF.msg('j-msg', 'error', 'El enlace del justificante no es válido. Ábrelo desde tu correo o desde «Mis solicitudes».');
  }
  var datos = { folio: folio };
  if (codigo) datos.codigo = codigo;
  JF.api('justificante', datos, 'alumno').then(function (r) {
    JF.mostrar('j-cargando', false);
    if (!r.ok) return JF.msg('j-msg', 'error', r.mensaje);
    document.title = 'Justificante ' + r.folio + ' · JustiFica';
    $('j-folio').textContent = 'Folio ' + r.folio;
    $('j-emitido').textContent = 'Emitido ' + (r.emitido_en || '');
    $('j-alumno').textContent = r.alumno.nombre;
    $('j-num').textContent = r.alumno.num_control;
    $('j-grupo').textContent = r.alumno.carrera + ' · ' + r.alumno.grupo;
    $('j-fechas').textContent = r.fechas;
    $('j-motivo').textContent = r.motivo;
    var tb = JF.vaciar($('j-materias'));
    r.materias.forEach(function (m) { tb.appendChild(el('tr', null, el('td', { text: m.fecha }), el('td', { text: m.materia }), el('td', { text: m.docente }))); });
    var base = /^https:\/\//.test(r.front_url || '') ? r.front_url : location.href.replace(/\/[^/]*$/, '');
    var url = base + '/verificar.html?folio=' + encodeURIComponent(r.folio);
    $('j-url').textContent = url;
    JF.qr($('j-qr'), url);
    JF.mostrar('j-doc', true); JF.mostrar('j-imprimir', true);
  });
  $('j-imprimir').addEventListener('click', function () { window.print(); });
})();

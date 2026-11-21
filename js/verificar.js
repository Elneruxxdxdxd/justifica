// JustiFica · verificación pública de un folio (datos mínimos)
(function () {
  'use strict';
  var $ = JF.$, el = JF.el;
  function buscar() {
    var folio = $('v-folio').value.trim().toUpperCase();
    JF.msg('v-msg'); JF.vaciar($('v-res'));
    if (!/^JF-[0-9]{4}-[0-9]{4,7}$/.test(folio)) return JF.msg('v-msg', 'error', 'El folio tiene la forma JF-2026-0001.');
    JF.ocupado($('v-buscar'), JF.api('verificar', { folio: folio }), 'Verificando…').then(function (r) {
      if (!r.ok) return JF.msg('v-msg', 'error', r.mensaje);
      if (!r.encontrado) return JF.msg('v-msg', 'error', 'No existe ningún justificante con el folio ' + folio + '.');
      var filas = [['Folio', r.folio], ['Alumno', r.alumno], ['Grupo', r.grupo], ['Motivo', r.motivo], ['Fechas', r.fechas]];
      if (r.valido) filas.push(['Emitido', r.emitido_en]);
      JF.poner($('v-res'), el('div', null,
        el('div', { class: r.valido ? 'msg okm' : 'msg warn', text: r.valido ? 'Justificante VÁLIDO y emitido por JustiFica.' : 'Este folio existe pero NO es un justificante válido.' }),
        el('table', { class: 'datos' }, filas.map(function (f) { return el('tr', null, el('td', { text: f[0] }), el('td', { text: f[1] || '' })); })),
        el('p', null, JF.badge(r.estado))));
    });
  }
  $('v-buscar').addEventListener('click', buscar);
  $('v-folio').addEventListener('keydown', function (e) { if (e.key === 'Enter') buscar(); });
  var f = JF.param('folio');
  if (f) { $('v-folio').value = f.slice(0, 20); buscar(); }
})();

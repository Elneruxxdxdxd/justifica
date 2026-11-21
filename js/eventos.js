// JustiFica · carga de listas oficiales de eventos
(function () {
  'use strict';
  var $ = JF.$, el = JF.el;
  function numeros() {
    var vistos = {}, lista = [];
    ($('e-lista').value.toUpperCase().match(/\b[A-Z]?[0-9]{8}\b/g) || []).forEach(function (n) { if (!vistos[n]) { vistos[n] = 1; lista.push(n); } });
    return lista;
  }
  function contar() { $('e-conteo').textContent = numeros().length + ' número(s) de control detectados.'; }
  $('e-lista').addEventListener('input', contar);
  $('e-archivo').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    if (f.size > 200 * 1024) { this.value = ''; return JF.msg('e-msg', 'error', 'El archivo es demasiado grande (máximo 200 KB).'); }
    var fr = new FileReader();
    fr.onload = function () { $('e-lista').value = String(fr.result); contar(); };
    fr.readAsText(f);
  });

  $('e-enviar').addEventListener('click', function () {
    JF.msg('e-msg'); JF.vaciar($('e-res'));
    var lista = numeros(), ini = $('e-ini').value, fin = $('e-fin').value || ini;
    if (!$('e-nombre').value.trim() || !$('e-area').value.trim()) return JF.msg('e-msg', 'error', 'Escribe el nombre del evento y el área organizadora.');
    if (!ini) return JF.msg('e-msg', 'error', 'Escribe la fecha del evento.');
    if (!lista.length) return JF.msg('e-msg', 'error', 'La lista no tiene números de control.');
    if (lista.length > 500) return JF.msg('e-msg', 'error', 'La lista tiene más de 500 alumnos.');
    JF.ocupado(this, JF.api('evento', { nombre: $('e-nombre').value, area: $('e-area').value, fecha_inicio: ini, fecha_fin: fin, numeros: lista }, 'admin'), 'Emitiendo…').then(function (r) {
      if (!r.ok) return JF.msg('e-msg', 'error', r.mensaje);
      JF.msg('e-msg', 'ok', 'Listo: se emitieron ' + r.emitidos + ' justificante(s) y se avisó a sus docentes.');
      var extra = [];
      if (r.duplicados.length) extra.push('Ya tenían justificante: ' + r.duplicados.map(function (d) { return d.num_control + ' (' + d.folio + ')'; }).join(', '));
      if (r.no_encontrados.length) extra.push('No encontrados o inactivos: ' + r.no_encontrados.join(', '));
      if (r.sin_clases.length) extra.push('Sin clases en esas fechas: ' + r.sin_clases.join(', '));
      if (r.invalidos) extra.push(r.invalidos + ' renglón(es) con formato no válido.');
      JF.poner($('e-res'), el('ul', { class: 'muted' }, extra.map(function (t) { return el('li', { text: t }); })));
    });
  });
  JFAdmin.iniciar(['EVENTOS', 'JEFATURA'], function () {});
})();

// JustiFica · panel de la jefatura
(function () {
  'use strict';
  var $ = JF.$, el = JF.el, ultimoReporte = null;
  var NOMBRES = { plazo_dias_habiles: 'Plazo para pedir (días hábiles)', max_dias_sin_revision: 'Días máximos sin revisión',
    umbral_alerta_tutor: 'Justificantes para alertar al tutor', max_archivo_kb: 'Tamaño máximo del comprobante (KB)',
    correo_jefatura: 'Correo que recibe casos y reportes', periodo: 'Nombre del periodo', periodo_inicio: 'Inicio del periodo (AAAA-MM-DD)',
    periodo_fin: 'Fin del periodo (AAAA-MM-DD)' };

  function cargar(aviso) {
    JF.api('panel', {}, 'admin').then(function (r) {
      if (!r.ok) return JF.msg('p-msg', 'error', r.mensaje);
      if (aviso) JF.msg('p-msg', 'ok', aviso); else JF.msg('p-msg');
      var k = r.kpis;
      JF.poner($('kpis'));
      [['Emitidos este mes', k.emitidos_mes], ['Por revisar', k.en_revision], ['No procedieron este mes', k.rechazados_mes],
       ['Alertas a tutores', k.alertas_tutor], ['Segundos promedio de emisión automática', k.seg_emision]].forEach(function (x) {
        $('kpis').appendChild(el('div', { class: 'kpi' }, el('b', { text: x[1] }), el('span', { class: 'muted', text: x[0] })));
      });
      pintarPendientes(r.pendientes);
      var tb = JF.vaciar($('rec'));
      r.recientes.forEach(function (s) {
        tb.appendChild(el('tr', null, el('td', { text: s.folio }), el('td', null, s.alumno, el('br'), el('span', { class: 'muted', text: s.grupo })),
          el('td', null, s.motivo, el('br'), el('span', { class: 'muted', text: s.fechas }),
            s.descripcion ? el('div', { class: 'muted', text: 'Justificación: «' + s.descripcion + '»' }) : null,
            s.comentario ? el('div', { class: 'muted', text: 'Comentario de jefatura: ' + s.comentario }) : null),
          el('td', null, JF.badge(s.estado), s.tiene_archivo ? el('div', { class: 'muted', text: 'Con comprobante' }) : null, el('div', { class: 'acciones' }, el('button', { type: 'button', class: 'sec small', text: 'Ver expediente', on: { click: function () { verExpediente(s.folio, this); } } })))));
      });
      if (!r.recientes.length) tb.appendChild(el('tr', null, el('td', { colspan: 4, class: 'muted', text: 'Sin solicitudes todavía.' })));
      pintarReglas(r.reglas);
    });
  }

  function pintarPendientes(lista) {
    var cont = JF.vaciar($('pend'));
    if (!lista.length) return cont.appendChild(el('p', { class: 'muted', text: 'No hay casos pendientes. 🎉' }));
    lista.forEach(function (s) {
      var comentario = el('input', { maxlength: 300, placeholder: 'Comentario (obligatorio si no procede)' });
      var msg = el('div', { class: 'msg oculto' });
      function decidir(decision, boton) {
        JF.ocupado(boton, JF.api('revisar', { folio: s.folio, decision: decision, comentario: comentario.value }, 'admin')).then(function (r) {
          if (!r.ok) { msg.className = 'msg err'; msg.textContent = r.mensaje; return; }
          cargar(r.estado === 'EMITIDO' ? 'Folio ' + r.folio + ' aprobado: se avisó al alumno y a ' + r.avisos + ' docente(s).' : 'Folio ' + r.folio + ' marcado como «no procede»; el alumno recibió el motivo por correo.');
        });
      }
      var bVer = el('button', { type: 'button', class: 'sec small', text: 'Ver expediente', on: { click: function () { verExpediente(s.folio, this); } } });
      var bSi = el('button', { type: 'button', class: 'ok small', text: 'Aprobar', on: { click: function () { decidir('APROBAR', this); } } });
      var bNo = el('button', { type: 'button', class: 'no small', text: 'No procede', on: { click: function () { decidir('RECHAZAR', this); } } });
      cont.appendChild(el('div', { class: 'item' },
        el('b', { text: s.folio }), ' · ', el('span', { class: 'muted', text: s.creada_en }), el('br'),
        s.alumno + ' (' + s.num_control + ', ' + s.grupo + ') · ' + s.motivo + ' · ' + s.fechas, el('br'),
        el('span', { class: 'badge EN_REVISION', text: s.regla }),
        s.descripcion ? el('div', { class: 'muted', text: '«' + s.descripcion + '»' }) : null,
        comentario, el('div', { class: 'acciones' }, bVer, bSi, bNo), msg));
    });
  }

  // ---------- expediente completo ----------
  var urlArchivo = null;
  function mostrarPanel(si) { JF.mostrar('v-exp', !si); JF.mostrar('v-app', si); window.scrollTo(0, 0); }
  function verExpediente(folio, boton) {
    JF.ocupado(boton, JF.api('expediente', { folio: folio }, 'admin'), 'Abriendo…').then(function (r) {
      if (!r.ok) {
        window.scrollTo(0, 0);
        return JF.msg('p-msg', 'error', r.regla === 'PETICION'
          ? 'El servidor todavía no tiene la función de expediente: falta publicar la nueva versión del backend en Apps Script.'
          : r.mensaje);
      }
      $('x-folio').textContent = 'Folio ' + r.folio;
      JF.poner($('x-estado'), JF.badge(r.estado));
      var filas = [['Alumno', r.alumno.nombre], ['Número de control', r.alumno.num_control], ['Carrera y grupo', r.alumno.carrera + ' · ' + r.alumno.grupo],
        ['Motivo', r.motivo], ['Fechas de la falta', r.fechas], ['Solicitada', r.creada_en], ['Evento', r.evento],
        ['Regla que la mandó a revisión', r.regla_revision], ['Resuelta', r.resuelta_en ? r.resuelta_en + (r.resuelta_por ? ' · por ' + r.resuelta_por : '') : 'Pendiente'],
        ['Comentario de jefatura', r.comentario]];
      JF.poner($('x-datos'));
      filas.forEach(function (f) { if (f[1]) $('x-datos').appendChild(el('tr', null, el('td', { text: f[0] }), el('td', { text: f[1] }))); });
      $('x-desc').textContent = r.descripcion ? '«' + r.descripcion + '»' : 'El alumno no escribió justificación.';
      var tb = JF.vaciar($('x-materias'));
      r.materias.forEach(function (m) { tb.appendChild(el('tr', null, el('td', { text: m.fecha }), el('td', { text: m.materia }), el('td', { text: m.docente }))); });
      if (!r.materias.length) tb.appendChild(el('tr', null, el('td', { colspan: 3, class: 'muted', text: 'Sin materias registradas.' })));
      if (urlArchivo) { URL.revokeObjectURL(urlArchivo); urlArchivo = null; }
      var caja = JF.vaciar($('x-archivo'));
      if (r.archivo && ['image/jpeg', 'image/png', 'application/pdf'].indexOf(r.archivo.tipo) >= 0) {
        urlArchivo = URL.createObjectURL(JF.blobDeBase64(r.archivo.b64, r.archivo.tipo));
        caja.appendChild(el('p', { class: 'muted', text: 'Archivo: ' + r.archivo.nombre }));
        caja.appendChild(r.archivo.tipo === 'application/pdf'
          ? el('iframe', { class: 'comprobante-pdf', src: urlArchivo, title: 'Comprobante PDF' })
          : el('img', { class: 'comprobante', src: urlArchivo, alt: 'Comprobante de ' + r.alumno.nombre }));
      } else caja.appendChild(el('p', { class: 'muted', text: 'Esta solicitud no tiene comprobante.' }));
      mostrarPanel(false);
    });
  }
  $('x-volver').addEventListener('click', function () { mostrarPanel(true); });
  $('x-imprimir').addEventListener('click', function () { window.print(); });

  function pintarReglas(reglas) {
    var cont = JF.vaciar($('reglas'));
    reglas.forEach(function (g) {
      var id = 'regla-' + g.clave;
      cont.appendChild(el('label', { for: id, text: NOMBRES[g.clave] || g.descripcion || g.clave }));
      cont.appendChild(el('input', { id: id, 'data-clave': g.clave, value: g.valor, maxlength: 120 }));
    });
  }
  $('g-guardar').addEventListener('click', function () {
    var datos = {};
    $('reglas').querySelectorAll('input[data-clave]').forEach(function (i) { datos[i.getAttribute('data-clave')] = i.value; });
    JF.ocupado(this, JF.api('reglas', { reglas: datos }, 'admin'), 'Guardando…').then(function (r) {
      if (!r.ok) return JF.msg('g-msg', 'error', r.mensaje);
      JF.msg('g-msg', 'ok', r.actualizadas ? 'Se actualizaron ' + r.actualizadas + ' regla(s).' : 'No había cambios.');
    });
  });

  // ---------- reporte ----------
  var hoy = new Date();
  $('r-mes').value = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0');
  $('r-ver').addEventListener('click', function () {
    var m = /^(\d{4})-(\d{2})$/.exec($('r-mes').value);
    if (!m) return JF.poner($('r-res'), el('div', { class: 'msg err', text: 'Elige un mes.' }));
    JF.ocupado(this, JF.api('reporte', { anio: m[1], mes: m[2] }, 'admin'), 'Consultando…').then(function (r) {
      if (!r.ok) return JF.poner($('r-res'), el('div', { class: 'msg err', text: r.mensaje }));
      ultimoReporte = r;
      JF.mostrar('r-csv', true);
      JF.poner($('r-res'), el('div', null,
        el('p', null, 'Justificantes emitidos en ' + r.periodo_txt + ': ', el('b', { text: r.total })),
        el('div', { class: 'scroll' }, el('table', null,
          el('thead', null, el('tr', null, el('th', { text: 'Carrera' }), el('th', { text: 'Grupo' }), el('th', { text: 'Motivo' }), el('th', { text: 'Total' }))),
          el('tbody', null, r.filas.length ? r.filas.map(function (f) {
            return el('tr', null, el('td', { text: f.carrera }), el('td', { text: f.grupo }), el('td', { text: f.motivo }), el('td', { text: f.total }));
          }) : el('tr', null, el('td', { colspan: 4, class: 'muted', text: 'Sin justificantes emitidos en el mes.' }))))),
        r.alertas.length ? el('p', { class: 'muted', text: 'Alertas a tutores: ' + r.alertas.map(function (a) { return a.alumno + ' (' + a.grupo + ', ' + a.total + ')'; }).join('; ') }) : null));
    });
  });
  $('r-csv').addEventListener('click', function () {
    if (!ultimoReporte) return;
    var filas = [['Carrera', 'Grupo', 'Motivo', 'Total']].concat(ultimoReporte.filas.map(function (f) { return [f.carrera, f.grupo, f.motivo, f.total]; }));
    JF.descargar(new Blob([JF.csv(filas)], { type: 'text/csv;charset=utf-8' }), 'reporte_justifica_' + ultimoReporte.anio + '_' + String(ultimoReporte.mes).padStart(2, '0') + '.csv');
  });

  JF.pestanas('tabs');
  JFAdmin.iniciar(['JEFATURA'], function () { cargar(); });
})();

// JustiFica · página del alumno
(function () {
  'use strict';
  var $ = JF.$, el = JF.el;
  var config = null, motivo = null, temporizador = null;

  function entrar(s) {
    JF.mostrar('v-login', false); JF.mostrar('v-app', true); JF.mostrar('quien', true);
    $('quien-nombre').textContent = s.nombre + (s.grupo ? ' · ' + s.grupo : '');
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { salir('Tu sesión terminó por tiempo. Vuelve a entrar.'); }, Math.max(0, s.vence - Date.now()));
    cargarConfig();
  }
  function salir(mensaje) {
    var s = JF.sesion.leer('alumno');
    if (s) JF.api('logout', {}, 'alumno');
    JF.sesion.borrar('alumno'); clearTimeout(temporizador);
    JF.mostrar('v-app', false); JF.mostrar('quien', false); JF.mostrar('v-login', true);
    $('l-nip').value = '';
    JF.msg('l-msg', 'aviso', mensaje || '');
  }
  JF.alTerminarSesion(function (m) { salir(m); });

  // ---------- inicio de sesión ----------
  $('l-entrar').addEventListener('click', function () {
    var num = $('l-num').value.trim().toUpperCase(), nip = $('l-nip').value.trim();
    if (!/^[A-Z]?[0-9]{8}$/.test(num) || !/^[0-9]{4,6}$/.test(nip)) {
      return JF.msg('l-msg', 'error', 'Escribe tu número de control (8 dígitos) y tu NIP (4 a 6 dígitos).');
    }
    JF.msg('l-msg');
    JF.ocupado(this, JF.api('login_alumno', { num_control: num, nip: nip }), 'Entrando…').then(function (r) {
      if (!r.ok) return JF.msg('l-msg', 'error', r.mensaje);
      $('l-nip').value = '';
      entrar(JF.sesion.guardar('alumno', r));
    });
  });
  $('l-nip').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('l-entrar').click(); });
  $('salir').addEventListener('click', function () { salir(); });

  // ---------- formulario ----------
  function cargarConfig() {
    if (config) return;
    JF.api('config', {}).then(function (r) {
      if (!r.ok) return JF.msg('n-msg', 'error', r.mensaje);
      config = r;
      $('n-info').textContent = 'Periodo ' + r.periodo + '. Pide tu justificante dentro de los ' + r.plazo +
        ' días hábiles siguientes a tu falta. Comprobante: máximo ' + Math.round(r.max_kb / 1024) + ' MB.';
      $('n-ini').max = r.hoy; $('n-fin').max = r.hoy;
      var cont = JF.vaciar($('n-motivos'));
      r.motivos.forEach(function (m) {
        cont.appendChild(el('button', { type: 'button', class: 'chip', 'data-clave': m.clave, text: m.nombre, on: { click: function () { elegir(m); } } }));
      });
    });
  }
  function elegir(m) {
    motivo = m;
    $('n-motivos').querySelectorAll('.chip').forEach(function (c) { c.classList.toggle('on', c.getAttribute('data-clave') === m.clave); });
    $('n-archivo-lbl').textContent = 'Comprobante (foto JPG/PNG o PDF)' + (m.requiere_comprobante ? ' · obligatorio' : ' · opcional');
  }

  $('n-enviar').addEventListener('click', function () {
    var boton = this;
    JF.msg('n-msg'); JF.vaciar($('n-res'));
    if (!config) return JF.msg('n-msg', 'error', 'No se pudo cargar la configuración. Recarga la página.');
    if (!motivo) return JF.msg('n-msg', 'error', 'Elige por qué faltaste.');
    var ini = $('n-ini').value, fin = $('n-fin').value || ini;
    if (!ini) return JF.msg('n-msg', 'error', 'Escribe la fecha de tu falta.');
    if (fin < ini) return JF.msg('n-msg', 'error', 'La fecha final no puede ser anterior a la inicial.');
    var archivo = $('n-archivo').files[0] || null;
    if (motivo.requiere_comprobante && !archivo) return JF.msg('n-msg', 'error', 'Para este motivo necesitas subir tu comprobante.');
    if (archivo && archivo.size > config.max_kb * 1024) return JF.msg('n-msg', 'error', 'El comprobante pesa más de lo permitido. Toma la foto con menor resolución.');
    if (archivo && !/\.(jpe?g|png|pdf)$/i.test(archivo.name)) return JF.msg('n-msg', 'error', 'El comprobante debe ser JPG, PNG o PDF.');

    var datos = { motivo: motivo.clave, fecha_inicio: ini, fecha_fin: fin, descripcion: $('n-desc').value.slice(0, 500) };
    var lectura = archivo ? JF.leerBase64(archivo).then(function (b64) { datos.archivo = { nombre: archivo.name.slice(0, 80), b64: b64 }; })
                          : Promise.resolve();
    JF.ocupado(boton, lectura.then(function () { return JF.api('registrar', datos, 'alumno'); },
      function () { return { ok: false, mensaje: 'No se pudo leer el archivo.' }; }), 'Enviando…').then(function (r) {
      if (!r.ok) return JF.msg('n-msg', 'error', r.mensaje);
      mostrarResultado(r);
      $('n-desc').value = ''; $('n-archivo').value = ''; $('n-ini').value = ''; $('n-fin').value = '';
    });
  });

  function mostrarResultado(r) {
    var caja = $('n-res');
    if (r.estado === 'EMITIDO') {
      JF.poner(caja, el('div', { class: 'msg okm' },
        el('b', { text: 'Justificante emitido: ' + r.folio }), el('br'),
        'Avisamos por correo a ' + r.avisos + ' docente(s). También te llegó un correo con tu justificante.',
        el('ul', null, r.materias.map(function (m) { return el('li', { text: m.fecha + ' · ' + m.materia + ' (' + m.docente + ')' }); })),
        el('a', { class: 'btn', href: 'justificante.html?folio=' + encodeURIComponent(r.folio) + '&codigo=' + encodeURIComponent(r.codigo), text: 'Ver mi justificante' })));
    } else {
      JF.poner(caja, el('div', { class: 'msg warn' },
        el('b', { text: 'Solicitud ' + r.folio + ' en revisión' }), el('br'),
        'La revisará la jefatura porque: ' + r.regla_revision + '. Te avisaremos por correo.'));
    }
  }

  // ---------- mis solicitudes ----------
  function cargarMias() {
    var lista = JF.poner($('m-lista'), el('p', { class: 'muted', text: 'Cargando…' }));
    JF.api('mis_solicitudes', {}, 'alumno').then(function (r) {
      if (!r.ok) return JF.poner(lista, el('div', { class: 'msg err', text: r.mensaje }));
      if (!r.solicitudes.length) return JF.poner(lista, el('p', { class: 'muted', text: 'Aún no tienes solicitudes.' }));
      JF.vaciar(lista);
      r.solicitudes.forEach(function (s) {
        lista.appendChild(el('div', { class: 'item' },
          el('b', { text: s.folio }), ' · ' + s.motivo, el('br'),
          el('span', { class: 'muted', text: s.fechas }), ' ', JF.badge(s.estado),
          s.estado === 'EN_REVISION' && s.regla_revision ? el('div', { class: 'muted', text: s.regla_revision }) : null,
          s.estado === 'RECHAZADO' && s.comentario ? el('div', { class: 'muted', text: 'Motivo: ' + s.comentario }) : null,
          s.estado === 'EMITIDO' ? el('div', { class: 'acciones' }, el('a', { href: 'justificante.html?folio=' + encodeURIComponent(s.folio) + '&codigo=' + encodeURIComponent(s.codigo), text: 'Ver justificante' })) : null));
      });
    });
  }
  JF.pestanas('tabs', function (id) { if (id === 't-mias') cargarMias(); });

  var s = JF.sesion.leer('alumno');
  if (s) entrar(s);
})();

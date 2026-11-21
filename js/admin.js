// JustiFica · inicio de sesión de jefatura y áreas de eventos (compartido)
window.JFAdmin = (function () {
  'use strict';
  var $ = JF.$, temporizador = null, alEntrar = null, roles = [];

  function entrar(s) {
    if (roles.indexOf(s.rol) < 0) {
      JF.sesion.borrar('admin');
      return JF.msg('l-msg', 'error', s.rol === 'EVENTOS' ? 'Tu cuenta es de área de eventos: entra desde «eventos.html».' : 'Tu cuenta no tiene acceso a esta página.');
    }
    JF.mostrar('v-login', false); JF.mostrar('v-app', true); JF.mostrar('quien', true);
    $('quien-nombre').textContent = s.nombre;
    clearTimeout(temporizador);
    temporizador = setTimeout(function () { salir('Tu sesión terminó por tiempo. Vuelve a entrar.'); }, Math.max(0, s.vence - Date.now()));
    if (alEntrar) alEntrar(s);
  }
  function salir(mensaje) {
    if (JF.sesion.leer('admin')) JF.api('logout', {}, 'admin');
    JF.sesion.borrar('admin'); clearTimeout(temporizador);
    JF.mostrar('v-app', false); JF.mostrar('quien', false); JF.mostrar('v-login', true);
    $('l-pass').value = '';
    JF.msg('l-msg', 'aviso', mensaje || '');
  }

  function iniciar(rolesPermitidos, fn) {
    roles = rolesPermitidos; alEntrar = fn;
    JF.alTerminarSesion(function (m) { salir(m); });
    $('l-entrar').addEventListener('click', function () {
      var correo = $('l-correo').value.trim().toLowerCase(), pass = $('l-pass').value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) || !pass) return JF.msg('l-msg', 'error', 'Escribe tu correo y tu contraseña.');
      JF.msg('l-msg');
      JF.ocupado(this, JF.api('login_admin', { correo: correo, password: pass }), 'Entrando…').then(function (r) {
        if (!r.ok) return JF.msg('l-msg', 'error', r.mensaje);
        $('l-pass').value = '';
        entrar(JF.sesion.guardar('admin', r));
      });
    });
    $('l-pass').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('l-entrar').click(); });
    $('salir').addEventListener('click', function () { salir(); });
    var s = JF.sesion.leer('admin');
    if (s) entrar(s);
  }
  return Object.freeze({ iniciar: iniciar });
})();

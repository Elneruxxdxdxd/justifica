// JustiFica · funciones comunes de las páginas.
// Reglas de seguridad del frontend:
//  - Nunca se usa innerHTML con datos: todo se pinta con textContent (sin inyección de HTML/JS).
//  - Las páginas no tienen scripts ni estilos en línea; la política CSP de cada página los bloquea.
//  - El token de sesión vive en sessionStorage (se borra al cerrar la pestaña) y caduca en el servidor.
//  - Toda validación real ocurre en la base de datos; aquí solo se ayuda al usuario a no equivocarse.
(function () {
  'use strict';
  var CFG = window.JF_CONFIG || {};
  var JF = {};
  var finSesion = null;

  // ---------- DOM seguro ----------
  JF.$ = function (id) { return document.getElementById(id); };
  JF.el = function (tag, props) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'text') e.textContent = String(v);
        else if (k === 'class') e.className = v;
        else if (k === 'on') Object.keys(v).forEach(function (ev) { e.addEventListener(ev, v[ev]); });
        else if (k === 'href') e.setAttribute('href', JF.urlSegura(v));
        else e.setAttribute(k, v === true ? '' : String(v));
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      (Array.isArray(c) ? c : [c]).forEach(function (x) {
        if (x == null || x === false) return;
        e.appendChild(typeof x === 'string' || typeof x === 'number' ? document.createTextNode(String(x)) : x);
      });
    }
    return e;
  };
  JF.vaciar = function (e) { while (e.firstChild) e.removeChild(e.firstChild); return e; };
  JF.poner = function (e) { JF.vaciar(e); for (var i = 1; i < arguments.length; i++) if (arguments[i]) e.appendChild(arguments[i]); return e; };
  JF.mostrar = function (id, si) { JF.$(id).classList.toggle('oculto', !si); };
  // Solo enlaces relativos de esta misma página o https
  JF.urlSegura = function (u) {
    u = String(u || '');
    return (/^(https:\/\/|[a-z_]+\.html(\?|$)|\.\/|#)/i.test(u) && !/^\s*javascript:/i.test(u)) ? u : '#';
  };

  JF.msg = function (id, tipo, texto) {
    var e = JF.$(id);
    if (!texto) { e.className = 'msg oculto'; e.textContent = ''; return; }
    e.className = 'msg ' + ({ error: 'err', ok: 'okm', aviso: 'warn' }[tipo] || 'err');
    e.textContent = texto;
  };
  JF.badge = function (estado) {
    var t = { EMITIDO: 'Emitido', EN_REVISION: 'En revisión', RECHAZADO: 'No procedió' }[estado] || estado;
    return JF.el('span', { class: 'badge ' + (/^[A-Z_]+$/.test(estado) ? estado : ''), text: t });
  };
  JF.param = function (nombre) { return new URLSearchParams(location.search).get(nombre) || ''; };

  // ---------- sesión ----------
  JF.sesion = {
    leer: function (tipo) {
      try { var s = JSON.parse(sessionStorage.getItem('jf_' + tipo) || 'null'); if (s && s.vence > Date.now()) return s; } catch (e) { /* nada */ }
      JF.sesion.borrar(tipo); return null;
    },
    guardar: function (tipo, r) {
      var s = { token: r.token, nombre: r.nombre, grupo: r.grupo || null, rol: r.rol || 'ALUMNO', vence: Date.now() + (r.minutos || 30) * 60000 };
      try { sessionStorage.setItem('jf_' + tipo, JSON.stringify(s)); } catch (e) { /* nada */ }
      return s;
    },
    borrar: function (tipo) { try { sessionStorage.removeItem('jf_' + tipo); } catch (e) { /* nada */ } }
  };

  // ---------- API ----------
  // tipoSesion: 'alumno' | 'admin' | null (sin token)
  JF.api = function (accion, datos, tipoSesion) {
    var cuerpo = Object.assign({}, datos || {}, { accion: accion });
    if (tipoSesion) { var s = JF.sesion.leer(tipoSesion); if (s) cuerpo.token = s.token; }
    if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(CFG.api || '') && !/^http:\/\/localhost(:\d+)?\//.test(CFG.api || '')) {
      return Promise.resolve({ ok: false, mensaje: 'La página no tiene configurada la dirección del servidor (js/config.js).' });
    }
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, 45000);
    return fetch(CFG.api, {
      // Petición «simple» (text/plain, sin encabezados extra): Google Apps Script no acepta la verificación previa CORS
      method: 'POST', mode: 'cors', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', redirect: 'follow', signal: ctrl.signal,
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(cuerpo)
    }).then(function (r) {
      clearTimeout(t);
      if (r.status === 429) return { ok: false, mensaje: 'Demasiadas peticiones seguidas. Espera un minuto.' };
      if (r.status === 413) return { ok: false, mensaje: 'El archivo es demasiado grande.' };
      if (!r.ok) return { ok: false, mensaje: 'El servidor no está disponible en este momento (' + r.status + ').' };
      return r.json().catch(function () { return { ok: false, mensaje: 'Respuesta no válida del servidor.' }; });
    }).catch(function () {
      clearTimeout(t);
      return { ok: false, mensaje: 'No hay conexión con el servidor de JustiFica. Revisa tu internet e intenta de nuevo.' };
    }).then(function (r) {
      r = (r && typeof r === 'object') ? r : { ok: false, mensaje: 'Respuesta no válida del servidor.' };
      if (r.ok === false && r.regla === 'SESION' && tipoSesion) {
        JF.sesion.borrar(tipoSesion);
        if (typeof finSesion === 'function') finSesion(r.mensaje);
      }
      return r;
    });
  };

  // Desactiva un botón mientras dura la petición
  JF.ocupado = function (boton, promesa, textoOcupado) {
    var txt = boton.textContent;
    boton.disabled = true; boton.textContent = textoOcupado || 'Procesando…';
    return promesa.then(function (r) { boton.disabled = false; boton.textContent = txt; return r; });
  };

  // Lee un archivo y devuelve su contenido en base64 (sin el prefijo data:)
  JF.leerBase64 = function (archivo) {
    return new Promise(function (ok, mal) {
      var fr = new FileReader();
      fr.onload = function () { var s = String(fr.result); ok(s.slice(s.indexOf(',') + 1)); };
      fr.onerror = function () { mal(new Error('lectura')); };
      fr.readAsDataURL(archivo);
    });
  };

  // Base64 -> Blob (para ver comprobantes sin escribir HTML)
  JF.blobDeBase64 = function (b64, tipo) {
    var bin = atob(b64), n = bin.length, arr = new Uint8Array(n);
    for (var i = 0; i < n; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: tipo });
  };

  // CSV seguro para Excel (evita fórmulas inyectadas en celdas)
  JF.csv = function (filas) {
    return '﻿' + filas.map(function (f) {
      return f.map(function (v) {
        var s = String(v == null ? '' : v);
        if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
        return '"' + s.replace(/"/g, '""') + '"';
      }).join(',');
    }).join('\r\n');
  };
  JF.descargar = function (blob, nombre) {
    var u = URL.createObjectURL(blob);
    var a = JF.el('a', { download: nombre });
    a.href = u; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 30000);
  };

  // Dibuja un código QR (generado localmente, sin servicios externos) en un canvas
  JF.qr = function (canvas, texto) {
    var m = window.JFQR(texto), n = m.length, borde = 4, esc = 6, lado = (n + borde * 2) * esc;
    canvas.width = lado; canvas.height = lado;
    var c = canvas.getContext('2d');
    c.fillStyle = '#fff'; c.fillRect(0, 0, lado, lado); c.fillStyle = '#000';
    for (var y = 0; y < n; y++) for (var x = 0; x < n; x++) if (m[y][x]) c.fillRect((x + borde) * esc, (y + borde) * esc, esc, esc);
  };

  // Pestañas simples: botones con data-tab="idDeSeccion"
  JF.pestanas = function (contenedorId, alCambiar) {
    var botones = JF.$(contenedorId).querySelectorAll('[data-tab]');
    function activar(id) {
      botones.forEach(function (b) {
        var on = b.getAttribute('data-tab') === id;
        b.classList.toggle('on', on); JF.mostrar(b.getAttribute('data-tab'), on);
      });
      if (alCambiar) alCambiar(id);
    }
    botones.forEach(function (b) { b.addEventListener('click', function () { activar(b.getAttribute('data-tab')); }); });
    return activar;
  };

  // Qué hacer cuando el servidor dice que la sesión terminó
  JF.alTerminarSesion = function (f) { finSesion = f; };

  window.JF = Object.freeze(JF);
})();

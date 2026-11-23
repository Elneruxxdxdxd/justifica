/**
 * JustiFica · backend en la nube (Google Apps Script)
 * --------------------------------------------------
 * - Base de datos: una hoja de cálculo privada en tu Google Drive (la crea instalar()).
 * - Comprobantes: carpeta privada en tu Google Drive.
 * - Correos reales: se envían desde tu cuenta de Gmail (MailApp).
 * - API: esta app web (https://script.google.com/macros/s/.../exec), llamada por las páginas de GitHub Pages.
 *
 * Seguridad:
 * - No hay SQL: los datos se guardan como texto en celdas, nunca se ejecutan.
 * - Cada acción valida formato, longitud y permisos (sesión y rol) aquí, en el servidor.
 * - NIP y contraseñas: hash PBKDF2-HMAC-SHA256 con sal y clave secreta (pepper) que solo vive en este proyecto.
 * - Sesiones: token aleatorio de 256 bits; solo se guarda su huella SHA-256 y caduca.
 * - Bloqueo de 15 min tras 5 intentos fallidos por cuenta; mismo mensaje exista o no la cuenta.
 * - Archivos: se revisa el tipo real (firma interna JPG/PNG/PDF) y el tamaño real.
 * - El navegador nunca recibe correos de docentes ni datos internos.
 *
 * PASOS: 1) Ejecuta instalar() una vez.  2) Implementar > Nueva implementación > App web
 *        (Ejecutar como: Yo · Acceso: Cualquier persona).  3) Copia la URL /exec en js/config.js.
 */

// Dirección pública de tus páginas (GitHub Pages), sin «/» al final.
var FRONT_URL = 'https://elneruxxdxdxd.github.io/justifica';

var TZ = 'America/Mexico_City';
var PROPS = PropertiesService.getScriptProperties();
var ITER = 1000;

// ============================ instalación ============================
function instalar() {
  var yo = Session.getEffectiveUser().getEmail();
  if (!yo) throw new Error('No se pudo leer tu correo de Google.');
  var partes = yo.split('@'), mas = function (tag) { return partes[0] + '+' + tag + '@' + partes[1]; };

  var ss = SpreadsheetApp.create('JustiFica · base de datos (privada)');
  var carpeta = DriveApp.createFolder('JustiFica · comprobantes (privado)');
  var nip = String(1000 + Math.floor(aleatorio01() * 9000));
  var passJef = claveAleatoria(), passEv = claveAleatoria();

  PROPS.setProperties({
    LIBRO: ss.getId(), CARPETA: carpeta.getId(), PEPPER: hexAleatorio(32) + hexAleatorio(32), FOLIO_SEQ: '0', EVENTO_SEQ: '0'
  }, false);

  var T = {
    Reglas: ['clave', 'valor', 'descripcion', 'editable'],
    Motivos: ['clave', 'nombre', 'requiere_comprobante', 'revision_siempre', 'requiere_lista', 'orden'],
    Inhabiles: ['fecha', 'descripcion'],
    Docentes: ['id', 'nombre', 'correo'],
    Grupos: ['clave', 'carrera', 'semestre', 'tutor_id'],
    Materias: ['clave', 'nombre'],
    Horario: ['grupo', 'materia_clave', 'docente_id', 'dia_semana', 'hora_inicio', 'hora_fin'],
    Alumnos: ['num_control', 'nombre', 'correo', 'grupo', 'nip_hash', 'activo'],
    Usuarios: ['correo', 'nombre', 'rol', 'pass_hash', 'activo'],
    Solicitudes: ['folio', 'codigo_acceso', 'num_control', 'motivo', 'fecha_inicio', 'fecha_fin', 'descripcion', 'archivo_id',
      'archivo_nombre', 'archivo_tipo', 'estado', 'regla_revision', 'evento_id', 'creada_en', 'resuelta_en', 'resuelta_por', 'comentario'],
    SolicitudMaterias: ['folio', 'fecha', 'materia_clave', 'docente_id'],
    Eventos: ['id', 'nombre', 'area', 'fecha_inicio', 'fecha_fin', 'cargado_por', 'creado_en'],
    EventoAsistentes: ['evento_id', 'num_control'],
    AlertasTutor: ['num_control', 'periodo', 'total', 'enviada_en'],
    Bitacora: ['ts', 'actor', 'accion', 'folio', 'detalle']
  };
  var primera = ss.getSheets()[0];
  Object.keys(T).forEach(function (n, i) {
    var sh = i === 0 ? primera.setName(n) : ss.insertSheet(n);
    sh.getRange(1, 1, sh.getMaxRows(), Math.max(T[n].length, 1)).setNumberFormat('@');   // todo como texto
    sh.getRange(1, 1, 1, T[n].length).setValues([T[n]]).setFontWeight('bold');
    sh.setFrozenRows(1);
  });
  _cacheTablas = {};

  var r = function (c, v, d, e) { return { clave: c, valor: v, descripcion: d, editable: e ? '1' : '0' }; };
  agregarVarios('Reglas', [
    r('plazo_dias_habiles', '5', 'Días hábiles para pedir el justificante después del último día de falta', true),
    r('max_dias_sin_revision', '3', 'Días hábiles máximos por solicitud sin pasar a revisión', true),
    r('umbral_alerta_tutor', '3', 'Justificantes en el periodo a partir de los cuales se avisa al tutor', true),
    r('max_archivo_kb', '5120', 'Tamaño máximo del comprobante en KB', true),
    r('correo_jefatura', mas('jefatura'), 'Correo que recibe los casos en revisión y el reporte mensual', true),
    r('periodo', 'AGO-DIC 2026', 'Nombre del periodo escolar', true),
    r('periodo_inicio', '2026-08-24', 'Primer día de clases (AAAA-MM-DD)', true),
    r('periodo_fin', '2026-12-11', 'Último día de clases (AAAA-MM-DD)', true),
    r('front_url', FRONT_URL, 'Dirección pública del sitio', false),
    r('fecha_simulada', '', 'Solo pruebas: fecha AAAA-MM-DD usada como hoy', false)
  ]);
  agregarVarios('Motivos', [
    { clave: 'salud', nombre: 'Salud', requiere_comprobante: '1', revision_siempre: '0', requiere_lista: '0', orden: '1' },
    { clave: 'evento', nombre: 'Evento del Tec', requiere_comprobante: '0', revision_siempre: '0', requiere_lista: '1', orden: '2' },
    { clave: 'tramite', nombre: 'Trámite oficial', requiere_comprobante: '1', revision_siempre: '0', requiere_lista: '0', orden: '3' },
    { clave: 'otro', nombre: 'Otro motivo', requiere_comprobante: '0', revision_siempre: '1', requiere_lista: '0', orden: '4' }
  ]);
  agregarVarios('Inhabiles', [
    { fecha: '2026-09-16', descripcion: 'Día de la Independencia' },
    { fecha: '2026-11-02', descripcion: 'Día de Muertos' },
    { fecha: '2026-11-16', descripcion: 'Aniversario de la Revolución (lunes)' }
  ]);
  agregarVarios('Docentes', [
    ['1', 'Mtra. Laura Méndez Ríos', 'docente-a'], ['2', 'Ing. Óscar Salinas Vega', 'docente-b'],
    ['3', 'Dra. Patricia Lozano Ibarra', 'docente-c'], ['4', 'Lic. Karen Ortiz Medina', 'docente-d'],
    ['5', 'Ing. Jorge Castañeda Ruiz', 'docente-e'], ['6', 'Mtro. Ramón Esquivel Torres', 'docente-f'],
    ['7', 'Ing. Elena Navarro Juárez', 'docente-g'], ['8', 'Mtro. Héctor Villa Arriaga', 'tutor-isc'],
    ['9', 'Mtra. Rosa Delgado Cano', 'tutor-ind']
  ].map(function (d) { return { id: d[0], nombre: d[1], correo: mas(d[2]) }; }));
  agregarVarios('Grupos', [
    { clave: 'ISC-5A', carrera: 'Ingeniería en Sistemas Computacionales', semestre: '5', tutor_id: '8' },
    { clave: 'IND-3B', carrera: 'Ingeniería Industrial', semestre: '3', tutor_id: '9' },
    { clave: 'CIV-7A', carrera: 'Ingeniería Civil', semestre: '7', tutor_id: '9' }
  ]);
  agregarVarios('Materias', [
    ['SCC-1007', 'Fundamentos de Ingeniería de Software'], ['ACF-0904', 'Cálculo Vectorial'], ['ACA-0909', 'Taller de Investigación I'],
    ['ING-0004', 'Inglés IV'], ['AEC-1061', 'Sistemas Operativos'], ['AEF-1052', 'Estadística Inferencial'], ['CIC-1009', 'Mecánica de Materiales']
  ].map(function (m) { return { clave: m[0], nombre: m[1] }; }));
  agregarVarios('Horario', [
    ['ISC-5A', 'SCC-1007', 1, 1, '07:00'], ['ISC-5A', 'SCC-1007', 1, 3, '07:00'], ['ISC-5A', 'SCC-1007', 1, 5, '07:00'],
    ['ISC-5A', 'ACF-0904', 2, 1, '08:00'], ['ISC-5A', 'ACF-0904', 2, 2, '08:00'], ['ISC-5A', 'ACF-0904', 2, 4, '08:00'],
    ['ISC-5A', 'ACA-0909', 3, 2, '09:00'], ['ISC-5A', 'ACA-0909', 3, 4, '09:00'],
    ['ISC-5A', 'ING-0004', 4, 1, '10:00'], ['ISC-5A', 'ING-0004', 4, 2, '10:00'], ['ISC-5A', 'ING-0004', 4, 3, '10:00'],
    ['ISC-5A', 'AEC-1061', 5, 3, '11:00'], ['ISC-5A', 'AEC-1061', 5, 5, '11:00'],
    ['IND-3B', 'AEF-1052', 6, 1, '07:00'], ['IND-3B', 'AEF-1052', 6, 3, '07:00'],
    ['IND-3B', 'ACF-0904', 2, 2, '07:00'], ['IND-3B', 'ACF-0904', 2, 4, '07:00'], ['IND-3B', 'ING-0004', 4, 5, '09:00'],
    ['CIV-7A', 'CIC-1009', 7, 1, '12:00'], ['CIV-7A', 'CIC-1009', 7, 3, '12:00'],
    ['CIV-7A', 'AEF-1052', 6, 2, '12:00'], ['CIV-7A', 'ING-0004', 4, 4, '12:00']
  ].map(function (h) { return { grupo: h[0], materia_clave: h[1], docente_id: String(h[2]), dia_semana: String(h[3]), hora_inicio: h[4], hora_fin: '' }; }));
  agregarVarios('Alumnos', [
    ['24660001', 'Daniela Ruiz Torres', 'ISC-5A'], ['24660002', 'Luis Ángel Pérez Soto', 'ISC-5A'],
    ['24660003', 'Fernanda Ibarra Gómez', 'ISC-5A'], ['24660004', 'Kevin Rangel Montoya', 'ISC-5A'],
    ['25660011', 'Mariana Solís Herrera', 'IND-3B'], ['25660012', 'Diego Contreras Lara', 'IND-3B'],
    ['25660013', 'Valeria Moreno Ávila', 'IND-3B'], ['23660021', 'Ricardo Treviño Salazar', 'CIV-7A'],
    ['23660022', 'Paola Guerrero Núñez', 'CIV-7A'], ['23660023', 'Andrés Becerra Olvera', 'CIV-7A']
  ].map(function (a) { return { num_control: a[0], nombre: a[1], correo: mas('a' + a[0]), grupo: a[2], nip_hash: hashSecreto(nip), activo: '1' }; }));
  var cJef = mas('jefatura').toLowerCase(), cEv = mas('eventos').toLowerCase();
  agregarVarios('Usuarios', [
    { correo: cJef, nombre: 'Jefatura de División', rol: 'JEFATURA', pass_hash: hashSecreto(passJef), activo: '1' },
    { correo: cEv, nombre: 'Actividades Extraescolares', rol: 'EVENTOS', pass_hash: hashSecreto(passEv), activo: '1' }
  ]);

  // Tareas automáticas
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('tareaRecordatorio').timeBased().everyDays(1).atHour(8).inTimezone(TZ).create();
  ScriptApp.newTrigger('tareaReporteMensual').timeBased().onMonthDay(1).atHour(8).inTimezone(TZ).create();

  var datos = [
    'Páginas: ' + FRONT_URL + '/',
    'Alumnos (NIP de todos: ' + nip + '): 24660001 a 24660004, 25660011 a 25660013, 23660021 a 23660023',
    'Jefatura: ' + cJef + '  /  ' + passJef + '   (' + FRONT_URL + '/jefatura.html)',
    'Eventos:  ' + cEv + '  /  ' + passEv + '   (' + FRONT_URL + '/eventos.html)',
    'Base de datos: ' + ss.getUrl()
  ];
  MailApp.sendEmail({ to: yo, subject: 'JustiFica instalado · accesos de la demostración', name: 'JustiFica',
    htmlBody: correoHtml('JustiFica quedó instalado', datos.map(esc).concat(['Todos los correos de alumnos, docentes y jefatura llegarán a este buzón (con «+» en la dirección).'])) });
  Logger.log(datos.join('\n'));
  return datos;
}

// ============================ entrada web ============================
function doGet() { return salida({ ok: true, servicio: 'JustiFica' }); }

function doPost(e) {
  var body = {};
  try {
    if (e && e.postData && e.postData.contents && e.postData.contents.length <= 10 * 1048576) {
      var b = JSON.parse(e.postData.contents);
      if (b && typeof b === 'object' && !Array.isArray(b)) body = b;
    }
  } catch (err) { body = {}; }
  var accion = typeof body.accion === 'string' && ACCIONES.hasOwnProperty(body.accion) ? body.accion : null;
  if (!accion) return salida(error('PETICION', 'Petición no válida.'));
  var r, lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    _cacheTablas = {};
    r = ACCIONES[accion](body);
  } catch (err) {
    try { log('sistema', 'ERROR', null, { accion: accion, error: String(err && err.message || err).slice(0, 300) }); } catch (e2) { /* nada */ }
    r = error('INTERNO', 'Ocurrió un error. Intenta de nuevo en un momento.');
  } finally {
    try { lock.releaseLock(); } catch (e3) { /* nada */ }
  }
  var respuesta = r.respuesta || r;
  if (r.interno) { try { enviarCorreos(r.interno); } catch (err) { log('sistema', 'ERROR_CORREO', null, { error: String(err.message || err).slice(0, 300) }); } }
  return salida(respuesta);
}

function salida(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

var ACCIONES = {
  config: accConfig, login_alumno: accLoginAlumno, login_admin: accLoginAdmin, logout: accLogout,
  registrar: accRegistrar, mis_solicitudes: accMisSolicitudes, justificante: accJustificante, verificar: accVerificar,
  panel: accPanel, revisar: accRevisar, comprobante: accComprobante, expediente: accExpediente, reglas: accGuardarReglas, reporte: accReporte, evento: accEvento
};

// ============================ tablas (hoja de cálculo) ============================
var _cacheTablas = {};
function libro() { return SpreadsheetApp.openById(PROPS.getProperty('LIBRO')); }
function txt(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}
function leer(n) {
  if (_cacheTablas[n]) return _cacheTablas[n];
  var v = libro().getSheetByName(n).getDataRange().getValues(), cab = v[0];
  var filas = [];
  for (var i = 1; i < v.length; i++) {
    if (!v[i].some(function (x) { return x !== '' && x !== null; })) continue;
    var o = { _fila: i + 1 };
    for (var j = 0; j < cab.length; j++) o[cab[j]] = txt(v[i][j]);
    filas.push(o);
  }
  _cacheTablas[n] = filas;
  return filas;
}
function cabecera(sh) { return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0]; }
function agregarVarios(n, objs) {
  if (!objs.length) return;
  var sh = libro().getSheetByName(n), cab = cabecera(sh), ini = sh.getLastRow() + 1;
  var vals = objs.map(function (o) { return cab.map(function (c) { return o[c] == null ? '' : String(o[c]); }); });
  if (sh.getMaxRows() < ini + vals.length) sh.insertRowsAfter(sh.getMaxRows(), ini + vals.length - sh.getMaxRows() + 100);
  var rango = sh.getRange(ini, 1, vals.length, cab.length);
  rango.setNumberFormat('@');
  rango.setValues(vals);
  delete _cacheTablas[n];
}
function agregar(n, obj) { agregarVarios(n, [obj]); }
function actualizar(n, fila, cambios) {
  var sh = libro().getSheetByName(n), cab = cabecera(sh);
  Object.keys(cambios).forEach(function (k) {
    var c = cab.indexOf(k);
    if (c >= 0) sh.getRange(fila, c + 1).setNumberFormat('@').setValue(cambios[k] == null ? '' : String(cambios[k]));
  });
  delete _cacheTablas[n];
}
function buscar(n, f) { var t = leer(n); for (var i = 0; i < t.length; i++) if (f(t[i])) return t[i]; return null; }
function regla(clave) { var r = buscar('Reglas', function (x) { return x.clave === clave; }); return r ? r.valor : ''; }
function log(actor, accion, folio, detalle) {
  agregar('Bitacora', { ts: new Date().toISOString(), actor: actor, accion: accion, folio: folio || '', detalle: detalle ? JSON.stringify(detalle).slice(0, 1000) : '' });
}
function siguiente(prop) { var n = Number(PROPS.getProperty(prop) || '0') + 1; PROPS.setProperty(prop, String(n)); return n; }

// ============================ utilidades ============================
function error(regla_, mensaje) { return { respuesta: { ok: false, regla: regla_, mensaje: mensaje } }; }
function resp(respuesta, interno) { return { respuesta: respuesta, interno: interno || null }; }
function texto(p, campo, max) {
  var v = p[campo];
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  v = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return v === '' ? null : v;
}
function fecha(p, campo) {
  var v = p[campo];
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  var d = new Date(v + 'T00:00:00Z');
  return isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v ? null : v;
}
function dUTC(s) { return new Date(s + 'T00:00:00Z'); }
function sumarDias(s, n) { var d = dUTC(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function isodow(s) { var d = dUTC(s).getUTCDay(); return d === 0 ? 7 : d; }
function diasEntre(a, b) { return Math.round((dUTC(b) - dUTC(a)) / 86400000); }
function esHabil(s) {
  var w = isodow(s);
  return w >= 1 && w <= 5 && !buscar('Inhabiles', function (x) { return x.fecha === s; });
}
function habilesEntre(desde, hasta) { var n = 0; for (var d = sumarDias(desde, 1); d <= hasta; d = sumarDias(d, 1)) if (esHabil(d)) n++; return n; }
function habilesRango(ini, fin) { var n = 0; for (var d = ini; d <= fin; d = sumarDias(d, 1)) if (esHabil(d)) n++; return n; }
function hoy() { var f = regla('fecha_simulada'); return /^\d{4}-\d{2}-\d{2}$/.test(f) ? f : Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
function fechaTxt(s) { return s ? s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4) : ''; }
function rangoTxt(a, b) { return fechaTxt(a) + (b > a ? ' al ' + fechaTxt(b) : ''); }
function horaTxt(iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'dd/MM/yyyy HH:mm') : null; }
function mesDe(iso) { return iso ? Utilities.formatDate(new Date(iso), TZ, 'yyyy-MM') : ''; }
function seSolapan(a1, a2, b1, b2) { return a1 <= b2 && b1 <= a2; }
function esc(v) { return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }

// ---------- criptografía ----------
function hex(bytes) { return bytes.map(function (b) { return ((b + 256) % 256).toString(16); }).map(function (h) { return h.length < 2 ? '0' + h : h; }).join(''); }
function sha256(s) { return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function hexAleatorio(n) { var s = ''; while (s.length < n) s += Utilities.getUuid().replace(/-/g, '').slice(0, 12) + sha256(Utilities.getUuid() + Math.random()).slice(0, 8); return s.slice(0, n); }
function aleatorio01() { return parseInt(hexAleatorio(8), 16) / 0x100000000; }
function claveAleatoria() {
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', s = '';
  for (var i = 0; i < 12; i++) s += abc.charAt(Math.floor(aleatorio01() * abc.length));
  return s + '#' + String(10 + Math.floor(aleatorio01() * 90));
}
function derivar(secreto, sal, iter) {
  var clave = Utilities.newBlob(PROPS.getProperty('PEPPER') + secreto).getBytes();
  var u = Utilities.computeHmacSha256Signature(Utilities.newBlob(sal).getBytes(), clave), t = u.slice();
  for (var i = 1; i < iter; i++) {
    u = Utilities.computeHmacSha256Signature(u, clave);
    for (var j = 0; j < t.length; j++) t[j] ^= u[j];
  }
  return hex(t);
}
function hashSecreto(secreto) { var sal = hexAleatorio(32); return 'pbk$' + ITER + '$' + sal + '$' + derivar(secreto, sal, ITER); }
function verificarSecreto(secreto, guardado) {
  var p = String(guardado || '').split('$');
  if (p.length !== 4 || p[0] !== 'pbk') { derivar(secreto, 'x', ITER); return false; }   // mismo tiempo exista o no
  var calc = derivar(secreto, p[2], Number(p[1])), dif = calc.length ^ p[3].length;
  for (var i = 0; i < calc.length && i < p[3].length; i++) dif |= calc.charCodeAt(i) ^ p[3].charCodeAt(i);
  return dif === 0;
}

// ---------- sesiones (caché del servidor, caducan solas) ----------
var CACHE = CacheService.getScriptCache();
function bloqueado(sujeto) { return Number(CACHE.get('int:' + sha256(sujeto)) || '0') >= 5; }
function fallo(sujeto) { var k = 'int:' + sha256(sujeto); CACHE.put(k, String(Number(CACHE.get(k) || '0') + 1), 900); }
function crearSesion(sujeto, rol, minutos) {
  var token = hexAleatorio(64);
  CACHE.put('ses:' + sha256(token), JSON.stringify({ sujeto: sujeto, rol: rol }), minutos * 60);
  return token;
}
function sesion(p, roles) {
  if (typeof p.token !== 'string' || !/^[0-9a-f]{64}$/.test(p.token)) return null;
  var s = CACHE.get('ses:' + sha256(p.token));
  if (!s) return null;
  s = JSON.parse(s);
  return roles.indexOf(s.rol) >= 0 ? s : null;
}
var SIN_SESION = function () { return error('SESION', 'Tu sesión terminó. Vuelve a entrar.'); };

// ============================ acciones ============================
function accConfig() {
  return resp({ ok: true, periodo: regla('periodo'), plazo: regla('plazo_dias_habiles'), max_kb: Number(regla('max_archivo_kb')), hoy: hoy(),
    motivos: leer('Motivos').slice().sort(function (a, b) { return a.orden - b.orden; })
      .map(function (m) { return { clave: m.clave, nombre: m.nombre, requiere_comprobante: m.requiere_comprobante === '1' }; }) });
}

function accLoginAlumno(p) {
  var num = String(p.num_control || '').trim().toUpperCase(), nip = String(p.nip || '');
  if (!/^[A-Z]?[0-9]{8}$/.test(num) || !/^[0-9]{4,6}$/.test(nip)) return error('CREDENCIALES', 'Escribe tu número de control (8 dígitos) y tu NIP.');
  if (bloqueado(num)) return error('BLOQUEO', 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.');
  var a = buscar('Alumnos', function (x) { return x.num_control === num && x.activo === '1'; });
  var ok = verificarSecreto(nip, a ? a.nip_hash : '');
  if (!a || !ok) { fallo(num); return error('CREDENCIALES', 'Número de control o NIP incorrectos.'); }
  log(num, 'LOGIN_ALUMNO');
  return resp({ ok: true, token: crearSesion(num, 'ALUMNO', 30), nombre: a.nombre, grupo: a.grupo, minutos: 30 });
}

function accLoginAdmin(p) {
  var correo = String(p.correo || '').trim().toLowerCase(), pass = typeof p.password === 'string' ? p.password : '';
  if (correo.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo) || pass.length < 1 || pass.length > 200) return error('CREDENCIALES', 'Escribe tu correo y tu contraseña.');
  if (bloqueado(correo)) return error('BLOQUEO', 'Demasiados intentos fallidos. Espera 15 minutos e intenta de nuevo.');
  var u = buscar('Usuarios', function (x) { return x.correo === correo && x.activo === '1'; });
  var ok = verificarSecreto(pass, u ? u.pass_hash : '');
  if (!u || !ok) { fallo(correo); return error('CREDENCIALES', 'Correo o contraseña incorrectos.'); }
  log(correo, 'LOGIN_' + u.rol);
  return resp({ ok: true, token: crearSesion(correo, u.rol, 360), nombre: u.nombre, rol: u.rol, minutos: 360 });
}

function accLogout(p) {
  if (typeof p.token === 'string' && /^[0-9a-f]{64}$/.test(p.token)) CACHE.remove('ses:' + sha256(p.token));
  return resp({ ok: true });
}

// ---------- cruce con horario y detalle ----------
function materiasAfectadas(num, ini, fin) {
  var a = buscar('Alumnos', function (x) { return x.num_control === num; });
  if (!a) return [];
  var out = [], vistos = {};
  for (var d = ini; d <= fin; d = sumarDias(d, 1)) {
    if (!esHabil(d)) continue;
    var w = String(isodow(d));
    leer('Horario').forEach(function (h) {
      var k = d + '|' + h.materia_clave + '|' + h.docente_id;
      if (h.grupo === a.grupo && h.dia_semana === w && !vistos[k]) { vistos[k] = 1; out.push({ fecha: d, materia_clave: h.materia_clave, docente_id: h.docente_id }); }
    });
  }
  return out;
}
function solicitud(folio) { return buscar('Solicitudes', function (x) { return x.folio === folio; }); }
function detalle(folio) {
  var s = solicitud(folio), a = buscar('Alumnos', function (x) { return x.num_control === s.num_control; });
  var g = buscar('Grupos', function (x) { return x.clave === a.grupo; }), m = buscar('Motivos', function (x) { return x.clave === s.motivo; });
  var mats = {}, docs = {};
  leer('Materias').forEach(function (x) { mats[x.clave] = x.nombre; });
  leer('Docentes').forEach(function (x) { docs[x.id] = x; });
  var filas = leer('SolicitudMaterias').filter(function (x) { return x.folio === folio; })
    .map(function (x) { return { fecha: x.fecha, materia: mats[x.materia_clave], docente: docs[x.docente_id] }; })
    .sort(function (x, y) { return x.fecha < y.fecha ? -1 : x.fecha > y.fecha ? 1 : x.materia.localeCompare(y.materia); });
  var avisos = [], porDoc = {};
  filas.forEach(function (f) {
    var k = f.docente.id;
    if (!porDoc[k]) { porDoc[k] = { docente: f.docente.nombre, correo: f.docente.correo, partes: [] }; avisos.push(porDoc[k]); }
    porDoc[k].partes.push(f.materia + ' (' + f.fecha.slice(8, 10) + '/' + f.fecha.slice(5, 7) + ')');
  });
  return {
    folio: s.folio, codigo: s.codigo_acceso, estado: s.estado, motivo: m.nombre, fechas: rangoTxt(s.fecha_inicio, s.fecha_fin),
    regla_revision: s.regla_revision || null, comentario: s.comentario || null, creada_en: horaTxt(s.creada_en), resuelta_en: horaTxt(s.resuelta_en),
    front_url: regla('front_url'), correo_jefatura: regla('correo_jefatura'),
    alumno: { num_control: a.num_control, nombre: a.nombre, correo: a.correo, grupo: a.grupo, carrera: g.carrera, semestre: Number(g.semestre) },
    materias: filas.map(function (f) { return { fecha: fechaTxt(f.fecha), materia: f.materia, docente: f.docente.nombre }; }),
    avisos: avisos.map(function (v) { return { docente: v.docente, correo: v.correo, detalle: v.partes.join(', ') }; })
  };
}
function vistaAlumno(d) {
  var al = { num_control: d.alumno.num_control, nombre: d.alumno.nombre, grupo: d.alumno.grupo, carrera: d.alumno.carrera, semestre: d.alumno.semestre };
  return { ok: true, folio: d.folio, codigo: d.codigo, estado: d.estado, motivo: d.motivo, fechas: d.fechas, regla_revision: d.regla_revision,
    comentario: d.comentario, emitido_en: d.resuelta_en, alumno: al, materias: d.materias, avisos: d.avisos.length };
}
function emitir(folio, actor) {
  var s = solicitud(folio);
  agregarVarios('SolicitudMaterias', materiasAfectadas(s.num_control, s.fecha_inicio, s.fecha_fin)
    .map(function (f) { return { folio: folio, fecha: f.fecha, materia_clave: f.materia_clave, docente_id: f.docente_id }; }));
  actualizar('Solicitudes', s._fila, { estado: 'EMITIDO', resuelta_en: new Date().toISOString(), resuelta_por: actor });
  log(actor, 'EMITIDO', folio);
  var periodo = regla('periodo'), pi = regla('periodo_inicio'), pf = regla('periodo_fin');
  var total = leer('Solicitudes').filter(function (x) { return x.num_control === s.num_control && x.estado === 'EMITIDO' && x.fecha_inicio >= pi && x.fecha_inicio <= pf; }).length;
  var alerta = null;
  if (total >= Number(regla('umbral_alerta_tutor')) && !buscar('AlertasTutor', function (x) { return x.num_control === s.num_control && x.periodo === periodo; })) {
    agregar('AlertasTutor', { num_control: s.num_control, periodo: periodo, total: String(total), enviada_en: new Date().toISOString() });
    log('sistema', 'ALERTA_TUTOR', folio, { total: total });
    var a = buscar('Alumnos', function (x) { return x.num_control === s.num_control; });
    var g = buscar('Grupos', function (x) { return x.clave === a.grupo; }), t = buscar('Docentes', function (x) { return x.id === g.tutor_id; });
    alerta = { tutor: t.nombre, correo: t.correo, alumno: a.nombre, num_control: a.num_control, grupo: a.grupo, total: total, periodo: periodo };
  }
  var d = detalle(folio); d.alerta_tutor = alerta;
  return d;
}
function duplicado(num, ini, fin) {
  var s = buscar('Solicitudes', function (x) { return x.num_control === num && (x.estado === 'EMITIDO' || x.estado === 'EN_REVISION') && seSolapan(x.fecha_inicio, x.fecha_fin, ini, fin); });
  return s ? s.folio : null;
}
function nuevoFolio() { var n = String(siguiente('FOLIO_SEQ')); while (n.length < 4) n = '0' + n; return 'JF-' + hoy().slice(0, 4) + '-' + n; }

// ---------- registrar solicitud ----------
function accRegistrar(p) {
  var ses = sesion(p, ['ALUMNO']);
  if (!ses) return error('SESION', 'Tu sesión terminó. Vuelve a entrar con tu número de control y NIP.');
  var a = buscar('Alumnos', function (x) { return x.num_control === ses.sujeto && x.activo === '1'; });
  if (!a) return error('SESION', 'Tu cuenta no está activa.');
  var m = buscar('Motivos', function (x) { return x.clave === p.motivo; });
  if (!m) return error('MOTIVO', 'Elige por qué faltaste.');
  var ini = fecha(p, 'fecha_inicio'), fin = fecha(p, 'fecha_fin') || ini, h = hoy();
  if (!ini) return error('FECHAS', 'Escribe la fecha de tu falta.');
  if (fin < ini) return error('FECHAS', 'La fecha final no puede ser anterior a la inicial.');
  if (fin > h) return error('FECHAS', 'Solo puedes justificar faltas de hoy o de días anteriores.');
  if (ini < regla('periodo_inicio') || fin > regla('periodo_fin')) return error('FECHAS', 'Las fechas deben estar dentro del periodo ' + regla('periodo') + '.');
  var desc = texto(p, 'descripcion', 500);

  // Comprobante: tamaño real y tipo real (firma del archivo)
  var max = Number(regla('max_archivo_kb')) * 1024, bytes = null, tipo = null, nombre = null;
  var arch = p.archivo && typeof p.archivo === 'object' ? p.archivo : null;
  if (arch && typeof arch.b64 === 'string' && arch.b64 !== '') {
    var mb = Math.round(max / 1048576);
    if (arch.b64.length > (Math.floor(max / 3) + 2) * 4) return error('ARCHIVO', 'El comprobante pesa más de ' + mb + ' MB. Toma la foto con menor resolución.');
    if (!/^[A-Za-z0-9+/=]+$/.test(arch.b64)) return error('ARCHIVO', 'No se pudo leer el comprobante. Vuelve a subirlo.');
    try { bytes = Utilities.base64Decode(arch.b64); } catch (e) { return error('ARCHIVO', 'No se pudo leer el comprobante. Vuelve a subirlo.'); }
    if (bytes.length > max) return error('ARCHIVO', 'El comprobante pesa más de ' + mb + ' MB.');
    var u = bytes.slice(0, 8).map(function (b) { return (b + 256) % 256; });
    if (u[0] === 0x25 && u[1] === 0x50 && u[2] === 0x44 && u[3] === 0x46) tipo = 'application/pdf';
    else if (u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff) tipo = 'image/jpeg';
    else if ([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(function (v, i) { return u[i] === v; })) tipo = 'image/png';
    else return error('ARCHIVO', 'El comprobante debe ser una foto JPG o PNG, o un PDF.');
    nombre = String(arch.nombre || 'comprobante').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
  }
  if (m.requiere_comprobante === '1' && !bytes) return error('COMPROBANTE', 'Para el motivo «' + m.nombre + '» necesitas subir tu comprobante (foto o PDF).');

  var dup = duplicado(a.num_control, ini, fin);
  if (dup) return error('DUPLICADO', 'Ya tienes la solicitud ' + dup + ' para esas fechas.');
  if (!materiasAfectadas(a.num_control, ini, fin).length) return error('SIN_CLASES', 'No tienes clases registradas en esas fechas.');

  var reglaRev = null, evento = null;
  if (m.requiere_lista === '1') {
    var evs = leer('Eventos').filter(function (e) { return e.fecha_inicio <= ini && e.fecha_fin >= fin && buscar('EventoAsistentes', function (x) { return x.evento_id === e.id && x.num_control === a.num_control; }); });
    if (evs.length) evento = evs[evs.length - 1].id; else reglaRev = 'Tu nombre no está en una lista oficial de evento para esas fechas';
  }
  if (!reglaRev && m.revision_siempre === '1') reglaRev = 'El motivo «Otro» siempre lo revisa la jefatura';
  if (!reglaRev && habilesEntre(fin, h) > Number(regla('plazo_dias_habiles'))) reglaRev = 'Fuera de plazo (más de ' + regla('plazo_dias_habiles') + ' días hábiles después de la falta)';
  if (!reglaRev && habilesRango(ini, fin) > Number(regla('max_dias_sin_revision'))) reglaRev = 'Más de ' + regla('max_dias_sin_revision') + ' días hábiles en una sola solicitud';

  var folio = nuevoFolio(), archivoId = '';
  if (bytes) archivoId = DriveApp.getFolderById(PROPS.getProperty('CARPETA')).createFile(Utilities.newBlob(bytes, tipo, folio + '_' + nombre)).getId();
  agregar('Solicitudes', { folio: folio, codigo_acceso: hexAleatorio(32), num_control: a.num_control, motivo: m.clave, fecha_inicio: ini, fecha_fin: fin,
    descripcion: desc || '', archivo_id: archivoId, archivo_nombre: nombre || '', archivo_tipo: tipo || '', estado: 'EN_REVISION',
    regla_revision: reglaRev || '', evento_id: evento || '', creada_en: new Date().toISOString() });
  log(a.num_control, 'SOLICITUD', folio, { motivo: m.clave, regla_revision: reglaRev });
  var d = reglaRev ? detalle(folio) : emitir(folio, 'sistema');
  d.tipo = reglaRev ? 'REVISION' : 'EMITIDO';
  return resp(vistaAlumno(d), d);
}

function accMisSolicitudes(p) {
  var ses = sesion(p, ['ALUMNO']);
  if (!ses) return SIN_SESION();
  var motivos = {}; leer('Motivos').forEach(function (m) { motivos[m.clave] = m.nombre; });
  var lista = leer('Solicitudes').filter(function (s) { return s.num_control === ses.sujeto; })
    .sort(function (a, b) { return a.creada_en < b.creada_en ? 1 : -1; })
    .map(function (s) { return { folio: s.folio, codigo: s.estado === 'EMITIDO' ? s.codigo_acceso : null, estado: s.estado, motivo: motivos[s.motivo],
      fechas: rangoTxt(s.fecha_inicio, s.fecha_fin), regla_revision: s.regla_revision || null, comentario: s.comentario || null }; });
  return resp({ ok: true, solicitudes: lista });
}

function accJustificante(p) {
  var folio = String(p.folio || '').trim().toUpperCase();
  var s = buscar('Solicitudes', function (x) { return x.folio === folio && x.estado === 'EMITIDO'; });
  var no = error('FOLIO', 'No encontramos un justificante emitido con esos datos.');
  if (!s) return no;
  var ses = sesion(p, ['ALUMNO']);
  var porCodigo = typeof p.codigo === 'string' && p.codigo.length === 32 && p.codigo === s.codigo_acceso;
  if (!porCodigo && !(ses && ses.sujeto === s.num_control)) return no;
  var v = vistaAlumno(detalle(s.folio)); v.front_url = regla('front_url');
  return resp(v);
}

function accVerificar(p) {
  var folio = String(p.folio || '').trim().toUpperCase();
  var s = /^JF-[0-9]{4}-[0-9]{4,7}$/.test(folio) ? solicitud(folio) : null;
  if (!s) return resp({ ok: true, encontrado: false });
  var a = buscar('Alumnos', function (x) { return x.num_control === s.num_control; }), m = buscar('Motivos', function (x) { return x.clave === s.motivo; });
  return resp({ ok: true, encontrado: true, valido: s.estado === 'EMITIDO', estado: s.estado, folio: s.folio,
    alumno: a.nombre.charAt(0) + '•••••• (' + a.num_control.slice(0, 2) + '••••' + a.num_control.slice(-2) + ')',
    grupo: a.grupo, motivo: m.nombre, fechas: rangoTxt(s.fecha_inicio, s.fecha_fin), emitido_en: horaTxt(s.resuelta_en) });
}

// ---------- jefatura ----------
function accRevisar(p) {
  var ses = sesion(p, ['JEFATURA']);
  if (!ses) return SIN_SESION();
  var s = solicitud(String(p.folio || ''));
  if (!s) return error('FOLIO', 'No existe ese folio.');
  if (s.estado !== 'EN_REVISION') return error('ESTADO', 'Ese folio ya fue resuelto.');
  var com = texto(p, 'comentario', 300), d;
  if (p.decision === 'RECHAZAR') {
    if (!com) return error('COMENTARIO', 'Para rechazar escribe el motivo; el alumno lo recibirá por correo.');
    actualizar('Solicitudes', s._fila, { estado: 'RECHAZADO', comentario: com, resuelta_en: new Date().toISOString(), resuelta_por: ses.sujeto });
    log(ses.sujeto, 'RECHAZADO', s.folio, { comentario: com });
    d = detalle(s.folio); d.tipo = 'RECHAZO';
    return resp({ ok: true, folio: s.folio, estado: 'RECHAZADO' }, d);
  }
  if (p.decision === 'APROBAR') {
    actualizar('Solicitudes', s._fila, { comentario: com || '' });
    log(ses.sujeto, 'APROBADO', s.folio, { comentario: com });
    d = emitir(s.folio, ses.sujeto); d.tipo = 'EMITIDO';
    return resp({ ok: true, folio: s.folio, estado: 'EMITIDO', avisos: d.avisos.length }, d);
  }
  return error('DECISION', 'Decisión no válida.');
}

function accPanel(p) {
  var ses = sesion(p, ['JEFATURA']);
  if (!ses) return SIN_SESION();
  var mes = mesDe(new Date().toISOString()), S = leer('Solicitudes');
  var alumnos = {}, motivos = {};
  leer('Alumnos').forEach(function (a) { alumnos[a.num_control] = a; });
  leer('Motivos').forEach(function (m) { motivos[m.clave] = m.nombre; });
  var auto = S.filter(function (s) { return s.estado === 'EMITIDO' && !s.regla_revision; });
  var seg = auto.length ? auto.reduce(function (t, s) { return t + (new Date(s.resuelta_en) - new Date(s.creada_en)) / 1000; }, 0) / auto.length : 0;
  var porFecha = function (a, b) { return a.creada_en < b.creada_en ? -1 : 1; };
  return resp({ ok: true,
    kpis: {
      emitidos_mes: S.filter(function (s) { return s.estado === 'EMITIDO' && mesDe(s.resuelta_en) === mes; }).length,
      en_revision: S.filter(function (s) { return s.estado === 'EN_REVISION'; }).length,
      rechazados_mes: S.filter(function (s) { return s.estado === 'RECHAZADO' && mesDe(s.resuelta_en) === mes; }).length,
      alertas_tutor: leer('AlertasTutor').filter(function (x) { return x.periodo === regla('periodo'); }).length,
      seg_emision: Math.round(seg * 100) / 100
    },
    pendientes: S.filter(function (s) { return s.estado === 'EN_REVISION'; }).sort(porFecha).map(function (s) {
      var a = alumnos[s.num_control];
      return { folio: s.folio, alumno: a.nombre, num_control: a.num_control, grupo: a.grupo, motivo: motivos[s.motivo], fechas: rangoTxt(s.fecha_inicio, s.fecha_fin),
        regla: s.regla_revision, descripcion: s.descripcion || null, tiene_archivo: !!s.archivo_id, creada_en: horaTxt(s.creada_en) };
    }),
    recientes: S.slice().sort(porFecha).reverse().slice(0, 30).map(function (s) {
      var a = alumnos[s.num_control];
      return { folio: s.folio, alumno: a.nombre, grupo: a.grupo, motivo: motivos[s.motivo], estado: s.estado, fechas: rangoTxt(s.fecha_inicio, s.fecha_fin),
        descripcion: s.descripcion || null, tiene_archivo: !!s.archivo_id, comentario: s.comentario || null };
    }),
    reglas: leer('Reglas').filter(function (r) { return r.editable === '1'; }).sort(function (a, b) { return a.clave < b.clave ? -1 : 1; })
      .map(function (r) { return { clave: r.clave, valor: r.valor, descripcion: r.descripcion }; })
  });
}

// Expediente completo de una solicitud (solo jefatura): datos, justificación, decisión, materias y comprobante
function accExpediente(p) {
  var ses = sesion(p, ['JEFATURA']);
  if (!ses) return SIN_SESION();
  var s = solicitud(String(p.folio || ''));
  if (!s) return error('FOLIO', 'No existe ese folio.');
  log(ses.sujeto, 'VER_EXPEDIENTE', s.folio);
  var d = detalle(s.folio), ev = s.evento_id ? buscar('Eventos', function (x) { return x.id === s.evento_id; }) : null;
  var r = { ok: true, folio: d.folio, estado: d.estado, motivo: d.motivo, fechas: d.fechas,
    alumno: { num_control: d.alumno.num_control, nombre: d.alumno.nombre, grupo: d.alumno.grupo, carrera: d.alumno.carrera, semestre: d.alumno.semestre },
    descripcion: s.descripcion || null, regla_revision: d.regla_revision, comentario: d.comentario,
    creada_en: d.creada_en, resuelta_en: d.resuelta_en, resuelta_por: s.resuelta_por || null,
    evento: ev ? ev.nombre + ' · ' + ev.area : null,
    materias: d.materias.length ? d.materias : materiasAfectadas(s.num_control, s.fecha_inicio, s.fecha_fin).map(function (f) {
      var m = buscar('Materias', function (x) { return x.clave === f.materia_clave; }), dc = buscar('Docentes', function (x) { return x.id === f.docente_id; });
      return { fecha: fechaTxt(f.fecha), materia: m.nombre, docente: dc.nombre };
    }),
    archivo: null };
  if (s.archivo_id) r.archivo = { nombre: s.archivo_nombre, tipo: s.archivo_tipo, b64: Utilities.base64Encode(DriveApp.getFileById(s.archivo_id).getBlob().getBytes()) };
  return resp(r);
}

function accComprobante(p) {
  var ses = sesion(p, ['JEFATURA']);
  if (!ses) return SIN_SESION();
  var s = solicitud(String(p.folio || ''));
  if (!s || !s.archivo_id) return error('ARCHIVO', 'Ese folio no tiene comprobante.');
  log(ses.sujeto, 'VER_COMPROBANTE', s.folio);
  var bytes = DriveApp.getFileById(s.archivo_id).getBlob().getBytes();
  return resp({ ok: true, folio: s.folio, nombre: s.archivo_nombre, tipo: s.archivo_tipo, b64: Utilities.base64Encode(bytes) });
}

function accGuardarReglas(p) {
  var ses = sesion(p, ['JEFATURA']);
  if (!ses) return SIN_SESION();
  if (!p.reglas || typeof p.reglas !== 'object' || Array.isArray(p.reglas)) return error('REGLA', 'No hay reglas para guardar.');
  var cambios = [];
  var claves = Object.keys(p.reglas);
  for (var i = 0; i < claves.length; i++) {
    var k = claves[i], v = String(p.reglas[k] == null ? '' : p.reglas[k]).trim();
    var r = buscar('Reglas', function (x) { return x.clave === k && x.editable === '1'; });
    if (!r) continue;
    if (['plazo_dias_habiles', 'max_dias_sin_revision', 'umbral_alerta_tutor'].indexOf(k) >= 0 && !/^[0-9]{1,2}$/.test(v)) return error('REGLA', 'El valor de «' + k + '» debe ser un número entre 0 y 99.');
    if (k === 'max_archivo_kb' && (!/^[0-9]{2,5}$/.test(v) || Number(v) > 10240)) return error('REGLA', 'El tamaño máximo debe estar entre 10 y 10240 KB.');
    if (k === 'correo_jefatura' && (v.length > 120 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v))) return error('REGLA', 'Escribe un correo válido para la jefatura.');
    if ((k === 'periodo_inicio' || k === 'periodo_fin') && !fecha({ f: v }, 'f')) return error('REGLA', 'Las fechas del periodo deben tener formato AAAA-MM-DD.');
    if (k === 'periodo' && !/^[A-Za-z0-9 ÁÉÍÓÚáéíóúÑñ/-]{3,30}$/.test(v)) return error('REGLA', 'El nombre del periodo solo puede tener letras, números, espacios y guiones.');
    if (r.valor !== v) cambios.push([r._fila, v]);
  }
  cambios.forEach(function (c) { actualizar('Reglas', c[0], { valor: c[1] }); });
  log(ses.sujeto, 'REGLAS', null, p.reglas);
  return resp({ ok: true, actualizadas: cambios.length });
}

function reporteDatos(anio, mes) {
  var pref = anio + '-' + (mes < 10 ? '0' : '') + mes;
  var alumnos = {}, grupos = {}, motivos = {};
  leer('Alumnos').forEach(function (a) { alumnos[a.num_control] = a; });
  leer('Grupos').forEach(function (g) { grupos[g.clave] = g; });
  leer('Motivos').forEach(function (m) { motivos[m.clave] = m.nombre; });
  var em = leer('Solicitudes').filter(function (s) { return s.estado === 'EMITIDO' && s.fecha_inicio.slice(0, 7) === pref; });
  var agrupa = {};
  em.forEach(function (s) {
    var a = alumnos[s.num_control], k = grupos[a.grupo].carrera + '|' + a.grupo + '|' + motivos[s.motivo];
    agrupa[k] = (agrupa[k] || 0) + 1;
  });
  return { ok: true, anio: anio, mes: mes, periodo_txt: pref.slice(5) + '/' + anio, total: em.length,
    filas: Object.keys(agrupa).sort().map(function (k) { var x = k.split('|'); return { carrera: x[0], grupo: x[1], motivo: x[2], total: agrupa[k] }; }),
    alertas: leer('AlertasTutor').filter(function (x) { return mesDe(x.enviada_en) === pref; })
      .map(function (x) { var a = alumnos[x.num_control]; return { alumno: a.nombre, grupo: a.grupo, total: Number(x.total) }; }) };
}
function accReporte(p) {
  var ses = sesion(p, ['JEFATURA']);
  if (!ses) return SIN_SESION();
  if (!/^20[0-9]{2}$/.test(String(p.anio || '')) || !/^(0?[1-9]|1[0-2])$/.test(String(p.mes || ''))) return error('REPORTE', 'Elige un mes válido.');
  return resp(reporteDatos(Number(p.anio), Number(p.mes)));
}

// ---------- listas de eventos ----------
function accEvento(p) {
  var ses = sesion(p, ['EVENTOS', 'JEFATURA']);
  if (!ses) return SIN_SESION();
  var nom = texto(p, 'nombre', 120), area = texto(p, 'area', 120);
  if (!nom || !area) return error('DATOS', 'Escribe el nombre del evento y el área organizadora.');
  var ini = fecha(p, 'fecha_inicio'), fin = fecha(p, 'fecha_fin') || ini;
  if (!ini || fin < ini || diasEntre(ini, fin) > 14) return error('FECHAS', 'Revisa las fechas del evento (máximo 15 días).');
  if (ini < regla('periodo_inicio') || fin > regla('periodo_fin')) return error('FECHAS', 'Las fechas deben estar dentro del periodo ' + regla('periodo') + '.');
  if (!Array.isArray(p.numeros) || !p.numeros.length) return error('LISTA', 'La lista no tiene números de control.');
  if (p.numeros.length > 500) return error('LISTA', 'La lista tiene más de 500 renglones.');

  var ev = String(siguiente('EVENTO_SEQ'));
  agregar('Eventos', { id: ev, nombre: nom, area: area, fecha_inicio: ini, fecha_fin: fin, cargado_por: ses.sujeto, creado_en: new Date().toISOString() });
  log(ses.sujeto, 'LISTA_EVENTO', null, { evento_id: ev, renglones: p.numeros.length });
  var vistos = {}, emitidos = [], no = [], dups = [], sin = [], inval = 0, asistentes = [];
  p.numeros.forEach(function (x) {
    var n = String(x == null ? '' : x).trim().toUpperCase();
    if (vistos[n]) return; vistos[n] = 1;
    if (!/^[A-Z]?[0-9]{8}$/.test(n)) { inval++; return; }
    if (!buscar('Alumnos', function (a) { return a.num_control === n && a.activo === '1'; })) { no.push(n); return; }
    asistentes.push({ evento_id: ev, num_control: n });
  });
  agregarVarios('EventoAsistentes', asistentes);
  asistentes.forEach(function (x) {
    var n = x.num_control, dup = duplicado(n, ini, fin);
    if (dup) { dups.push({ num_control: n, folio: dup }); return; }
    if (!materiasAfectadas(n, ini, fin).length) { sin.push(n); return; }
    var folio = nuevoFolio();
    agregar('Solicitudes', { folio: folio, codigo_acceso: hexAleatorio(32), num_control: n, motivo: 'evento', fecha_inicio: ini, fecha_fin: fin,
      descripcion: nom + ' · ' + area, estado: 'EN_REVISION', evento_id: ev, creada_en: new Date().toISOString() });
    emitidos.push(emitir(folio, ses.sujeto));
  });
  return resp({ ok: true, emitidos: emitidos.length, no_encontrados: no, duplicados: dups, sin_clases: sin, invalidos: inval },
    { tipo: 'EVENTO', evento: nom, emitidos: emitidos });
}

// ============================ tareas automáticas ============================
function tareaRecordatorio() {
  var h = hoy();
  if (!esHabil(h)) return;
  var alumnos = {}; leer('Alumnos').forEach(function (a) { alumnos[a.num_control] = a; });
  var pend = leer('Solicitudes').filter(function (s) { return s.estado === 'EN_REVISION'; }).map(function (s) {
    var a = alumnos[s.num_control];
    return { folio: s.folio, alumno: a.nombre, grupo: a.grupo, regla: s.regla_revision, dias: diasEntre(Utilities.formatDate(new Date(s.creada_en), TZ, 'yyyy-MM-dd'), h) };
  });
  enviarCorreos({ tipo: 'RECORDATORIO', correo_jefatura: regla('correo_jefatura'), front_url: regla('front_url'), pendientes: pend });
}
function tareaReporteMensual() {
  var d = new Date(); d.setDate(0);   // último día del mes anterior
  var r = reporteDatos(Number(Utilities.formatDate(d, TZ, 'yyyy')), Number(Utilities.formatDate(d, TZ, 'MM')));
  r.tipo = 'REPORTE'; r.correo_jefatura = regla('correo_jefatura'); r.front_url = regla('front_url');
  enviarCorreos(r);
}

// ============================ correos ============================
var NAVY = '#12264A', TEAL = '#2A8C86', GRAY = '#5A6472';
function url(base, pagina, params) {
  return base + '/' + pagina + (params ? '?' + Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&') : '');
}
function correoHtml(titulo, parrafos, boton) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto;border:1px solid #E1E8EE;border-radius:12px;overflow:hidden">' +
    '<div style="background:' + NAVY + ';color:#fff;padding:14px 18px;font-size:18px;font-weight:bold">Justi<span style="color:#7FD1CB">Fica</span></div>' +
    '<div style="padding:18px;color:#1E2A38;font-size:15px;line-height:1.5"><h2 style="color:' + NAVY + ';font-size:18px;margin:0 0 10px">' + esc(titulo) + '</h2>' +
    parrafos.map(function (p) { return '<p style="margin:0 0 10px">' + p + '</p>'; }).join('') +
    (boton ? '<p style="margin:18px 0 6px"><a href="' + esc(boton.url) + '" style="background:' + TEAL + ';color:#fff;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:bold">' + esc(boton.texto) + '</a></p>' : '') +
    '</div><div style="background:#F2F6F9;color:' + GRAY + ';font-size:12px;padding:10px 18px">Correo automático de JustiFica (prototipo escolar con datos simulados). No respondas a este mensaje.</div></div>';
}
function correosEmitido(d) {
  var out = [];
  out.push({ to: d.alumno.correo, subject: 'Justificante emitido ' + d.folio, html: correoHtml('Tu justificante ya está emitido', [
    'Hola, ' + esc(d.alumno.nombre) + '. Tu justificante <b>' + esc(d.folio) + '</b> (' + esc(d.motivo) + ', ' + esc(d.fechas) + ') quedó emitido.',
    'Ya avisamos a ' + d.avisos.length + ' docente(s): ' + d.avisos.map(function (a) { return esc(a.detalle); }).join('; ') + '.',
    'No necesitas llevar ningún papel.'], { texto: 'Ver o descargar mi justificante', url: url(d.front_url, 'justificante.html', { folio: d.folio, codigo: d.codigo }) }) });
  d.avisos.forEach(function (a) {
    out.push({ to: a.correo, subject: 'Falta justificada · ' + d.alumno.nombre + ' · ' + d.folio, html: correoHtml('Aviso de falta justificada', [
      'Estimado(a) ' + esc(a.docente) + ':',
      'El alumno <b>' + esc(d.alumno.nombre) + '</b> (' + esc(d.alumno.num_control) + ', grupo ' + esc(d.alumno.grupo) + ') tiene justificada su inasistencia en: <b>' + esc(a.detalle) + '</b>.',
      'Motivo general: ' + esc(d.motivo) + '. Folio: <b>' + esc(d.folio) + '</b>.',
      'Conforme al numeral 5.4.5.6 del lineamiento de evaluación del TecNM, la reprogramación de evidencias queda a su criterio.'],
      { texto: 'Verificar el folio', url: url(d.front_url, 'verificar.html', { folio: d.folio }) }) });
  });
  if (d.alerta_tutor) {
    var t = d.alerta_tutor;
    out.push({ to: t.correo, subject: 'Alerta de tutoría · ' + t.alumno, html: correoHtml('Alumno con varias faltas justificadas', [
      'Estimado(a) ' + esc(t.tutor) + ':',
      esc(t.alumno) + ' (' + esc(t.num_control) + ', grupo ' + esc(t.grupo) + ') acumula <b>' + esc(t.total) + '</b> justificantes en el periodo ' + esc(t.periodo) + '.',
      'Te sugerimos platicar con el alumno en la próxima sesión de tutoría.']) });
  }
  return out;
}
function tablaReporte(r) {
  var filas = r.filas.length ? r.filas.map(function (f) { return '<tr><td>' + esc(f.carrera) + '</td><td>' + esc(f.grupo) + '</td><td>' + esc(f.motivo) + '</td><td style="text-align:right">' + esc(f.total) + '</td></tr>'; }).join('')
    : '<tr><td colspan="4">Sin justificantes emitidos en el mes.</td></tr>';
  return '<table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="background:' + NAVY + ';color:#fff"><th style="text-align:left;padding:6px">Carrera</th><th style="text-align:left;padding:6px">Grupo</th><th style="text-align:left;padding:6px">Motivo</th><th style="padding:6px">Total</th></tr>' + filas + '</table>';
}
function construirCorreos(i) {
  if (!i) return [];
  if (i.tipo === 'EMITIDO') return correosEmitido(i);
  if (i.tipo === 'REVISION') return [
    { to: i.alumno.correo, subject: 'Solicitud ' + i.folio + ' en revisión', html: correoHtml('Tu solicitud está en revisión', [
      'Hola, ' + esc(i.alumno.nombre) + '. Recibimos tu solicitud <b>' + esc(i.folio) + '</b> (' + esc(i.motivo) + ', ' + esc(i.fechas) + ').',
      'La revisará la jefatura porque: <b>' + esc(i.regla_revision) + '</b>.', 'Te avisaremos por correo en cuanto se resuelva.']) },
    { to: i.correo_jefatura, subject: 'Nuevo caso por revisar · ' + i.folio, html: correoHtml('Hay un caso que necesita tu revisión', [
      'Folio <b>' + esc(i.folio) + '</b> · ' + esc(i.alumno.nombre) + ' (' + esc(i.alumno.grupo) + ') · ' + esc(i.motivo) + ' · ' + esc(i.fechas) + '.',
      'Regla no cumplida: <b>' + esc(i.regla_revision) + '</b>.'], { texto: 'Abrir el panel de jefatura', url: url(i.front_url, 'jefatura.html') }) }];
  if (i.tipo === 'RECHAZO') return [{ to: i.alumno.correo, subject: 'Solicitud ' + i.folio + ' no procedió', html: correoHtml('Tu solicitud no procedió', [
    'Hola, ' + esc(i.alumno.nombre) + '. La jefatura revisó tu solicitud <b>' + esc(i.folio) + '</b> (' + esc(i.fechas) + ') y no procedió.',
    'Motivo: <b>' + esc(i.comentario) + '</b>.', 'Si tienes dudas, acude con tu coordinación de carrera.']) }];
  if (i.tipo === 'EVENTO') {
    var out = [], porDoc = {}, orden = [];
    i.emitidos.forEach(function (d) {
      var todos = correosEmitido(d);
      out.push(todos[0]);
      if (d.alerta_tutor) out.push(todos[todos.length - 1]);
      d.avisos.forEach(function (a) {
        if (!porDoc[a.correo]) { porDoc[a.correo] = { docente: a.docente, lineas: [], front: d.front_url }; orden.push(a.correo); }
        porDoc[a.correo].lineas.push(esc(d.alumno.nombre) + ' (' + esc(d.alumno.num_control) + ', ' + esc(d.alumno.grupo) + ') · ' + esc(a.detalle) + ' · folio ' + esc(d.folio));
      });
    });
    orden.forEach(function (c) {
      var v = porDoc[c];
      out.push({ to: c, subject: 'Faltas justificadas por evento · ' + i.evento, html: correoHtml('Alumnos justificados por «' + i.evento + '»', [
        'Estimado(a) ' + esc(v.docente) + ':', 'Los siguientes alumnos asistieron a un evento oficial y tienen justificada su inasistencia:',
        '<ul style="padding-left:18px;margin:0">' + v.lineas.map(function (l) { return '<li>' + l + '</li>'; }).join('') + '</ul>'],
        { texto: 'Verificar un folio', url: url(v.front, 'verificar.html') }) });
    });
    return out;
  }
  if (i.tipo === 'REPORTE') return [{ to: i.correo_jefatura, subject: 'Reporte mensual de justificantes · ' + i.periodo_txt, html: correoHtml('Reporte de ' + i.periodo_txt, [
    'Se emitieron <b>' + esc(i.total) + '</b> justificantes en el mes.', tablaReporte(i),
    i.alertas.length ? 'Alertas enviadas a tutores: ' + i.alertas.map(function (a) { return esc(a.alumno) + ' (' + esc(a.grupo) + ', ' + esc(a.total) + ')'; }).join('; ') + '.' : 'No hubo alertas a tutores.'],
    { texto: 'Abrir el panel', url: url(i.front_url, 'jefatura.html') }) }];
  if (i.tipo === 'RECORDATORIO' && i.pendientes.length) return [{ to: i.correo_jefatura, subject: 'Tienes ' + i.pendientes.length + ' caso(s) por revisar', html: correoHtml('Casos pendientes de revisión', [
    '<ul style="padding-left:18px;margin:0">' + i.pendientes.map(function (p) { return '<li><b>' + esc(p.folio) + '</b> · ' + esc(p.alumno) + ' (' + esc(p.grupo) + ') · ' + esc(p.regla) + ' · hace ' + esc(p.dias) + ' día(s)</li>'; }).join('') + '</ul>'],
    { texto: 'Abrir el panel', url: url(i.front_url, 'jefatura.html') }) }];
  return [];
}
function enviarCorreos(interno) {
  construirCorreos(interno).forEach(function (c) {
    if (!c || typeof c.to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c.to)) return;
    MailApp.sendEmail({ to: c.to, subject: c.subject, htmlBody: c.html, name: 'JustiFica' });
  });
}

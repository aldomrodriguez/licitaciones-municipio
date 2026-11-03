/**
 * Conecta los <form data-accion="..."> del panel con las Astro Actions, siempre
 * pasando antes por el diálogo de confirmación.
 *
 * Atributos del form:
 *   data-accion     nombre de la acción (ver ACCIONES)
 *   data-titulo     título de la confirmación
 *   data-detalle    párrafos separados por «|»
 *   data-tono       "peligro" para acciones destructivas
 *   data-boton      texto del botón de confirmar (verbo: «Enviar a la papelera»)
 *   data-motivo     "requerido" | "opcional"
 *   data-escribir   texto que hay que tipear para habilitar el botón
 *   data-exito      aviso después de guardar
 *   data-ir         a dónde ir después ({id} se reemplaza por el id devuelto); si falta, recarga
 *   data-diff       formulario de edición: la confirmación muestra los campos cambiados
 */
import { actions, isInputError, type ActionError } from 'astro:actions';
import { avisar, avisarDespues, confirmar, mostrarAvisoPendiente } from './confirmar';

const ACCIONES = {
  crearProcedimiento: actions.crearProcedimiento,
  actualizarProcedimiento: actions.actualizarProcedimiento,
  cambiarEstado: actions.cambiarEstado,
  agregarAdjudicacion: actions.agregarAdjudicacion,
  quitarAdjudicacion: actions.quitarAdjudicacion,
  quitarDocumento: actions.quitarDocumento,
  restaurarDocumento: actions.restaurarDocumento,
  cambiarVisibilidadDocumento: actions.cambiarVisibilidadDocumento,
  eliminarDocumentoDefinitivo: actions.eliminarDocumentoDefinitivo,
  eliminarProcedimiento: actions.eliminarProcedimiento,
  restaurarProcedimiento: actions.restaurarProcedimiento,
  eliminarProcedimientoDefinitivo: actions.eliminarProcedimientoDefinitivo,
  crearUsuario: actions.crearUsuario,
  cambiarActivoUsuario: actions.cambiarActivoUsuario,
  resetearClave: actions.resetearClave,
  cambiarMiClave: actions.cambiarMiClave,
  guardarIdentidad: actions.guardarIdentidad,
  guardarEncabezado: actions.guardarEncabezado,
  guardarTextos: actions.guardarTextos,
  quitarImagenMarca: actions.quitarImagenMarca,
};
type NombreAccion = keyof typeof ACCIONES;

function esAccion(n: string): n is NombreAccion {
  return n in ACCIONES;
}

type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function valorInicial(el: Campo): string {
  if (el instanceof HTMLSelectElement) return [...el.options].find((o) => o.defaultSelected)?.value ?? el.options[0]?.value ?? '';
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.defaultChecked ? 'sí' : 'no';
  return el.defaultValue;
}

function valorActual(el: Campo): string {
  if (el instanceof HTMLInputElement && el.type === 'checkbox') return el.checked ? 'sí' : 'no';
  return el.value;
}

function textoVisible(el: Campo, v: string): string {
  if (!v) return '—';
  if (el instanceof HTMLSelectElement) return [...el.options].find((o) => o.value === v)?.text ?? v;
  if (el instanceof HTMLInputElement && el.dataset.fecha !== undefined) return v.split('-').reverse().join('/');
  return v;
}

interface ItemLista {
  texto?: string;
  href?: string;
  titulo?: string;
  textos?: string[];
  links?: ItemLista[];
}

/** Ítems de una lista del editor de configuración (JSON en un campo oculto), en texto legible. */
function itemsLista(v: string): string[] {
  try {
    const items = JSON.parse(v) as ItemLista[];
    return Array.isArray(items)
      ? items.map((i) => (i.titulo !== undefined ? `${i.titulo}: ${[...(i.textos ?? []), ...(i.links ?? []).map((l) => `${l.texto} (${l.href})`)].join(', ') || 'vacía'}` : `${i.texto} (${i.href})`))
      : [];
  } catch {
    return [v];
  }
}

/** En las listas se muestra solo lo que se quita y lo que se agrega (o el nuevo orden). */
function cambioLista(el: Campo) {
  const antes = itemsLista(valorInicial(el));
  const despues = itemsLista(valorActual(el));
  const quitados = antes.filter((i) => !despues.includes(i));
  const agregados = despues.filter((i) => !antes.includes(i));
  if (quitados.length === 0 && agregados.length === 0) {
    return { etiqueta: `${el.dataset.etiqueta}: nuevo orden`, antes: antes.join(' / '), despues: despues.join(' / ') };
  }
  return { etiqueta: el.dataset.etiqueta!, antes: quitados.join(' / ') || '—', despues: agregados.join(' / ') || '—' };
}

function cambios(form: HTMLFormElement) {
  return [...form.querySelectorAll<Campo>('[data-etiqueta]')]
    .filter((el) => valorInicial(el).trim() !== valorActual(el).trim())
    .map((el) => ({
      nombre: el.name,
      ...(el.dataset.lista !== undefined
        ? cambioLista(el)
        : { etiqueta: el.dataset.etiqueta!, antes: textoVisible(el, valorInicial(el)), despues: textoVisible(el, valorActual(el)) }),
    }));
}

function mensajeError(error: ActionError): string {
  if (isInputError(error)) {
    const mensajes = Object.values(error.fields).flat().filter((m): m is string => Boolean(m));
    return mensajes.length ? [...new Set(mensajes)].join('\n') : error.message;
  }
  // Errores de negocio: mensaje corto pensado para el operador. Lo demás (500, 404, HTML) no se muestra crudo.
  if (error.code === 'BAD_REQUEST' || error.code === 'CONFLICT' || error.code === 'FORBIDDEN' || error.code === 'UNAUTHORIZED') {
    return error.message;
  }
  return `No se pudo guardar (${error.status}). Probá de nuevo; si sigue pasando, avisá a Sistemas.`;
}

// ─── Cambios sin guardar ──────────────────────────────────────────────────────

let sucio = false;
let saliendo = false;

function marcarSucio() {
  sucio = false;
  for (const f of document.querySelectorAll<HTMLFormElement>('form[data-diff]')) {
    const conCambios = cambios(f).length > 0;
    f.toggleAttribute('data-sucio', conCambios);
    sucio ||= conCambios;
  }
}

// Aviso nativo del navegador al cerrar o recargar con cambios sin guardar.
// En desarrollo no se activa: las recargas automáticas del servidor lo disparan y traban las pruebas.
if (!import.meta.env.DEV) {
  window.addEventListener('beforeunload', (e) => {
    if (sucio && !saliendo) e.preventDefault();
  });
}

document.addEventListener('click', async (e) => {
  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (!a || !sucio || saliendo || a.target === '_blank' || a.hasAttribute('download') || e.metaKey || e.ctrlKey) return;
  e.preventDefault();
  const ok = await confirmar({
    titulo: '¿Salir sin guardar?',
    detalle: 'Hay cambios en el formulario que todavía no guardaste. Si salís, se pierden.',
    tono: 'peligro',
    boton: 'Salir sin guardar',
  });
  if (ok) {
    saliendo = true;
    location.href = a.href;
  }
});

// ─── Envío con confirmación ───────────────────────────────────────────────────

async function enviar(form: HTMLFormElement, e: SubmitEvent) {
  e.preventDefault();
  const nombre = form.dataset.accion ?? '';
  if (!esAccion(nombre)) return;
  const d = form.dataset;
  if (!form.reportValidity()) return;

  const lista = d.diff !== undefined ? cambios(form) : [];
  if (d.diff !== undefined && lista.length === 0) {
    avisar('No hay cambios para guardar.');
    return;
  }
  const detalle = (d.detalle ?? '').split('|').filter(Boolean);
  if (d.diff !== undefined && d.prorroga === 'si' && lista.some((c) => c.nombre === 'fechaApertura')) {
    detalle.push('Cambiaste la fecha de apertura de un llamado publicado: se registra como prórroga y se muestra en el sitio.');
  }

  let resultado: Awaited<ReturnType<(typeof ACCIONES)[NombreAccion]>>['data'] | undefined;
  const ok = await confirmar({
    titulo: d.titulo ?? '¿Confirmás?',
    detalle,
    lista,
    tono: d.tono === 'peligro' ? 'peligro' : 'normal',
    boton: d.boton,
    motivo: d.motivo === 'requerido' || d.motivo === 'opcional' ? d.motivo : undefined,
    escribir: d.escribir,
    ejecutar: async ({ motivo, escrito }) => {
      const datos = new FormData(form);
      if (d.motivo) datos.set('motivo', motivo);
      if (d.escribir) datos.set('confirmacion', escrito);
      const r = await ACCIONES[nombre](datos);
      if (r.error) return mensajeError(r.error);
      resultado = r.data;
      return null;
    },
  });
  if (!ok) return;

  saliendo = true;
  sucio = false;
  if (resultado && 'clave' in resultado) {
    await confirmar({
      titulo: 'Contraseña generada',
      detalle: [
        'Pasásela a la persona por un canal seguro. No se vuelve a mostrar: anotala ahora.',
        'Es provisoria: al entrar, el sistema le pide que elija una propia.',
      ],
      lista: [resultado.clave],
      boton: 'Ya la anoté',
    });
  }
  if (d.exito) avisarDespues(d.exito);
  const destino = d.ir?.replace('{id}', resultado && 'id' in resultado ? String(resultado.id) : '');
  if (destino) location.href = destino;
  else location.reload();
}

export function iniciarFormularios() {
  mostrarAvisoPendiente();
  for (const form of document.querySelectorAll<HTMLFormElement>('form[data-accion]')) {
    form.noValidate = false;
    form.addEventListener('submit', (e) => enviar(form, e));
    if (form.dataset.diff !== undefined) form.addEventListener('input', marcarSucio);
  }
}

/**
 * Confirmaciones y avisos del panel.
 *
 *   const ok = await confirmar({ titulo, detalle, ejecutar: async ({ motivo }) => null | 'error' });
 *
 * El diálogo queda abierto mientras corre `ejecutar`; si devuelve un mensaje, se muestra
 * adentro del diálogo y el usuario puede corregir o cancelar.
 */
export type Tono = 'normal' | 'peligro';

export interface OpcionesConfirmar {
  titulo: string;
  detalle?: string | string[];
  lista?: (string | { etiqueta: string; antes?: string; despues: string })[];
  tono?: Tono;
  boton?: string;
  motivo?: 'requerido' | 'opcional';
  escribir?: string;
  ejecutar?: (extra: { motivo: string; escrito: string }) => Promise<string | null>;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function texto(el: HTMLElement, t: string) {
  el.textContent = t;
  return el;
}

export function confirmar(o: OpcionesConfirmar): Promise<boolean> {
  const dlg = $<HTMLDialogElement>('dlg-confirmar');
  const ok = $<HTMLButtonElement>('dlg-ok');
  const cancelar = dlg.querySelector<HTMLButtonElement>('[data-cancelar]')!;
  const error = $('dlg-error');
  const motivoCaja = $('dlg-motivo');
  const motivo = $<HTMLTextAreaElement>('dlg-motivo-texto');
  const escribirCaja = $('dlg-escribir');
  const escribir = $<HTMLInputElement>('dlg-escribir-texto');
  const lista = $<HTMLUListElement>('dlg-lista');
  const detalle = $('dlg-detalle');
  const previo = document.activeElement as HTMLElement | null;
  const peligro = o.tono === 'peligro';

  texto($('dlg-titulo'), o.titulo);
  detalle.replaceChildren(
    ...[o.detalle ?? []].flat().map((d) => texto(document.createElement('p'), d)),
  );
  lista.replaceChildren(
    ...(o.lista ?? []).map((item) => {
      const li = document.createElement('li');
      if (typeof item === 'string') return texto(li, item);
      const b = texto(document.createElement('b'), `${item.etiqueta}: `);
      li.append(b);
      if (item.antes !== undefined) {
        const s = texto(document.createElement('s'), item.antes);
        s.className = 'text-gris';
        li.append(s, ' → ');
      }
      li.append(item.despues);
      return li;
    }),
  );
  lista.hidden = !o.lista?.length;
  motivoCaja.hidden = !o.motivo;
  motivo.value = '';
  texto($('dlg-motivo-req'), o.motivo === 'requerido' ? '(obligatorio)' : '(opcional)');
  escribirCaja.hidden = !o.escribir;
  escribir.value = '';
  texto($('dlg-escribir-clave'), o.escribir ?? '');
  error.hidden = true;
  ok.textContent = o.boton ?? 'Confirmar';
  ok.className = peligro ? 'btn-peligro' : 'btn-primario';
  ok.disabled = Boolean(o.escribir);
  $('dlg-icono').className = `grid size-11 shrink-0 place-items-center rounded-full ${peligro ? 'bg-peligro-fondo text-peligro' : 'bg-neutro-fondo text-tinta'}`;
  dlg.querySelector<HTMLElement>('[data-icono="normal"]')!.hidden = peligro;
  dlg.querySelector<HTMLElement>('[data-icono="peligro"]')!.hidden = !peligro;

  return new Promise((resolver) => {
    let ocupado = false;
    const alEscribir = () => {
      ok.disabled = escribir.value.trim() !== o.escribir;
    };
    const terminar = (resultado: boolean) => {
      ok.removeEventListener('click', alOk);
      cancelar.removeEventListener('click', alCancelar);
      dlg.removeEventListener('cancel', alEsc);
      escribir.removeEventListener('input', alEscribir);
      dlg.close();
      previo?.focus();
      resolver(resultado);
    };
    const alCancelar = () => !ocupado && terminar(false);
    const alEsc = (e: Event) => {
      e.preventDefault();
      alCancelar();
    };
    const alOk = async () => {
      if (ocupado) return;
      const m = motivo.value.trim();
      if (o.motivo === 'requerido' && m.length < 5) {
        mostrarError('Indicá el motivo (al menos 5 caracteres).');
        motivo.focus();
        return;
      }
      if (!o.ejecutar) return terminar(true);
      ocupado = true;
      const etiqueta = ok.textContent;
      ok.disabled = true;
      cancelar.disabled = true;
      ok.textContent = 'Guardando…';
      error.hidden = true;
      try {
        const fallo = await o.ejecutar({ motivo: m, escrito: escribir.value.trim() });
        if (fallo) {
          mostrarError(fallo);
        } else {
          ocupado = false;
          return terminar(true);
        }
      } catch {
        mostrarError('No se pudo conectar con el servidor. Revisá la conexión y probá de nuevo.');
      }
      ocupado = false;
      ok.disabled = false;
      cancelar.disabled = false;
      ok.textContent = etiqueta;
    };
    const mostrarError = (m: string) => {
      error.textContent = m;
      error.hidden = false;
    };

    ok.addEventListener('click', alOk);
    cancelar.addEventListener('click', alCancelar);
    dlg.addEventListener('cancel', alEsc);
    escribir.addEventListener('input', alEscribir);
    dlg.showModal();
    (o.motivo ? motivo : o.escribir ? escribir : cancelar).focus();
  });
}

// ─── Avisos ─────────────────────────────────────────────────────────────────

const CLAVE_FLASH = 'panel-aviso';

export function avisar(mensaje: string, tono: 'exito' | 'error' = 'exito') {
  const cont = document.getElementById('toasts');
  if (!cont) return;
  const el = document.createElement('div');
  el.className = `pointer-events-auto max-w-[420px] rounded-lg px-4 py-3 text-sm font-semibold shadow-xl ${
    tono === 'exito' ? 'bg-tinta text-white' : 'bg-peligro text-white'
  }`;
  el.textContent = mensaje;
  cont.append(el);
  setTimeout(() => el.remove(), tono === 'exito' ? 4500 : 8000);
}

/** Aviso que sobrevive a una recarga o navegación (para después de guardar). */
export function avisarDespues(mensaje: string) {
  try {
    sessionStorage.setItem(CLAVE_FLASH, mensaje);
  } catch {
    /* sin storage: el cambio igual se ve en la página */
  }
}

export function mostrarAvisoPendiente() {
  try {
    const m = sessionStorage.getItem(CLAVE_FLASH);
    if (m) {
      sessionStorage.removeItem(CLAVE_FLASH);
      avisar(m);
    }
  } catch {
    /* idem */
  }
}

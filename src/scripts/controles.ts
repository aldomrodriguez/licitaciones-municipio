/**
 * Desplegables y selector de fecha propios (reemplazan los del sistema operativo).
 *
 * Mejora progresiva: el <select> o <input> original sigue en el formulario como fuente de
 * verdad (se envía, y lo usan el diff y los filtros); solo se oculta y se dibuja un control
 * accesible encima, siguiendo los patrones de ARIA APG:
 *   - «select-only combobox» para los desplegables
 *   - «date picker dialog» (grilla de días) para la fecha
 *
 * Uso: <select class="campo"> se mejora solo. Para la fecha:
 *   <input type="text" hidden data-fecha name="..." value="AAAA-MM-DD">
 */
import chevron from '@tabler/icons/outline/chevron-down.svg?raw';
import calendario from '@tabler/icons/outline/calendar-event.svg?raw';
import anterior from '@tabler/icons/outline/chevron-left.svg?raw';
import siguiente from '@tabler/icons/outline/chevron-right.svg?raw';
import tilde from '@tabler/icons/outline/check.svg?raw';
import { errorCuit, formatearCuit } from '../lib/cuit';

let contador = 0;
const uid = (prefijo: string) => `${prefijo}-${++contador}`;

function icono(svg: string, tamano = 18, clase = '') {
  return svg
    .replace(/\s(width|height|class)="[^"]*"/g, '')
    .replace('<svg', `<svg width="${tamano}" height="${tamano}" aria-hidden="true" focusable="false" class="shrink-0 ${clase}"`);
}

/** Si un desplegable recién abierto se sale por la derecha (celular), lo corre hacia adentro. */
function dentroDeLaPantalla(el: HTMLElement) {
  // Con `left` y no `translate`: la posición original igual ensancharía la página.
  el.style.left = '';
  el.style.right = '';
  const r = el.getBoundingClientRect();
  const sobra = r.right - (document.documentElement.clientWidth - 8);
  if (sobra <= 0) return;
  const corrimiento = Math.min(sobra, Math.max(r.left - 8, 0));
  el.style.left = `${el.offsetLeft - corrimiento}px`;
  el.style.right = 'auto';
}

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function etiquetaDe(el: HTMLElement): HTMLLabelElement | null {
  return el.id ? document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`) : null;
}

/** Cierra el control si el foco o un clic se va fuera de `raiz`. */
function alSalir(raiz: HTMLElement, cerrar: () => void) {
  raiz.addEventListener('focusout', () => {
    // Se espera un ciclo: al redibujar (cambio de mes) el foco pasa un instante por <body>.
    setTimeout(() => {
      if (!raiz.contains(document.activeElement)) cerrar();
    });
  });
  document.addEventListener('pointerdown', (e) => {
    if (!raiz.contains(e.target as Node)) cerrar();
  });
}

// ─── Desplegable ──────────────────────────────────────────────────────────────

function mejorarSelect(sel: HTMLSelectElement) {
  if (sel.dataset.mejorado || sel.multiple) return;
  sel.dataset.mejorado = 'si';

  const raiz = document.createElement('div');
  raiz.className = 'relative';
  sel.before(raiz);
  raiz.append(sel);
  sel.hidden = true;
  sel.tabIndex = -1;

  const etiqueta = etiquetaDe(sel);
  if (etiqueta && !etiqueta.id) etiqueta.id = uid('etq');

  const combo = document.createElement('div');
  combo.id = uid('combo');
  combo.tabIndex = 0;
  combo.setAttribute('role', 'combobox');
  combo.setAttribute('aria-haspopup', 'listbox');
  combo.setAttribute('aria-expanded', 'false');
  if (etiqueta) combo.setAttribute('aria-labelledby', etiqueta.id);
  else if (sel.getAttribute('aria-label')) combo.setAttribute('aria-label', sel.getAttribute('aria-label')!);
  for (const a of ['aria-describedby', 'aria-invalid', 'required']) {
    const v = sel.getAttribute(a);
    if (v !== null) combo.setAttribute(a === 'required' ? 'aria-required' : a, a === 'required' ? 'true' : v);
  }
  combo.className = `${sel.className} flex cursor-pointer items-center justify-between gap-2 text-left select-none aria-expanded:border-tinta`;
  const texto = document.createElement('span');
  texto.className = 'min-w-0 truncate';
  combo.append(texto);
  combo.insertAdjacentHTML('beforeend', icono(chevron, 18, 'text-gris transition-transform [[aria-expanded=true]>&]:rotate-180'));

  const lista = document.createElement('ul');
  lista.id = uid('lista');
  lista.setAttribute('role', 'listbox');
  lista.tabIndex = -1;
  if (etiqueta) lista.setAttribute('aria-labelledby', etiqueta.id);
  else if (sel.getAttribute('aria-label')) lista.setAttribute('aria-label', sel.getAttribute('aria-label')!);
  lista.hidden = true;
  lista.className =
    'absolute inset-x-0 top-[calc(100%+6px)] z-40 max-h-72 min-w-[12rem] overflow-auto rounded-lg border border-linea bg-white p-1 text-[15px] shadow-xl';
  combo.setAttribute('aria-controls', lista.id);
  raiz.append(combo, lista);
  if (etiqueta) etiqueta.htmlFor = combo.id;
  etiqueta?.addEventListener('click', (e) => {
    e.preventDefault();
    combo.focus();
  });

  let activo = -1;
  let buscado = '';
  let reloj: number | undefined;
  const opciones = () => [...sel.options];
  const items = () => [...lista.children] as HTMLLIElement[];

  const dibujarOpciones = () => {
    lista.replaceChildren(
      ...opciones().map((o, i) => {
        const li = document.createElement('li');
        li.id = `${lista.id}-${i}`;
        li.setAttribute('role', 'option');
        li.dataset.indice = String(i);
        if (o.disabled) li.setAttribute('aria-disabled', 'true');
        li.className =
          'flex cursor-pointer items-center justify-between gap-3 rounded-md px-3 py-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-selected:font-semibold data-[activo]:bg-papel';
        const t = document.createElement('span');
        t.textContent = o.text;
        li.append(t);
        li.insertAdjacentHTML('beforeend', icono(tilde, 16, 'invisible text-marca [[aria-selected=true]>&]:visible'));
        return li;
      }),
    );
  };

  const pintar = () => {
    const o = sel.options[sel.selectedIndex];
    texto.textContent = o?.text ?? '';
    texto.classList.toggle('text-gris', !o?.value);
    items().forEach((li, i) => li.setAttribute('aria-selected', String(i === sel.selectedIndex)));
  };

  const marcar = (i: number) => {
    const lis = items();
    if (i < 0 || i >= lis.length) return;
    activo = i;
    lis.forEach((li, j) => li.toggleAttribute('data-activo', j === i));
    combo.setAttribute('aria-activedescendant', lis[i]!.id);
    lis[i]!.scrollIntoView({ block: 'nearest' });
  };

  const abierto = () => combo.getAttribute('aria-expanded') === 'true';
  const abrir = () => {
    if (abierto()) return;
    dibujarOpciones();
    pintar();
    lista.hidden = false;
    dentroDeLaPantalla(lista);
    combo.setAttribute('aria-expanded', 'true');
    marcar(Math.max(sel.selectedIndex, 0));
  };
  const cerrar = () => {
    if (!abierto()) return;
    lista.hidden = true;
    combo.setAttribute('aria-expanded', 'false');
    combo.removeAttribute('aria-activedescendant');
  };
  const elegir = (i: number) => {
    const o = sel.options[i];
    if (!o || o.disabled) return;
    if (sel.selectedIndex !== i) {
      sel.selectedIndex = i;
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    pintar();
  };
  /** Siguiente opción habilitada en la dirección dada. */
  const mover = (desde: number, paso: number) => {
    const ops = opciones();
    for (let i = desde + paso; i >= 0 && i < ops.length; i += paso) if (!ops[i]!.disabled) return i;
    return desde;
  };
  const tipear = (c: string) => {
    window.clearTimeout(reloj);
    reloj = window.setTimeout(() => (buscado = ''), 600);
    buscado += normalizar(c);
    const ops = opciones();
    const inicio = buscado.length === 1 ? activo + 1 : activo;
    for (let k = 0; k < ops.length; k++) {
      const i = (inicio + k) % ops.length;
      if (!ops[i]!.disabled && normalizar(ops[i]!.text).startsWith(buscado)) {
        if (abierto()) marcar(i);
        else elegir(i);
        return;
      }
    }
  };

  combo.addEventListener('click', () => (abierto() ? cerrar() : abrir()));
  combo.addEventListener('keydown', (e) => {
    const abiertoAhora = abierto();
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!abiertoAhora) abrir();
        else marcar(mover(activo, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!abiertoAhora) abrir();
        else marcar(mover(activo, -1));
        break;
      case 'Home':
        if (abiertoAhora) {
          e.preventDefault();
          marcar(mover(-1, 1));
        }
        break;
      case 'End':
        if (abiertoAhora) {
          e.preventDefault();
          marcar(mover(opciones().length, -1));
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (abiertoAhora) {
          elegir(activo);
          cerrar();
        } else abrir();
        break;
      case 'Escape':
        if (abiertoAhora) {
          e.preventDefault();
          e.stopPropagation(); // no cerrar el diálogo que lo contiene
          cerrar();
        }
        break;
      case 'Tab':
        if (abiertoAhora) {
          elegir(activo);
          cerrar();
        }
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) tipear(e.key);
    }
  });
  lista.addEventListener('pointerdown', (e) => e.preventDefault()); // no robar el foco
  lista.addEventListener('click', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('li[role=option]');
    if (!li || li.getAttribute('aria-disabled') === 'true') return;
    elegir(Number(li.dataset.indice));
    cerrar();
    combo.focus();
  });
  lista.addEventListener('pointermove', (e) => {
    const li = (e.target as HTMLElement).closest<HTMLLIElement>('li[role=option]');
    if (li) marcar(Number(li.dataset.indice));
  });
  alSalir(raiz, cerrar);
  // Si otro script cambia el select (p. ej. la categoría sugerida), el control se actualiza.
  sel.addEventListener('change', pintar);

  dibujarOpciones();
  pintar();
}

// ─── Selector de fecha ────────────────────────────────────────────────────────

const ZONA = 'America/Argentina/Buenos_Aires';
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = [
  ['lu', 'lunes'],
  ['ma', 'martes'],
  ['mi', 'miércoles'],
  ['ju', 'jueves'],
  ['vi', 'viernes'],
  ['sá', 'sábado'],
  ['do', 'domingo'],
] as const;

/** Fechas de calendario sin hora: se trabajan en UTC para que la zona no las corra. */
const aIso = (d: Date) => d.toISOString().slice(0, 10);
const desdeIso = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null);
const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
function sumarMeses(d: Date, n: number) {
  const r = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const ultimo = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate();
  r.setUTCDate(Math.min(d.getUTCDate(), ultimo));
  return r;
}
const hoyIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(new Date());
const textoFecha = (d: Date) =>
  new Intl.DateTimeFormat('es-AR', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);

function mejorarFecha(input: HTMLInputElement) {
  if (input.dataset.mejorado) return;
  input.dataset.mejorado = 'si';
  const soloLectura = input.readOnly;
  const etiqueta = etiquetaDe(input);
  if (etiqueta && !etiqueta.id) etiqueta.id = uid('etq');

  const raiz = document.createElement('div');
  raiz.className = 'relative';
  input.before(raiz);
  raiz.append(input);

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.id = uid('fecha');
  const valorId = uid('valor');
  boton.setAttribute('aria-haspopup', 'dialog');
  boton.setAttribute('aria-expanded', 'false');
  boton.setAttribute('aria-labelledby', [etiqueta?.id, valorId].filter(Boolean).join(' '));
  const descripcion = input.getAttribute('aria-describedby');
  if (descripcion) boton.setAttribute('aria-describedby', descripcion);
  boton.className = soloLectura
    ? 'campo flex cursor-not-allowed items-center justify-between gap-2 bg-papel text-left text-gris'
    : 'campo flex items-center justify-between gap-2 text-left aria-expanded:border-tinta';
  boton.disabled = soloLectura;
  const valor = document.createElement('span');
  valor.id = valorId;
  valor.className = 'min-w-0 truncate first-letter:uppercase';
  boton.append(valor);
  boton.insertAdjacentHTML('beforeend', icono(calendario, 18, 'text-gris'));
  raiz.append(boton);
  if (etiqueta) etiqueta.htmlFor = boton.id;

  const pintarValor = () => {
    const d = desdeIso(input.value);
    valor.textContent = d ? textoFecha(d) : soloLectura ? 'Sin informar' : 'Elegir fecha';
    valor.classList.toggle('text-gris', !d);
  };
  pintarValor();
  if (soloLectura) return;

  // Panel del calendario
  const panel = document.createElement('div');
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'false');
  panel.setAttribute('aria-label', `Elegir ${etiqueta?.textContent?.trim().toLowerCase() ?? 'fecha'}`);
  panel.hidden = true;
  panel.className = 'absolute top-[calc(100%+6px)] left-0 z-40 w-[min(312px,calc(100vw-16px))] rounded-xl border border-linea bg-white p-3 shadow-xl';
  const tituloId = uid('mes');
  panel.innerHTML = `
    <div class="mb-2 flex items-center justify-between">
      <button type="button" class="grid size-9 place-items-center rounded-md text-gris hover:bg-papel hover:text-tinta" data-nav="-1" aria-label="Mes anterior">${icono(anterior)}</button>
      <h2 id="${tituloId}" class="text-[15px] font-bold capitalize" aria-live="polite"></h2>
      <button type="button" class="grid size-9 place-items-center rounded-md text-gris hover:bg-papel hover:text-tinta" data-nav="1" aria-label="Mes siguiente">${icono(siguiente)}</button>
    </div>
    <table role="grid" aria-labelledby="${tituloId}" class="cifras w-full border-collapse text-center text-sm">
      <thead><tr>${DIAS.map(([c, l]) => `<th scope="col" abbr="${l}" class="pb-1 text-xs font-semibold text-gris">${c}</th>`).join('')}</tr></thead>
      <tbody></tbody>
    </table>
    <div class="mt-2 flex items-center justify-between border-t border-linea pt-2">
      <button type="button" class="rounded-md px-2.5 py-1.5 text-sm font-semibold text-marca hover:bg-marca-claro" data-hoy>Hoy</button>
      ${input.required ? '' : '<button type="button" class="rounded-md px-2.5 py-1.5 text-sm text-gris hover:bg-papel hover:text-tinta" data-borrar>Borrar fecha</button>'}
    </div>`;
  raiz.append(panel);
  const titulo = panel.querySelector<HTMLElement>(`#${tituloId}`)!;
  const cuerpo = panel.querySelector('tbody')!;

  let foco = desdeIso(input.value) ?? desdeIso(hoyIso())!;

  const dibujar = () => {
    titulo.textContent = `${MESES[foco.getUTCMonth()]} ${foco.getUTCFullYear()}`;
    const primero = new Date(Date.UTC(foco.getUTCFullYear(), foco.getUTCMonth(), 1));
    const desfase = (primero.getUTCDay() + 6) % 7; // semana que empieza el lunes
    const inicio = sumarDias(primero, -desfase);
    const hoy = hoyIso();
    const elegido = input.value;
    const filas: string[] = [];
    for (let s = 0; s < 6; s++) {
      const celdas: string[] = [];
      for (let d = 0; d < 7; d++) {
        const dia = sumarDias(inicio, s * 7 + d);
        const iso = aIso(dia);
        const delMes = dia.getUTCMonth() === foco.getUTCMonth();
        const esFoco = iso === aIso(foco);
        const clases = [
          'mx-auto grid size-9 place-items-center rounded-full',
          delMes ? 'text-tinta' : 'text-gris/60',
          iso === elegido ? 'bg-marca font-bold text-white hover:bg-marca-oscuro' : 'hover:bg-papel',
          iso === hoy && iso !== elegido ? 'font-bold ring-1 ring-tinta' : '',
        ].join(' ');
        celdas.push(
          `<td role="gridcell" aria-selected="${iso === elegido}" class="p-0.5"><button type="button" tabindex="${esFoco ? 0 : -1}" data-dia="${iso}" class="${clases}" aria-label="${textoFecha(dia)}${iso === hoy ? ', hoy' : ''}"${iso === hoy ? ' aria-current="date"' : ''}>${dia.getUTCDate()}</button></td>`,
        );
      }
      filas.push(`<tr>${celdas.join('')}</tr>`);
    }
    cuerpo.innerHTML = filas.join('');
  };
  const enfocarDia = () => cuerpo.querySelector<HTMLButtonElement>(`[data-dia="${aIso(foco)}"]`)?.focus();
  const abierto = () => !panel.hidden;
  const abrir = () => {
    foco = desdeIso(input.value) ?? desdeIso(hoyIso())!;
    dibujar();
    panel.hidden = false;
    dentroDeLaPantalla(panel);
    boton.setAttribute('aria-expanded', 'true');
    enfocarDia();
  };
  const cerrar = (devolverFoco = false) => {
    if (!abierto()) return;
    panel.hidden = true;
    boton.setAttribute('aria-expanded', 'false');
    if (devolverFoco) boton.focus();
  };
  const fijar = (iso: string) => {
    if (input.value !== iso) {
      input.value = iso;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    pintarValor();
    cerrar(true);
  };
  const irA = (d: Date) => {
    const otroMes = d.getUTCMonth() !== foco.getUTCMonth() || d.getUTCFullYear() !== foco.getUTCFullYear();
    foco = d;
    if (otroMes) dibujar();
    else cuerpo.querySelectorAll<HTMLButtonElement>('[data-dia]').forEach((b) => (b.tabIndex = b.dataset.dia === aIso(foco) ? 0 : -1));
    enfocarDia();
  };

  boton.addEventListener('click', () => (abierto() ? cerrar() : abrir()));
  boton.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' && !abierto()) {
      e.preventDefault();
      abrir();
    }
  });
  panel.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const dia = t.closest<HTMLButtonElement>('[data-dia]');
    if (dia) return fijar(dia.dataset.dia!);
    const nav = t.closest<HTMLButtonElement>('[data-nav]');
    if (nav) {
      foco = sumarMeses(foco, Number(nav.dataset.nav));
      dibujar();
      return;
    }
    if (t.closest('[data-hoy]')) return fijar(hoyIso());
    if (t.closest('[data-borrar]')) {
      input.value = '';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      pintarValor();
      cerrar(true);
    }
  });
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrar(true);
      return;
    }
    if (!(e.target as HTMLElement).dataset.dia) return;
    const pasos: Record<string, () => Date> = {
      ArrowLeft: () => sumarDias(foco, -1),
      ArrowRight: () => sumarDias(foco, 1),
      ArrowUp: () => sumarDias(foco, -7),
      ArrowDown: () => sumarDias(foco, 7),
      Home: () => sumarDias(foco, -((foco.getUTCDay() + 6) % 7)),
      End: () => sumarDias(foco, 6 - ((foco.getUTCDay() + 6) % 7)),
      PageUp: () => sumarMeses(foco, e.shiftKey ? -12 : -1),
      PageDown: () => sumarMeses(foco, e.shiftKey ? 12 : 1),
    };
    const paso = pasos[e.key];
    if (paso) {
      e.preventDefault();
      irA(paso());
    }
  });
  alSalir(raiz, () => cerrar());
}

// ─── CUIT ─────────────────────────────────────────────────────────────────────

/** Pone los guiones mientras se escribe y avisa si el dígito verificador no coincide. */
function mejorarCuit(input: HTMLInputElement) {
  if (input.dataset.mejorado) return;
  input.dataset.mejorado = 'si';
  const idAyuda = input.getAttribute('aria-describedby');
  const ayuda = idAyuda ? document.getElementById(idAyuda) : null;
  const textoAyuda = ayuda?.textContent ?? '';

  input.addEventListener('input', () => {
    // Conserva el cursor: cuenta cuántos dígitos había antes de él y lo reubica después de formatear.
    const cursor = input.selectionStart ?? input.value.length;
    const digitosAntes = input.value.slice(0, cursor).replace(/\D/g, '').length;
    const nuevo = formatearCuit(input.value);
    if (nuevo !== input.value) input.value = nuevo;
    let pos = 0;
    for (let vistos = 0; pos < nuevo.length && vistos < digitosAntes; pos++) if (/\d/.test(nuevo[pos]!)) vistos++;
    input.setSelectionRange(pos, pos);
    input.setCustomValidity('');
    input.removeAttribute('aria-invalid');
    if (ayuda) {
      ayuda.textContent = textoAyuda;
      ayuda.classList.remove('text-peligro');
    }
  });
  input.addEventListener('blur', () => {
    const error = input.value ? errorCuit(input.value) : null;
    input.setCustomValidity(error ?? '');
    if (error) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (ayuda) {
      ayuda.textContent = error ?? textoAyuda;
      ayuda.classList.toggle('text-peligro', Boolean(error));
    }
  });
}

/** Mejora todos los controles dentro de `raiz` (se puede llamar de nuevo con contenido agregado). */
export function mejorarControles(raiz: ParentNode = document) {
  raiz.querySelectorAll<HTMLSelectElement>('select').forEach(mejorarSelect);
  raiz.querySelectorAll<HTMLInputElement>('input[data-fecha]').forEach(mejorarFecha);
  raiz.querySelectorAll<HTMLInputElement>('input[data-cuit]').forEach(mejorarCuit);
  raiz.querySelectorAll<HTMLInputElement>('input[data-entero]').forEach(soloDigitos);
}

/** Cantidades: se descarta todo lo que no sea un dígito, también al pegar. */
function soloDigitos(input: HTMLInputElement) {
  if (input.dataset.mejorado) return;
  input.dataset.mejorado = 'si';
  input.addEventListener('input', () => {
    const limpio = input.value.replace(/\D/g, '');
    if (limpio !== input.value) input.value = limpio;
  });
}

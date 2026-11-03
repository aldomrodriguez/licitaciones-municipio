/** Paginación de listados por la URL (`?pagina=N`), compartida por el sitio público y el panel. */

export interface Pagina<T> {
  pagina: number;
  paginas: number;
  visibles: T[];
  /** Posición del primero y del último visibles, contando desde 1 (0 si no hay filas). */
  desde: number;
  hasta: number;
  total: number;
}

/** Corta la lista. Una página inválida va a la 1 y una fuera de rango, a la última. */
export function paginar<T>(filas: T[], paginaParam: string | null, porPagina: number): Pagina<T> {
  const paginas = Math.max(1, Math.ceil(filas.length / porPagina));
  const n = Number(paginaParam);
  const pagina = Number.isInteger(n) && n >= 1 ? Math.min(n, paginas) : 1;
  const inicio = (pagina - 1) * porPagina;
  const visibles = filas.slice(inicio, inicio + porPagina);
  return {
    pagina,
    paginas,
    visibles,
    desde: visibles.length ? inicio + 1 : 0,
    hasta: inicio + visibles.length,
    total: filas.length,
  };
}

/** URL de la página `n` conservando los demás parámetros; la 1 no lleva `pagina`. */
export function urlPagina(ruta: string, params: URLSearchParams, n: number, ancla = ''): string {
  const u = new URLSearchParams(params);
  if (n <= 1) u.delete('pagina');
  else u.set('pagina', String(n));
  const qs = u.toString();
  return `${ruta}${qs ? `?${qs}` : ''}${ancla}`;
}

/**
 * Números a mostrar: la primera, la última y las vecinas de la actual.
 * `null` marca un salto («…»). Con pocas páginas se muestran todas.
 */
export function numerosDePagina(pagina: number, paginas: number): (number | null)[] {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i + 1);
  const set = new Set([1, paginas, pagina - 1, pagina, pagina + 1].filter((n) => n >= 1 && n <= paginas));
  // Cerca de los bordes se muestran 5 seguidas, para que la barra no cambie tanto de ancho.
  if (pagina <= 3) [2, 3, 4].forEach((n) => set.add(n));
  if (pagina >= paginas - 2) [paginas - 3, paginas - 2, paginas - 1].forEach((n) => set.add(n));
  const orden = [...set].sort((a, b) => a - b);
  const salida: (number | null)[] = [];
  orden.forEach((n, i) => {
    if (i > 0 && n - orden[i - 1]! > 1) salida.push(null);
    salida.push(n);
  });
  return salida;
}

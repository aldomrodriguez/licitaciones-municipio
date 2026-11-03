import { describe, expect, it } from 'vitest';
import { numerosDePagina, paginar, urlPagina } from './paginacion';

const filas = Array.from({ length: 58 }, (_, i) => i + 1);

describe('paginar', () => {
  it('corta la página pedida', () => {
    const p = paginar(filas, '2', 25);
    expect(p).toMatchObject({ pagina: 2, paginas: 3, desde: 26, hasta: 50, total: 58 });
    expect(p.visibles[0]).toBe(26);
  });

  it('la última página trae el resto', () => {
    expect(paginar(filas, '3', 25)).toMatchObject({ desde: 51, hasta: 58 });
  });

  it('una página inválida va a la 1 y una fuera de rango a la última', () => {
    for (const valor of [null, '', 'abc', '0', '-2', '1.5']) expect(paginar(filas, valor, 25).pagina).toBe(1);
    expect(paginar(filas, '99', 25).pagina).toBe(3);
  });

  it('sin filas hay una sola página vacía', () => {
    expect(paginar([], '4', 25)).toMatchObject({ pagina: 1, paginas: 1, desde: 0, hasta: 0, visibles: [] });
  });
});

describe('urlPagina', () => {
  const params = new URLSearchParams('tipo=publica&pagina=3');
  it('conserva los filtros y agrega el ancla', () => {
    expect(urlPagina('/', params, 2, '#listado')).toBe('/?tipo=publica&pagina=2#listado');
  });
  it('la página 1 no lleva el parámetro', () => {
    expect(urlPagina('/panel', params, 1)).toBe('/panel?tipo=publica');
    expect(urlPagina('/panel', new URLSearchParams('pagina=2'), 1)).toBe('/panel');
  });
});

describe('numerosDePagina', () => {
  it('con pocas páginas muestra todas', () => {
    expect(numerosDePagina(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it('en el medio muestra la primera, las vecinas y la última', () => {
    expect(numerosDePagina(10, 20)).toEqual([1, null, 9, 10, 11, null, 20]);
  });
  it('cerca de los bordes muestra cinco seguidas', () => {
    expect(numerosDePagina(1, 20)).toEqual([1, 2, 3, 4, null, 20]);
    expect(numerosDePagina(20, 20)).toEqual([1, null, 17, 18, 19, 20]);
  });
});

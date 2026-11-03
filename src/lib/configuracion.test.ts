import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { crearDb, type Db } from './db';
import { configuracion } from './db/schema';
import {
  CONFIG_GENERICA,
  ErrorConfiguracion,
  cambiosRecientes,
  esHrefSeguro,
  estaConfigurado,
  guardarSeccion,
  leerConfiguracion,
  letraDecorativa,
  type ConfigSitio,
} from './configuracion';

let db: Db;
beforeEach(() => {
  db = crearDb(':memory:');
});

describe('esHrefSeguro', () => {
  it.each(['https://municipiodelobos.gob.ar/', 'http://localhost:4321/x', 'mailto:compras@lobos.gob.ar', 'tel:+542227431450'])('acepta %s', (h) => {
    expect(esHrefSeguro(h)).toBe(true);
  });
  it.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x', '/relativo', 'www.sin-protocolo.com', 'https://sinpunto', ''])('rechaza %s', (h) => {
    expect(esHrefSeguro(h)).toBe(false);
  });
});

describe('configuración', () => {
  it('sin fila guardada usa la genérica', () => {
    expect(estaConfigurado(db)).toBe(false);
    expect(leerConfiguracion(db)).toEqual(CONFIG_GENERICA);
    expect(CONFIG_GENERICA.nombre).toBe('Municipio');
    expect(CONFIG_GENERICA.logo).toBeNull();
  });

  it('guarda una sección, registra solo lo que cambió y no registra si no hay cambios', () => {
    const lista = guardarSeccion(db, 'Ana', 'identidad', { nombre: 'Municipio de Prueba' });
    expect(lista).toEqual([{ campo: 'Nombre del organismo', antes: 'Municipio', despues: 'Municipio de Prueba' }]);
    expect(estaConfigurado(db)).toBe(true);
    expect(leerConfiguracion(db).nombre).toBe('Municipio de Prueba');
    expect(guardarSeccion(db, 'Ana', 'identidad', { nombre: 'Municipio de Prueba' })).toEqual([]);
    const registro = cambiosRecientes(db);
    expect(registro).toHaveLength(1);
    expect(registro[0]).toMatchObject({ usuarioNombre: 'Ana', seccion: 'Identidad' });
  });

  it('rechaza links peligrosos en el menú y no guarda nada', () => {
    expect(() => guardarSeccion(db, 'Ana', 'encabezado', { nav: [{ texto: 'Truco', href: 'javascript:alert(1)' }] })).toThrow(/https:\/\//);
    expect(estaConfigurado(db)).toBe(false);
  });

  it('rechaza un color sin contraste', () => {
    const colores = { ...CONFIG_GENERICA.colores, marca: '#ffcc00' };
    expect(() => guardarSeccion(db, 'Ana', 'identidad', { colores })).toThrow(ErrorConfiguracion);
  });

  it('no deja guardar campos de otra sección', () => {
    expect(() => guardarSeccion(db, 'Ana', 'textos', { nombre: 'Otro' })).toThrow(/fuera de la sección/);
  });

  it('respeta los límites de la maqueta (3 columnas en el footer)', () => {
    const col = { titulo: 'X', textos: [], links: [] };
    expect(() => guardarSeccion(db, 'Ana', 'encabezado', { columnas: [col, col, col, col] })).toThrow(/3 columnas/);
  });

  it('si la fila se editó a mano con datos inválidos, cae en los genéricos solo en esos campos', () => {
    db.insert(configuracion).values({ id: 1, datos: JSON.stringify({ nombre: 'Municipio de Prueba', nav: [{ texto: 'x', href: 'javascript:1' }] }) }).run();
    const c = leerConfiguracion(db);
    expect(c.nombre).toBe('Municipio de Prueba');
    expect(c.nav).toEqual([]);
  });

  it('el ejemplo de Lobos es válido completo', () => {
    const lobos = JSON.parse(readFileSync('ejemplos/lobos/configuracion.json', 'utf8')) as Partial<ConfigSitio>;
    guardarSeccion(db, 'x', 'identidad', { nombre: lobos.nombre!, colores: lobos.colores! });
    guardarSeccion(db, 'x', 'encabezado', { direccion: lobos.direccion!, sitioUrl: lobos.sitioUrl!, textoVolver: lobos.textoVolver!, migas: lobos.migas!, nav: lobos.nav!, destacado: lobos.destacado!, lema: lobos.lema!, columnas: lobos.columnas! });
    guardarSeccion(db, 'x', 'textos', { queEs: lobos.queEs!, modalidades: lobos.modalidades!, vigenciaMontos: lobos.vigenciaMontos! });
    expect(leerConfiguracion(db)).toMatchObject(lobos);
  });
});

describe('letraDecorativa', () => {
  it('usa la inicial de la última palabra', () => {
    expect(letraDecorativa('Municipio de Lobos')).toBe('L');
    expect(letraDecorativa('Municipio')).toBe('M');
    expect(letraDecorativa('Municipalidad de General Paz')).toBe('P');
  });
});

describe('registro de listas', () => {
  it('registra solo los links agregados y quitados, o el nuevo orden', () => {
    const a = { texto: 'A', href: 'https://a.gob.ar/' };
    const b = { texto: 'B', href: 'https://b.gob.ar/' };
    const c = { texto: 'C', href: 'https://c.gob.ar/' };
    guardarSeccion(db, 'x', 'encabezado', { nav: [a, b] });
    expect(guardarSeccion(db, 'x', 'encabezado', { nav: [a, c] })).toEqual([{ campo: 'Menú del header', antes: 'B (https://b.gob.ar/)', despues: 'C (https://c.gob.ar/)' }]);
    expect(guardarSeccion(db, 'x', 'encabezado', { nav: [c, a] })).toEqual([
      { campo: 'Menú del header: nuevo orden', antes: 'A (https://a.gob.ar/) / C (https://c.gob.ar/)', despues: 'C (https://c.gob.ar/) / A (https://a.gob.ar/)' },
    ]);
  });
});

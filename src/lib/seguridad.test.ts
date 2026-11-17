import { describe, expect, it } from 'vitest';
import { destinoDespuesDeLogin, ipCliente, jsonParaScript } from './seguridad';
import { LimiteIntentos, textoEspera } from './limite-intentos';

describe('jsonParaScript', () => {
  it('no deja cerrar el bloque <script>', () => {
    const salida = jsonParaScript({ description: '</script><script>alert(1)</script>' });
    expect(salida).not.toContain('<');
    expect(salida).not.toContain('</');
  });

  it('sigue siendo el mismo JSON al parsearlo', () => {
    const valor = { a: '<b> & "c"', d: 'línea otra' };
    expect(JSON.parse(jsonParaScript(valor))).toEqual(valor);
  });
});

describe('destinoDespuesDeLogin', () => {
  it.each([
    [null, '/panel'],
    ['/panel', '/panel'],
    ['/panel/procedimientos/3', '/panel/procedimientos/3'],
    ['/panel?estado=llamado', '/panel?estado=llamado'],
    ['/panelx', '/panel'],
    ['/panel//otro.com', '/panel'],
    ['/panel/\\otro.com', '/panel'],
    ['https://otro.com/panel', '/panel'],
    ['//otro.com', '/panel'],
  ])('%s → %s', (volver, esperado) => {
    expect(destinoDespuesDeLogin(volver)).toBe(esperado);
  });
});

describe('LimiteIntentos', () => {
  const reloj = () => {
    let t = 1_000_000;
    return { ahora: () => t, avanzar: (ms: number) => (t += ms) };
  };

  it('bloquea la combinación IP + email después de 5 fallos', () => {
    const r = reloj();
    const l = new LimiteIntentos(r.ahora);
    for (let i = 0; i < 4; i++) l.registrarFallo('1.1.1.1', 'a@b.c');
    expect(l.espera('1.1.1.1', 'a@b.c')).toBe(0);
    l.registrarFallo('1.1.1.1', 'A@b.c ');
    expect(l.espera('1.1.1.1', 'a@b.c')).toBeGreaterThan(0);
    // Desde otra IP, la misma cuenta sigue disponible.
    expect(l.espera('2.2.2.2', 'a@b.c')).toBe(0);
    r.avanzar(15 * 60 * 1000 + 1);
    expect(l.espera('1.1.1.1', 'a@b.c')).toBe(0);
  });

  it('un ingreso correcto limpia los fallos', () => {
    const l = new LimiteIntentos(reloj().ahora);
    for (let i = 0; i < 4; i++) l.registrarFallo('1.1.1.1', 'a@b.c');
    l.registrarExito('1.1.1.1', 'a@b.c');
    l.registrarFallo('1.1.1.1', 'a@b.c');
    expect(l.espera('1.1.1.1', 'a@b.c')).toBe(0);
  });

  it('bloquea la IP que prueba muchos emails', () => {
    const l = new LimiteIntentos(reloj().ahora);
    for (let i = 0; i < 30; i++) l.registrarFallo('1.1.1.1', `u${i}@b.c`);
    expect(l.espera('1.1.1.1', 'nuevo@b.c')).toBeGreaterThan(0);
    expect(l.espera('2.2.2.2', 'nuevo@b.c')).toBe(0);
  });

  it('los fallos viejos no se acumulan', () => {
    const r = reloj();
    const l = new LimiteIntentos(r.ahora);
    for (let i = 0; i < 4; i++) l.registrarFallo('1.1.1.1', 'a@b.c');
    r.avanzar(16 * 60 * 1000);
    l.registrarFallo('1.1.1.1', 'a@b.c');
    expect(l.espera('1.1.1.1', 'a@b.c')).toBe(0);
  });

  it('el aviso dice cuántos minutos faltan', () => {
    expect(textoEspera(30_000)).toContain('1 minuto.');
    expect(textoEspera(14 * 60_000 + 1)).toContain('15 minutos');
  });
});

describe('ipCliente', () => {
  const proxy = '172.70.1.1';
  const con = (valor: string) => new Headers({ 'cf-connecting-ip': valor });

  it('sin la variable configurada, ignora la cabecera (alguien podría falsificarla)', () => {
    expect(ipCliente(con('200.45.1.10'), proxy, undefined)).toBe(proxy);
    expect(ipCliente(con('200.45.1.10'), proxy, '  ')).toBe(proxy);
  });

  it('con la variable, toma la IP real que manda el proxy (IPv4 e IPv6)', () => {
    expect(ipCliente(con('200.45.1.10'), proxy, 'cf-connecting-ip')).toBe('200.45.1.10');
    expect(ipCliente(con('2800:810:4a1::1'), proxy, 'CF-Connecting-IP')).toBe('2800:810:4a1::1');
  });

  it('si la cabecera falta o no parece una IP, vuelve a la dirección de la conexión', () => {
    expect(ipCliente(new Headers(), proxy, 'cf-connecting-ip')).toBe(proxy);
    expect(ipCliente(con('1.1.1.1, 2.2.2.2'), proxy, 'cf-connecting-ip')).toBe(proxy);
    expect(ipCliente(con('<script>'), proxy, 'cf-connecting-ip')).toBe(proxy);
    expect(ipCliente(con('x'.repeat(200)), proxy, 'cf-connecting-ip')).toBe(proxy);
  });

  it('dos visitantes detrás del mismo proxy tienen límites separados', () => {
    const l = new LimiteIntentos();
    const a = ipCliente(con('200.45.1.10'), proxy, 'cf-connecting-ip');
    const b = ipCliente(con('181.10.2.20'), proxy, 'cf-connecting-ip');
    for (let i = 0; i < 40; i++) l.registrarFallo(a, `persona${i}@municipio.gob.ar`);
    expect(l.espera(a, 'otra@municipio.gob.ar')).toBeGreaterThan(0);
    expect(l.espera(b, 'otra@municipio.gob.ar')).toBe(0);
  });
});

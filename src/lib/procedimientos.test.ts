import { beforeEach, describe, expect, it } from 'vitest';
import { crearDb, type Db } from './db';
import { usuarios } from './db/schema';
import {
  agregarAdjudicacion,
  actualizarProcedimiento,
  cambiarEstado,
  crearProcedimiento,
  detalle,
  detallePublico,
  eliminarProcedimiento,
  eliminarProcedimientoDefinitivo,
  ErrorNegocio,
  listarPanel,
  llamadosAbiertos,
  papelera,
  quitarAdjudicacion,
  quitarDocumento,
  registrarDocumento,
  restaurarProcedimiento,
  type Actor,
  type DatosProcedimiento,
} from './procedimientos';

let db: Db;
let compras: Actor;
let admin: Actor;

const publica = (extra: Partial<DatosProcedimiento> = {}): DatosProcedimiento => ({
  tipo: 'publica',
  numero: 7,
  anio: 2026,
  objeto: 'Restauración del Establecimiento Antigua E2 - Segunda Etapa',
  areaSolicitante: null,
  presupuestoOficial: 34591822675,
  valorPliego: 21000000,
  fechaApertura: new Date('2099-12-14T13:00:00Z'),
  lugarApertura: 'Salgado 40',
  invitados: null,
  cantidadOfertantes: null,
  observacionesPublicas: null,
  ...extra,
});

beforeEach(() => {
  db = crearDb(':memory:');
  const u = db.insert(usuarios).values([
    { nombre: 'Ana Compras', email: 'ana@municipio.gob.ar', hash: 'x', rol: 'compras' },
    { nombre: 'Admin', email: 'admin@municipio.gob.ar', hash: 'x', rol: 'admin' },
  ]).returning().all();
  compras = { id: u[0]!.id, nombre: u[0]!.nombre, rol: 'compras' };
  admin = { id: u[1]!.id, nombre: u[1]!.nombre, rol: 'admin' };
});

function acciones(id: number) {
  return detalle(db, id).historial.map((h) => h.accion).reverse();
}

describe('ciclo completo de una licitación pública', () => {
  it('registra cada paso en el historial', () => {
    const id = crearProcedimiento(db, compras, publica());
    cambiarEstado(db, compras, id, 'llamado', null);
    actualizarProcedimiento(db, compras, id, publica({ fechaApertura: new Date('2099-12-20T13:00:00Z') }));
    cambiarEstado(db, compras, id, 'evaluacion', null);
    agregarAdjudicacion(db, compras, id, { proveedor: 'Cavexe S.A.', cuit: '30123456781', monto: 30000000000 });
    agregarAdjudicacion(db, compras, id, { proveedor: 'Costa Nicolás', cuit: '20123456786', monto: 1500000000 });
    cambiarEstado(db, compras, id, 'adjudicada', null);

    const d = detalle(db, id);
    expect(d.estado).toBe('adjudicada');
    expect(d.totalAdjudicado).toBe(31500000000);
    expect(acciones(id)).toEqual([
      'creado',
      'estado',
      'prorroga',
      'estado',
      'adjudicacion_agregada',
      'adjudicacion_agregada',
      'estado',
    ]);
    const prorroga = d.historial.find((h) => h.accion === 'prorroga');
    expect(prorroga?.publico).toBe(true);
    expect(prorroga?.usuarioNombre).toBe('Ana Compras');
  });

  it('no registra nada si se guarda sin cambios', () => {
    const id = crearProcedimiento(db, compras, publica());
    expect(actualizarProcedimiento(db, compras, id, publica())).toEqual([]);
    expect(acciones(id)).toEqual(['creado']);
  });

  it('cambiar la fecha en borrador no es prórroga', () => {
    const id = crearProcedimiento(db, compras, publica());
    actualizarProcedimiento(db, compras, id, publica({ fechaApertura: new Date('2099-12-20T13:00:00Z') }));
    expect(acciones(id)).toEqual(['creado', 'campo']);
  });

  it('rechaza transiciones inválidas aunque se saltee la UI', () => {
    const id = crearProcedimiento(db, compras, publica());
    expect(() => cambiarEstado(db, compras, id, 'adjudicada', null)).toThrow(ErrorNegocio);
    expect(acciones(id)).toEqual(['creado']);
  });

  it('los adjudicatarios solo se cargan con las ofertas abiertas', () => {
    const id = crearProcedimiento(db, compras, publica({ tipo: 'privada' }));
    const germano = { proveedor: 'Germano S.R.L.', cuit: '20123456786', monto: 100 };
    expect(() => agregarAdjudicacion(db, compras, id, germano)).toThrow(/En trámite de adjudicación/);
    cambiarEstado(db, compras, id, 'tramite', null);
    const adj = agregarAdjudicacion(db, compras, id, germano);
    cambiarEstado(db, compras, id, 'adjudicada', null);
    expect(() => quitarAdjudicacion(db, compras, adj)).toThrow(/cerrado/);
    expect(() => agregarAdjudicacion(db, admin, id, germano)).toThrow(/reabrirlo/);
  });

  it('en el llamado no se cargan adjudicatarios ni ofertas', () => {
    const id = crearProcedimiento(db, compras, publica());
    cambiarEstado(db, compras, id, 'llamado', null);
    expect(() => agregarAdjudicacion(db, compras, id, { proveedor: 'X S.A.', cuit: '20123456786', monto: 1 })).toThrow(/En evaluación/);
    expect(() => actualizarProcedimiento(db, compras, id, publica({ cantidadOfertantes: 3 }))).toThrow(/Ofertas|ofertantes/i);
    cambiarEstado(db, compras, id, 'evaluacion', null);
    expect(() => actualizarProcedimiento(db, compras, id, publica({ cantidadOfertantes: 3 }))).not.toThrow();
  });

  it('número y año quedan fijos al publicar, salvo para un admin', () => {
    const id = crearProcedimiento(db, compras, publica());
    cambiarEstado(db, compras, id, 'llamado', null);
    expect(() => actualizarProcedimiento(db, compras, id, publica({ numero: 8 }))).toThrow(/Número/);
    expect(actualizarProcedimiento(db, admin, id, publica({ numero: 8 }))).toHaveLength(1);
  });

  it('cerrado solo admite observaciones', () => {
    const id = crearProcedimiento(db, compras, publica());
    cambiarEstado(db, compras, id, 'llamado', null);
    cambiarEstado(db, compras, id, 'anulada', 'Se dejó sin efecto por decreto');
    expect(() => actualizarProcedimiento(db, admin, id, publica({ objeto: 'Otro objeto distinto' }))).toThrow(/cerrado/);
    expect(actualizarProcedimiento(db, compras, id, publica({ observacionesPublicas: 'Decreto 123/2026' }))).toHaveLength(1);
  });

  it('al crear no se aceptan datos de etapas posteriores', () => {
    expect(() => crearProcedimiento(db, compras, publica({ cantidadOfertantes: 2 }))).toThrow(/Se completa desde/);
  });

  it('los campos de otra modalidad se descartan', () => {
    const id = crearProcedimiento(db, compras, publica({ tipo: 'concurso', invitados: 5 }));
    const p = detalle(db, id).procedimiento;
    expect(p.valorPliego).toBeNull();
    expect(p.lugarApertura).toBeNull();
    expect(p.invitados).toBe(5);
  });

  it('no permite duplicar tipo/número/año', () => {
    crearProcedimiento(db, compras, publica());
    expect(() => crearProcedimiento(db, compras, publica())).toThrow(/Ya existe/);
    expect(() => crearProcedimiento(db, compras, publica({ tipo: 'privada' }))).not.toThrow();
  });
});

describe('visibilidad pública', () => {
  it('el borrador no se ve; al abrir el llamado aparece en llamados abiertos', () => {
    const id = crearProcedimiento(db, compras, publica());
    expect(detallePublico(db, 'publica', 2026, 7)).toBeNull();
    cambiarEstado(db, compras, id, 'llamado', null);
    expect(detallePublico(db, 'publica', 2026, 7)).not.toBeNull();
    expect(llamadosAbiertos(db, new Date('2099-11-02T00:00:00Z')).map((p) => p.id)).toEqual([id]);
    expect(llamadosAbiertos(db, new Date('2100-01-01T00:00:00Z'))).toEqual([]);
  });

  it('los documentos internos y quitados no se publican', () => {
    const id = crearProcedimiento(db, compras, publica());
    cambiarEstado(db, compras, id, 'llamado', null);
    const doc = { categoria: 'Pliego de bases y condiciones', mime: 'application/pdf', tamano: 10, nombreOriginal: 'a.pdf' };
    registrarDocumento(db, compras, id, { ...doc, titulo: 'Pliego', archivo: 'a', publico: true });
    registrarDocumento(db, compras, id, { ...doc, titulo: 'Nota interna', archivo: 'b', publico: false });
    const quitado = registrarDocumento(db, compras, id, { ...doc, titulo: 'Viejo', archivo: 'c', publico: true });
    quitarDocumento(db, compras, quitado);
    expect(detallePublico(db, 'publica', 2026, 7)?.documentos.map((d) => d.titulo)).toEqual(['Pliego']);
  });
});

describe('documentos y publicación por etapa', () => {
  const doc = (categoria: string) => ({
    titulo: categoria, categoria, archivo: 'x.pdf', nombreOriginal: 'x.pdf', mime: 'application/pdf', tamano: 1, publico: true,
  });

  it('no se suben documentos de etapas posteriores', () => {
    const id = crearProcedimiento(db, compras, publica());
    expect(() => registrarDocumento(db, compras, id, doc('Acta de apertura'))).toThrow(/no se puede subir/);
    expect(() => registrarDocumento(db, compras, id, doc('Pliego de bases y condiciones'))).not.toThrow();
    cambiarEstado(db, compras, id, 'llamado', null);
    cambiarEstado(db, compras, id, 'evaluacion', null);
    expect(() => registrarDocumento(db, compras, id, doc('Acta de apertura'))).not.toThrow();
    expect(() => registrarDocumento(db, compras, id, doc('Orden de compra / contrato'))).toThrow(/no se puede subir/);
  });

  it('los adjudicatarios no se publican hasta adjudicar', () => {
    const id = crearProcedimiento(db, compras, publica());
    cambiarEstado(db, compras, id, 'llamado', null);
    cambiarEstado(db, compras, id, 'evaluacion', null);
    agregarAdjudicacion(db, compras, id, { proveedor: 'Preadjudicada S.A.', cuit: '20123456786', monto: 500 });
    expect(detallePublico(db, 'publica', 2026, 7)?.adjudicaciones).toEqual([]);
    cambiarEstado(db, compras, id, 'adjudicada', null);
    expect(detallePublico(db, 'publica', 2026, 7)?.adjudicaciones.map((a) => a.proveedor)).toEqual(['Preadjudicada S.A.']);
  });
});

describe('papelera', () => {
  it('eliminar, restaurar y eliminar definitivo', () => {
    const id = crearProcedimiento(db, compras, publica());
    registrarDocumento(db, compras, id, {
      titulo: 'Pliego', categoria: 'Pliego de bases y condiciones', archivo: 'uuid.pdf', nombreOriginal: 'p.pdf', mime: 'application/pdf', tamano: 1, publico: true,
    });
    eliminarProcedimiento(db, compras, id);
    expect(listarPanel(db, {})).toHaveLength(0);
    expect(papelera(db).procedimientos.map((p) => p.id)).toEqual([id]);
    expect(() => actualizarProcedimiento(db, compras, id, publica())).toThrow(/papelera/);

    restaurarProcedimiento(db, compras, id);
    expect(listarPanel(db, {})).toHaveLength(1);
    expect(acciones(id)).toEqual(['creado', 'documento_agregado', 'eliminado', 'restaurado']);

    expect(() => eliminarProcedimientoDefinitivo(db, admin, id)).toThrow(/papelera/);
    eliminarProcedimiento(db, compras, id);
    expect(() => eliminarProcedimientoDefinitivo(db, compras, id)).toThrow(/administrador/);
    expect(eliminarProcedimientoDefinitivo(db, admin, id)).toEqual(['uuid.pdf']);
    expect(papelera(db).procedimientos).toHaveLength(0);
  });
});

describe('listados', () => {
  it('el total y los documentos se calculan por procedimiento', () => {
    const a = crearProcedimiento(db, compras, publica({ tipo: 'privada', numero: 1 }));
    const b = crearProcedimiento(db, compras, publica({ tipo: 'privada', numero: 2 }));
    cambiarEstado(db, compras, a, 'tramite', null);
    agregarAdjudicacion(db, compras, a, { proveedor: 'Uno', cuit: '20123456786', monto: 100 });
    agregarAdjudicacion(db, compras, a, { proveedor: 'Dos', cuit: '20123456786', monto: 50 });
    registrarDocumento(db, compras, b, {
      titulo: 'X', categoria: 'Otro', archivo: 'x.pdf', nombreOriginal: 'x.pdf', mime: 'application/pdf', tamano: 1, publico: true,
    });
    const filas = new Map(listarPanel(db, {}).map((f) => [f.p.id, f]));
    expect(filas.get(a)).toMatchObject({ total: 150, documentos: 0, adjudicatarios: 'Uno, Dos' });
    expect(filas.get(b)).toMatchObject({ total: 0, documentos: 1, adjudicatarios: null });
  });
});

describe('CUIT de adjudicatarios', () => {
  it('es obligatorio', () => {
    const id = crearProcedimiento(db, compras, publica({ tipo: 'privada' }));
    cambiarEstado(db, compras, id, 'tramite', null);
    expect(() => agregarAdjudicacion(db, compras, id, { proveedor: 'Sin CUIT S.A.', cuit: '  ', monto: 1 })).toThrow(/Indicá el CUIT/);
  });

  it('se guarda con guiones y se rechaza si el verificador no coincide', () => {
    const id = crearProcedimiento(db, compras, publica({ tipo: 'privada' }));
    cambiarEstado(db, compras, id, 'tramite', null);
    expect(() => agregarAdjudicacion(db, compras, id, { proveedor: 'Mal S.A.', cuit: '30-12345678-9', monto: 1 })).toThrow(/verificador/);
    agregarAdjudicacion(db, compras, id, { proveedor: 'Bien S.A.', cuit: '30123456781', monto: 1 });
    expect(detalle(db, id).adjudicaciones[0]?.cuit).toBe('30-12345678-1');
  });
});

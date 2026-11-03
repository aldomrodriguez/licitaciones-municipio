import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { crearDb, type Db } from './db';
import { sesiones, usuarios } from './db/schema';
import { hashear, iniciarSesion, validarSesion } from './auth';
import { cambiarActivo, cambiarClavePropia, crearUsuario, ErrorUsuario, resetearClave, ultimosCambiosUsuarios } from './usuarios';

let db: Db;
const admin = { id: 0, nombre: 'Admin' };

beforeEach(async () => {
  db = crearDb(':memory:');
  admin.id = db.insert(usuarios).values({ nombre: 'Admin', email: 'admin@x.gob.ar', hash: await hashear('clave-admin-larga'), rol: 'admin' }).returning().get().id;
});

const sesionesDe = (id: number) => db.select().from(sesiones).where(eq(sesiones.usuarioId, id)).all().length;

describe('alta y reseteo', () => {
  it('la clave generada es provisoria y el alta queda registrada', async () => {
    const clave = await crearUsuario(db, admin, { nombre: 'Ana Pérez', email: ' Ana@X.gob.ar ', rol: 'compras' });
    const r = await iniciarSesion(db, 'ana@x.gob.ar', clave);
    expect(r?.usuario.debeCambiarClave).toBe(true);
    expect(validarSesion(db, r?.token)?.debeCambiarClave).toBe(true);
    const [cambio] = ultimosCambiosUsuarios(db);
    expect(cambio).toMatchObject({ accion: 'alta', actorNombre: 'Admin', usuarioEmail: 'ana@x.gob.ar', detalle: 'Compras' });
  });

  it('no permite emails repetidos', async () => {
    await expect(crearUsuario(db, admin, { nombre: 'Otro', email: 'admin@x.gob.ar', rol: 'compras' })).rejects.toThrow(ErrorUsuario);
  });

  it('resetear deja la clave vieja inútil, cierra sesiones y vuelve a pedir el cambio', async () => {
    const clave = await crearUsuario(db, admin, { nombre: 'Ana', email: 'ana@x.gob.ar', rol: 'compras' });
    const id = (await iniciarSesion(db, 'ana@x.gob.ar', clave))!.usuario.id;
    const nueva = await resetearClave(db, admin, id);
    expect(sesionesDe(id)).toBe(0);
    expect(await iniciarSesion(db, 'ana@x.gob.ar', clave)).toBeNull();
    expect((await iniciarSesion(db, 'ana@x.gob.ar', nueva))?.usuario.debeCambiarClave).toBe(true);
    expect(ultimosCambiosUsuarios(db)[0]?.accion).toBe('reseteo_clave');
  });
});

describe('baja', () => {
  it('no se puede dar de baja a uno mismo', () => {
    expect(() => cambiarActivo(db, admin, admin.id, false)).toThrow('vos mismo');
  });

  it('la baja cierra sesiones y queda registrada; repetirla no duplica el registro', async () => {
    const clave = await crearUsuario(db, admin, { nombre: 'Ana', email: 'ana@x.gob.ar', rol: 'compras' });
    const id = (await iniciarSesion(db, 'ana@x.gob.ar', clave))!.usuario.id;
    cambiarActivo(db, admin, id, false);
    cambiarActivo(db, admin, id, false);
    expect(sesionesDe(id)).toBe(0);
    expect(ultimosCambiosUsuarios(db).filter((c) => c.accion === 'baja')).toHaveLength(1);
  });
});

describe('cambio de la propia contraseña', () => {
  it('pide la actual', async () => {
    await expect(cambiarClavePropia(db, admin.id, { actual: 'otra-cosa-larga', nueva: 'nueva-clave-123', repetir: 'nueva-clave-123' }, undefined)).rejects.toThrow(
      'actual no es correcta',
    );
  });

  it('exige que la nueva sea distinta y que coincida', async () => {
    await expect(cambiarClavePropia(db, admin.id, { actual: 'clave-admin-larga', nueva: 'clave-admin-larga', repetir: 'clave-admin-larga' }, undefined)).rejects.toThrow('distinta');
    await expect(cambiarClavePropia(db, admin.id, { actual: 'clave-admin-larga', nueva: 'nueva-clave-123', repetir: 'nueva-clave-124' }, undefined)).rejects.toThrow('no coinciden');
  });

  it('quita la marca de provisoria y cierra las otras sesiones, no la actual', async () => {
    const clave = await crearUsuario(db, admin, { nombre: 'Ana', email: 'ana@x.gob.ar', rol: 'compras' });
    const actual = (await iniciarSesion(db, 'ana@x.gob.ar', clave))!;
    const otra = (await iniciarSesion(db, 'ana@x.gob.ar', clave))!;
    await cambiarClavePropia(db, actual.usuario.id, { actual: clave, nueva: 'mi-clave-propia-1', repetir: 'mi-clave-propia-1' }, actual.token);
    expect(validarSesion(db, actual.token)?.debeCambiarClave).toBe(false);
    expect(validarSesion(db, otra.token)).toBeNull();
    expect(ultimosCambiosUsuarios(db)[0]).toMatchObject({ accion: 'cambio_clave', actorNombre: 'Ana' });
  });
});

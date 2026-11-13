import type { APIRoute } from 'astro';
import { db } from '../../../../lib/db';
import { TAMANO_MAXIMO, borrarArchivo, guardarArchivo } from '../../../../lib/archivos';
import { MARGEN_FORMULARIO, excedeTamano } from '../../../../lib/seguridad';
import { esCategoria } from '../../../../lib/categorias';
import { ErrorNegocio, registrarDocumento } from '../../../../lib/procedimientos';

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

/** Subida de un documento (uno por pedido, para poder mostrar el progreso). */
export const POST: APIRoute = async ({ request, locals }) => {
  const u = locals.usuario;
  if (!u) return texto('Tu sesión venció. Volvé a ingresar.', 401);
  if (excedeTamano(request, TAMANO_MAXIMO + MARGEN_FORMULARIO)) return texto('El archivo supera los 25 MB.', 413);
  const datos = await request.formData().catch(() => null);
  if (!datos) return texto('El archivo no llegó completo.', 400);

  const procedimientoId = Number(datos.get('procedimientoId'));
  const titulo = String(datos.get('titulo') ?? '').trim().slice(0, 200);
  const categoria = String(datos.get('categoria') ?? '');
  const archivo = datos.get('archivo');
  if (!Number.isInteger(procedimientoId)) return texto('Procedimiento inválido.', 400);
  if (!titulo) return texto('Falta el título.', 400);
  if (!esCategoria(categoria)) return texto('Tipo de documento inválido.', 400);
  if (!(archivo instanceof File)) return texto('No se recibió el archivo.', 400);

  let guardado;
  try {
    guardado = await guardarArchivo(archivo);
  } catch (e) {
    return texto((e as Error).message, 400);
  }
  try {
    const id = registrarDocumento(db(), { id: u.id, nombre: u.nombre, rol: u.rol }, procedimientoId, {
      ...guardado,
      titulo,
      categoria,
      publico: datos.get('publico') === 'si',
    });
    return Response.json({ id }, { status: 201 });
  } catch (e) {
    await borrarArchivo(guardado.archivo);
    if (e instanceof ErrorNegocio) return texto(e.errores.join(' '), 400);
    throw e;
  }
};

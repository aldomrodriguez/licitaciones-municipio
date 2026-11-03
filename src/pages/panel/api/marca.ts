import type { APIRoute } from 'astro';
import { db } from '../../../lib/db';
import { ErrorConfiguracion, guardarSeccion, leerConfiguracion } from '../../../lib/configuracion';
import { borrarImagenMarca, guardarImagenMarca, type ClaseImagen } from '../../../lib/marca-archivos';

const texto = (mensaje: string, status: number) =>
  new Response(mensaje, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

/** Sube el logo o el favicon (solo admin). Reemplaza el anterior y lo registra en los cambios de configuración. */
export const POST: APIRoute = async ({ request, locals }) => {
  const usuario = locals.usuario;
  if (!usuario) return texto('Tu sesión venció. Volvé a ingresar.', 401);
  if (usuario.rol !== 'admin') return texto('Esta acción es solo para administradores.', 403);

  const datos = await request.formData();
  const clase = datos.get('clase');
  const archivo = datos.get('archivo');
  if (clase !== 'logo' && clase !== 'favicon') return texto('Falta indicar si es el logo o el ícono.', 400);
  if (!(archivo instanceof File)) return texto('No llegó ningún archivo.', 400);

  const r = await guardarImagenMarca(clase as ClaseImagen, new Uint8Array(await archivo.arrayBuffer()), archivo.name);
  if ('error' in r) return texto(r.error, 400);

  const conexion = db();
  const anterior = leerConfiguracion(conexion)[clase];
  try {
    guardarSeccion(conexion, usuario.nombre, 'identidad', { [clase]: r.imagen });
  } catch (e) {
    await borrarImagenMarca(r.imagen.archivo);
    if (e instanceof ErrorConfiguracion) return texto(e.message, 400);
    throw e;
  }
  await borrarImagenMarca(anterior?.archivo);
  return Response.json(r.imagen, { status: 201 });
};

import type { APIRoute } from 'astro';
import { respuestaImagenMarca } from '../../lib/marca-archivos';

/** Logo y favicon configurados desde el panel. */
export const GET: APIRoute = ({ params }) => respuestaImagenMarca(params.archivo ?? '');

/**
 * Copia la identidad de Muni-2026 (logo, favicon, fuentes Geist, links del header y footer)
 * a este proyecto. Se corre a mano cuando cambia el sitio: `pnpm sync:marca`.
 *
 * No se scrapea en runtime porque las rutas de Muni-2026 llevan hashes de build
 * que cambian con cada deploy.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORIGEN = 'https://municipiodelobos.gob.ar';
const PAGINA = `${ORIGEN}/Muni-2026/municipio/`;
const RAIZ = fileURLToPath(new URL('..', import.meta.url));

interface Link {
  texto: string;
  href: string;
}

async function bajarTexto(url: string): Promise<string> {
  const r = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (sync-marca licitaciones)' } });
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.text();
}

async function bajarArchivo(url: string, destino: string) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  const ruta = join(RAIZ, destino);
  await mkdir(dirname(ruta), { recursive: true });
  await writeFile(ruta, new Uint8Array(await r.arrayBuffer()));
  console.log(`  ✓ ${destino}`);
}

function absoluto(href: string): string {
  if (href.startsWith('http') || href.startsWith('tel:') || href.startsWith('mailto:')) return href;
  // Anclas sueltas del footer (#intendencia, #transparencia) apuntan a la página Municipio.
  if (href.startsWith('#')) return `${ORIGEN}/Muni-2026/municipio${href}`;
  return new URL(href, ORIGEN).toString();
}

function decodificarTexto(s: string): string {
  return s.replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

function links(html: string): Link[] {
  return [...html.matchAll(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map(([, href = '', texto = '']) => ({ href: absoluto(href), texto: decodificarTexto(texto).replace(/\s*→$/, '') }))
    .filter((l) => l.texto && !l.href.includes('/cdn-cgi/'));
}

/** Cloudflare ofusca los mails: el primer byte es la clave XOR del resto. */
function decodificarCfEmail(hex: string): string {
  const clave = parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16) ^ clave);
  return out;
}

async function main() {
  console.log(`Leyendo ${PAGINA}`);
  const html = await bajarTexto(PAGINA);

  const header = html.match(/<header class="inner-header">([\s\S]*?)<\/header>/)?.[1];
  const footer = html.match(/<footer>([\s\S]*?)<\/footer>/)?.[1];
  if (!header || !footer) throw new Error('No se encontró el header o el footer: cambió el markup de Muni-2026.');

  const nav = links(header.match(/<nav[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '');
  const tramites = links(header).find((l) => l.href.includes('tramites'));
  const columnas = [...footer.matchAll(/<div><h3>([^<]+)<\/h3>([\s\S]*?)<\/div>/g)].map(([, titulo = '', cuerpo = '']) => ({
    titulo,
    links: links(cuerpo),
    textos: [...cuerpo.matchAll(/<p>([^<]+)<\/p>/g)].map(([, t = '']) => decodificarTexto(t)),
  }));
  const cfEmail = footer.match(/data-cfemail="([0-9a-f]+)"/)?.[1];
  const lema = decodificarTexto(footer.match(/footer-identity[\s\S]*?<p>([\s\S]*?)<\/p>/)?.[1] ?? '');

  const marca = {
    sincronizado: new Date().toISOString(),
    origen: PAGINA,
    inicio: `${ORIGEN}/Muni-2026/`,
    nav,
    tramites: tramites ?? { texto: 'Trámites online', href: 'https://tramites.municipiodelobos.gob.ar/' },
    lema,
    columnas,
    email: cfEmail ? decodificarCfEmail(cfEmail) : null,
  };
  const destinoJson = join(RAIZ, 'src/components/marca/marca.json');
  await mkdir(dirname(destinoJson), { recursive: true });
  await writeFile(destinoJson, `${JSON.stringify(marca, null, 2)}\n`);
  console.log('  ✓ src/components/marca/marca.json');

  await bajarArchivo(`${ORIGEN}/Muni-2026/logo-municipio-lobos.png`, 'public/marca/logo-municipio-lobos.png');
  await bajarArchivo(`${ORIGEN}/Muni-2026/favicon.png`, 'public/favicon.png');

  const fuentes = [...html.matchAll(/href="([^"]+\/(geist(?:-mono)?)-[0-9a-f]+\.woff2)"/g)];
  for (const [, ruta = '', familia = ''] of fuentes) {
    await bajarArchivo(new URL(ruta, ORIGEN).toString(), `public/fonts/${familia}.woff2`);
  }
  if (fuentes.length === 0) console.warn('  ! No se encontraron las fuentes Geist en la página.');
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});

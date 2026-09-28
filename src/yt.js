import { Innertube, UniversalCache } from 'youtubei.js/web';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Le fetch de Tauri contourne le CORS du navigateur, mais n'envoie pas
// les en-têtes d'un vrai navigateur : on les force nous-mêmes,
// sinon YouTube répond 403 sur la plupart des requêtes.
function brandedFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('User-Agent')) headers.set('User-Agent', UA);
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'fr-FR,fr;q=0.9');
  if (!headers.has('Origin')) headers.set('Origin', 'https://www.youtube.com');
  if (!headers.has('Referer')) headers.set('Referer', 'https://www.youtube.com/');
  return tauriFetch(input, { ...init, headers });
}

let yt;
async function client() {
  if (!yt) {
    yt = await Innertube.create({
      lang: 'fr',
      location: 'FR',
      fetch: brandedFetch,
      cache: new UniversalCache(false),
      generate_session_locally: true
    });
  }
  return yt;
}

export async function search(q) {
  const c = await client();
  const r = await c.search(q, { type: 'video' });
  return (r.results || [])
    .filter((v) => v.type === 'Video')
    .map((v) => ({
      id: v.video_id ?? v.id,
      title: v.title?.text ?? '',
      thumb: v.thumbnails?.[0]?.url,
      author: v.author?.name ?? '',
      dur: v.duration?.text ?? '',
      views: v.short_view_count?.text ?? ''
    }));
}

export async function stream(id) {
  const c = await client();
  // Le client WEB tient mieux la route que IOS pour ce genre de requêtes.
  const info = await c.getBasicInfo(id, 'WEB');
  const f = info.chooseFormat({ type: 'video+audio', quality: 'best' });
  const url = f.url ?? (await f.decipher(c.session.player));
  return { url, title: info.basic_info.title, author: info.basic_info.author };
}

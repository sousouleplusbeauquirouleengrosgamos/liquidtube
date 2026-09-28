import { Innertube, UniversalCache } from 'youtubei.js/web';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { BG } from 'bgutils-js';
import { JSDOM } from 'jsdom';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Le fetch de Tauri ne pose pas les mêmes en-têtes qu'un vrai navigateur.
function brandedFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('User-Agent')) headers.set('User-Agent', UA);
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'fr-FR,fr;q=0.9');
  if (!headers.has('Origin')) headers.set('Origin', 'https://www.youtube.com');
  if (!headers.has('Referer')) headers.set('Referer', 'https://www.youtube.com/');
  return tauriFetch(input, { ...init, headers });
}

// Depuis 2026, YouTube exige un "PoToken" (preuve d'origine) sur la plupart
// des requêtes, y compris la recherche. bgutils-js le génère en simulant
// l'environnement JS que YouTube vérifie (BotGuard).
async function makePoToken(visitorData) {
  const dom = new JSDOM();
  Object.assign(globalThis, { window: dom.window, document: dom.window.document });

  const challengeRes = await BG.Challenge.create({
    fetch: brandedFetch,
    globalObj: globalThis,
    requestKey: 'O43z0dpjhgX20SCx4KAo'
  });
  if (!challengeRes) throw new Error('Impossible de créer le challenge BotGuard');

  const interpreterUrl = challengeRes.interpreterJavascriptUrl?.privateDoNotAccessOrElseSafeScriptWrappedValue;
  if (interpreterUrl) {
    const script = await (await brandedFetch(`https:${interpreterUrl}`)).text();
    new Function(script)();
  }

  const poTokenResult = await BG.PoToken.generate({
    program: challengeRes.program,
    globalName: challengeRes.globalName,
    bgConfig: {
      fetch: brandedFetch,
      globalObj: globalThis,
      identifier: visitorData,
      requestKey: 'O43z0dpjhgX20SCx4KAo'
    }
  });
  return poTokenResult.poToken;
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
    try {
      const visitorData = yt.session.context.client.visitorData;
      const poToken = await makePoToken(visitorData);
      yt.session.po_token = poToken;
      yt.session.context.client.visitorData = visitorData;
    } catch (e) {
      // Si la génération échoue, on continue quand même : certaines requêtes
      // passent encore sans PoToken selon les moments.
      console.warn('PoToken indisponible :', e);
    }
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
  const info = await c.getBasicInfo(id, 'WEB');
  const f = info.chooseFormat({ type: 'video+audio', quality: 'best' });
  const url = f.url ?? (await f.decipher(c.session.player));
  return { url, title: info.basic_info.title, author: info.basic_info.author };
}

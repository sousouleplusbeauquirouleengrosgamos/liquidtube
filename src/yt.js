import { Innertube, UniversalCache } from 'youtubei.js/web';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function brandedFetch(input, init = {}) {
  const headers = new Headers(init.headers || {});
  if (!headers.has('User-Agent')) headers.set('User-Agent', UA);
  if (!headers.has('Accept-Language')) headers.set('Accept-Language', 'fr-FR,fr;q=0.9');
  if (!headers.has('Origin')) headers.set('Origin', 'https://www.youtube.com');
  if (!headers.has('Referer')) headers.set('Referer', 'https://www.youtube.com/');
  return tauriFetch(input, { ...init, headers });
}

// --- Implémentation du flux BotGuard, telle que documentée par bgutils-js ---
// (https://github.com/LuanRT/BgUtils) — la même approche que celle utilisée
// par des apps comme FreeTube pour obtenir un PoToken valide.

const REQUEST_KEY = 'O43z0dpjhgX20SCx4KAo';
const GOOG_API_KEY = 'AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw';

function b64ToU8(b64) {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function u8ToB64(u8) {
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function getIntegrityToken(botguardResponse) {
  const res = await brandedFetch('https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/GenerateIT', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json+protobuf',
      'x-goog-api-key': GOOG_API_KEY,
      'x-user-agent': 'grpc-web-javascript/0.1'
    },
    body: JSON.stringify([REQUEST_KEY, botguardResponse])
  });
  const [integrityToken] = await res.json();
  return integrityToken;
}

// Construit un minteur de PoToken à partir d'une session Innertube déjà créée.
async function buildMinter(innertube) {
  const challenge = await innertube.getAttestationChallenge('ENGAGEMENT_TYPE_UNBOUND');
  const bg = challenge?.bg_challenge ?? challenge?.bgChallenge;
  if (!bg) throw new Error('Pas de challenge BotGuard reçu');

  const interpreterUrl =
    bg.interpreter_url?.private_do_not_access_or_else_trusted_resource_url_wrapped_value ??
    bg.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrapped_value;
  const program = bg.program;
  const globalName = bg.global_name ?? bg.globalName;

  if (!interpreterUrl || !program || !globalName) throw new Error('Challenge BotGuard incomplet');

  if (!window[globalName]) {
    const script = await (await brandedFetch(`https:${interpreterUrl}`)).text();
    // eslint-disable-next-line no-new-func
    new Function(script)();
  }

  const vm = window[globalName];
  if (!vm || !vm.a) throw new Error('VM BotGuard indisponible');

  let vmFns = {};
  await vm.a(
    program,
    (asyncSnapshotFunction, shutdownFunction, passEventFunction, checkCameraFunction) => {
      vmFns = { asyncSnapshotFunction, shutdownFunction, passEventFunction, checkCameraFunction };
    },
    true,
    undefined,
    () => {},
    [[], []],
    undefined,
    false,
    undefined
  );
  if (!vmFns.asyncSnapshotFunction) throw new Error('Fonction de snapshot BotGuard indisponible');

  const webPoSignalOutput = [];
  const botguardResponse = await new Promise((resolve, reject) => {
    vmFns.asyncSnapshotFunction(
      (response) => resolve(response),
      [undefined, undefined, webPoSignalOutput, undefined]
    );
    setTimeout(() => reject(new Error('Timeout BotGuard')), 8000);
  });

  const integrityToken = await getIntegrityToken(botguardResponse);
  const getMinter = webPoSignalOutput[0];
  if (!getMinter) throw new Error('Minteur PoToken indisponible');

  const mintCallback = await getMinter(b64ToU8(integrityToken));
  if (!(mintCallback instanceof Function)) throw new Error('Le minteur PoToken a échoué');

  return async (contentBinding) => {
    const result = await mintCallback(new TextEncoder().encode(contentBinding));
    if (!(result instanceof Uint8Array)) throw new Error('PoToken invalide');
    return u8ToB64(result);
  };
}

// --- Client YouTube ---

let yt;
let minter;

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
      minter = await buildMinter(yt);
      const visitorData = yt.session.context.client.visitorData;
      yt.session.po_token = await minter(visitorData);
    } catch (e) {
      console.warn('PoToken indisponible, on continue sans :', e);
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
  // Un PoToken lié à la vidéo précise est plus fiable qu'un token générique.
  if (minter) {
    try { c.session.po_token = await minter(id); } catch { /* on garde le précédent */ }
  }
  const info = await c.getBasicInfo(id, 'WEB');
  const f = info.chooseFormat({ type: 'video+audio', quality: 'best' });
  const url = f.url ?? (await f.decipher(c.session.player));
  return { url, title: info.basic_info.title, author: info.basic_info.author };
}

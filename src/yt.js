import { Innertube } from 'youtubei.js/web';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

let yt;
async function client() {
  if (!yt) yt = await Innertube.create({ lang: 'fr', location: 'FR', fetch: tauriFetch });
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
  const info = await c.getBasicInfo(id, 'IOS');
  const f = info.chooseFormat({ type: 'video+audio', quality: 'best' });
  const url = f.url ?? (await f.decipher(c.session.player));
  return { url, title: info.basic_info.title, author: info.basic_info.author };
}

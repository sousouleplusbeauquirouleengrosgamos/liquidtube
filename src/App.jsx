import { useEffect, useState } from 'react';
import { search, stream } from './yt.js';

export default function App() {
  const [q, setQ] = useState('');
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [play, setPlay] = useState(null);

  async function run(term) {
    setBusy(true); setErr('');
    try { setItems(await search(term)); }
    catch (e) { setErr('Recherche impossible : ' + (e?.message || e)); }
    setBusy(false);
  }
  useEffect(() => { run('à la une'); }, []);

  async function open(v) {
    setErr('');
    try {
      const s = await stream(v.id);
      setPlay(s);
      if ('mediaSession' in navigator)
        navigator.mediaSession.metadata = new MediaMetadata({ title: s.title, artist: s.author });
    } catch (e) { setErr('Lecture impossible : ' + (e?.message || e)); }
  }

  return (
    <>
      <div className="orbs" aria-hidden="true"><i /><i /><i /></div>
      <header className="glass bar">
        <b className="logo">LiquidTube</b>
        <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) run(q.trim()); }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une vidéo" />
          <button>Rechercher</button>
        </form>
      </header>
      {err && <p className="glass msg">{err}</p>}
      {busy && <p className="msg">Chargement…</p>}
      <main className="grid">
        {items.map((v) => (
          <button key={v.id} className="glass card" onClick={() => open(v)}>
            <img src={v.thumb} alt="" loading="lazy" />
            <span className="dur">{v.dur}</span>
            <strong>{v.title}</strong>
            <small>{v.author} {v.views && '· ' + v.views}</small>
          </button>
        ))}
      </main>
      {play && (
        <div className="veil" onClick={() => setPlay(null)}>
          <div className="glass player" onClick={(e) => e.stopPropagation()}>
            <video src={play.url} controls autoPlay playsInline />
            <div className="meta"><strong>{play.title}</strong><small>{play.author}</small></div>
            <button className="close" onClick={() => setPlay(null)}>Fermer</button>
          </div>
        </div>
      )}
    </>
  );
}

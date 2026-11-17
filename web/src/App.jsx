import { useEffect, useMemo, useState } from 'react'

const header = (id) => `https://cdn.akamai.steamstatic.com/steam/apps/${id}/header.jpg`

export default function App() {
  const [games, setGames] = useState(null)
  const [recs, setRecs] = useState(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const [liked, setLiked] = useState([])
  const [disliked, setDisliked] = useState([])

  useEffect(() => {
    const base = import.meta.env.BASE_URL
    Promise.all([
      fetch(base + 'data/games.json').then((r) => r.json()),
      fetch(base + 'data/recs.json').then((r) => r.json()),
    ])
      .then(([g, r]) => { setGames(g); setRecs(r) })
      .catch(() => setFailed(true))
  }, [])

  const byId = useMemo(() => new Map((games || []).map((g) => [g.id, g])), [games])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!games || q.length < 2) return []
    return games.filter((g) => g.t.toLowerCase().includes(q)).sort((a, b) => b.n - a.n).slice(0, 8)
  }, [games, query])

  const results = useMemo(() => {
    if (!recs || !liked.length) return []
    const picked = new Set([...liked, ...disliked])
    const scores = new Map()
    const add = (src, sign) => {
      for (const [id, w] of recs[src] || []) {
        if (picked.has(id)) continue
        const e = scores.get(id) || { total: 0, best: 0, from: null }
        e.total += sign * w
        if (sign > 0 && w > e.best) { e.best = w; e.from = src }
        scores.set(id, e)
      }
    }
    liked.forEach((id) => add(id, 1))
    disliked.forEach((id) => add(id, -1))
    return [...scores].filter(([, e]) => e.total > 0).sort((a, b) => b[1].total - a[1].total).slice(0, 24)
  }, [recs, liked, disliked])

  const pick = (id, kind) => {
    setLiked((l) => l.filter((x) => x !== id).concat(kind === 'like' ? id : []))
    setDisliked((d) => d.filter((x) => x !== id).concat(kind === 'dislike' ? id : []))
    setQuery('')
  }
  const drop = (id) => { setLiked((l) => l.filter((x) => x !== id)); setDisliked((d) => d.filter((x) => x !== id)) }

  if (failed) return <p className="status">Couldn't load the data files. Run the build script first (see the README).</p>
  if (!games) return <p className="status">Loading games…</p>

  const top = results[0]?.[1].total || 1

  return (
    <>
      <header>
        <h1>Also Liked</h1>
        <p>Tell it which Steam games you loved and which you didn't. It finds games that people with the same taste recommended.</p>
      </header>
      <main>
        <aside>
          <label htmlFor="q">Find a game</label>
          <input id="q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. Portal 2" autoComplete="off" />
          {matches.length > 0 && (
            <ul className="matches">
              {matches.map((g) => (
                <li key={g.id}>
                  <span>{g.t} <small>{g.y}</small></span>
                  <button className="like" onClick={() => pick(g.id, 'like')}>Liked</button>
                  <button className="dislike" onClick={() => pick(g.id, 'dislike')}>Didn't like</button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 2 && matches.length === 0 && <p className="hint">No match. Only games with enough reviews are included.</p>}
          <Picks title="You liked" ids={liked} byId={byId} onDrop={drop} cls="like" />
          <Picks title="You didn't like" ids={disliked} byId={byId} onDrop={drop} cls="dislike" />
        </aside>
        <section>
          {!liked.length ? (
            <p className="hint">Add at least one game you liked to get recommendations.</p>
          ) : (
            <ul className="grid">
              {results.map(([id, e]) => {
                const g = byId.get(id)
                if (!g) return null
                return (
                  <li key={id}>
                    <a href={`https://store.steampowered.com/app/${id}`} target="_blank" rel="noreferrer">
                      <img src={header(id)} alt="" loading="lazy" />
                      <h3>{g.t}</h3>
                    </a>
                    <p className="why">Liked by people who liked {byId.get(e.from)?.t}</p>
                    <div className="bar"><i style={{ width: `${Math.max(8, (e.total / top) * 100)}%` }} /></div>
                    <p className="tags">{g.tags.join(', ')}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </main>
    </>
  )
}

function Picks({ title, ids, byId, onDrop, cls }) {
  if (!ids.length) return null
  return (
    <div className="picks">
      <h2>{title}</h2>
      <ul>
        {ids.map((id) => (
          <li key={id} className={cls}>
            {byId.get(id)?.t}
            <button onClick={() => onDrop(id)} aria-label={`Remove ${byId.get(id)?.t}`}>×</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

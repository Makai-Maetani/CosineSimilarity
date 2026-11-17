"""Turn the Steam reviews dataset into a small item-to-item recommendation file.

Each user is a vector over games: +1 if they recommended it, -1 if they didn't.
Two games are similar when the same people feel the same way about both
(cosine similarity), discounted when few people reviewed both.
"""
import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import sparse


def load_reviews(path, nrows=None):
    chunks = pd.read_csv(
        path,
        usecols=["app_id", "user_id", "is_recommended"],
        dtype={"app_id": "int32", "user_id": "int32", "is_recommended": "bool"},
        chunksize=5_000_000,
        nrows=nrows,
    )
    return pd.concat(chunks, ignore_index=True)


def filter_reviews(df, min_game, min_user, max_user, max_games):
    df = df.drop_duplicates(["user_id", "app_id"])
    counts = df.app_id.value_counts()
    keep = counts[counts >= min_game].index[:max_games]
    df = df[df.app_id.isin(keep)]
    per_user = df.user_id.value_counts()
    ok = per_user[(per_user >= min_user) & (per_user <= max_user)].index
    return df[df.user_id.isin(ok)]


def similarity(df, shrink):
    users = df.user_id.astype("category")
    games = df.app_id.astype("category")
    shape = (len(users.cat.categories), len(games.cat.categories))
    vals = np.where(df.is_recommended.values, 1.0, -1.0).astype("float32")
    signed = sparse.csr_matrix((vals, (users.cat.codes, games.cat.codes)), shape=shape)
    seen = signed.copy()
    seen.data = np.ones_like(seen.data)

    norms = np.sqrt(np.asarray(signed.multiply(signed).sum(axis=0)).ravel())
    items = (signed @ sparse.diags(1 / norms)).T.tocsr()
    cos = (items @ items.T).toarray()

    overlap = (seen.T @ seen).toarray()
    sim = cos * overlap / (overlap + shrink)  # few shared reviewers -> weaker signal
    np.fill_diagonal(sim, 0)
    return sim, games.cat.categories.to_numpy()


def load_tags(path):
    tags = {}
    with open(path, encoding="utf-8") as f:
        for line in f:  # open() only splits on real newlines
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue  # skip a damaged line, tags are optional
            tags[row["app_id"]] = row.get("tags", [])
    return tags


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--raw", default="data/raw")
    p.add_argument("--out", default="web/public/data")
    p.add_argument("--sample", type=int, help="only read the first N review rows")
    p.add_argument("--min-game", type=int, default=2000, help="min reviews per game")
    p.add_argument("--min-user", type=int, default=5)
    p.add_argument("--max-user", type=int, default=200)
    p.add_argument("--max-games", type=int, default=4000)
    p.add_argument("--neighbors", type=int, default=30)
    p.add_argument("--shrink", type=float, default=50)
    a = p.parse_args()
    raw, out = Path(a.raw), Path(a.out)

    print("reading reviews...")
    df = load_reviews(raw / "recommendations.csv", a.sample)
    df = filter_reviews(df, a.min_game, a.min_user, a.max_user, a.max_games)
    print(f"{len(df):,} reviews, {df.user_id.nunique():,} users, {df.app_id.nunique()} games")

    print("computing similarity...")
    sim, ids = similarity(df, a.shrink)

    meta = pd.read_csv(raw / "games.csv").set_index("app_id")
    tags = load_tags(raw / "games_metadata.json")
    reviews = df.app_id.value_counts()

    games, recs = [], {}
    for i, app_id in enumerate(ids):
        app_id = int(app_id)
        if app_id not in meta.index:
            continue
        k = min(a.neighbors, len(ids) - 1)
        top = np.argpartition(sim[i], -k)[-k:]
        top = top[np.argsort(sim[i][top])[::-1]]
        recs[app_id] = [[int(ids[j]), round(float(sim[i][j]), 4)] for j in top if sim[i][j] > 0]
        row = meta.loc[app_id]
        games.append({
            "id": app_id,
            "t": row["title"],
            "y": str(row["date_release"])[:4],
            "tags": tags.get(app_id, [])[:4],
            "n": int(reviews[app_id]),
        })

    out.mkdir(parents=True, exist_ok=True)
    (out / "games.json").write_text(json.dumps(games, separators=(",", ":")), encoding="utf-8")
    (out / "recs.json").write_text(json.dumps(recs, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {len(games)} games to {out}")


if __name__ == "__main__":
    main()

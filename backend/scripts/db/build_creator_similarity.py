"""
Build creator similarity map (nodes + edges).

Usage:
  docker exec sonic_backend python scripts/db/build_creator_similarity.py
"""

import asyncio
import math
import os
import random
import sys
import hashlib
from collections import defaultdict
from typing import Dict, List, Tuple

from sqlalchemy import select, func
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Docker container root
sys.path.insert(0, "/app")

from app.database import DATABASE_URL, Base
from app.models import (
    Creator,
    CreatorSpotifyProfile,
    AlbumCredit,
    AlbumGroup,
    CreatorNode,
    CreatorEdge,
)
from app.services.common import GENRE_VIBE_MAP

WEIGHT_GENRE = float(os.getenv("CREATOR_SIM_WEIGHT_GENRE", "0.5"))
WEIGHT_COLLAB = float(os.getenv("CREATOR_SIM_WEIGHT_COLLAB", "0.3"))
WEIGHT_COUNTRY = float(os.getenv("CREATOR_SIM_WEIGHT_COUNTRY", "0.1"))
WEIGHT_ERA = float(os.getenv("CREATOR_SIM_WEIGHT_ERA", "0.1"))
MIN_EDGE_WEIGHT = float(os.getenv("CREATOR_SIM_MIN_WEIGHT", "0.18"))
MAX_EDGES_PER_CREATOR = int(os.getenv("CREATOR_SIM_MAX_EDGES_PER_CREATOR", "36"))
GENRE_TOP_K = int(os.getenv("CREATOR_SIM_GENRE_TOP_K", "40"))
LAYOUT_MODE = os.getenv("CREATOR_SIM_LAYOUT", "umap").lower()
LAYOUT_STEPS = int(os.getenv("CREATOR_SIM_LAYOUT_STEPS", "300"))
LAYOUT_REPULSION = float(os.getenv("CREATOR_SIM_LAYOUT_REPULSION", "0.002"))
LAYOUT_ATTRACTION = float(os.getenv("CREATOR_SIM_LAYOUT_ATTRACTION", "0.01"))
LAYOUT_SAMPLE_REPULSION = int(os.getenv("CREATOR_SIM_LAYOUT_REPULSION_SAMPLE", "8"))
RANDOM_SEED = int(os.getenv("CREATOR_SIM_SEED", "42"))
UMAP_N_NEIGHBORS = int(os.getenv("CREATOR_SIM_UMAP_NEIGHBORS", "28"))
UMAP_MIN_DIST = float(os.getenv("CREATOR_SIM_UMAP_MIN_DIST", "0.42"))
UMAP_SPREAD = float(os.getenv("CREATOR_SIM_UMAP_SPREAD", "1.35"))
BATCH_SIZE = int(os.getenv("CREATOR_SIM_DB_BATCH", "1000"))


def jaccard(a: List[str], b: List[str]) -> float:
    if not a or not b:
        return 0.0
    sa = set(a)
    sb = set(b)
    if not sa or not sb:
        return 0.0
    inter = len(sa & sb)
    union = len(sa | sb)
    return inter / union if union else 0.0


def era_overlap_score(a: Tuple[int, int], b: Tuple[int, int]) -> float:
    if not a or not b:
        return 0.0
    a_start, a_end = a
    b_start, b_end = b
    if a_start is None or a_end is None or b_start is None or b_end is None:
        return 0.0
    overlap = max(0, min(a_end, b_end) - max(a_start, b_start) + 1)
    if overlap <= 0:
        return 0.0
    union = max(a_end, b_end) - min(a_start, b_start) + 1
    return overlap / union if union else 0.0


def collab_score(count: int) -> float:
    # Soft saturation: 1 collab = 0.5, 2 = 0.75, 3+ ~= 1.0
    if count <= 0:
        return 0.0
    return min(1.0, 1 - math.exp(-count / 2))


def compute_similarity(
    genres_a: List[str],
    genres_b: List[str],
    collab_count: int,
    country_a: str,
    country_b: str,
    era_a: Tuple[int, int],
    era_b: Tuple[int, int],
) -> Tuple[float, Dict]:
    g = jaccard(genres_a, genres_b)
    c = collab_score(collab_count)
    same_country = 1.0 if country_a and country_b and country_a == country_b else 0.0
    e = era_overlap_score(era_a, era_b)
    score = (
        WEIGHT_GENRE * g
        + WEIGHT_COLLAB * c
        + WEIGHT_COUNTRY * same_country
        + WEIGHT_ERA * e
    )
    return score, {
        "genre": g,
        "collab": c,
        "country": same_country,
        "era": e,
    }


def stable_rand_xy(seed: int, key: str) -> Tuple[float, float]:
    payload = f"{seed}:{key}".encode("utf-8")
    h = hashlib.md5(payload).digest()
    x = int.from_bytes(h[:2], "big") / 0xFFFF
    y = int.from_bytes(h[2:4], "big") / 0xFFFF
    return x, y


def layout_nodes(node_ids: List[str], edges: List[Tuple[str, str, float]]):
    rng = random.Random(RANDOM_SEED)
    positions: Dict[str, List[float]] = {}
    for cid in node_ids:
        x, y = stable_rand_xy(RANDOM_SEED, cid)
        positions[cid] = [x, y]

    neighbors = defaultdict(list)
    for a, b, w in edges:
        neighbors[a].append((b, w))
        neighbors[b].append((a, w))

    for _ in range(LAYOUT_STEPS):
        # Attractive forces along edges
        for a, b, w in edges:
            ax, ay = positions[a]
            bx, by = positions[b]
            dx = bx - ax
            dy = by - ay
            dist = math.sqrt(dx * dx + dy * dy) + 1e-6
            force = LAYOUT_ATTRACTION * w * dist
            fx = force * dx / dist
            fy = force * dy / dist
            positions[a][0] += fx
            positions[a][1] += fy
            positions[b][0] -= fx
            positions[b][1] -= fy

        # Repulsion (sampled)
        ids = node_ids
        for a in ids:
            ax, ay = positions[a]
            for _ in range(LAYOUT_SAMPLE_REPULSION):
                b = ids[rng.randrange(0, len(ids))]
                if a == b:
                    continue
                bx, by = positions[b]
                dx = ax - bx
                dy = ay - by
                dist2 = dx * dx + dy * dy + 1e-6
                force = LAYOUT_REPULSION / dist2
                positions[a][0] += force * dx
                positions[a][1] += force * dy

        # Clamp to [0, 1]
        for cid in ids:
            positions[cid][0] = min(1.0, max(0.0, positions[cid][0]))
            positions[cid][1] = min(1.0, max(0.0, positions[cid][1]))

    return positions


def layout_nodes_umap(node_ids: List[str], edges: List[Tuple[str, str, float]]):
    try:
        import numpy as np
        from scipy.sparse import coo_matrix
        import umap
    except Exception as e:
        print(f"UMAP deps missing, fallback to force layout: {e}")
        return layout_nodes(node_ids, edges)

    rng = random.Random(RANDOM_SEED)
    index = {cid: i for i, cid in enumerate(node_ids)}
    rows = []
    cols = []
    data = []
    degree = defaultdict(int)
    for a, b, w in edges:
        if a not in index or b not in index:
            continue
        ia = index[a]
        ib = index[b]
        dist = max(0.0, min(1.0, 1.0 - w))
        rows.append(ia)
        cols.append(ib)
        data.append(dist)
        rows.append(ib)
        cols.append(ia)
        data.append(dist)
        degree[ia] += 1
        degree[ib] += 1

    n = len(node_ids)
    if not rows:
        return {cid: [0.5, 0.5] for cid in node_ids}

    target_neighbors = min(UMAP_N_NEIGHBORS, max(2, n - 1))
    for i in range(n):
        missing = target_neighbors - degree.get(i, 0)
        if missing <= 0:
            continue
        for _ in range(missing):
            j = rng.randrange(0, n)
            if j == i:
                j = (j + 1) % n
            rows.append(i)
            cols.append(j)
            data.append(1.0)
            rows.append(j)
            cols.append(i)
            data.append(1.0)

    matrix = coo_matrix((data, (rows, cols)), shape=(n, n)).tocsr()
    reducer = umap.UMAP(
        n_neighbors=target_neighbors,
        min_dist=UMAP_MIN_DIST,
        spread=UMAP_SPREAD,
        metric="precomputed",
        random_state=RANDOM_SEED,
    )
    embedding = reducer.fit_transform(matrix)
    # Normalize to [0, 1]
    xs = embedding[:, 0]
    ys = embedding[:, 1]
    x_min, x_max = float(xs.min()), float(xs.max())
    y_min, y_max = float(ys.min()), float(ys.max())
    x_span = x_max - x_min or 1.0
    y_span = y_max - y_min or 1.0
    positions = {}
    for i, cid in enumerate(node_ids):
        x = (embedding[i, 0] - x_min) / x_span
        y = (embedding[i, 1] - y_min) / y_span
        positions[cid] = [x, y]
    return positions


async def main() -> None:
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as session:
        creators = await session.execute(select(Creator))
        creators = creators.scalars().all()
        profiles = await session.execute(select(CreatorSpotifyProfile))
        profiles = {p.creator_id: p for p in profiles.scalars().all()}

        # Build active era from album credits
        era_rows = await session.execute(
            select(
                AlbumCredit.creator_id,
                func.min(AlbumGroup.original_year),
                func.max(AlbumGroup.original_year),
            )
            .join(AlbumGroup, AlbumGroup.album_group_id == AlbumCredit.album_group_id)
            .group_by(AlbumCredit.creator_id)
        )
        era_by_creator = {cid: (mn, mx) for cid, mn, mx in era_rows.all()}

        # Collaboration counts by album
        credit_rows = await session.execute(
            select(AlbumCredit.album_group_id, AlbumCredit.creator_id)
            .order_by(AlbumCredit.album_group_id)
        )
        collab_counts = defaultdict(int)
        current_album = None
        current_creators: List[str] = []
        for album_id, creator_id in credit_rows.all():
            if current_album is None:
                current_album = album_id
            if album_id != current_album:
                uniq = list(dict.fromkeys(current_creators))
                for i in range(len(uniq)):
                    for j in range(i + 1, len(uniq)):
                        a, b = sorted((uniq[i], uniq[j]))
                        collab_counts[(a, b)] += 1
                current_album = album_id
                current_creators = []
            current_creators.append(creator_id)
        if current_creators:
            uniq = list(dict.fromkeys(current_creators))
            for i in range(len(uniq)):
                for j in range(i + 1, len(uniq)):
                    a, b = sorted((uniq[i], uniq[j]))
                    collab_counts[(a, b)] += 1

        # Genre-based candidates (top-K per genre)
        genre_to_creators: Dict[str, List[Tuple[str, int]]] = defaultdict(list)
        for creator in creators:
            prof = profiles.get(creator.creator_id)
            genres = prof.genres if prof and prof.genres else []
            pop = prof.popularity if prof and prof.popularity is not None else 0
            for g in genres[:5]:
                genre_to_creators[g].append((creator.creator_id, pop))

        genre_pairs = set()
        for _, items in genre_to_creators.items():
            items.sort(key=lambda x: x[1], reverse=True)
            top = [cid for cid, _ in items[:GENRE_TOP_K]]
            for i in range(len(top)):
                for j in range(i + 1, len(top)):
                    a, b = sorted((top[i], top[j]))
                    genre_pairs.add((a, b))

        candidate_pairs = set(collab_counts.keys()) | genre_pairs

        creator_meta = {}
        for creator in creators:
            prof = profiles.get(creator.creator_id)
            creator_meta[creator.creator_id] = {
                "genres": prof.genres if prof and prof.genres else [],
                "country": creator.country_code,
                "popularity": prof.popularity if prof else None,
                "era": era_by_creator.get(creator.creator_id),
            }

        edges = []
        degree = defaultdict(int)
        for a, b in candidate_pairs:
            meta_a = creator_meta.get(a)
            meta_b = creator_meta.get(b)
            if not meta_a or not meta_b:
                continue
            collabs = collab_counts.get((a, b), 0)
            score, components = compute_similarity(
                meta_a["genres"],
                meta_b["genres"],
                collabs,
                meta_a["country"],
                meta_b["country"],
                meta_a["era"],
                meta_b["era"],
            )
            if score < MIN_EDGE_WEIGHT:
                continue
            edges.append((a, b, score, components))
            degree[a] += 1
            degree[b] += 1

        # Limit edges per creator
        edges.sort(key=lambda x: x[2], reverse=True)
        kept = []
        per_creator = defaultdict(int)
        for a, b, score, comps in edges:
            if per_creator[a] >= MAX_EDGES_PER_CREATOR or per_creator[b] >= MAX_EDGES_PER_CREATOR:
                continue
            kept.append((a, b, score, comps))
            per_creator[a] += 1
            per_creator[b] += 1

        node_ids = list({cid for cid, _, _, _ in kept} | {cid for _, cid, _, _ in kept})
        if LAYOUT_MODE == "umap":
            positions = layout_nodes_umap(node_ids, [(a, b, w) for a, b, w, _ in kept])
        else:
            positions = layout_nodes(node_ids, [(a, b, w) for a, b, w, _ in kept])

        node_rows = []
        for cid in node_ids:
            meta = creator_meta.get(cid, {})
            pop = meta.get("popularity") or 0
            size = 2.0 + (pop / 100.0) * 3.6 + math.log1p(degree.get(cid, 0)) * 0.45
            x, y = positions[cid]
            node_rows.append(
                {
                    "creator_id": cid,
                    "x": x,
                    "y": y,
                    "size": size,
                }
            )

        edge_rows = [
            {
                "source_creator_id": a,
                "target_creator_id": b,
                "weight": w,
                "components": comps,
            }
            for a, b, w, comps in kept
        ]

        # Write nodes
        for start in range(0, len(node_rows), BATCH_SIZE):
            batch = node_rows[start:start + BATCH_SIZE]
            stmt = insert(CreatorNode).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=[CreatorNode.creator_id],
                set_={
                    "x": stmt.excluded.x,
                    "y": stmt.excluded.y,
                    "size": stmt.excluded.size,
                },
            )
            await session.execute(stmt)
            await session.commit()

        # Write edges
        for start in range(0, len(edge_rows), BATCH_SIZE):
            batch = edge_rows[start:start + BATCH_SIZE]
            stmt = insert(CreatorEdge).values(batch)
            stmt = stmt.on_conflict_do_update(
                index_elements=[CreatorEdge.source_creator_id, CreatorEdge.target_creator_id],
                set_={
                    "weight": stmt.excluded.weight,
                    "components": stmt.excluded.components,
                },
            )
            await session.execute(stmt)
            await session.commit()

    await engine.dispose()
    print(f"Creator nodes: {len(node_rows)}")
    print(f"Creator edges: {len(edge_rows)}")


if __name__ == "__main__":
    asyncio.run(main())


import React, { useEffect, useMemo, useState } from 'react';
import { X, Heart, ExternalLink } from 'lucide-react';
import { useStore, BACKEND_URL, getAuthHeaders } from '../../state/store';
import { Album, LikeItem } from '../../types';

interface ArtistPanelProps {
  artistName?: string | null;
}

type ArtistProfile = {
  creator_id?: string | null;
  display_name: string;
  bio?: string | null;
  image_url?: string | null;
  debut_country_code?: string | null;
  birth_country_code?: string | null;
  genres?: string[];
  spotify_url?: string | null;
  links?: { provider: string; url: string; external_id?: string | null; is_primary: boolean }[];
  discography?: { id: string; title: string; year?: number | null; cover_url?: string | null }[];
  relations?: { relation_type: string; creator_id: string; display_name: string }[];
};

const countryName = (code?: string | null): string | null => {
  if (!code) return null;
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    return dn.of(code.toUpperCase()) || code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
};

const getDiscographyRange = (albums: { year?: number | null }[]) => {
  if (!albums.length) return '';
  const years = albums.map(a => a.year).filter(Boolean) as number[];
  if (!years.length) return '';
  const min = Math.min(...years);
  const max = Math.max(...years);
  return min === max ? `${min}` : `${min}–${max}`;
};

export const ArtistPanel: React.FC<ArtistPanelProps> = ({ artistName }) => {
  const { selectedArtist, albums, selectAlbumKeepArtist, selectArtist } = useStore();
  const resolvedArtist = artistName ?? selectedArtist;
  const [isLiked, setIsLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);

  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const artistAlbums = useMemo(() => {
    if (profile?.discography?.length) {
      return profile.discography;
    }
    if (!resolvedArtist) return [];
    return albums
      .filter(a => a.artist === resolvedArtist)
      .sort((a, b) => b.year - a.year)
      .map(a => ({ id: a.id, title: a.title, year: a.year, cover_url: a.coverUrl }));
  }, [albums, resolvedArtist, profile]);

  const coverUrl = profile?.image_url || (resolvedArtist ? albums.find(a => a.artist === resolvedArtist && a.coverUrl)?.coverUrl : '') || '';
  const yearRange = getDiscographyRange(artistAlbums);
  const genreItems = profile?.genres?.slice(0, 6) ?? [];
  const countryText =
    countryName(profile?.debut_country_code) ||
    countryName(profile?.birth_country_code) ||
    '-';

  useEffect(() => {
    const fetchLikes = async () => {
      if (!resolvedArtist) return;
      try {
        const headers = await getAuthHeaders();
        const response = await fetch(`${BACKEND_URL}/me/likes?entity_type=artist`, { headers });
        if (!response.ok) return;
        const data = await response.json();
        const items: LikeItem[] = data.items || [];
        const key = `spotify:artist:${resolvedArtist}`;
        const liked = items.some(item => item.entity_id === key);
        setIsLiked(liked);
      } catch (e) {
        console.warn('Failed to load artist likes', e);
      }
    };
    const fetchProfile = async () => {
      if (!resolvedArtist) return;
      try {
        const response = await fetch(`${BACKEND_URL}/artists/lookup?name=${encodeURIComponent(resolvedArtist)}`);
        if (!response.ok) return;
        const data = await response.json();
        if (data?.data) {
          setProfile(data.data);
        }
      } catch (e) {
        console.warn('Failed to load artist profile', e);
      }
    };
    setIsLiked(false);
    setProfile(null);
    fetchLikes();
    fetchProfile();
  }, [resolvedArtist]);

  const handleLikeToggle = async () => {
    if (!resolvedArtist || likeLoading) return;
    setLikeLoading(true);
    try {
      const headers = await getAuthHeaders();
      const method = isLiked ? 'DELETE' : 'POST';
      const response = await fetch(`${BACKEND_URL}/me/likes`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({
          entity_type: 'artist',
          entity_id: resolvedArtist,
        }),
      });
      if (response.ok) {
        setIsLiked(!isLiked);
      }
    } catch (e) {
      console.warn('Failed to toggle artist like', e);
    } finally {
      setLikeLoading(false);
    }
  };

  if (!resolvedArtist) return null;

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 shadow-lg overflow-hidden">
      <div className="relative h-48 sm:h-56 md:h-64 w-full shrink-0">
        <div className="absolute inset-0 bg-gradient-to-t from-white via-white/60 to-transparent z-10" />
        {coverUrl ? (
          <img
            src={coverUrl}
            alt={resolvedArtist}
            className="w-full h-full object-contain bg-gray-100"
          />
        ) : (
          <div className="w-full h-full bg-gray-100" />
        )}
        <button
          onClick={() => selectArtist(null)}
          className="absolute top-4 right-4 z-20 p-2 bg-white/90 hover:bg-white backdrop-blur rounded-full text-black transition-colors border border-gray-200"
        >
          <X size={18} />
        </button>
        <div className="absolute bottom-4 left-5 z-20 w-[calc(100%-2.5rem)]">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-black leading-tight truncate">
            {profile?.display_name || resolvedArtist}
          </h2>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleLikeToggle();
            }}
            disabled={likeLoading}
            className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg font-bold text-xs transition-all ${
              isLiked
                ? 'bg-gradient-to-r from-pink-500 to-red-500 text-white'
                : 'bg-gray-100 border border-gray-300 text-gray-700 hover:bg-gray-200'
            } ${likeLoading ? 'opacity-50 cursor-wait' : ''}`}
          >
            <Heart size={12} fill={isLiked ? 'currentColor' : 'none'} strokeWidth={2.5} />
            <span>{isLiked ? 'Liked' : 'Like'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar bg-gray-50 p-5">
        <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-gray-500">
            <span>Country</span>
            <span className="text-gray-300">/</span>
            <span className="text-[11px] normal-case tracking-normal font-semibold text-black whitespace-nowrap">{countryText}</span>
          </div>
          <div className="mt-1.5 text-[9px] uppercase tracking-[0.16em] text-gray-500">Genre</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {genreItems.length > 0 ? (
              genreItems.map((g) => (
                <span
                  key={g}
                  className="px-2 py-[2px] rounded-full border border-black/10 bg-black/[0.04] text-[10px] font-medium text-black/85"
                >
                  {g}
                </span>
              ))
            ) : (
              <span className="text-[10px] text-gray-500">No genre tags</span>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">About</h3>
          <p className="text-sm text-gray-700">
            {profile?.bio
              ? profile.bio
              : (() => {
                  const name = profile?.display_name || resolvedArtist;
                  const genres = profile?.genres?.slice(0, 3) || [];
                  const genreText = genres.length ? `Genres: ${genres.join(', ')}. ` : '';
                  const rangeText = yearRange ? `Active releases: ${yearRange}. ` : '';
                  return `${name}. ${genreText}${rangeText}${artistAlbums.length} albums in this collection.`;
                })()}
          </p>
          {profile?.spotify_url ? (
            <a
              href={profile.spotify_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 mt-3 text-xs text-green-700 hover:text-green-800"
            >
              <ExternalLink size={12} />
              Spotify
            </a>
          ) : null}
          {profile?.links?.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {profile.links
                .filter(l => l.provider === 'official' || l.provider === 'wikipedia' || l.provider === 'wikidata')
                .slice(0, 3)
                .map((link) => (
                  <a
                    key={`${link.provider}-${link.url}`}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-gray-600 hover:text-black"
                  >
                    <ExternalLink size={10} />
                    {link.provider}
                  </a>
                ))}
            </div>
          ) : null}
        </div>

        {profile?.relations?.length ? (
          <div className="bg-white border border-gray-200 rounded-lg p-4 mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Relations</h3>
            <div className="flex flex-wrap gap-2">
              {profile.relations.slice(0, 12).map((rel) => (
                <span
                  key={`${rel.relation_type}-${rel.creator_id}`}
                  className="px-2 py-1 text-[10px] rounded-full border border-gray-200 text-gray-600"
                >
                  {rel.display_name} · {rel.relation_type}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">Discography</h3>
          {artistAlbums.map(album => (
            <div
              key={album.id}
              className="bg-white border border-gray-200 rounded-lg p-3 flex items-center gap-3"
            >
              <div className="w-12 h-12 rounded overflow-hidden flex-shrink-0 bg-gray-100">
                {album.cover_url ? (
                  <img src={album.cover_url} alt={album.title} className="w-full h-full object-cover" />
                ) : null}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-black truncate">{album.title}</div>
                <div className="text-xs text-gray-500">{album.year ?? ''}</div>
              </div>
              <button
                onClick={() => {
                  selectAlbumKeepArtist(album.id);
                }}
                className="px-2.5 py-1.5 text-xs font-semibold bg-black text-white rounded hover:bg-gray-800 transition-colors"
              >
                View Detail
              </button>
            </div>
          ))}
          {artistAlbums.length === 0 && (
            <div className="text-xs text-gray-500">No albums found for this artist.</div>
          )}
        </div>
      </div>
    </div>
  );
};

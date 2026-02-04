from typing import Optional


COUNTRY_TO_REGION = {
    'United States': 'North America', 'USA': 'North America', 'US': 'North America',
    'Canada': 'North America', 'Mexico': 'North America',
    'UK': 'Europe', 'United Kingdom': 'Europe', 'England': 'Europe', 'Scotland': 'Europe', 'Wales': 'Europe',
    'Germany': 'Europe', 'France': 'Europe', 'Italy': 'Europe', 'Spain': 'Europe',
    'Netherlands': 'Europe', 'Belgium': 'Europe', 'Switzerland': 'Europe', 'Austria': 'Europe',
    'Sweden': 'Europe', 'Norway': 'Europe', 'Denmark': 'Europe', 'Finland': 'Europe',
    'Poland': 'Europe', 'Portugal': 'Europe', 'Ireland': 'Europe', 'Greece': 'Europe',
    'Iceland': 'Europe', 'Russia': 'Europe', 'Soviet Union': 'Europe', 'Turkey': 'Europe',
    'Czech Republic': 'Europe', 'Hungary': 'Europe', 'Romania': 'Europe', 'Bulgaria': 'Europe',
    'South Korea': 'Asia', 'Korea': 'Asia', 'Japan': 'Asia', 'China': 'Asia', 'Taiwan': 'Asia',
    'Hong Kong': 'Asia', 'Singapore': 'Asia', 'Thailand': 'Asia', 'Malaysia': 'Asia',
    'Indonesia': 'Asia', 'Philippines': 'Asia', 'India': 'Asia', 'Vietnam': 'Asia',
    'Pakistan': 'Asia',
    'Brazil': 'South America', 'Argentina': 'South America', 'Chile': 'South America',
    'Colombia': 'South America', 'Peru': 'South America', 'Venezuela': 'South America',
    'Ecuador': 'South America', 'Uruguay': 'South America', 'Paraguay': 'South America',
    'Cuba': 'Caribbean', 'Jamaica': 'Caribbean', 'Dominican Republic': 'Caribbean',
    'Puerto Rico': 'Caribbean', 'Trinidad and Tobago': 'Caribbean',
    'Australia': 'Oceania', 'New Zealand': 'Oceania',
    'South Africa': 'Africa', 'Nigeria': 'Africa', 'Kenya': 'Africa', 'Egypt': 'Africa',
    'Morocco': 'Africa', 'Ghana': 'Africa', 'Senegal': 'Africa',
}

GENRE_VIBE_MAP = {
    'Rock': 0.85,
    'Metal': 0.95,
    'Punk': 0.90,
    'EDM': 0.90,
    'Electronic': 0.75,
    'Hip Hop': 0.80,
    'Rap': 0.85,
    'Dance': 0.85,
    'Pop': 0.60,
    'K-pop/Asia Pop': 0.65,
    'Alternative/Indie': 0.55,
    'R&B': 0.45,
    'Soul': 0.50,
    'Folk': 0.40,
    'Country': 0.45,
    'Jazz': 0.35,
    'Blues': 0.40,
    'Classical': 0.25,
    'Ambient': 0.20,
    'Latin': 0.70,
    'World': 0.55,
    'Reggae': 0.60,
    'Unknown': 0.50,
}


def country_to_region(country: Optional[str]) -> str:
    if not country:
        return 'Unknown'
    return COUNTRY_TO_REGION.get(country, 'Unknown')


def genre_to_vibe(genre: Optional[str]) -> float:
    if not genre:
        return 0.5
    return GENRE_VIBE_MAP.get(genre, 0.5)

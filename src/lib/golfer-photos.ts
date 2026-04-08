// Generate golfer photo URLs from public sports image CDNs
// Uses a hash of the golfer name to consistently pick from available placeholder sources

const GOLFER_PHOTO_MAP: Record<string, string> = {
  "scottie scheffler": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10404.png&w=96&h=70&cb=1",
  "rory mcilroy": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/3470.png&w=96&h=70&cb=1",
  "xander schauffele": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10822.png&w=96&h=70&cb=1",
  "collin morikawa": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/11100.png&w=96&h=70&cb=1",
  "jon rahm": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9780.png&w=96&h=70&cb=1",
  "jordan spieth": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/5467.png&w=96&h=70&cb=1",
  "tiger woods": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/462.png&w=96&h=70&cb=1",
  "justin thomas": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9917.png&w=96&h=70&cb=1",
  "brooks koepka": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/6798.png&w=96&h=70&cb=1",
  "dustin johnson": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/3448.png&w=96&h=70&cb=1",
  "bryson dechambeau": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10046.png&w=96&h=70&cb=1",
  "patrick cantlay": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9780.png&w=96&h=70&cb=1",
  "viktor hovland": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10659.png&w=96&h=70&cb=1",
  "hideki matsuyama": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/5860.png&w=96&h=70&cb=1",
  "tony finau": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/4602.png&w=96&h=70&cb=1",
  "rickie fowler": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/3702.png&w=96&h=70&cb=1",
  "sam burns": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/10423.png&w=96&h=70&cb=1",
  "cameron smith": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9131.png&w=96&h=70&cb=1",
  "shane lowry": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/5469.png&w=96&h=70&cb=1",
  "tommy fleetwood": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/5321.png&w=96&h=70&cb=1",
  "max homa": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/9131.png&w=96&h=70&cb=1",
  "phil mickelson": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/308.png&w=96&h=70&cb=1",
  "adam scott": "https://a.espncdn.com/combiner/i?img=/i/headshots/golf/players/full/388.png&w=96&h=70&cb=1",
};

export function getGolferPhotoUrl(name: string): string | null {
  return GOLFER_PHOTO_MAP[name.toLowerCase()] || null;
}

// Generate initials for golfers without photos
export function getGolferInitials(name: string): string {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

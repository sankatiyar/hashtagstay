/**
 * Photography, hotlinked from Unsplash's CDN under the Unsplash License: free
 * for commercial use, no attribution required. Hotlinking is what Unsplash asks
 * for, and its CDN resizes and serves WebP/AVIF from the query string, so there
 * is nothing to host or optimise here.
 *
 * These illustrate the *idea* of a stay — marketing surfaces, city and campus
 * pages. They are never presented as a real operator's property: a verified
 * listing shows only photos the operator uploaded and we moderated. The seeded
 * sample listings borrow a few, and are labelled as samples.
 */
export const PHOTOS = {
  heroFriends: {
    id: 'photo-1772724316741-d71af45b5558',
    alt: 'Three smiling friends with their arms around each other',
  },
  movingIn: {
    id: 'photo-1772724317350-520faccb15e6',
    alt: 'Young people carrying boxes and luggage into a building',
  },
  rooftopFriends: {
    id: 'photo-1772724317077-a41e81c70cb3',
    alt: 'Friends relaxing together on a rooftop terrace',
  },
  womenTalking: {
    id: 'photo-1772471586699-a770c551f442',
    alt: 'Two women talking and laughing indoors',
  },
  studentsLaptop: {
    id: 'photo-1523240795612-9a054b0db644',
    alt: 'Three students laughing while looking at a laptop',
  },
  studentBooks: {
    id: 'photo-1571260899304-425eee4c7efc',
    alt: 'A student carrying textbooks',
  },
  studyDesk: {
    id: 'photo-1604933762021-54a5858c9832',
    alt: 'A woman working on a laptop at a desk',
  },
  sunlitBedroom: {
    id: 'photo-1616486029423-aaa4789e8c9a',
    alt: 'A sunlit bedroom with a made bed and wall art',
  },
  blueBedroom: {
    id: 'photo-1618221118493-9cfa1a1c00da',
    alt: 'A calm bedroom with blue walls and a woven pendant light',
  },
  studentRoom: {
    id: 'photo-1638454668466-e8dbd5462f20',
    alt: 'A compact bedroom with a bed, desk and window',
  },
  greyBedroom: {
    id: 'photo-1560185893-a55cbc8c57e8',
    alt: 'A bedroom with a large bed and a patterned rug',
  },
  cosyBedroom: {
    id: 'photo-1566665797739-1674de7a421a',
    alt: 'A modern bedroom with an upholstered headboard',
  },
  gardenBedroom: {
    id: 'photo-1611892440504-42a792e24d32',
    alt: 'A bedroom with a wooden bed and a garden view',
  },
  livingRoom: {
    id: 'photo-1501183638710-841dd1904471',
    alt: 'A bright living room with sofas and plants',
  },
  loungeKitchen: {
    id: 'photo-1649083048337-4aeb6dda80bb',
    alt: 'An open living room and kitchen',
  },
  sharedLounge: {
    id: 'photo-1662454419736-de132ff75638',
    alt: 'A shared lounge with a couch and coffee table',
  },
  kitchenDining: {
    id: 'photo-1664372623516-0b1540d6771e',
    alt: 'A large kitchen with a dining table',
  },
  kitchenCooking: {
    id: 'photo-1773332589460-5a5d43c80f5b',
    alt: 'Two women talking while cooking in a shared kitchen',
  },
  phoneSupport: {
    id: 'photo-1663767117072-a97deef95956',
    alt: 'A woman at a desk with a laptop and phone',
  },
  onThePhone: {
    id: 'photo-1503324010925-71cfe52dad2a',
    alt: 'A woman talking on the phone',
  },
  balconies: {
    id: 'photo-1624204386084-dd8c05e32226',
    alt: 'A modern apartment building with glass balconies at dusk',
  },
  yellowBalconies: {
    id: 'photo-1692681272972-ad7ae5a8a7fd',
    alt: 'A tall residential building with yellow balconies',
  },
  bengaluru: {
    id: 'photo-1596176530529-78163a4f7af2',
    alt: 'Bengaluru city lights from above at night',
  },
  pune: {
    id: 'photo-1553064483-f10fe837615f',
    alt: 'An aerial view of Pune',
  },
  delhi: {
    id: 'photo-1587474260584-136574528ed5',
    alt: 'India Gate in New Delhi under a pink evening sky',
  },
} as const;

export type PhotoKey = keyof typeof PHOTOS;

/** City name → photo, for city pages and city tiles. */
export const CITY_PHOTOS: Record<string, PhotoKey> = {
  Bengaluru: 'bengaluru',
  Bangalore: 'bengaluru',
  Pune: 'pune',
  'Delhi NCR': 'delhi',
  Delhi: 'delhi',
};

const BASE = 'https://images.unsplash.com/';

/** A sized, cropped Unsplash CDN URL. */
export function photoUrl(id: string, width: number, height?: number): string {
  const size = height ? `&h=${height}` : '';
  return `${BASE}${id}?auto=format&fit=crop&w=${width}${size}&q=75`;
}

/** Full URL for storing on a seeded media row. */
export function storedPhotoPath(key: PhotoKey): string {
  return photoUrl(PHOTOS[key].id, 1600);
}

/** Responsive srcset at a fixed aspect ratio (width / height). */
export function photoSrcSet(
  id: string,
  aspect: number,
  widths = [480, 800, 1200, 1600],
) {
  return widths
    .map((w) => `${photoUrl(id, w, Math.round(w / aspect))} ${w}w`)
    .join(', ');
}

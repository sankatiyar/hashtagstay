import { and, inArray, like, notInArray, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import {
  type LibraryPhoto,
  PHOTO_LIBRARY,
  type PhotoCategory,
  libraryPhotoPath,
} from '../../photo-library';
import * as schema from '../schema';
import { ANCHOR_CITIES, INSTITUTIONS } from './institutions-data';

/**
 * Bulk sample inventory: 50 live listings around every seeded campus, so
 * search, filters, pagination and the city and campus landing pages can be
 * judged at a realistic density rather than against a handful of rows.
 *
 * Everything here is invented. Operator names carry "(Sample)", every slug ends
 * in `-sample` (which the listing page uses to label it as a demonstration), and
 * the photos are representative stock. Campus and locality coordinates are
 * real, approximately, so proximity search returns sensible distances.
 *
 * Generation is deterministic — a PRNG seeded from each campus slug — so
 * re-running the seed rewrites the same listings instead of producing a new set.
 */

export const BULK_PER_CAMPUS = 50;

/** Listings sit between these distances from the campus they were made for. */
export const MIN_CAMPUS_DISTANCE_KM = 0.3;
export const MAX_CAMPUS_DISTANCE_KM = 4;

type PropertyType = 'pbsa' | 'coliving' | 'homeshare';
type GenderPolicy = 'any' | 'male_only' | 'female_only' | 'co_ed_segregated_floors';
type Tier = 'documents_checked' | 'photos_verified' | 'onground_audited';
type AnchorCity = (typeof ANCHOR_CITIES)[number];

interface Locality {
  readonly name: string;
  readonly lat: number;
  readonly lng: number;
  readonly state: string;
  /** Rents run higher in the city's most sought-after neighbourhoods. */
  readonly premium?: boolean;
}

interface CityPlan {
  readonly city: AnchorCity;
  /** Relative rent level against Bengaluru. */
  readonly rentFactor: number;
  /** Named neighbourhoods; a listing takes the name of the nearest one. */
  readonly localities: readonly Locality[];
}

const KA = 'Karnataka';
const MH = 'Maharashtra';
const DL = 'Delhi';
const UP = 'Uttar Pradesh';
const HR = 'Haryana';

const CITY_PLANS: readonly CityPlan[] = [
  {
    city: 'Bengaluru',
    rentFactor: 1,
    localities: [
      { name: 'Koramangala', lat: 12.9352, lng: 77.6245, state: KA, premium: true },
      { name: 'Indiranagar', lat: 12.9784, lng: 77.6408, state: KA, premium: true },
      { name: 'HSR Layout', lat: 12.9116, lng: 77.6389, state: KA, premium: true },
      { name: 'Sadashivanagar', lat: 13.0068, lng: 77.5813, state: KA, premium: true },
      { name: 'Ejipura', lat: 12.945, lng: 77.628, state: KA },
      { name: 'BTM Layout', lat: 12.9166, lng: 77.6101, state: KA },
      { name: 'Bilekahalli', lat: 12.899, lng: 77.605, state: KA },
      { name: 'Bannerghatta Road', lat: 12.8876, lng: 77.5973, state: KA },
      { name: 'Jayanagar', lat: 12.925, lng: 77.5938, state: KA },
      { name: 'Basavanagudi', lat: 12.9406, lng: 77.5738, state: KA },
      { name: 'Malleswaram', lat: 13.0035, lng: 77.5712, state: KA },
      { name: 'Mathikere', lat: 13.033, lng: 77.562, state: KA },
      { name: 'Yeshwanthpur', lat: 13.028, lng: 77.54, state: KA },
      { name: 'Jalahalli', lat: 13.045, lng: 77.548, state: KA },
      { name: 'Dasarahalli', lat: 13.0461, lng: 77.513, state: KA },
      { name: 'Chikkabanavara', lat: 13.078, lng: 77.499, state: KA },
      { name: 'Rajajinagar', lat: 12.991, lng: 77.552, state: KA },
      { name: 'Banashankari', lat: 12.9255, lng: 77.5468, state: KA },
      { name: 'Hosakerehalli', lat: 12.93, lng: 77.54, state: KA },
      { name: 'Nagarbhavi', lat: 12.9606, lng: 77.5096, state: KA },
      { name: 'Jnanabharathi', lat: 12.945, lng: 77.51, state: KA },
      { name: 'RR Nagar', lat: 12.9274, lng: 77.5155, state: KA },
      { name: 'Kengeri', lat: 12.9081, lng: 77.4854, state: KA },
      { name: 'Hebbal', lat: 13.0358, lng: 77.597, state: KA },
      { name: 'Whitefield', lat: 12.9698, lng: 77.75, state: KA },
      { name: 'Marathahalli', lat: 12.9591, lng: 77.6974, state: KA },
      { name: 'Electronic City', lat: 12.8452, lng: 77.6602, state: KA },
      { name: 'Hulimavu', lat: 12.877, lng: 77.598, state: KA },
      { name: 'Begur', lat: 12.873, lng: 77.627, state: KA },
      { name: 'Garvebhavipalya', lat: 12.896, lng: 77.625, state: KA },
      { name: 'Wilson Garden', lat: 12.949, lng: 77.597, state: KA },
      { name: 'Richmond Town', lat: 12.965, lng: 77.6, state: KA },
      { name: 'Abbigere', lat: 13.08, lng: 77.525, state: KA },
      { name: 'Soladevanahalli', lat: 13.093, lng: 77.504, state: KA },
      { name: 'Makali', lat: 13.062, lng: 77.468, state: KA },
      { name: 'Vijayanagar', lat: 12.97, lng: 77.536, state: KA },
      { name: 'Girinagar', lat: 12.943, lng: 77.546, state: KA },
      { name: 'Ullal', lat: 12.953, lng: 77.48, state: KA },
      { name: 'Mallathahalli', lat: 12.957, lng: 77.492, state: KA },
      { name: 'Uttarahalli', lat: 12.905, lng: 77.545, state: KA },
      { name: 'Channasandra', lat: 12.902, lng: 77.508, state: KA },
      { name: 'Chamarajpet', lat: 12.958, lng: 77.566, state: KA },
      { name: 'Lalbagh Road', lat: 12.955, lng: 77.585, state: KA },
      { name: 'Vidyaranyapura', lat: 13.077, lng: 77.558, state: KA },
      { name: 'Sahakar Nagar', lat: 13.062, lng: 77.588, state: KA },
    ],
  },
  {
    city: 'Pune',
    rentFactor: 0.85,
    localities: [
      { name: 'Kothrud', lat: 18.5074, lng: 73.8077, state: MH },
      { name: 'Karve Nagar', lat: 18.49, lng: 73.82, state: MH },
      { name: 'Warje', lat: 18.48, lng: 73.8, state: MH },
      { name: 'Erandwane', lat: 18.51, lng: 73.83, state: MH },
      { name: 'Deccan Gymkhana', lat: 18.5167, lng: 73.84, state: MH },
      { name: 'Shivajinagar', lat: 18.5308, lng: 73.8475, state: MH },
      { name: 'Model Colony', lat: 18.528, lng: 73.84, state: MH },
      { name: 'Ganeshkhind', lat: 18.547, lng: 73.83, state: MH },
      { name: 'Aundh', lat: 18.558, lng: 73.8075, state: MH },
      { name: 'Pashan', lat: 18.538, lng: 73.796, state: MH },
      { name: 'Baner', lat: 18.559, lng: 73.7868, state: MH, premium: true },
      { name: 'Viman Nagar', lat: 18.5679, lng: 73.9143, state: MH, premium: true },
      { name: 'Kalyani Nagar', lat: 18.5463, lng: 73.9033, state: MH, premium: true },
      { name: 'Koregaon Park', lat: 18.5362, lng: 73.894, state: MH, premium: true },
      { name: 'Yerawada', lat: 18.553, lng: 73.887, state: MH },
      { name: 'Lohegaon', lat: 18.59, lng: 73.92, state: MH },
      { name: 'Kharadi', lat: 18.5515, lng: 73.9348, state: MH },
      { name: 'Bibwewadi', lat: 18.47, lng: 73.864, state: MH },
      { name: 'Katraj', lat: 18.4575, lng: 73.8677, state: MH },
      { name: 'Dhankawadi', lat: 18.46, lng: 73.85, state: MH },
      { name: 'Hadapsar', lat: 18.5089, lng: 73.926, state: MH },
      { name: 'Bopodi', lat: 18.572, lng: 73.838, state: MH },
      { name: 'Sangvi', lat: 18.569, lng: 73.818, state: MH },
      { name: 'Khadki', lat: 18.563, lng: 73.846, state: MH },
      { name: 'Pimple Gurav', lat: 18.585, lng: 73.815, state: MH },
      { name: 'Camp', lat: 18.515, lng: 73.878, state: MH },
      { name: 'Pune Station', lat: 18.5285, lng: 73.874, state: MH },
      { name: 'Swargate', lat: 18.501, lng: 73.863, state: MH },
      { name: 'Dhanori', lat: 18.592, lng: 73.896, state: MH },
      { name: 'Vishrantwadi', lat: 18.579, lng: 73.878, state: MH },
      { name: 'Kondhwa', lat: 18.465, lng: 73.892, state: MH },
      { name: 'Salisbury Park', lat: 18.493, lng: 73.874, state: MH },
      { name: 'Ambegaon', lat: 18.442, lng: 73.838, state: MH },
      { name: 'Jambhulwadi', lat: 18.425, lng: 73.845, state: MH },
    ],
  },
  {
    city: 'Delhi NCR',
    rentFactor: 0.95,
    localities: [
      { name: 'Mukherjee Nagar', lat: 28.7075, lng: 77.2098, state: DL },
      { name: 'Kamla Nagar', lat: 28.6812, lng: 77.2046, state: DL },
      { name: 'GTB Nagar', lat: 28.698, lng: 77.207, state: DL },
      { name: 'Vijay Nagar', lat: 28.6949, lng: 77.203, state: DL },
      { name: 'Shahbad Daulatpur', lat: 28.755, lng: 77.108, state: DL },
      { name: 'Samaypur Badli', lat: 28.744, lng: 77.138, state: DL },
      { name: 'Rohini', lat: 28.7383, lng: 77.0822, state: DL },
      { name: 'Munirka', lat: 28.5575, lng: 77.174, state: DL },
      { name: 'Ber Sarai', lat: 28.548, lng: 77.18, state: DL },
      { name: 'Katwaria Sarai', lat: 28.538, lng: 77.183, state: DL },
      { name: 'Hauz Khas', lat: 28.5494, lng: 77.2001, state: DL, premium: true },
      { name: 'Kalu Sarai', lat: 28.5418, lng: 77.2046, state: DL },
      { name: 'Saket', lat: 28.5245, lng: 77.2066, state: DL, premium: true },
      { name: 'Lajpat Nagar', lat: 28.5677, lng: 77.2433, state: DL },
      { name: 'Jamia Nagar', lat: 28.562, lng: 77.283, state: DL },
      { name: 'Govindpuri', lat: 28.5355, lng: 77.264, state: DL },
      { name: 'Dwarka', lat: 28.5921, lng: 77.046, state: DL },
      { name: 'Kakrola', lat: 28.604, lng: 77.049, state: DL },
      { name: 'Noida Sector 18', lat: 28.57, lng: 77.326, state: UP, premium: true },
      { name: 'Noida Sector 125', lat: 28.544, lng: 77.33, state: UP },
      { name: 'Noida Sector 126', lat: 28.536, lng: 77.342, state: UP },
      { name: 'Knowledge Park, Greater Noida', lat: 28.473, lng: 77.485, state: UP },
      { name: 'Alpha, Greater Noida', lat: 28.474, lng: 77.507, state: UP },
      { name: 'Pari Chowk, Greater Noida', lat: 28.466, lng: 77.51, state: UP },
      { name: 'Rai, Sonipat', lat: 28.95, lng: 77.095, state: HR },
      { name: 'Education City, Sonipat', lat: 28.938, lng: 77.11, state: HR },
      { name: 'Jatheri, Sonipat', lat: 28.912, lng: 77.102, state: HR },
      { name: 'Kamaspur, Sonipat', lat: 28.97, lng: 77.11, state: HR },
      { name: 'Bahalgarh, Sonipat', lat: 28.956, lng: 77.13, state: HR },
      { name: 'Civil Lines', lat: 28.68, lng: 77.225, state: DL },
      { name: 'Kashmere Gate', lat: 28.667, lng: 77.229, state: DL },
      { name: 'Model Town', lat: 28.716, lng: 77.193, state: DL },
      { name: 'Shakti Nagar', lat: 28.68, lng: 77.195, state: DL },
      { name: 'Timarpur', lat: 28.704, lng: 77.224, state: DL },
      { name: 'Vasant Kunj', lat: 28.521, lng: 77.155, state: DL, premium: true },
      { name: 'Vasant Vihar', lat: 28.557, lng: 77.16, state: DL, premium: true },
      { name: 'Kishangarh', lat: 28.527, lng: 77.17, state: DL },
      { name: 'Rangpuri', lat: 28.536, lng: 77.125, state: DL },
      { name: 'Green Park', lat: 28.559, lng: 77.206, state: DL, premium: true },
      { name: 'Safdarjung Enclave', lat: 28.564, lng: 77.195, state: DL },
      { name: 'Maharani Bagh', lat: 28.58, lng: 77.26, state: DL },
      { name: 'Okhla Vihar', lat: 28.55, lng: 77.294, state: DL },
      { name: 'Jasola', lat: 28.538, lng: 77.288, state: DL },
      { name: 'Sarita Vihar', lat: 28.528, lng: 77.29, state: DL },
      { name: 'Madanpur Khadar', lat: 28.515, lng: 77.292, state: DL },
      { name: 'Pitampura', lat: 28.703, lng: 77.132, state: DL },
      { name: 'Rohini Sector 16', lat: 28.73, lng: 77.125, state: DL },
      { name: 'Dwarka Mor', lat: 28.619, lng: 77.033, state: DL },
      { name: 'Najafgarh', lat: 28.609, lng: 76.98, state: DL },
      { name: 'Chhawla', lat: 28.575, lng: 76.999, state: DL },
      { name: 'Noida Sector 104', lat: 28.54, lng: 77.37, state: UP },
      { name: 'Noida Sector 44', lat: 28.554, lng: 77.338, state: UP },
      { name: 'Kalindi Kunj', lat: 28.546, lng: 77.305, state: DL },
      { name: 'Surajpur, Greater Noida', lat: 28.502, lng: 77.496, state: UP },
      { name: 'Ecotech 3, Greater Noida', lat: 28.505, lng: 77.455, state: UP },
      { name: 'Knowledge Park 5, Greater Noida', lat: 28.49, lng: 77.44, state: UP },
      { name: 'Ecotech 1, Greater Noida', lat: 28.45, lng: 77.48, state: UP },
      { name: 'Alipur', lat: 28.797, lng: 77.133, state: DL },
      { name: 'Siraspur', lat: 28.758, lng: 77.148, state: DL },
      { name: 'Barwasni, Sonipat', lat: 28.94, lng: 77.06, state: HR },
    ],
  },
];

interface Operator {
  readonly slug: string;
  readonly name: string;
  readonly brand: string;
  readonly legalName: string;
  readonly types: readonly PropertyType[];
}

const OPERATORS: readonly Operator[] = [
  {
    slug: 'saffron-coliving-sample',
    name: 'Saffron Co-Living (Sample)',
    brand: 'Saffron',
    legalName: 'Saffron Co-Living Private Limited',
    types: ['coliving'],
  },
  {
    slug: 'terracotta-living-sample',
    name: 'Terracotta Living (Sample)',
    brand: 'Terracotta',
    legalName: 'Terracotta Living LLP',
    types: ['coliving'],
  },
  {
    slug: 'kite-coliving-sample',
    name: 'Kite Co-Living (Sample)',
    brand: 'Kite',
    legalName: 'Kite Co-Living Private Limited',
    types: ['coliving'],
  },
  {
    slug: 'campus-crest-sample',
    name: 'Campus Crest Residences (Sample)',
    brand: 'Campus Crest',
    legalName: 'Campus Crest Residences Private Limited',
    types: ['pbsa'],
  },
  {
    slug: 'scholars-quarter-sample',
    name: 'Scholars Quarter (Sample)',
    brand: 'Scholars Quarter',
    legalName: 'Scholars Quarter Housing Private Limited',
    types: ['pbsa'],
  },
  {
    slug: 'banyan-court-sample',
    name: 'Banyan Court Student Living (Sample)',
    brand: 'Banyan Court',
    legalName: 'Banyan Court Student Living Private Limited',
    types: ['pbsa'],
  },
  {
    slug: 'brightdoor-homes-sample',
    name: 'Brightdoor Homes (Sample)',
    brand: 'Brightdoor',
    legalName: 'Brightdoor Homes',
    types: ['homeshare'],
  },
  {
    slug: 'courtyard-homestays-sample',
    name: 'Courtyard Homestays (Sample)',
    brand: 'Courtyard',
    legalName: 'Courtyard Homestays',
    types: ['homeshare'],
  },
  {
    slug: 'mango-tree-stays-sample',
    name: 'Mango Tree Stays (Sample)',
    brand: 'Mango Tree',
    legalName: 'Mango Tree Stays',
    types: ['homeshare', 'coliving'],
  },
  {
    slug: 'lantern-house-sample',
    name: 'Lantern House Living (Sample)',
    brand: 'Lantern House',
    legalName: 'Lantern House Living LLP',
    types: ['coliving', 'pbsa'],
  },
];

const NAME_SUFFIX: Record<PropertyType, readonly string[]> = {
  coliving: ['House', 'Commons', 'Residency', 'Living', 'Nest', 'Suites'],
  pbsa: [
    'Student Residence',
    'Hall',
    'Campus Living',
    'Scholars House',
    'Student Village',
  ],
  homeshare: ['Home', 'Rooms', 'Guest House', 'Homestay', 'Villa'],
};

/** Building names common in Indian housing societies; paired with a brand. */
const LANDMARKS = [
  'Palm Grove',
  'Neem Tree',
  'Sunrise',
  'Maple',
  'Orchid',
  'Lotus',
  'Jasmine',
  'Cedar',
  'Amaltas',
  'Kadamba',
  'Tamarind',
  'Peepal',
  'Silver Oak',
  'Coral',
  'Parijat',
  'Champa',
  'Laburnum',
  'Magnolia',
  'Hibiscus',
  'Sandalwood',
];

const BASE_AMENITIES = [
  'wifi',
  'furnished',
  'wardrobe',
  'hot_water',
  'power_backup',
  'cctv',
];

const EXTRA_AMENITIES: Record<PropertyType, readonly string[]> = {
  coliving: [
    'ac',
    'housekeeping',
    'laundry',
    'meals_included',
    'gym',
    'common_area',
    'tv_lounge',
    'terrace',
    'events',
    'coworking',
    'security_24x7',
    'biometric_entry',
    'lift',
    'parking_two_wheeler',
    'refrigerator',
    'water_purifier',
    'fire_safety',
    'games_room',
    'no_broker_fee',
  ],
  pbsa: [
    'study_desk',
    'security_24x7',
    'laundry',
    'meals_included',
    'coworking',
    'common_area',
    'gym',
    'visitor_log',
    'fire_safety',
    'games_room',
    'housekeeping',
    'ac',
    'lift',
    'biometric_entry',
    'water_purifier',
  ],
  homeshare: [
    'kitchen_access',
    'refrigerator',
    'study_desk',
    'parking_two_wheeler',
    'housekeeping',
    'ac',
    'laundry',
    'terrace',
    'maintenance',
    'water_purifier',
    'no_broker_fee',
    'gated_community',
  ],
};

/** How each room product is sold, by property type. */
const ROOM_PLANS: Record<
  PropertyType,
  readonly { name: string; occupancy: number; chance: number }[]
> = {
  coliving: [
    { name: 'Single occupancy', occupancy: 1, chance: 1 },
    { name: 'Twin sharing', occupancy: 2, chance: 0.8 },
    { name: 'Triple sharing', occupancy: 3, chance: 0.4 },
  ],
  pbsa: [
    { name: 'Ensuite single', occupancy: 1, chance: 1 },
    { name: 'Twin sharing', occupancy: 2, chance: 0.85 },
    { name: 'Triple sharing', occupancy: 3, chance: 0.3 },
  ],
  homeshare: [
    { name: 'Private room', occupancy: 1, chance: 1 },
    { name: 'Twin room', occupancy: 2, chance: 0.4 },
  ],
};

/** Monthly rent range for a single room, in rupees, before city and locality. */
const SINGLE_RENT_RANGE: Record<PropertyType, readonly [number, number]> = {
  coliving: [16_000, 26_000],
  pbsa: [14_000, 22_000],
  homeshare: [9_000, 16_000],
};

/** Per-bed rent relative to a single room. */
const SHARING_DISCOUNT: Record<number, number> = { 1: 1, 2: 0.65, 3: 0.5 };

/** Photos in a sample listing's gallery. */
export const GALLERY_SIZE = 5;

interface GalleryState {
  /** Galleries already issued, so no two listings share the same five photos. */
  readonly issued: Set<string>;
  /** Next cover per category, so covers rotate evenly instead of clustering. */
  readonly coverCursor: Map<PhotoCategory, number>;
}

/**
 * A listing's gallery: five distinct photos in the order a resident reads a
 * listing — where they would sleep, a second sleeping or shared space, the
 * living area, something that sets the property type apart (a study space for
 * a student residence, a common area or kitchen for co-living, the kitchen or
 * dining table in a home-share), and a closing shot of a bathroom, the
 * building or the kitchen.
 */
function buildGallery(
  rng: Rng,
  type: PropertyType,
  hasSharedRooms: boolean,
  state: GalleryState,
): LibraryPhoto[] {
  const sleep: PhotoCategory = hasSharedRooms && rng() < 0.45 ? 'shared' : 'bedroom';
  const secondSleep: PhotoCategory =
    sleep === 'shared' ? 'bedroom' : hasSharedRooms ? 'shared' : 'bedroom';
  const coverCategory: PhotoCategory =
    type === 'coliving' && rng() < 0.25 ? 'living' : sleep;
  const signature: PhotoCategory =
    type === 'pbsa'
      ? 'study'
      : type === 'coliving'
        ? pick(rng, ['common', 'kitchen', 'dining'] as const)
        : pick(rng, ['kitchen', 'dining'] as const);
  const closing: PhotoCategory = pick(
    rng,
    (['bathroom', 'exterior', 'kitchen'] as const).filter(
      (category) => category !== signature,
    ),
  );
  const recipe: PhotoCategory[] = [
    coverCategory,
    coverCategory === 'living' ? sleep : secondSleep,
    coverCategory === 'living' ? secondSleep : 'living',
    signature,
    closing,
  ];

  const coverPool = PHOTO_LIBRARY[coverCategory];
  const coverIndex = state.coverCursor.get(coverCategory) ?? 0;
  state.coverCursor.set(coverCategory, coverIndex + 1);
  const cover = coverPool[coverIndex % coverPool.length];

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const gallery = [cover];
    for (const category of recipe.slice(1)) {
      const pool = PHOTO_LIBRARY[category].filter(
        (photo) => !gallery.some((chosen) => chosen.id === photo.id),
      );
      gallery.push(pick(rng, pool));
    }
    const key = gallery.map((photo) => photo.id).join(',');
    if (!state.issued.has(key)) {
      state.issued.add(key);
      return gallery;
    }
  }
  throw new Error('Could not build a distinct sample gallery.');
}

const TYPE_PHRASE: Record<PropertyType, string> = {
  coliving: 'A managed co-living home',
  pbsa: 'A purpose-built student residence',
  homeshare: 'Rooms in a family-run home',
};

const GENDER_PHRASE: Record<GenderPolicy, string> = {
  any: '',
  female_only: ' for women',
  male_only: ' for men',
  co_ed_segregated_floors: ' with separate floors for men and women',
};

const AMENITY_PHRASE: Record<string, string> = {
  meals_included: 'meals included',
  housekeeping: 'regular housekeeping',
  laundry: 'laundry',
  ac: 'air-conditioned rooms',
  gym: 'a gym',
  coworking: 'a co-working space',
  study_desk: 'a study desk in every room',
  security_24x7: '24×7 security',
  kitchen_access: 'a shared kitchen',
  terrace: 'terrace access',
};

// ---- Deterministic randomness ---------------------------------------------

type Rng = () => number;

/** FNV-1a, to turn a campus slug into a stable PRNG seed. */
function hashSeed(text: string): number {
  let hash = 2_166_136_261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast and good enough for plausible sample data. */
function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const pick = <T>(rng: Rng, items: readonly T[]): T =>
  items[Math.floor(rng() * items.length)];

const between = (rng: Rng, min: number, max: number) => min + rng() * (max - min);

const intBetween = (rng: Rng, min: number, max: number) =>
  Math.floor(between(rng, min, max + 1));

function weighted<T>(rng: Rng, options: readonly (readonly [T, number])[]): T {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [value, weight] of options) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return options[options.length - 1][0];
}

function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const DAY_MS = 86_400_000;
const daysFrom = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

const slugPart = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// ---- Geometry ---------------------------------------------------------------

export function distanceKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The point `km` away on `bearing` (radians clockwise from north). */
function offsetPoint(lat: number, lng: number, km: number, bearing: number) {
  const dLat = (km * Math.cos(bearing)) / 110.574;
  const dLng = (km * Math.sin(bearing)) / (111.32 * Math.cos((lat * Math.PI) / 180));
  return { lat: Number((lat + dLat).toFixed(5)), lng: Number((lng + dLng).toFixed(5)) };
}

/**
 * A listing must be nearer its own campus than any other by this much, so the
 * database's geography distance and this generator's haversine agree on which
 * campus page it belongs to even for points near a boundary.
 */
const CATCHMENT_MARGIN_KM = 0.15;

/**
 * A random point near `campus` that is closer to it than to any other campus,
 * skewed towards the campus: most inside 2 km, a tail out to the maximum.
 */
function pointInCatchment(rng: Rng, campus: (typeof INSTITUTIONS)[number]) {
  const others = INSTITUTIONS.filter((other) => other.slug !== campus.slug);
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const targetKm =
      MIN_CAMPUS_DISTANCE_KM +
      (MAX_CAMPUS_DISTANCE_KM - MIN_CAMPUS_DISTANCE_KM) * rng() ** 1.5;
    const point = offsetPoint(campus.lat, campus.lng, targetKm, rng() * 2 * Math.PI);
    const campusKm = distanceKm(point.lat, point.lng, campus.lat, campus.lng);
    const closestOtherKm = Math.min(
      ...others.map((other) => distanceKm(point.lat, point.lng, other.lat, other.lng)),
    );
    if (campusKm + CATCHMENT_MARGIN_KM < closestOtherKm) {
      return { ...point, campusKm };
    }
  }
  throw new Error(`Could not place a listing in the catchment of ${campus.slug}.`);
}

function nearestLocality(plan: CityPlan, lat: number, lng: number) {
  return plan.localities
    .map((locality) => ({
      locality,
      km: distanceKm(lat, lng, locality.lat, locality.lng),
    }))
    .sort((a, b) => a.km - b.km)[0];
}

// ---- Copy -------------------------------------------------------------------

/** "a", "a and b", "a, b and c". */
function listPhrase(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function ordinal(n: number): string {
  const lastTwo = n % 100;
  const last = n % 10;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th'}`;
}

function addressFor(city: AnchorCity, locality: string, rng: Rng): string {
  const number = intBetween(rng, 2, 480);
  switch (city) {
    case 'Bengaluru':
      return `${number}, ${ordinal(intBetween(rng, 1, 18))} Cross, ${locality}`;
    case 'Pune':
      return `${number}, Lane ${intBetween(rng, 1, 14)}, ${locality}`;
    default:
      return `${pick(rng, ['A', 'B', 'C', 'D', 'E', 'F'])}-${number}, ${locality}`;
  }
}

/**
 * A listing name not used before. Half take the locality ("Saffron Kothrud
 * House"), half a building name ("Kite Orchid Commons"), which keeps 1,300
 * names readable instead of numbering hundreds of "Saffron Koramangala House N".
 */
function uniqueName(
  rng: Rng,
  used: Set<string>,
  brand: string,
  locality: string,
  type: PropertyType,
): string {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const suffix = pick(rng, NAME_SUFFIX[type]);
    const candidate =
      rng() < 0.5
        ? `${brand} ${locality} ${suffix}`
        : `${brand} ${pick(rng, LANDMARKS)} ${suffix}`;
    if (!used.has(candidate)) {
      used.add(candidate);
      return candidate;
    }
  }
  const base = `${brand} ${locality} ${NAME_SUFFIX[type][0]}`;
  let n = 2;
  while (used.has(`${base} ${n}`)) n += 1;
  used.add(`${base} ${n}`);
  return `${base} ${n}`;
}

// ---- Generation -------------------------------------------------------------

export interface BulkRoom {
  name: string;
  occupancy: number;
  hasPrivateBathroom: boolean;
  areaSqft: number;
  rentAmountMinor: number;
  depositAmountMinor: number;
  minTenureMonths: number;
  availableCount: number;
  availableFrom: Date;
  lastConfirmedAt: Date;
}

export interface BulkListing {
  operatorSlug: string;
  /** The campus this listing was generated around. */
  campusSlug: string;
  campus: { name: string; km: number };
  name: string;
  slug: string;
  description: string;
  propertyType: PropertyType;
  genderPolicy: GenderPolicy;
  addressLine1: string;
  locality: string;
  /** Distance from the listing to the centre of the locality it is named for. */
  localityKm: number;
  city: AnchorCity;
  state: string;
  lat: number;
  lng: number;
  amenities: string[];
  houseRules: string[];
  verificationTier: Tier;
  verifiedAt: Date;
  verificationExpiresAt: Date;
  publishedAt: Date;
  lastReviewedAt: Date;
  rooms: BulkRoom[];
  photos: LibraryPhoto[];
}

/** Build the full sample set in memory. Pure: the same `now` gives the same rows. */
export function buildBulkInventory(now: Date): BulkListing[] {
  const listings: BulkListing[] = [];
  const usedNames = new Set<string>();
  const galleries: GalleryState = { issued: new Set(), coverCursor: new Map() };

  for (const campus of INSTITUTIONS) {
    const plan = CITY_PLANS.find((candidate) => candidate.city === campus.city);
    if (!plan) {
      throw new Error(`No city plan for ${campus.city} (campus ${campus.slug}).`);
    }
    const rng = createRng(hashSeed(campus.slug));
    // A separate stream, so gallery choices can change without moving listings.
    const galleryRng = createRng(hashSeed(`${campus.slug}:gallery`));

    for (let index = 0; index < BULK_PER_CAMPUS; index += 1) {
      const { lat, lng, campusKm } = pointInCatchment(rng, campus);
      const { locality, km: localityKm } = nearestLocality(plan, lat, lng);
      const shortLocality = locality.name.split(',')[0];

      const propertyType = weighted<PropertyType>(rng, [
        ['coliving', 40],
        ['pbsa', 35],
        ['homeshare', 25],
      ]);
      const operator = pick(
        rng,
        OPERATORS.filter((op) => op.types.includes(propertyType)),
      );

      const genderPolicy = weighted<GenderPolicy>(
        rng,
        propertyType === 'pbsa'
          ? [
              ['co_ed_segregated_floors', 45],
              ['female_only', 30],
              ['male_only', 25],
            ]
          : propertyType === 'homeshare'
            ? [
                ['female_only', 35],
                ['male_only', 35],
                ['any', 30],
              ]
            : [
                ['any', 45],
                ['female_only', 25],
                ['male_only', 20],
                ['co_ed_segregated_floors', 10],
              ],
      );

      // Amenities: a common base, a type-specific handful, and safety extras
      // that women-only residents filter for.
      const extras = shuffled(rng, EXTRA_AMENITIES[propertyType]).slice(
        0,
        intBetween(rng, 4, 8),
      );
      const amenities = new Set([...BASE_AMENITIES, ...extras]);
      if (genderPolicy === 'female_only') {
        amenities.add('female_staff');
        amenities.add('biometric_entry');
        if (propertyType !== 'homeshare') amenities.add('warden_on_site');
      }
      if (propertyType === 'pbsa') amenities.add('study_desk');

      const houseRules = new Set(['id_proof_required']);
      if (rng() < 0.8) houseRules.add('no_smoking');
      if (rng() < 0.4) houseRules.add('no_loud_music');
      if (rng() < 0.5) houseRules.add('no_pets');
      if (propertyType === 'pbsa') {
        houseRules.add('min_tenure_applies');
        houseRules.add('no_alcohol');
      }
      if (genderPolicy === 'female_only' || genderPolicy === 'male_only') {
        if (rng() < 0.6) houseRules.add('no_opposite_gender_visitors');
        if (propertyType !== 'coliving' || rng() < 0.5) houseRules.add('entry_curfew');
        if (rng() < 0.5) houseRules.add('police_verification');
      }

      // Pricing.
      const [low, high] = SINGLE_RENT_RANGE[propertyType];
      const singleRent =
        between(rng, low, high) * plan.rentFactor * (locality.premium ? 1.15 : 1);
      const minTenureMonths =
        propertyType === 'pbsa'
          ? 11
          : propertyType === 'homeshare'
            ? pick(rng, [3, 6])
            : pick(rng, [1, 3, 6]);
      const depositMonths =
        propertyType === 'coliving'
          ? 2
          : propertyType === 'pbsa'
            ? 1
            : pick(rng, [1, 2]);

      const rooms: BulkRoom[] = ROOM_PLANS[propertyType]
        .filter((room) => rng() < room.chance)
        .map((room) => {
          const rupees = Math.max(
            4_000,
            Math.round((singleRent * SHARING_DISCOUNT[room.occupancy]) / 500) * 500,
          );
          const confirmedDaysAgo =
            rng() < 0.85 ? between(rng, 0, 7) : between(rng, 15, 35);
          return {
            name: room.name,
            occupancy: room.occupancy,
            hasPrivateBathroom: room.occupancy === 1 && propertyType !== 'homeshare',
            areaSqft: intBetween(rng, 100, 140) + (room.occupancy - 1) * 60,
            rentAmountMinor: rupees * 100,
            depositAmountMinor: rupees * depositMonths * 100,
            minTenureMonths,
            availableCount: rng() < 0.08 ? 0 : intBetween(rng, 1, 8),
            availableFrom: daysFrom(now, Math.floor(between(rng, 0, 30))),
            lastConfirmedAt: daysFrom(now, -confirmedDaysAgo),
          };
        });

      const verificationTier = weighted<Tier>(rng, [
        ['onground_audited', 35],
        ['photos_verified', 35],
        ['documents_checked', 30],
      ]);
      const verifiedAt = daysFrom(now, -Math.floor(between(rng, 10, 120)));
      const verificationExpiresAt = daysFrom(
        verifiedAt,
        verificationTier === 'onground_audited' ? 365 : 182,
      );

      const name = uniqueName(
        rng,
        usedNames,
        operator.brand,
        shortLocality,
        propertyType,
      );

      const highlights = [...amenities]
        .map((slug) => AMENITY_PHRASE[slug])
        .filter(Boolean)
        .slice(0, 3);
      const description =
        `${TYPE_PHRASE[propertyType]}${GENDER_PHRASE[genderPolicy]} in ${locality.name}, ` +
        `about ${campusKm.toFixed(1)} km from ${campus.name}. ` +
        `Rooms come furnished, with ${listPhrase(['Wi-Fi', ...highlights])}. ` +
        'Sample listing generated for demonstration.';

      // This draw once chose a photo. It is kept so the rest of the sequence —
      // and with it every listing's address, position and slug — stays exactly
      // as already seeded; galleries use their own generator below.
      rng();
      const photos = buildGallery(
        galleryRng,
        propertyType,
        rooms.some((room) => room.occupancy > 1),
        galleries,
      );

      listings.push({
        operatorSlug: operator.slug,
        campusSlug: campus.slug,
        campus: { name: campus.name, km: Number(campusKm.toFixed(2)) },
        name,
        slug: `${slugPart(name)}-sample`,
        description,
        propertyType,
        genderPolicy,
        addressLine1: addressFor(plan.city, locality.name, rng),
        locality: shortLocality,
        localityKm: Number(localityKm.toFixed(2)),
        city: plan.city,
        state: locality.state,
        lat,
        lng,
        amenities: [...amenities],
        houseRules: [...houseRules],
        verificationTier,
        verifiedAt,
        verificationExpiresAt,
        publishedAt: daysFrom(verifiedAt, 1),
        lastReviewedAt: rooms.reduce(
          (latest, room) =>
            room.lastConfirmedAt > latest ? room.lastConfirmedAt : latest,
          verifiedAt,
        ),
        rooms,
        photos,
      });
    }
  }

  return listings;
}

// ---- Writing ----------------------------------------------------------------

const WRITE_BATCH = 100;

function inBatches<T>(items: readonly T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) batches.push(items.slice(i, i + size));
  return batches;
}

/** Media rows for a listing's seeded gallery. */
function galleryRows(listing: BulkListing, propertyId: string, now: Date) {
  return listing.photos.map((photo, sortOrder) => ({
    propertyId,
    kind: 'image' as const,
    storagePath: libraryPhotoPath(photo.id),
    altText: photo.alt,
    sortOrder,
    moderationState: 'approved' as const,
    moderatedAt: now,
    moderationNote: 'Sample photo seeded for demonstration.',
  }));
}

/**
 * Replace the seeded photos of sample listings that already exist, touching
 * nothing else. Only hosted stock (Unsplash URLs) is removed, so a photo an
 * operator uploaded through the portal is never deleted.
 */
async function refreshGalleries(
  db: PostgresJsDatabase<typeof schema>,
  listings: readonly BulkListing[],
  now: Date,
): Promise<number> {
  let refreshed = 0;
  for (const batch of inBatches(listings, WRITE_BATCH)) {
    const rows = await db
      .select({ id: schema.properties.id, slug: schema.properties.slug })
      .from(schema.properties)
      .where(
        inArray(
          schema.properties.slug,
          batch.map((listing) => listing.slug),
        ),
      );
    if (rows.length === 0) continue;

    const idBySlug = new Map(rows.map((row) => [row.slug, row.id]));
    await db.delete(schema.media).where(
      and(
        inArray(
          schema.media.propertyId,
          rows.map((row) => row.id),
        ),
        like(schema.media.storagePath, 'https://images.unsplash.com/%'),
      ),
    );
    await db
      .insert(schema.media)
      .values(
        batch
          .filter((listing) => idBySlug.has(listing.slug))
          .flatMap((listing) => galleryRows(listing, idBySlug.get(listing.slug)!, now)),
      );
    refreshed += rows.length;
  }
  return refreshed;
}

/** On conflict, take the incoming row's value for this column. */
const excluded = (column: string) => sql.raw(`excluded.${column}`);

/**
 * Upsert the bulk sample set, in batches so 1,300 listings cost a couple of
 * hundred round trips rather than thousands.
 *
 * Idempotent locally: each listing's rooms, availability and sample photos are
 * replaced rather than duplicated, and sample-operator listings the generator
 * no longer produces are removed. On Vercel, where the seed runs on every deploy
 * and real bookings may reference a room, it only inserts into a database that
 * does not have the set yet.
 */
export async function seedBulkInventory(
  db: PostgresJsDatabase<typeof schema>,
  now = new Date(),
): Promise<void> {
  const listings = buildBulkInventory(now);

  if (process.env.VERCEL) {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.properties)
      .where(like(schema.properties.slug, '%-sample'));
    if (count >= listings.length) {
      // Rooms may be referenced by real bookings, so the inventory is left
      // alone. Galleries are only seeded photos and can be refreshed safely.
      const refreshed = await refreshGalleries(db, listings, now);
      console.log(
        `  bulk sample inventory: already present, left untouched; refreshed ${refreshed} sample galleries`,
      );
      return;
    }
  }

  const operatorIds = new Map<string, string>();
  for (const [index, operator] of OPERATORS.entries()) {
    const [row] = await db
      .insert(schema.organizations)
      .values({
        name: operator.name,
        slug: operator.slug,
        legalName: operator.legalName,
        contactEmail: `ops@${slugPart(operator.brand)}.local`,
        // Never rendered to residents; reaching a host is always a masked call.
        contactPhone: `+9190000001${String(index).padStart(2, '0')}`,
        commissionRateBps: 800,
        verificationTier: 'documents_checked',
        verifiedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.organizations.slug,
        set: { name: operator.name, legalName: operator.legalName, updatedAt: now },
      })
      .returning({ id: schema.organizations.id });
    operatorIds.set(operator.slug, row.id);
  }

  // Listings from an earlier version of the generator (e.g. the per-city set).
  const removed = await db
    .delete(schema.properties)
    .where(
      and(
        inArray(schema.properties.organizationId, [...operatorIds.values()]),
        notInArray(
          schema.properties.slug,
          listings.map((listing) => listing.slug),
        ),
      ),
    )
    .returning({ id: schema.properties.id });

  for (const batch of inBatches(listings, WRITE_BATCH)) {
    const propertyRows = await db
      .insert(schema.properties)
      .values(
        batch.map((listing) => ({
          organizationId: operatorIds.get(listing.operatorSlug)!,
          name: listing.name,
          slug: listing.slug,
          description: listing.description,
          propertyType: listing.propertyType,
          genderPolicy: listing.genderPolicy,
          addressLine1: listing.addressLine1,
          locality: listing.locality,
          city: listing.city,
          state: listing.state,
          country: 'IN',
          // x is longitude — see src/lib/geo.
          location: { x: listing.lng, y: listing.lat },
          amenities: listing.amenities,
          houseRules: listing.houseRules,
          listingState: 'live' as const,
          publishedAt: listing.publishedAt,
          verificationTier: listing.verificationTier,
          verifiedAt: listing.verifiedAt,
          verificationExpiresAt: listing.verificationExpiresAt,
          lastReviewedAt: listing.lastReviewedAt,
        })),
      )
      .onConflictDoUpdate({
        target: schema.properties.slug,
        set: {
          organizationId: excluded('organization_id'),
          name: excluded('name'),
          description: excluded('description'),
          propertyType: excluded('property_type'),
          genderPolicy: excluded('gender_policy'),
          addressLine1: excluded('address_line1'),
          locality: excluded('locality'),
          city: excluded('city'),
          state: excluded('state'),
          location: excluded('location'),
          amenities: excluded('amenities'),
          houseRules: excluded('house_rules'),
          listingState: excluded('listing_state'),
          publishedAt: excluded('published_at'),
          verificationTier: excluded('verification_tier'),
          verifiedAt: excluded('verified_at'),
          verificationExpiresAt: excluded('verification_expires_at'),
          lastReviewedAt: excluded('last_reviewed_at'),
          updatedAt: now,
        },
      })
      .returning({ id: schema.properties.id, slug: schema.properties.slug });

    const propertyIdBySlug = new Map(propertyRows.map((row) => [row.slug, row.id]));
    const propertyIds = propertyRows.map((row) => row.id);

    // Room types cascade to availability.
    await db
      .delete(schema.roomTypes)
      .where(inArray(schema.roomTypes.propertyId, propertyIds));
    await db
      .delete(schema.media)
      .where(
        and(
          inArray(schema.media.propertyId, propertyIds),
          like(schema.media.storagePath, 'https://images.unsplash.com/%'),
        ),
      );

    await db
      .insert(schema.media)
      .values(
        batch.flatMap((listing) =>
          galleryRows(listing, propertyIdBySlug.get(listing.slug)!, now),
        ),
      );

    const roomRows = await db
      .insert(schema.roomTypes)
      .values(
        batch.flatMap((listing) =>
          listing.rooms.map((room) => ({
            propertyId: propertyIdBySlug.get(listing.slug)!,
            name: room.name,
            occupancy: room.occupancy,
            hasPrivateBathroom: room.hasPrivateBathroom,
            areaSqft: room.areaSqft,
            rentAmountMinor: room.rentAmountMinor,
            rentCurrency: 'INR',
            depositAmountMinor: room.depositAmountMinor,
            depositCurrency: 'INR',
            minTenureMonths: room.minTenureMonths,
            amenities: [],
          })),
        ),
      )
      .returning({
        id: schema.roomTypes.id,
        propertyId: schema.roomTypes.propertyId,
        name: schema.roomTypes.name,
      });

    // Room names are unique within a property, so they key the returned ids.
    const roomIdByKey = new Map(
      roomRows.map((row) => [`${row.propertyId}:${row.name}`, row.id]),
    );

    await db.insert(schema.availability).values(
      batch.flatMap((listing) =>
        listing.rooms.map((room) => ({
          roomTypeId: roomIdByKey.get(
            `${propertyIdBySlug.get(listing.slug)}:${room.name}`,
          )!,
          availableCount: room.availableCount,
          availableFrom: room.availableFrom,
          // Seeded data is an import, the least trustworthy provenance.
          source: 'import' as const,
          lastConfirmedAt: room.lastConfirmedAt,
          notes: 'Seeded sample data; not confirmed with the operator.',
        })),
      ),
    );
  }

  const perCity = new Map<string, number>();
  for (const listing of listings) {
    perCity.set(listing.city, (perCity.get(listing.city) ?? 0) + 1);
  }
  const summary = [...perCity].map(([city, count]) => `${city} ${count}`).join(', ');
  console.log(
    `  bulk sample inventory: ${OPERATORS.length} operators, ${listings.length} live properties, ` +
      `${BULK_PER_CAMPUS} per campus (${summary})` +
      (removed.length ? `; removed ${removed.length} from an earlier sample set` : ''),
  );
}

/**
 * Institution seed data for the Phase 1 anchor cities.
 *
 * Chosen for the student wedge: FR-03 proximity search only works if there is a
 * real coordinate to measure from, and "PG near <campus>" is the query students
 * actually type. `aliases` matters as much as `name` — nobody searches for
 * "Savitribai Phule Pune University", they search "Pune University" or "SPPU".
 *
 * ## On coordinate accuracy
 *
 * These are **approximate campus centroids**, good to roughly a few hundred
 * metres. That is fine for a 2–5 km radius filter and for ranking, and not fine
 * for anything that implies precision (walking directions, "150 m from gate 3").
 * Spot-check against an authoritative source before relying on them in
 * customer-facing copy, and treat a surprising distance as suspect data rather
 * than a surprising property.
 *
 * Large campuses (JNU, DU North, SPPU) span more than a kilometre, so a single
 * point is a genuine simplification for them.
 */

export interface InstitutionSeed {
  readonly name: string;
  readonly slug: string;
  readonly aliases: readonly string[];
  readonly city: string;
  readonly state: string;
  readonly lat: number;
  readonly lng: number;
}

export const ANCHOR_CITIES = ['Bengaluru', 'Pune', 'Delhi NCR'] as const;

export const INSTITUTIONS: readonly InstitutionSeed[] = [
  // --- Bengaluru ----------------------------------------------------------
  {
    name: 'Indian Institute of Science',
    slug: 'iisc-bengaluru',
    aliases: ['IISc', 'Indian Institute of Science Bangalore', 'Tata Institute'],
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 13.0218,
    lng: 77.5665,
  },
  {
    name: 'Indian Institute of Management Bangalore',
    slug: 'iim-bangalore',
    aliases: ['IIMB', 'IIM Bangalore', 'IIM-B'],
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.8933,
    lng: 77.6019,
  },
  {
    name: 'Christ University',
    slug: 'christ-university-bengaluru',
    aliases: ['Christ', 'Christ College', 'CHRIST Deemed to be University'],
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.9346,
    lng: 77.6065,
  },
  {
    name: 'National Law School of India University',
    slug: 'nlsiu-bengaluru',
    aliases: ['NLSIU', 'National Law School', 'Law School Bangalore'],
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 13.0724,
    lng: 77.503,
  },
  {
    name: 'PES University',
    slug: 'pes-university-bengaluru',
    aliases: ['PES', 'PESIT', 'PES Institute of Technology'],
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.9347,
    lng: 77.5354,
  },
  {
    name: 'RV College of Engineering',
    slug: 'rvce-bengaluru',
    aliases: ['RVCE', 'RV College', 'Rashtreeya Vidyalaya College of Engineering'],
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.9237,
    lng: 77.4987,
  },
  {
    name: 'BMS College of Engineering',
    slug: 'bmsce-bengaluru',
    aliases: ['BMSCE', 'BMS College'],
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.9406,
    lng: 77.5659,
  },
  {
    name: 'MS Ramaiah Institute of Technology',
    slug: 'msrit-bengaluru',
    aliases: ['MSRIT', 'Ramaiah Institute of Technology', 'RIT Bangalore'],
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 13.0297,
    lng: 77.565,
  },
  {
    name: 'Bangalore University',
    slug: 'bangalore-university',
    aliases: ['BU', 'Jnanabharathi', 'Bangalore Univ'],
    city: 'Bengaluru',
    state: 'Karnataka',
    lat: 12.942,
    lng: 77.5029,
  },

  // --- Pune ---------------------------------------------------------------
  {
    name: 'Savitribai Phule Pune University',
    slug: 'sppu-pune',
    aliases: ['SPPU', 'Pune University', 'University of Pune', 'Poona University'],
    city: 'Pune',
    state: 'Maharashtra',
    lat: 18.5529,
    lng: 73.8254,
  },
  {
    name: 'College of Engineering Pune',
    slug: 'coep-pune',
    aliases: ['COEP', 'COEP Technological University', 'Engineering College Pune'],
    city: 'Pune',
    state: 'Maharashtra',
    lat: 18.5294,
    lng: 73.8563,
  },
  {
    name: 'Symbiosis International University',
    slug: 'symbiosis-pune',
    aliases: ['Symbiosis', 'SIU', 'Symbiosis Viman Nagar'],
    city: 'Pune',
    state: 'Maharashtra',
    lat: 18.5679,
    lng: 73.9143,
  },
  {
    name: 'Fergusson College',
    slug: 'fergusson-college-pune',
    aliases: ['Fergusson', 'FC Pune'],
    city: 'Pune',
    state: 'Maharashtra',
    lat: 18.5215,
    lng: 73.8408,
  },
  {
    name: 'MIT World Peace University',
    slug: 'mit-wpu-pune',
    aliases: ['MIT WPU', 'MIT Pune', 'Maharashtra Institute of Technology'],
    city: 'Pune',
    state: 'Maharashtra',
    lat: 18.4926,
    lng: 73.818,
  },
  {
    name: 'Vishwakarma Institute of Technology',
    slug: 'vit-pune',
    aliases: ['VIT Pune', 'Vishwakarma Institute'],
    city: 'Pune',
    state: 'Maharashtra',
    lat: 18.464,
    lng: 73.868,
  },
  {
    name: 'Bharati Vidyapeeth Deemed University',
    slug: 'bharati-vidyapeeth-pune',
    aliases: ['Bharati Vidyapeeth', 'BVDU', 'BVP Katraj'],
    city: 'Pune',
    state: 'Maharashtra',
    lat: 18.4575,
    lng: 73.8497,
  },

  // --- Delhi NCR ----------------------------------------------------------
  // NCR is treated as one market because students routinely choose housing in a
  // different administrative area from their campus (Noida campus, Delhi room).
  {
    name: 'University of Delhi (North Campus)',
    slug: 'du-north-campus',
    aliases: ['DU', 'Delhi University', 'North Campus', 'DU North'],
    city: 'Delhi NCR',
    state: 'Delhi',
    lat: 28.6889,
    lng: 77.212,
  },
  {
    name: 'Jawaharlal Nehru University',
    slug: 'jnu-delhi',
    aliases: ['JNU', 'Jawaharlal Nehru Univ'],
    city: 'Delhi NCR',
    state: 'Delhi',
    lat: 28.5404,
    lng: 77.1675,
  },
  {
    name: 'Indian Institute of Technology Delhi',
    slug: 'iit-delhi',
    aliases: ['IIT Delhi', 'IITD', 'IIT-D', 'Hauz Khas IIT'],
    city: 'Delhi NCR',
    state: 'Delhi',
    lat: 28.545,
    lng: 77.1926,
  },
  {
    name: 'Jamia Millia Islamia',
    slug: 'jamia-millia-islamia',
    aliases: ['Jamia', 'JMI'],
    city: 'Delhi NCR',
    state: 'Delhi',
    lat: 28.5617,
    lng: 77.28,
  },
  {
    name: 'Delhi Technological University',
    slug: 'dtu-delhi',
    aliases: ['DTU', 'Delhi College of Engineering', 'DCE'],
    city: 'Delhi NCR',
    state: 'Delhi',
    lat: 28.7501,
    lng: 77.1177,
  },
  {
    name: 'Indraprastha Institute of Information Technology Delhi',
    slug: 'iiit-delhi',
    aliases: ['IIIT Delhi', 'IIITD'],
    city: 'Delhi NCR',
    state: 'Delhi',
    lat: 28.5455,
    lng: 77.2732,
  },
  {
    name: 'Guru Gobind Singh Indraprastha University',
    slug: 'ipu-delhi',
    aliases: ['IPU', 'GGSIPU', 'IP University', 'Dwarka University'],
    city: 'Delhi NCR',
    state: 'Delhi',
    lat: 28.599,
    lng: 77.025,
  },
  {
    name: 'Amity University Noida',
    slug: 'amity-noida',
    aliases: ['Amity', 'Amity Noida', 'Amity University Uttar Pradesh'],
    city: 'Delhi NCR',
    state: 'Uttar Pradesh',
    lat: 28.544,
    lng: 77.3349,
  },
  {
    name: 'Sharda University',
    slug: 'sharda-university-greater-noida',
    aliases: ['Sharda', 'Sharda Greater Noida'],
    city: 'Delhi NCR',
    state: 'Uttar Pradesh',
    lat: 28.473,
    lng: 77.482,
  },
  {
    name: 'Ashoka University',
    slug: 'ashoka-university-sonipat',
    aliases: ['Ashoka', 'Ashoka Sonipat'],
    city: 'Delhi NCR',
    state: 'Haryana',
    lat: 28.9455,
    lng: 77.1015,
  },
] as const;

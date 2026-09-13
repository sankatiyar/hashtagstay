import { photoUrl } from './photos';

/**
 * Representative photo library for sample listings.
 *
 * Every entry is a free-licence Unsplash photo — the Unsplash License allows
 * commercial use without attribution, and Unsplash+ photos are excluded — in
 * landscape orientation, checked to load from the CDN when the library was
 * built (September 2026). Photos were kept or dropped by what they show, so a
 * gallery never puts a restaurant, a construction site or a pet where a room
 * should be.
 *
 * These depict the kind of space, never a specific property. Sample listings
 * say so on the page; a real listing shows only photos its operator uploaded
 * and ops moderated.
 */

export type PhotoCategory =
  | 'bedroom'
  | 'shared'
  | 'living'
  | 'kitchen'
  | 'study'
  | 'dining'
  | 'bathroom'
  | 'exterior'
  | 'common';

export interface LibraryPhoto {
  /** Unsplash CDN id, e.g. `photo-1560185893-a55cbc8c57e8`. */
  readonly id: string;
  readonly alt: string;
}

const entries = (rows: readonly (readonly [string, string])[]): LibraryPhoto[] =>
  rows.map(([id, alt]) => ({ id, alt }));

export const PHOTO_LIBRARY: Record<PhotoCategory, readonly LibraryPhoto[]> = {
  bedroom: entries([
    ['photo-1522771739844-6a9f6d5f14af', 'A table lamp on a bedside nightstand'],
    ['photo-1541004995602-b3e898709909', 'A made bed beside windows in daylight'],
    ['photo-1549638441-b787d2e11f14', 'A white bed near the window'],
    ['photo-1552858725-2758b5fb1286', 'A lit table lamp beside a bed'],
    ['photo-1559841644-08984562005a', 'Pillows against a wooden headboard'],
    [
      'photo-1559841771-599b6eeaca62',
      'A bed with white and black pillows and a bedside lantern',
    ],
    [
      'photo-1560185893-a55cbc8c57e8',
      'A bedroom with dark grey walls, a large bed and a floral rug',
    ],
    [
      'photo-1560448075-57d0285fc59b',
      'A bed with table lamps on nightstands either side',
    ],
    ['photo-1562438668-bcf0ca6578f0', 'A grey bed in a bedroom'],
    [
      'photo-1566665797739-1674de7a421a',
      'A bedroom with a blue upholstered headboard and wooden blinds',
    ],
    ['photo-1577975142952-221c53e51a10', 'A neatly made bed'],
    ['photo-1586105251261-72a756497a11', 'A bed with black and white linen'],
    [
      'photo-1586310520462-658e93388399',
      'A bed with white linen beside a wooden cabinet',
    ],
    [
      'photo-1588796460666-590f1d712a2e',
      'A bed with white linen beside a white nightstand',
    ],
    [
      'photo-1588840103995-02893d4eb8fd',
      'A bed with white linen beside brown curtains',
    ],
    ['photo-1595526051245-4506e0005bd0', 'A bed made up with white linen'],
    ['photo-1595526114035-0d45ed16cfbf', 'A bed made up with white linen'],
    ['photo-1598928636135-d146006ff4be', 'A white pillow on a made bed'],
    ['photo-1600210491305-7396500b5b31', 'A bed with white and blue linen'],
    ['photo-1606796913825-2b02883605e9', 'A bed with white linen beside a green plant'],
    ['photo-1611095459865-47682ae3c41c', 'Red throw pillows on a white bed'],
    [
      'photo-1611892440504-42a792e24d32',
      'A bedroom with a wooden bed, teal pillows and a garden view',
    ],
    ['photo-1612152605347-f93296cb657d', 'A bed with white linen near a white door'],
    ['photo-1612320582827-a95ab2596dbc', 'A bed with white linen and pillows'],
    ['photo-1612320583049-eabe3c21bd94', 'A white bed with white linen'],
    [
      'photo-1616486029423-aaa4789e8c9a',
      'A sunlit bedroom with a bed, a leather bench and wall art',
    ],
    ['photo-1617104678098-de229db51175', 'A bed with black and white linen'],
    ['photo-1617325247661-675ab4b64ae2', 'A white pillow on a wooden bed frame'],
    [
      'photo-1618221118493-9cfa1a1c00da',
      'A bedroom with blue walls, a beige bed and a woven pendant light',
    ],
    ['photo-1618773928121-c32242e63f39', 'A bed with white linen and throw pillows'],
    ['photo-1619810230359-b2c2f61c49cd', 'A bed made up with white linen'],
    ['photo-1622429420441-60dd67f737a6', 'A white wooden cabinet beside a bed'],
    ['photo-1625334782252-da92af3ad887', 'A bed with white linen and two pillows'],
    ['photo-1630660664869-c9d3cc676880', 'A white pillow on a white bed'],
    ['photo-1630699293259-0b6c08606c62', 'A blue throw on a white bed'],
    [
      'photo-1630699375019-c334927264df',
      'A white bed with white and black throw pillows',
    ],
    ['photo-1631048730653-fe02e0784236', 'A bed made up with white linen'],
    ['photo-1631048730670-ff5cd0d08f15', 'A bed made up with white linen'],
    ['photo-1631048835184-3f0ceda91b75', 'A bed made up with white linen'],
    ['photo-1631049035115-f96132761a38', 'A bed with white and black linen'],
    ['photo-1631049307264-da0ec9d70304', 'A bed made up with white linen'],
    ['photo-1631049421450-348ccd7f8949', 'A bed made up with white linen'],
    ['photo-1633948393301-d43e3ec0e5cd', 'A bedroom with a neatly made bed and a desk'],
    [
      'photo-1634208006171-6713e0c9a25e',
      'A bed with a white comforter and pink pillows',
    ],
    ['photo-1638454668466-e8dbd5462f20', 'A bedroom with a bed, a desk and a window'],
    ['photo-1647792855184-af42f1720b91', 'A bedroom with a bed and a nightstand'],
    ['photo-1649068559107-e5d936141e44', 'A bed next to a window'],
    ['photo-1652882860902-7c6b0f88ef23', 'A bedroom with a neatly made bed and a desk'],
    ['photo-1652882860938-f90aa298e644', 'A bedroom with a bed, a desk and a chair'],
    ['photo-1660407761025-539c2dbc1dc6', 'A bed with pillows'],
    ['photo-1662352137320-d1ac1494c8f1', 'A bedroom with a large window'],
    ['photo-1662841540530-2f04bb3291e8', 'A bedroom with a large bed and a fan'],
    ['photo-1696762932825-2737db830bbe', 'A bedroom with a bed and a chair'],
    ['photo-1702014857653-dcea938d51f0', 'A room with a bed and a small table'],
    ['photo-1702014861736-d62834317c5e', 'A room with a large bed and a window'],
    ['photo-1703783010857-9bd7a7b97c50', 'A bed under a window beside a nightstand'],
    ['photo-1705299493347-b09f2a8b719b', 'A nightstand with a lamp beside a bed'],
    ['photo-1717930290246-53c32a1184ca', 'A bed with two pillows and a nightstand'],
    [
      'photo-1718717722247-26f4c6c09192',
      'A bedroom with a large bed and a ceiling fan',
    ],
    ['photo-1720420021124-4e18564e070f', 'A bedroom with a bed and a desk'],
    ['photo-1722474027005-eac2b857bff7', 'A bedroom with a large window and a bed'],
    ['photo-1724582586413-6b69e1c94a17', 'A bedroom with a bed and a table'],
    ['photo-1727706572437-4fcda0cbd66f', 'A bedroom with two beds and a desk'],
    [
      'photo-1731336478850-6bce7235e320',
      'A bedroom with a white bed and a wooden headboard',
    ],
    ['photo-1734456416941-416c08f0778e', 'A bedroom with a large bed and a red rug'],
    [
      'photo-1734599505058-6653a0d8d3ff',
      'A bedroom with a bed and a plant in the corner',
    ],
    ['photo-1734599505101-66d53bd36927', 'A room with bunk beds and a window'],
    ['photo-1734599511415-cb4a52aea2fe', 'A bedroom with a bed and a nightstand'],
    ['photo-1742319096912-7bb94fdfeb03', 'A modern bedroom with a bed and furnishings'],
    ['photo-1743435009576-1beabc1043bd', 'A stylish modern bedroom'],
    ['photo-1743867840110-ee532b7c6fb9', 'A cosy bedroom with artwork and plants'],
    ['photo-1747139157713-430fd0b29b93', 'A cosy bedroom with pillows and a shelf'],
    ['photo-1750420556288-d0e32a6f517b', 'A modern bedroom in neutral tones'],
    [
      'photo-1757344454333-cc666252e596',
      'A modern bedroom with wooden accents and soft lighting',
    ],
    [
      'photo-1760072513376-67a46aab0fd1',
      'A modern bedroom with a bed, a desk and mirrors',
    ],
    [
      'photo-1760072513393-b9d81f65dd7e',
      'A modern bedroom with a large wardrobe and a vanity area',
    ],
    [
      'photo-1765279333918-949ddcb655ba',
      'A modern bedroom with a large bed and minimal decor',
    ],
    [
      'photo-1765464184843-105e144bd54b',
      'A cosy bedroom with a single bed and a window view',
    ],
    ['photo-1768946131535-b90bad125f16', 'An upholstered bed with white linen'],
    [
      'photo-1771327811766-5f4149190b3d',
      'A modern bedroom with a large window and wooden accents',
    ],
    [
      'photo-1771327811795-6197403af846',
      'A modern bedroom with a large window and a bed',
    ],
    [
      'photo-1771328756051-dff10c3feaab',
      'A cosy bedroom with a large window and a city view',
    ],
    [
      'photo-1771328756144-02bde5549a9a',
      'A modern bedroom with a large wardrobe and a bed',
    ],
    [
      'photo-1773867567921-fcd134cffc33',
      'A neatly made bed with blue pillows and white linen',
    ],
    [
      'photo-1774716925806-e152f1995bed',
      'A bed with grey sheets and a patterned pillow',
    ],
    [
      'photo-1776348065117-02285a905b0b',
      'A modern bedroom with a desk, a bed and a city view',
    ],
    [
      'photo-1777880305920-e542f575f4e9',
      'A modern bedroom with wooden accents and a large bed',
    ],
    [
      'photo-1779277301060-ca36c5afead5',
      'A modern bedroom with a large bed and wooden furniture',
    ],
    [
      'photo-1780884864607-8601237e4b22',
      'A cosy bedroom with a bed, a window and a skylight',
    ],
    [
      'photo-1780884864627-3e1664eb8feb',
      'A cosy bedroom with decorative pillows and a wicker headboard',
    ],
    [
      'photo-1781249144056-ec397e444dfa',
      'A cosy bedroom with a single bed, a window and blue decor',
    ],
    [
      'photo-1781249144083-6264548df901',
      'A modern bedroom with a bed, artwork and a white wardrobe',
    ],
    [
      'photo-1781249144129-4ba0869707f5',
      'A modern bedroom with colourful bedding and a wooden headboard',
    ],
    [
      'photo-1781249144235-7dff19f6e7db',
      'A modern bedroom with a bed, a white wardrobe and a window',
    ],
    [
      'photo-1784653549349-97e2116919b1',
      'A bedroom with a large bed, a bench and neutral decor',
    ],
    [
      'photo-1784653549463-83c9bd94c7e2',
      'A bedroom with a large bed and built-in wardrobes',
    ],
    [
      'photo-1785232273548-4beae5334903',
      'A modern bedroom with a bed, a wardrobe and a window',
    ],
  ]),

  shared: entries([
    ['photo-1463620910506-d0458143143e', 'A white desk beside a bed'],
    ['photo-1520277739336-7bf67edfa768', 'Wooden bunk beds'],
    [
      'photo-1522079185018-c7dfc98897c2',
      'A quilted bed near a blue door and a curtained window',
    ],
    [
      'photo-1530334580314-1e7a340426a0',
      'A black bed frame with blue and white sheets',
    ],
    ['photo-1542681575-352258e0c854', 'A made bed in a room'],
    ['photo-1552130356-addbad6fc198', 'Two grey pillows on a bed beside a table lamp'],
    ['photo-1555854877-bab0e564b8d5', 'A black metal bunk bed'],
    ['photo-1571599611089-6aab8233a4b3', 'Pillows on a made bed'],
    ['photo-1582719478250-c89cae4dc85b', 'White linen on a wooden bed frame'],
    ['photo-1584132905271-512c958d674a', 'A bed made up with white linen'],
    ['photo-1584132923901-cd27c0cdd88e', 'A white bed on a wooden parquet floor'],
    ['photo-1603072387865-e48a022fc541', 'A bed with blue and white linen'],
    ['photo-1603072387986-d6136328c664', 'A floral bed with white and red cushions'],
    ['photo-1603072388139-565853396b38', 'A bed with white and blue linen'],
    ['photo-1616486232086-81d47190669a', 'A white bed with an orange blanket'],
    ['photo-1623625434462-e5e42318ae49', 'A bed with white and grey floral linen'],
    ['photo-1628746234641-28eb583a51b4', 'A white pillow on a made bed'],
    ['photo-1629078691977-dc51747c0263', 'A bed made up with white linen'],
    ['photo-1632119289059-793dd347950f', 'A room with a bed and a desk'],
    ['photo-1635108197086-5107e1e98107', 'A room with two beds and a desk'],
    ['photo-1636917754428-60ece5e521df', 'A bunk bed in a room with plenty of windows'],
    [
      'photo-1646236731457-18f0c8a6d188',
      'A green metal bed frame against a green wall',
    ],
    ['photo-1658595148963-13b7da6dcd6d', 'A bed with a wooden headboard'],
    ['photo-1658595149174-ff76486ec800', 'A bed with a white bedspread'],
    ['photo-1658595149281-8d6bb3643eab', 'A bed with a white bedspread'],
    ['photo-1674162406360-df5ec5eb97e4', 'A room with a bed and a desk'],
    ['photo-1676152466751-054c5cb0af27', 'A bunk bed in a room with wooden walls'],
    ['photo-1682449893611-c9dcae54b51c', 'Two beds side by side'],
    ['photo-1682452664065-e0d911ca967e', 'Two beds side by side'],
    [
      'photo-1709805619372-40de3f158e83',
      'A room with several bunk beds beside a window',
    ],
    ['photo-1719569332255-030dd517952f', 'A room with two beds and a rug'],
    ['photo-1721134110588-6f014e96d3e1', 'A white bunk bed beside a window'],
    ['photo-1722247521637-3cb9c98b77b0', 'A room with two beds and a window'],
    ['photo-1744187170989-0da1811af435', 'Two beds with matching bedding'],
    [
      'photo-1756199622314-189b113a6e3d',
      'Two beds in a bright room with large windows',
    ],
    ['photo-1759139445627-5ce9d5fac8f9', 'Two beds in a rustic room with windows'],
    [
      'photo-1774556743949-f4734bd8393c',
      'Bunk beds, a dresser and a sink in a small room',
    ],
    ['photo-1776500587913-6e55907a738e', 'A room with two beds and large windows'],
    ['photo-1779870458288-95fd59cd2c5b', 'Twin beds in a bright room'],
    [
      'photo-1781415980730-bfcf192e38bc',
      'A clean, well-lit room with several made beds',
    ],
    [
      'photo-1784730352754-70b352a5c45e',
      'A bright green room with two beds and wooden furniture',
    ],
  ]),

  living: entries([
    ['photo-1484101403633-562f891dc89a', 'A blue fabric loveseat'],
    ['photo-1535078035266-a0fa7d3b8f65', 'A white and brown living room'],
    [
      'photo-1592401526914-7e5d94a8d6fa',
      'A blue and white sofa near a glass coffee table',
    ],
    ['photo-1600493505873-cddd69453072', 'A round wooden table beside a white sofa'],
    [
      'photo-1611048267451-e6ed903d4a38',
      'An open-plan living room with leather armchairs',
    ],
    ['photo-1612419299101-6c294dc2901d', 'A white and brown living room set'],
    ['photo-1629042306541-85e77116aed3', 'A black leather sofa beside a wooden table'],
    ['photo-1629042306547-c1d7c6c85ffa', 'A black and grey sectional couch'],
    ['photo-1629042306558-7d1e15cc02fa', 'A grey sofa against a white wall'],
    [
      'photo-1630699294897-723e02620662',
      'A white and grey sofa chair against a white wall',
    ],
    [
      'photo-1638284457192-27d3d0ec51aa',
      'A furnished living room with a painting on the wall',
    ],
    [
      'photo-1654506012740-09321c969dc2',
      'A living room with a couch, a table and chairs',
    ],
    ['photo-1663756915301-2ba688e078cf', 'A living room with a white window'],
    ['photo-1665249934445-1de680641f50', 'A living room with a large window'],
    [
      'photo-1677100091536-4a311441afb5',
      'A living room with a grey couch and a white shelf',
    ],
    [
      'photo-1682662046426-f7589013d25e',
      'A furnished living room with a painting on the wall',
    ],
    [
      'photo-1682662046457-74fd5b199b92',
      'A furnished living room with a painting on the wall',
    ],
    ['photo-1682662046486-23b39bda0799', 'A living room with a couch and two chairs'],
    [
      'photo-1682662046610-fbdb3db4bd74',
      'A furnished living room with a painting on the wall',
    ],
    ['photo-1685602729758-cecb632237a6', 'A white couch in the middle of a room'],
    ['photo-1688005981109-005d981759ac', 'A furnished living room with tall windows'],
    [
      'photo-1713832139677-a03a41b602e3',
      'A living room with a couch, a table and a window',
    ],
    ['photo-1713832139688-79676097edde', 'A furnished living room with a large window'],
    ['photo-1717140370275-7d847544b27b', 'A furnished living room with a large window'],
    ['photo-1738168246881-40f35f8aba0a', 'A living room with a large green couch'],
    ['photo-1742319096901-b8dc2e2734cc', 'A cosy modern living room'],
    ['photo-1745429523615-2a82c60bfc02', 'A modern living room with an open kitchen'],
    ['photo-1745429523617-0d837856ca35', 'A modern living room in neutral colours'],
    ['photo-1767348923210-9aba792076e6', 'A cosy living room with a wall tapestry'],
    [
      'photo-1774278720783-cce9dfbeddc3',
      'A living room with sofas, chairs and a coffee table',
    ],
    [
      'photo-1785402231092-859d0a6c4397',
      'A spacious modern living room in neutral decor',
    ],
    [
      'photo-1787383274118-19be2f542e2b',
      'An orange sofa and two armchairs under wooden beams',
    ],
    [
      'photo-1787390629829-abb32b3025c5',
      'A living room with beige sofas, a coffee table and plants',
    ],
  ]),

  kitchen: entries([
    [
      'photo-1484154218962-a197022b5858',
      'A steel refrigerator beside a modular kitchen',
    ],
    [
      'photo-1529423374493-8b2f78fd2437',
      'White kitchen cupboards with a rack of dinnerware',
    ],
    [
      'photo-1539922980492-38f6673af8dd',
      'A kitchen with blue cabinets and a black refrigerator',
    ],
    ['photo-1556911220-bff31c812dba', 'A modern white kitchen with an island'],
    ['photo-1574739782594-db4ead022697', 'White kitchen cupboards and a gas stove'],
    ['photo-1585821570322-3172bfadb645', 'A refrigerator beside a microwave oven'],
    ['photo-1588796460718-f457ad1e1a1f', 'White and brown wooden kitchen cabinets'],
    ['photo-1601760562234-9814eea6663a', 'White kitchen cabinets and a pendant lamp'],
    [
      'photo-1606398016782-2f49b8c03e99',
      'White kitchen cabinets with an electric kettle',
    ],
    ['photo-1609266117579-5bb972860d27', 'White kitchen cabinets with a steel sink'],
    [
      'photo-1609766856923-7e0a0c06584d',
      'A refrigerator beside white kitchen cabinets',
    ],
    ['photo-1610527003928-47afd5f470c6', 'White kitchen cabinets and a microwave oven'],
    ['photo-1630699144641-72fa7a6b8aa1', 'White and black kitchen cabinets'],
    ['photo-1630699293784-9f977570255a', 'A microwave oven on a white kitchen counter'],
    ['photo-1630699293875-e56c25151c4b', 'A microwave oven on a white kitchen counter'],
    ['photo-1630699294110-6bbec2bb9ea4', 'A white wooden kitchen'],
    ['photo-1630699294512-64ecddd912c5', 'A white wooden kitchen'],
    ['photo-1630699376167-3870469e7598', 'White and brown kitchen cabinets'],
    ['photo-1630699376331-7d70d7a3e417', 'White kitchen cabinets against a white wall'],
    [
      'photo-1649068533606-0e7ef6786214',
      'A kitchen with wooden cabinets and a steel refrigerator',
    ],
    ['photo-1682662044733-9120471befc7', 'A kitchen with a stove beside the sink'],
    [
      'photo-1689043528099-2ba014dd7c64',
      'A kitchen with a table and chairs by a window',
    ],
    [
      'photo-1696814543707-1bdce2a5d48e',
      'A kitchen with white cabinets and steel appliances',
    ],
    [
      'photo-1721522000055-795cf74e9856',
      'A kitchen with a wooden counter and white cabinets',
    ],
    [
      'photo-1722606487512-e555fc998234',
      'A kitchen with white cabinets and steel appliances',
    ],
    ['photo-1722764385074-3f296107a497', 'A kitchen with a refrigerator and a sink'],
    ['photo-1722942115826-13208bc3f8c5', 'A kitchen with a stove beside a window'],
    ['photo-1723810389040-44aee5338fb9', 'A kitchen with white cabinets and a stove'],
    ['photo-1755771984341-546c2a04f236', 'A modern U-shaped kitchen'],
    [
      'photo-1773098587137-1a62971cfedb',
      'A modern kitchen with steel appliances and wooden floors',
    ],
  ]),

  study: entries([
    ['photo-1457276587196-a9d53d84c58b', 'Books on a wooden shelf'],
    ['photo-1501685532562-aa6846b14a0e', 'Books on a table'],
    ['photo-1530984794059-26f732e6b7ab', 'A rolling chair at a wooden desk'],
    ['photo-1533090161767-e6ffed986c88', 'A desk lamp beside a green plant'],
    ['photo-1567774040705-e55e313f6079', 'A wooden bookshelf'],
    ['photo-1604328698692-f76ea9498e76', 'A lounge with plants and chairs'],
    ['photo-1616400619175-5beda3a17896', 'A laptop on a white desk'],
    ['photo-1629079447838-3d78840ee8cf', 'A laptop on a white desk'],
    ['photo-1639705124644-d9e8f0ae0cab', 'A book beside a laptop on a desk'],
    [
      'photo-1641998148499-cb6b55a3c0d3',
      'A study area with a desk, a chair and a computer',
    ],
    ['photo-1650661926447-9efb2610f64c', 'A laptop on a desk'],
    ['photo-1654356709115-3f68998bead4', 'A desk with a plant and a book'],
    ['photo-1658053283477-b985256569bc', 'A laptop on a desk'],
    ['photo-1666249245780-6584c2a8a3a5', 'A desk with a laptop and a lamp'],
    ['photo-1687676627046-094d418e29c3', 'A room full of books with a desk'],
    ['photo-1764096534686-68091ce5ab45', 'A desk with a laptop and books'],
  ]),

  dining: entries([
    [
      'photo-1759150712537-0e32b6c6a373',
      'A kitchen island with bar stools and a dining area',
    ],
    [
      'photo-1768434118991-667871772318',
      'A breakfast nook with built-in seating and a table',
    ],
    [
      'photo-1771888703720-6a55f70dcbed',
      'A long dining table with many chairs in a bright room',
    ],
    [
      'photo-1772563199191-6c25d80982b5',
      'A modern dining area with a table and chairs',
    ],
    [
      'photo-1772567732674-4756f99b8d55',
      'Dining chairs and an armchair by a large window',
    ],
    ['photo-1772567733008-4de82de3e5c4', 'A dining room with large windows'],
    [
      'photo-1778936317478-688315004196',
      'A dining table and chairs in front of a window',
    ],
    [
      'photo-1779078652919-8d2942dfbe48',
      'A kitchen with a dining table and steel appliances',
    ],
  ]),

  bathroom: entries([
    [
      'photo-1584622650111-993a426fbf0a',
      'A modern bathroom with a shower and a vanity',
    ],
    [
      'photo-1631889993959-41b4e9c6e3c5',
      'A bathroom with a toilet, a sink and a bathtub',
    ],
    ['photo-1667550177726-96da7c257853', 'A bathroom with a sink and a mirror'],
    ['photo-1667550177753-52b318cd4d40', 'A bathroom with a tub, a sink and a toilet'],
    [
      'photo-1677553512940-f79af72efd1b',
      'A bathroom with a bathtub, a sink and a mirror',
    ],
    [
      'photo-1680209081088-645c22402d58',
      'A bathroom with a toilet, a sink and a mirror',
    ],
    ['photo-1687951276836-06efbfda608b', 'A bathroom sink against a blue tiled wall'],
    [
      'photo-1733425844220-feab971190ff',
      'A bathroom with a sink, a mirror, a toilet and a tub',
    ],
    [
      'photo-1733426107854-ee00a25d72a7',
      'A bathroom with a tub, a sink and a large window',
    ],
    ['photo-1742134131017-44d377a611b1', 'A modern bathroom with soft lighting'],
    ['photo-1770941450515-50f2b8ca380b', 'A modern bathroom with double sinks'],
    [
      'photo-1770941550709-a555ac4a69b3',
      'A modern bathroom with double sinks and a bathtub',
    ],
    [
      'photo-1771681278369-e2a5480b8c29',
      'A modern bathroom with marble accents and a plant',
    ],
    [
      'photo-1776525433347-13ffc965601a',
      'A modern bathroom with a bathtub and a toilet',
    ],
  ]),

  exterior: entries([
    ['photo-1448630360428-65456885c650', 'Windows on a residential building'],
    ['photo-1469022563428-aa04fef9f5a2', 'A white and blue four-storey building'],
    ['photo-1549499090-c9203d2b20ad', 'A white high-rise building in daylight'],
    ['photo-1551583996-f0a1d53f5bfd', 'A white concrete building in daylight'],
    ['photo-1565363887735-c63cb07cf57e', 'A white and brown concrete building'],
    ['photo-1597047084897-51e81819a499', 'A white building under a blue sky'],
    ['photo-1597047084993-bf337e09ede0', 'High-rise buildings in daylight'],
    ['photo-1610402919524-dcd64aa0b17b', 'A brown building under a blue sky'],
    ['photo-1630699376682-84df40131d22', 'A brick building near green trees'],
    ['photo-1650877489685-b7d8b1160b6f', 'A tall building against a blue sky'],
    ['photo-1651418476229-504131aea546', 'A tall building against a blue sky'],
    ['photo-1663985139222-6af2f8646104', 'A tall building with many windows'],
    ['photo-1672506142658-eef14f61ec43', 'A tall white building with many windows'],
    ['photo-1672508013582-035e75fb76ec', 'A very tall building with many windows'],
    ['photo-1673977597435-b794445d3fe2', 'Two tall buildings side by side'],
    ['photo-1726746416205-3cda9ec1536c', 'A tall red building with many windows'],
    [
      'photo-1762958266438-5fbfffde5234',
      'Red balcony screens on a brick apartment building',
    ],
    ['photo-1762958266774-95abba6e0685', 'A balcony on a brick building'],
    [
      'photo-1776018525322-1311733d1f95',
      'A tall apartment building against a clear sky',
    ],
    [
      'photo-1776363116182-51694a04a1d5',
      'A modern balcony with a city view and a hanging chair',
    ],
  ]),

  common: entries([
    [
      'photo-1493246318656-5bfd4cfb29b8',
      'A patio set on a terrace overlooking the city',
    ],
    ['photo-1571902943202-507ec2618e8f', 'Gym equipment in a room'],
    ['photo-1604335398980-ededcadcc37d', 'Front-loading washing machines'],
    ['photo-1626806787426-5910811b6325', 'A front-loading washing machine'],
    ['photo-1626806787461-102c1bfaaea1', 'A front-loading washing machine'],
    ['photo-1626806818535-29c61b8cd3f7', 'A front-loading washing machine'],
    ['photo-1626806819282-2c1dc01a5e0c', 'A washer and dryer in a room'],
    [
      'photo-1638949493140-edb10b7be2f3',
      'A row of washers and dryers in a laundry room',
    ],
    ['photo-1646592474094-342fbc28736c', 'A laundry room with a washer and dryer'],
    ['photo-1646592491525-1d4abf467273', 'A laundry room with washers and dryers'],
    ['photo-1649805418927-643004a0afe6', 'A washer and dryer in a white kitchen'],
    ['photo-1657064575960-efefbe831c2e', 'A row of washing machines'],
    [
      'photo-1682888818612-1c18ebecf3ec',
      'A laundry room with a sink, a washer and a dryer',
    ],
    ['photo-1721523261883-8297c0c0251b', 'A laundry room with a washer and dryer'],
    ['photo-1778749024305-d3f3d97b92cb', 'A rooftop garden with flowering plants'],
    [
      'photo-1784878281083-58f3f8e6d5ab',
      'A rooftop garden with planters and a wooden pergola',
    ],
    ['photo-1785486249823-02fbb298c918', 'A rooftop terrace overlooking a green roof'],
  ]),
};

/** Full URL stored on a seeded media row. */
export const libraryPhotoPath = (id: string): string => photoUrl(id, 1600);

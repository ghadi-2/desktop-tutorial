/**
 * Schematic geometry transcribed from the three pages of «المخطط (1).pdf».
 * Coordinates preserve the relative arrangement, not surveyed dimensions.
 * Numbers distinguish repeated rooms; they are not official room identifiers.
 */
export type Floor = 0 | 1 | 2;
export type Point = { x: number; z: number };
export type Room = {
  id: string;
  name: string;
  floor: Floor;
  kind: 'lab' | 'classroom' | 'office' | 'meeting' | 'service' | 'library' | 'sports' | 'theater';
  x: number;
  z: number;
  width: number;
  depth: number;
  color: string;
  door: Point;
  description: string;
  polygon?: Point[];
};
export type POI = {
  id: string;
  name: string;
  floor: Floor;
  kind: 'elevator' | 'stairs' | 'restroom' | 'exit' | 'fire' | 'entrance';
  x: number;
  z: number;
  description: string;
};
export type Route = { floor: Floor; points: Point[] }[];

export const floors: { id: Floor; name: string; shortName: string }[] = [
  { id: 0, name: 'الدور الأرضي', shortName: 'الأرضي' },
  { id: 1, name: 'الدور الأول', shortName: 'الأول' },
  { id: 2, name: 'الدور الثاني', shortName: 'الثاني' },
];
export const entrance: Point = { x: 30, z: -7 };
export const elevator: Point = { x: 14, z: -12 };
export const insideEntrance: Point = { x: 21, z: -7 };
export const bounds = { minX: -28, maxX: 28, minZ: -30, maxZ: 30 };
/** The common L-shaped envelope. The ground-floor theater has its own polygon. */
export const floorFootprint: Point[] = [
  { x: 9, z: -30 }, { x: 28, z: -30 }, { x: 28, z: 30 },
  { x: -28, z: 30 }, { x: -28, z: 0 }, { x: 9, z: 0 },
];

const palette = {
  lab: '#80c9ec', classroom: '#c7ecb3', office: '#a5cbe9', meeting: '#d4bee9',
  service: '#90bcb8', library: '#b7bdd0', sports: '#cdb7e9', theater: '#e2bf91',
};
const arabicNumber = (n: number) => String(n).replace(/\d/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
const repeatedDescription = 'الموقع مستند إلى المخطط المرفق. الترقيم للتفريق بين الغرف في النموذج، وليس رقمًا رسميًا.';
const unlabeledDescription = 'هذه المساحة موجودة في المخطط المرفق، لكن تسميتها غير موضحة في مفتاح هذا الدور. يلزم تأكيد اسمها.';

function room(
  id: string, name: string, floor: Floor, kind: Room['kind'],
  left: number, top: number, width: number, depth: number, door: Point,
  description = 'الموقع والتسمية مستندان إلى المخطط المرفق.',
  color = palette[kind],
): Room {
  return { id, name, floor, kind, x: left + width / 2, z: top + depth / 2, width, depth, color, door, description };
}

export const rooms: Room[] = [];

for (const floor of [0, 1, 2] as const) {
  // Six rectangles north of the western hall, and six south of it.
  for (let index = 0; index < 6; index++) {
    const left = -28 + index * (38 / 6);
    const door = { x: left + 4.6, z: 11 };
    if (floor === 0 && index === 0) {
      rooms.push(room('g-daycare', 'الحضانة', floor, 'service', left, 0, 38 / 6, 11, door, undefined, '#96c5ad'));
    } else if (floor === 0 && index === 1) {
      rooms.push(room('g-unlabeled-west', 'مساحة غير مسماة · الجناح الغربي', floor, 'service', left, 0, 38 / 6, 11, door, unlabeledDescription, '#c7ecb3'));
    } else {
      const kind = floor === 0 ? 'lab' : 'classroom';
      const number = floor === 0 ? index - 1 : index + 1;
      rooms.push(room(`f${floor}-${kind}-${number}`, `${kind === 'lab' ? 'معمل الحاسب' : 'قاعة تدريبية'} ${arabicNumber(number)}`, floor, kind, left, 0, 38 / 6, 11, door, repeatedDescription));
    }
  }
  for (let index = 0; index < 6; index++) {
    const left = -20.6 + index * (37.6 / 6);
    const door = { x: left + 4.4, z: 21 };
    if (floor === 2 && index === 5) {
      rooms.push(room('f2-library', 'المكتبة', floor, 'library', left, 21, 37.6 / 6, 9, door));
    } else {
      const kind = floor === 0 ? 'lab' : 'classroom';
      const number = floor === 0 ? index + 5 : index + 7;
      rooms.push(room(`f${floor}-${kind}-${number}`, `${kind === 'lab' ? 'معمل الحاسب' : 'قاعة تدريبية'} ${arabicNumber(number)}`, floor, kind, left, 21, 37.6 / 6, 9, door, repeatedDescription));
    }
  }

  // The two northern rooms flank the lift/stair lobby.
  const upperLeft = floor === 0
    ? room('g-store-north', 'المستودع الشمالي', floor, 'service', 9, -24, 10, 10, { x: 19, z: -15 }, 'مساحة المستودع الرمادية في الجزء الشمالي من مخطط الدور الأرضي.', '#cfd4db')
    : floor === 1
      ? room('f1-meeting', 'قاعة الاجتماعات', floor, 'meeting', 9, -24, 10, 10, { x: 19, z: -15 })
      : room('f2-studio-1', 'قاعة متصلة بالاستديو ١', floor, 'classroom', 9, -24, 10, 10, { x: 19, z: -15 }, repeatedDescription, '#8dbac2');
  rooms.push(upperLeft);
  rooms.push(floor === 0
    ? room('g-health', 'الوحدة الصحية', floor, 'service', 23, -24, 5, 10, { x: 23, z: -15 })
    : floor === 1
      ? room('f1-community', 'خدمة المجتمع', floor, 'service', 23, -24, 5, 10, { x: 23, z: -15 })
      : room('f2-studio-2', 'قاعة متصلة بالاستديو ٢', floor, 'classroom', 23, -24, 5, 10, { x: 23, z: -15 }, repeatedDescription, '#8dbac2'));

  rooms.push(floor === 1
    ? room('f1-prayer', 'المصلى', floor, 'service', 23, -14, 5, 5, { x: 23, z: -11 }, 'المصلى موضح برمز في مخطط الدور الأول.', '#e8d4b3')
    : room(`f${floor}-unlabeled-north`, 'مساحة غير مسماة · الجناح الشمالي', floor, 'service', 23, -14, 5, 5, { x: 23, z: -11 }, unlabeledDescription, floor === 0 ? '#edf0f3' : '#a8d4bc'));

  // Small service rooms on the west side of the long eastern corridor.
  rooms.push(room(`f${floor}-utility`, floor === 0 ? 'المستودع بجوار الممر' : 'غرفة خدمات غير مسماة', floor, 'service', 17, 0, 3, 7, { x: 20, z: 5.5 }, floor === 0 ? 'مساحة رمادية موضحة في المخطط بجوار دورات المياه.' : unlabeledDescription, '#cfd4db'));
  if (floor === 0) {
    rooms.push(room('g-unlabeled-east', 'مساحة غير مسماة · الممر الشرقي', floor, 'service', 17, 17, 3, 8, { x: 20, z: 19 }, unlabeledDescription, '#c7ecb3'));
    rooms.push(room('g-waiting', 'صالة الانتظار', floor, 'service', 24, 0, 4, 9, { x: 24, z: 2.5 }, undefined, '#98aecb'));
    rooms.push(room('g-meeting', 'قاعة الاجتماعات', floor, 'meeting', 24, 9, 4, 16, { x: 24, z: 23 }));
    rooms.push(room('g-dean', 'مكتب العميدة', floor, 'office', 19, 25, 9, 5, { x: 22, z: 25 }, undefined, '#bbb5bb'));
    rooms.push(room('g-store-west', 'المستودع بجوار المسرح', floor, 'service', 2, -3, 8, 3, { x: 10, z: -1 }, 'مساحة المستودع الرمادية فوق صف المعامل في المخطط.', '#cfd4db'));
  } else {
    rooms.push(floor === 1
      ? room('f1-stationery', 'القرطاسية', floor, 'service', 24, -9, 4, 9, { x: 24, z: -6 }, undefined, '#9dccb4')
      : room('f2-sports', 'الصالة الرياضية', floor, 'sports', 24, -9, 4, 9, { x: 24, z: -6 }));
    const officeRects = [
      { left: 24, top: 0, width: 4, depth: 9, door: { x: 24, z: 2.5 } },
      { left: 24, top: 9, width: 4, depth: 8, door: { x: 24, z: 10.5 } },
      { left: 24, top: 17, width: 4, depth: 8, door: { x: 24, z: 18.5 } },
      { left: 17, top: 17, width: 3, depth: 8, door: { x: 20, z: 19 } },
      { left: 17, top: 25, width: 6, depth: 5, door: { x: 20, z: 25 } },
      { left: 23, top: 25, width: 5, depth: 5, door: { x: 23.5, z: 25 } },
    ];
    officeRects.forEach((rect, index) => rooms.push(room(`f${floor}-office-${index + 1}`, `مكتب ${arabicNumber(index + 1)}`, floor, 'office', rect.left, rect.top, rect.width, rect.depth, rect.door, repeatedDescription)));
  }
}

const theaterPolygon: Point[] = [
  { x: -10, z: -12.5 }, { x: -7, z: -18 }, { x: -4.5, z: -17.5 },
  { x: 5, z: -12 }, { x: 9, z: -12 }, { x: 9, z: -8 },
  { x: 5, z: -8 }, { x: 2, z: -3 }, { x: -1.7, z: -4.2 }, { x: -8.5, z: -10.3 },
];
rooms.push({
  ...room('g-theater', 'المسرح', 0, 'theater', -10, -18, 19, 15, { x: 9, z: -10 }, 'شكل المسرح المضلع ووصلة دخوله مستندان إلى المخطط؛ الأبعاد تقريبية.'),
  polygon: theaterPolygon,
});

export const pois: POI[] = [];
for (const floor of [0, 1, 2] as const) {
  const add = (id: string, name: string, kind: POI['kind'], x: number, z: number, description: string) => pois.push({ id: `f${floor}-${id}`, name, floor, kind, x, z, description });
  add('elevator', 'المصعد', 'elevator', elevator.x, elevator.z, 'المصعد يربط الأدوار الثلاثة ويستخدم افتراضيًا في المسارات بين الأدوار.');
  add('stairs-north', 'السلالم الشمالية', 'stairs', 12, -27, 'درج ومخرج في الجزء الشمالي من المخطط.');
  add('stairs-lobby', 'سلالم البهو', 'stairs', 10.5, -10.5, 'السلالم المجاورة للمصعد كما تظهر في المخطط.');
  add('stairs-west', 'السلالم الغربية', 'stairs', -26, 24, 'السلالم في الركن الجنوبي الغربي من المخطط.');
  add('restroom-north', 'دورات المياه الشمالية', 'restroom', 25.5, -27, 'دورات مياه موضحة في المخطط.');
  add('restroom-east', 'دورات المياه الشرقية', 'restroom', 18.5, 12.5, 'دورات المياه بمحاذاة الممر الشرقي.');
  add('restroom-west', 'دورات المياه الغربية', 'restroom', -22.6, 25.5, 'دورات المياه بجوار السلالم الغربية.');
  add('exit-north', 'المخرج الشمالي', 'exit', 20, -25.5, 'مخرج موضح بالرمز الأخضر في المخطط.');
  add('exit-west', 'المخرج الغربي', 'exit', -26, 20.5, 'مخرج موضح بالرمز الأخضر بجوار السلالم الغربية.');
  add('fire-west', 'طفاية حريق · غرب', 'fire', -25.5, 12.5, 'موضع طفاية حريق وفق المخطط.');
  add('fire-center', 'طفاية حريق · الممر', 'fire', -5.8, 19.5, 'موضع طفاية حريق وفق المخطط.');
  add('fire-east', 'طفاية حريق · شرق', 'fire', 6.1, 12.5, 'موضع طفاية حريق وفق المخطط.');
}
pois.push({ id: 'main-entrance', name: 'المدخل الرئيسي', floor: 0, kind: 'entrance', ...entrance, description: 'موضع المدخل يستند إلى سهم المخطط؛ شكل الواجهة توضيحي إلى حين توفير صورتها.' });

type Segment = [Point, Point];
const tolerance = 0.00001;
const pointKey = (point: Point) => `${point.x.toFixed(5)},${point.z.toFixed(5)}`;
const same = (a: Point, b: Point) => Math.abs(a.x - b.x) < tolerance && Math.abs(a.z - b.z) < tolerance;
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z);
const contains = ([a, b]: Segment, p: Point) => Math.abs(distance(a, p) + distance(p, b) - distance(a, b)) < tolerance;

/** Explicit corridor centerlines; the western branch avoids the east-side service rooms. */
function corridorSegments(floor: Floor): Segment[] {
  const segments: Segment[] = [
    [{ x: 21, z: -28 }, { x: 21, z: 23 }],
    [{ x: 21, z: -27 }, { x: 12, z: -27 }],
    [{ x: 21, z: -12 }, elevator],
    [{ x: 21, z: -3 }, { x: 15, z: -3 }],
    [{ x: 15, z: -3 }, { x: 15, z: 15 }],
    [{ x: -26, z: 15 }, { x: 17, z: 15 }],
    [{ x: -26, z: 15 }, { x: -26, z: 24 }],
    [{ x: 19, z: 23 }, { x: 23.5, z: 23 }],
  ];
  if (floor === 0) segments.push([{ x: 21, z: -7 }, entrance], [{ x: 21, z: -10 }, { x: 9, z: -10 }]);
  for (const destination of rooms.filter(r => r.floor === floor)) {
    const { door } = destination;
    let anchor: Point;
    if (Math.abs(door.z - 11) < tolerance || Math.abs(door.z - 21) < tolerance) anchor = { x: door.x, z: 15 };
    else if (Math.abs(door.z - 25) < tolerance) anchor = { x: door.x, z: 23 };
    else if (destination.id === 'g-store-west') anchor = { x: 15, z: door.z };
    else anchor = { x: 21, z: door.z };
    segments.push([anchor, door]);
  }
  return segments;
}

function projection(point: Point, [a, b]: Segment): Point {
  const dx = b.x - a.x, dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz;
  const ratio = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / lengthSquared));
  return { x: a.x + ratio * dx, z: a.z + ratio * dz };
}

function routeOnFloor(floor: Floor, origin: Point, destination: Point): Point[] {
  const segments = corridorSegments(floor);
  // A supplied location can be on a corridor between graph junctions.
  for (const endpoint of [origin, destination]) {
    const nearest = segments.reduce((best, segment) => {
      const candidate = projection(endpoint, segment);
      return distance(endpoint, candidate) < distance(endpoint, best) ? candidate : best;
    }, projection(endpoint, segments[0]));
    if (!same(nearest, endpoint)) segments.push([endpoint, nearest]);
  }
  const candidates = [...segments.flat(), origin, destination];
  // Split crossing lines as well as lines with a branch ending on them.
  for (const first of segments) for (const second of segments) {
    const firstHorizontal = Math.abs(first[0].z - first[1].z) < tolerance;
    const secondHorizontal = Math.abs(second[0].z - second[1].z) < tolerance;
    if (firstHorizontal === secondHorizontal) continue;
    const horizontal = firstHorizontal ? first : second;
    const vertical = firstHorizontal ? second : first;
    const crossing = { x: vertical[0].x, z: horizontal[0].z };
    if (contains(first, crossing) && contains(second, crossing)) candidates.push(crossing);
  }
  const nodes = new Map(candidates.map(point => [pointKey(point), point]));
  const adjacency = new Map([...nodes.keys()].map(key => [key, new Map<string, number>()]));
  for (const segment of segments) {
    const points = [...nodes.values()].filter(point => contains(segment, point)).sort((a, b) => distance(segment[0], a) - distance(segment[0], b));
    for (let index = 1; index < points.length; index++) {
      const a = pointKey(points[index - 1]), b = pointKey(points[index]);
      const cost = distance(points[index - 1], points[index]);
      adjacency.get(a)!.set(b, cost);
      adjacency.get(b)!.set(a, cost);
    }
  }
  const start = pointKey(origin), end = pointKey(destination);
  const costs = new Map<string, number>([[start, 0]]);
  const previous = new Map<string, string>();
  const open = new Set([start]);
  while (open.size) {
    const current = [...open].reduce((best, key) => costs.get(key)! < costs.get(best)! ? key : best);
    open.delete(current);
    if (current === end) break;
    for (const [next, cost] of adjacency.get(current) ?? []) {
      const tentative = costs.get(current)! + cost;
      if (tentative < (costs.get(next) ?? Infinity)) {
        costs.set(next, tentative); previous.set(next, current); open.add(next);
      }
    }
  }
  if (!costs.has(end)) throw new Error(`No corridor route on floor ${floor}`);
  const result: Point[] = [];
  let current: string | undefined = end;
  while (current !== undefined) { result.unshift({ ...nodes.get(current)! }); current = previous.get(current); }
  // Keep turns but remove collinear intermediate junctions for readable route geometry.
  return result.filter((point, index) => {
    if (!index || index === result.length - 1) return true;
    const before = result[index - 1], after = result[index + 1];
    return Math.abs((point.x - before.x) * (after.z - point.z) - (point.z - before.z) * (after.x - point.x)) > tolerance;
  });
}

/** Routes terminate at the destination door, and never use a room as a shortcut. */
export function findRoute(destination: Room, origin: { floor: Floor; point: Point } = { floor: 0, point: insideEntrance }, accessible = true): Route {
  if (origin.floor === destination.floor) return [{ floor: origin.floor, points: routeOnFloor(origin.floor, origin.point, destination.door) }];
  const connection = accessible ? elevator : { x: 12, z: -27 };
  return [
    { floor: origin.floor, points: routeOnFloor(origin.floor, origin.point, connection) },
    { floor: destination.floor, points: routeOnFloor(destination.floor, connection, destination.door) },
  ];
}

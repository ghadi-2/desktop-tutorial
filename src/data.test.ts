import assert from 'node:assert/strict';
import test from 'node:test';
import { rooms, pois, floors, entrance, insideEntrance, elevator, findRoute, type Point, type Room } from './data.ts';

const close = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.z - b.z) < 0.00001;

/** Strict rectangle intersection ignores walls, where destination doors terminate. */
function crossesRoomInterior(a: Point, b: Point, room: Room) {
  const left = room.x - room.width / 2 + 0.00001;
  const right = room.x + room.width / 2 - 0.00001;
  const top = room.z - room.depth / 2 + 0.00001;
  const bottom = room.z + room.depth / 2 - 0.00001;
  if (Math.abs(a.x - b.x) < 0.00001) {
    return a.x > left && a.x < right && Math.max(a.z, b.z) > top && Math.min(a.z, b.z) < bottom;
  }
  if (Math.abs(a.z - b.z) < 0.00001) {
    return a.z > top && a.z < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right;
  }
  throw new Error('Routes must use perpendicular corridor segments');
}

test('room inventory preserves the count and relative placement in the PDF', () => {
  assert.equal(rooms.filter(room => room.floor === 0 && room.kind === 'lab').length, 10);
  assert.equal(rooms.filter(room => room.floor === 1 && room.name.startsWith('قاعة تدريبية')).length, 12);
  assert.equal(rooms.filter(room => room.floor === 2 && room.name.startsWith('قاعة تدريبية')).length, 11);
  assert.equal(rooms.filter(room => room.floor === 2 && room.kind === 'library').length, 1);
  assert.equal(rooms.filter(room => room.floor === 1 && room.kind === 'office').length, 6);
  assert.equal(rooms.filter(room => room.floor === 2 && room.kind === 'office').length, 6);
  assert.equal(new Set(rooms.map(room => room.id)).size, rooms.length);
  assert.equal(new Set(pois.map(poi => poi.id)).size, pois.length);
  assert.equal(floors.length, 3);
  assert.deepEqual(entrance, { x: 30, z: -7 });
  assert.ok(rooms.find(room => room.id === 'g-theater')!.polygon!.length > 4);
  assert.ok(rooms.filter(room => room.name.includes('غير مسماة')).every(room => room.description.includes('غير موضحة')));
});

test('every destination is reachable from the entrance through corridors without crossing rooms', () => {
  for (const destination of rooms) {
    const route = findRoute(destination);
    assert.equal(route[0].floor, 0);
    assert.ok(close(route[0].points[0], insideEntrance), destination.id);
    const final = route.at(-1)!;
    assert.equal(final.floor, destination.floor);
    assert.ok(close(final.points.at(-1)!, destination.door), destination.id);
    for (const leg of route) {
      for (let index = 1; index < leg.points.length; index++) {
        assert.ok(!close(leg.points[index - 1], leg.points[index]), `${destination.id}: duplicate point`);
        for (const room of rooms.filter(room => room.floor === leg.floor)) {
          assert.equal(crossesRoomInterior(leg.points[index - 1], leg.points[index], room), false, `${destination.id} crosses ${room.id}`);
        }
      }
    }
  }
});

test('routes between floors join at the same lift position on both floors', () => {
  for (const destination of rooms.filter(room => room.floor !== 0)) {
    const route = findRoute(destination);
    assert.equal(route.length, 2);
    assert.ok(close(route[0].points.at(-1)!, elevator));
    assert.ok(close(route[1].points[0], elevator));
  }
  const reverse = findRoute(rooms.find(room => room.id === 'g-health')!, { floor: 2, point: elevator });
  assert.equal(reverse[0].floor, 2);
  assert.equal(reverse[1].floor, 0);
  assert.ok(close(reverse[0].points.at(-1)!, elevator));
});

test('stairs preference and arbitrary corridor origins preserve connection and destination', () => {
  const destination = rooms.find(room => room.id === 'f2-library')!;
  const route = findRoute(destination, undefined, false);
  assert.ok(close(route[0].points.at(-1)!, { x: 12, z: -27 }));
  assert.ok(close(route[1].points[0], { x: 12, z: -27 }));
  const sameFloor = findRoute(destination, { floor: 2, point: { x: -13, z: 15 } });
  assert.equal(sameFloor.length, 1);
  assert.deepEqual(sameFloor[0].points[0], { x: -13, z: 15 });
  assert.ok(close(sameFloor[0].points.at(-1)!, destination.door));
  const outsideOrigin = findRoute(rooms.find(room => room.id === 'g-theater')!, { floor: 0, point: entrance });
  assert.ok(close(outsideOrigin[0].points[0], entrance));
});

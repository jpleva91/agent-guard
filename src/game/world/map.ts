// Map tile queries
//
// TODO(roadmap): Phase 7 — Roguelike dungeon renderer (procedural floor layouts)

interface MapData {
  width: number;
  height: number;
  tiles: number[][];
}

let MAP_DATA: MapData = { width: 0, height: 0, tiles: [] };

export function setMapData(data: MapData): void {
  MAP_DATA = data;
}

export function getMap(): MapData {
  return MAP_DATA;
}

export function getTile(x: number, y: number): number {
  if (y < 0 || y >= MAP_DATA.height || x < 0 || x >= MAP_DATA.width) {
    return 1; // out of bounds = wall
  }
  return MAP_DATA.tiles[y][x];
}

export function isWalkable(x: number, y: number): boolean {
  const tile = getTile(x, y);
  return tile === 0 || tile === 2;
}

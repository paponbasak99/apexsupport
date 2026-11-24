export type PlantType = 'ficus' | 'olive' | 'palm' | 'fern';
export type PlacementType = 'top-right' | 'top-left' | 'right' | 'left' | 'bottom-right' | 'bottom-left';

export interface BranchDefinition {
  offset: number;
  length: number;
  segments: number;
  curl: number;
  droop: number;
  depth: number;
  spread: number;
}

export interface LeafInstance {
  at: number;
  side: number;
  length: number;
  width: number;
  tilt: number;
  droop: number;
  flutter: number;
  rate: number;
  kind: number;
}

export interface BranchInstance {
  base: [number, number];
  angle: number;
  length: number;
  segments: number;
  curl: number;
  droop: number;
  depth: number;
  phase: number;
  thickness: number;
  leaves: LeafInstance[];
  bend: number;
  velocity: number;
  kick: number;
  kickAt: number;
}

export const PLANT_PRESETS: Record<PlantType, BranchDefinition[]> = {
  ficus: [
    { offset: 0, length: 0.95, segments: 6, curl: 0.16, droop: 0.05, depth: 0.12, spread: 0 },
    { offset: -0.44, length: 0.74, segments: 5, curl: -0.1, droop: 0.06, depth: 0.55, spread: -0.12 },
    { offset: 0.42, length: 0.66, segments: 5, curl: 0.2, droop: 0.04, depth: 0.95, spread: 0.1 },
    { offset: 0.88, length: 0.52, segments: 4, curl: -0.14, droop: 0.07, depth: 0.35, spread: 0.2 },
  ],
  olive: [
    { offset: 0.02, length: 1.15, segments: 10, curl: 0.1, droop: 0.035, depth: 0.18, spread: 0 },
    { offset: -0.36, length: 0.92, segments: 8, curl: -0.07, droop: 0.04, depth: 0.6, spread: -0.1 },
    { offset: 0.4, length: 0.86, segments: 8, curl: 0.14, droop: 0.03, depth: 1, spread: 0.12 },
  ],
  palm: [
    { offset: 0.04, length: 1.28, segments: 14, curl: 0.02, droop: 0.05, depth: 0.14, spread: 0 },
    { offset: -0.5, length: 1.05, segments: 12, curl: -0.02, droop: 0.06, depth: 0.6, spread: -0.08 },
    { offset: 0.56, length: 1, segments: 12, curl: 0.03, droop: 0.065, depth: 0.95, spread: 0.1 },
  ],
  fern: [
    { offset: 0, length: 1.1, segments: 18, curl: 0.22, droop: 0.06, depth: 0.15, spread: 0 },
    { offset: -0.42, length: 0.88, segments: 15, curl: 0.12, droop: 0.07, depth: 0.55, spread: -0.1 },
    { offset: 0.45, length: 0.82, segments: 14, curl: 0.3, droop: 0.06, depth: 0.95, spread: 0.12 },
    { offset: 0.9, length: 0.62, segments: 11, curl: 0.18, droop: 0.08, depth: 0.4, spread: 0.2 },
  ],
};

export const PLACEMENTS: Record<PlacementType, { x: number; y: number; angle: number }> = {
  'top-right': { x: 1, y: 1, angle: -2.42 },
  'top-left': { x: -1, y: 1, angle: -0.72 },
  right: { x: 1, y: 0.18, angle: Math.PI - 0.18 },
  left: { x: -1, y: 0.18, angle: 0.18 },
  'bottom-right': { x: 1, y: -1, angle: 2.42 },
  'bottom-left': { x: -1, y: -1, angle: 0.72 },
};

export const clamp = (val: number, min: number, max: number): number => Math.min(max, Math.max(min, val));

export function createRandom(seed: number, plant: string, placement: string): () => number {
  let r = Math.floor(Math.abs(7919 * Math.round(seed) + 131 * plant.length + 17 * placement.length)) % 0x7ffffffe + 1;
  return () => {
    r = (16807 * r) % 0x7fffffff;
    return (r - 1) / 0x7ffffffe;
  };
}

export function generatePlantBranches(
  plant: PlantType,
  placement: PlacementType,
  scale: number,
  density: number,
  seed: number,
  aspectRatio: number
): BranchInstance[] {
  const definitions = PLANT_PRESETS[plant] ?? PLANT_PRESETS.ficus;
  const place = PLACEMENTS[placement] ?? PLACEMENTS['top-right'];
  const rng = createRandom(seed, plant, placement);
  const u = place.x < 0 ? -1 : 1;
  const d = place.y < 0 ? -1 : 1;

  const responsiveScale = clamp(aspectRatio / 1.5, 0.48, 1);
  const effectiveScale = clamp(scale, 0.3, 2.5) * responsiveScale;
  const effectiveDensity = clamp(density, 0.2, 1.6);
  const densityFilter = clamp(0.5 + 0.5 * effectiveDensity, 0.25, 1);
  const leafScaleFactor = 0.82 + 0.18 * clamp(effectiveDensity, 0.3, 1.6);

  const baseX = place.x * (aspectRatio / 2 + 0.05);
  const baseY = Math.abs(place.y) === 1 ? 0.56 * place.y : place.y;

  return definitions.map((def, branchIdx) => {
    const normalAngle = place.angle + Math.PI / 2;
    const spreadOffset = def.spread * effectiveScale;
    const branch: BranchInstance = {
      base: [
        baseX + Math.cos(normalAngle) * spreadOffset * 0.6,
        baseY + Math.sin(normalAngle) * spreadOffset * 0.6 * (Math.abs(place.y) < 1 ? 1 : 0.4),
      ],
      angle: place.angle + def.offset * u * d,
      length: def.length * effectiveScale * (0.92 + 0.16 * rng()),
      segments: def.segments,
      curl: def.curl * u * d,
      droop: def.droop,
      depth: def.depth,
      phase: rng() * (2 * Math.PI) + branchIdx,
      thickness: plant === 'palm' ? 0.0036 : plant === 'fern' ? 0.0028 : 0.0042,
      leaves: [],
      bend: 0,
      velocity: 0,
      kick: 0,
      kickAt: 0,
    };

    for (let seg = 1; seg <= def.segments; seg++) {
      const segT = seg / def.segments;
      const sides = seg === def.segments ? [0] : [-1, 1];

      for (const side of sides) {
        if (side !== 0 && rng() > densityFilter) continue;

        if (plant === 'ficus') {
          if (side !== 0 && (seg + (side > 0 ? 1 : 0)) % 2 === 0 && rng() < 0.35) continue;
          branch.leaves.push({
            at: seg,
            side,
            length: (0.13 + 0.08 * rng()) * effectiveScale * leafScaleFactor * (side === 0 ? 1.12 : 1),
            width: 0.4 + 0.14 * rng(),
            tilt: side === 0 ? 0 : 0.62 + 0.45 * rng(),
            droop: 0.22,
            flutter: rng() * (2 * Math.PI),
            rate: 1.1 + 1.1 * rng(),
            kind: 0,
          });
        } else if (plant === 'olive') {
          branch.leaves.push({
            at: seg,
            side,
            length: (0.095 + 0.05 * rng()) * effectiveScale * leafScaleFactor,
            width: 0.15 + 0.06 * rng(),
            tilt: side === 0 ? 0 : 0.42 + 0.32 * rng(),
            droop: 0.12,
            flutter: rng() * (2 * Math.PI),
            rate: 1.6 + 1.4 * rng(),
            kind: 0,
          });
        } else if (plant === 'fern') {
          const curve = Math.pow(Math.sin(Math.PI * clamp(0.9 * segT + 0.08, 0, 1)), 0.85) * (1 - 0.35 * segT);
          branch.leaves.push({
            at: seg,
            side,
            length: (0.03 + 0.11 * curve) * effectiveScale * leafScaleFactor * (0.92 + 0.16 * rng()),
            width: 0.3 + 0.08 * rng(),
            tilt: side === 0 ? 0 : 1.05 + 0.12 * rng(),
            droop: 0.18,
            flutter: rng() * (2 * Math.PI),
            rate: 1.6 + 1.4 * rng(),
            kind: 0,
          });
        } else {
          // palm
          const curve = Math.pow(Math.sin(Math.PI * clamp(0.94 * segT + 0.04, 0, 1)), 0.7);
          branch.leaves.push({
            at: seg,
            side,
            length: (0.06 + 0.2 * curve) * effectiveScale * leafScaleFactor * (0.92 + 0.16 * rng()),
            width: 0.11 + 0.04 * rng(),
            tilt: side === 0 ? 0 : 0.92 + 0.18 * rng(),
            droop: 0.38,
            flutter: rng() * (2 * Math.PI),
            rate: 1.8 + 1.6 * rng(),
            kind: 0,
          });
        }
      }
    }

    return branch;
  });
}

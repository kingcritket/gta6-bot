// Port Vela — small math helpers shared by the sim and the renderer.
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist2(ax, az, bx, bz) {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
}

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDiff(b, a) * clamp(t, 0, 1);
}

// Heading convention: forward = (sin h, cos h) in (x, z). So h = 0 faces +z,
// h = PI / 2 faces +x.
export function headingToVector(h) {
  return { x: Math.sin(h), z: Math.cos(h) };
}

export function vectorToHeading(x, z) {
  return Math.atan2(x, z);
}

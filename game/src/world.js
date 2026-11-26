// world.js — Coral Bay: island terrain, sea, city, runway, clouds and sky.
// All geometry is generated here from a seeded height function, no assets.
import * as THREE from 'three';

export const WORLD_SIZE = 4200;          // metres, square island region
export const SEA_LEVEL = 0;
export const RUNWAY = {
  x: 620, z: 240, heading: Math.PI / 2, // runway runs east-west
  length: 620, width: 46, elevation: 6,
};

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Smooth value noise over a grid, deterministic per seed.
function makeNoise(seed) {
  const rand = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rand() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const fade = (t) => t * t * (3 - 2 * t);
  function grad(h, x, y) {
    switch (h & 3) {
      case 0: return x + y; case 1: return -x + y;
      case 2: return x - y; default: return -x - y;
    }
  }
  return function noise2(x, y) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const a = grad(perm[X + perm[Y]], xf, yf);
    const b = grad(perm[X + 1 + perm[Y]], xf - 1, yf);
    const c = grad(perm[X + perm[Y + 1]], xf, yf - 1);
    const d = grad(perm[X + 1 + perm[Y + 1]], xf - 1, yf - 1);
    const u = fade(xf), v = fade(yf);
    return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 0.7;
  };
}

const noise = makeNoise(20261126);

// Island height: a big dome with ridges, falling away to the sea at the edges.
// A flat shelf is carved for the runway + city on the east side.
export function terrainHeight(x, z) {
  const half = WORLD_SIZE / 2;
  const nx = x / half, nz = z / half;
  const r = Math.sqrt(nx * nx + nz * nz);
  const coast = Math.max(0, 1 - Math.pow(Math.max(0, r - 0.55) / 0.45, 2));
  let h = 0;
  h += noise(x * 0.0011, z * 0.0011) * 95;
  h += noise(x * 0.0035 + 40, z * 0.0035 - 17) * 34;
  h += noise(x * 0.012, z * 0.012) * 7;
  // Mountain massif in the north-west.
  const mx = (x + 1150) / 620, mz = (z + 950) / 620;
  const m = Math.max(0, 1 - (mx * mx + mz * mz));
  h += m * m * 260;
  // Second ridge south-west.
  const rx = (x + 900) / 520, rz = (z - 1050) / 520;
  const rr = Math.max(0, 1 - (rx * rx + rz * rz));
  h += rr * rr * 150;
  h = h * coast - 26 * (1 - coast);
  // Flatten the airfield shelf.
  const dx = (x - RUNWAY.x) / 560, dz = (z - RUNWAY.z) / 420;
  const d2 = dx * dx + dz * dz;
  if (d2 < 1) {
    const t = d2 * d2 * (3 - 2 * d2);
    h = h * t + RUNWAY.elevation * (1 - t);
  }
  return h;
}

function colorForHeight(h, x, z) {
  const c = new THREE.Color();
  if (h < 1.5) { c.setHex(0xd9c489); }                       // sand
  else if (h < 55) {
    const g = noise(x * 0.01 + 9, z * 0.01 - 4) * 0.5 + 0.5;
    c.setHex(0x4d8a3f).lerp(new THREE.Color(0x6fae4e), g);  // meadow
  } else if (h < 150) { c.setHex(0x5d6b52); }               // scrub rock
  else if (h < 240) { c.setHex(0x7d7468); }                 // grey rock
  else { c.setHex(0xe8eef2); }                              // snow
  return c;
}

export function buildTerrain(scene) {
  const seg = 150;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    const c = colorForHeight(h, x, z);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  scene.add(mesh);

  // Sea plane, slightly below the sand line.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE * 2.4, WORLD_SIZE * 2.4),
    new THREE.MeshStandardMaterial({ color: 0x1d6f9e, roughness: 0.25, metalness: 0.35, transparent: true, opacity: 0.94 })
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = SEA_LEVEL;
  sea.name = 'sea';
  scene.add(sea);
}

export function buildRunway(scene) {
  const g = new THREE.Group();
  g.name = 'runway';
  const { x, z, length, width, elevation } = RUNWAY;
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(length, 1.2, width),
    new THREE.MeshStandardMaterial({ color: 0x2b2f36, roughness: 0.9 })
  );
  strip.position.set(x, elevation + 0.4, z);
  g.add(strip);
  // Centre dashes.
  const dashMat = new THREE.MeshStandardMaterial({ color: 0xf5f0dc, roughness: 0.7 });
  for (let d = -length / 2 + 40; d < length / 2 - 20; d += 60) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(26, 0.3, 2.4), dashMat);
    dash.position.set(x + d, elevation + 1.1, z);
    g.add(dash);
  }
  // Threshold bars at both ends.
  for (const end of [-1, 1]) {
    for (let k = -3; k <= 3; k++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 3.2), dashMat);
      bar.position.set(x + end * (length / 2 - 22), elevation + 1.1, z + k * 5.4);
      g.add(bar);
    }
  }
  // Edge lights, alternating white / amber.
  const lightGeo = new THREE.SphereGeometry(1.1, 8, 6);
  for (let d = -length / 2 + 10; d <= length / 2 - 10; d += 55) {
    for (const side of [-1, 1]) {
      const lamp = new THREE.Mesh(lightGeo, new THREE.MeshBasicMaterial({
        color: side < 0 ? 0xfff2c0 : 0xffb347,
      }));
      lamp.position.set(x + d, elevation + 1.6, z + side * (width / 2 + 2));
      g.add(lamp);
    }
  }
  // "09" numbers as simple block glyphs are skipped; windsock pole + sock.
  const pole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, 26, 8),
    new THREE.MeshStandardMaterial({ color: 0xd8d8d8 })
  );
  pole.position.set(x - length / 2 - 30, elevation + 13, z - width / 2 - 18);
  g.add(pole);
  const sock = new THREE.Mesh(
    new THREE.ConeGeometry(3.2, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.6 })
  );
  sock.rotation.z = Math.PI / 2;
  sock.position.set(x - length / 2 - 22, elevation + 24, z - width / 2 - 18);
  g.add(sock);
  scene.add(g);
}

export function buildCity(scene) {
  const rand = mulberry32(77);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.05 });
  const positions = [];
  // City grid north of the runway, clear of the strip itself.
  for (let gx = -7; gx <= 7; gx++) {
    for (let gz = -4; gz <= 3; gz++) {
      if (rand() < 0.18) continue;
      const bx = RUNWAY.x - 260 + gx * 52;
      const bz = RUNWAY.z - 320 + gz * 52;
      if (Math.abs(bz - RUNWAY.z) < 60 && Math.abs(bx - RUNWAY.x) < 420) continue;
      const h = 14 + rand() * rand() * 95;
      positions.push({ x: bx, z: bz, w: 26 + rand() * 16, d: 26 + rand() * 16, h });
    }
  }
  const inst = new THREE.InstancedMesh(geo, mat, positions.length);
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  const palette = [0x9aa7b5, 0xb8a88f, 0x7f93a8, 0xc2b49a, 0x8fa3b0, 0xd8cfc0];
  positions.forEach((b, i) => {
    m.makeScale(b.w, b.h, b.d);
    m.setPosition(b.x, RUNWAY.elevation + b.h / 2, b.z);
    inst.setMatrixAt(i, m);
    col.setHex(palette[(rand() * palette.length) | 0]);
    inst.setColorAt(i, col);
  });
  inst.instanceMatrix.needsUpdate = true;
  inst.name = 'city';
  scene.add(inst);
  // A harbour lighthouse on the south beach.
  const lh = new THREE.Group();
  const tower = new THREE.Mesh(
    new THREE.CylinderGeometry(4, 6, 42, 12),
    new THREE.MeshStandardMaterial({ color: 0xf2ede2, roughness: 0.7 })
  );
  tower.position.y = 21;
  lh.add(tower);
  const band = new THREE.Mesh(
    new THREE.CylinderGeometry(4.4, 4.4, 7, 12),
    new THREE.MeshStandardMaterial({ color: 0xc23b2e, roughness: 0.7 })
  );
  band.position.y = 26;
  lh.add(band);
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(3, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0 })
  );
  lamp.position.y = 44;
  lh.add(lamp);
  lh.position.set(-260, 2, 1560);
  lh.name = 'lighthouse';
  scene.add(lh);
}

function cloudTexture() {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const ctx = cv.getContext('2d');
  const rand = mulberry32(4242);
  for (let i = 0; i < 26; i++) {
    const cx = 30 + rand() * 196, cy = 44 + rand() * 40, r = 18 + rand() * 30;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function buildClouds(scene) {
  const rand = mulberry32(9001);
  const tex = cloudTexture();
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.9, depthWrite: false });
  const group = new THREE.Group();
  group.name = 'clouds';
  for (let i = 0; i < 30; i++) {
    const s = new THREE.Sprite(mat);
    const scale = 220 + rand() * 320;
    s.scale.set(scale, scale * 0.42, 1);
    s.position.set((rand() - 0.5) * 5200, 260 + rand() * 260, (rand() - 0.5) * 5200);
    s.userData.drift = 2 + rand() * 4;
    group.add(s);
  }
  scene.add(group);
  return group;
}

export function buildSky(scene) {
  // Smooth gradient sky dome via a shader (vertex-colour bands showed a
  // visible arc at the colour-break latitude, so the gradient is analytic).
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x2f7fc4) },
      mid: { value: new THREE.Color(0x8ec9ee) },
      low: { value: new THREE.Color(0xf6e3c0) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_Position.z = gl_Position.w; // pin to the far plane
      }`,
    fragmentShader: `
      varying vec3 vDir;
      uniform vec3 top; uniform vec3 mid; uniform vec3 low;
      void main() {
        float h = normalize(vDir).y;
        vec3 c = h > 0.0
          ? mix(mid, top, pow(h, 0.55))
          : mix(mid, low, pow(-h, 0.5));
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 32, 20), skyMat);
  sky.name = 'sky';
  scene.add(sky);

  const sun = new THREE.Mesh(
    new THREE.CircleGeometry(260, 32),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false })
  );
  sun.position.set(-5200, 2600, -5200);
  sun.lookAt(0, 0, 0);
  scene.add(sun);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(560, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.35, fog: false })
  );
  glow.position.copy(sun.position).multiplyScalar(0.999);
  glow.lookAt(0, 0, 0);
  scene.add(glow);

  scene.fog = new THREE.Fog(0xcfe4f2, 900, 6500);
  const hemi = new THREE.HemisphereLight(0xbfd9ff, 0x4a6b46, 0.85);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xfff2d8, 2.1);
  dir.position.set(-1800, 2600, -1400);
  scene.add(dir);
}

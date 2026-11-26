// missions.js — rings, mission definitions, scoring and sortie flow.
import * as THREE from 'three';
import { RUNWAY, terrainHeight } from './world.js';

export const MISSIONS = {
  rings: {
    name: 'Ring Run',
    blurb: 'Thread 8 rings over Coral Bay before the clock runs out.',
    ringCount: 8, timeLimit: 240, fuelDrain: 1.0, startFuel: 100,
  },
  tour: {
    name: 'Island Tour',
    blurb: 'Twelve rings around the whole island. Watch your fuel gauge.',
    ringCount: 12, timeLimit: 420, fuelDrain: 1.0, startFuel: 100,
  },
  landing: {
    name: 'Landing Challenge',
    blurb: 'Three rings, then bring her home: grease it on runway 09.',
    ringCount: 3, timeLimit: 300, fuelDrain: 0.8, startFuel: 100,
  },
};

// Ring courses are laid out by hand across recognisable landmarks so the
// route itself teaches the island: beach, city, lighthouse, mountains.
function ringCourse(count, kind) {
  const spots = [
    { x: 1050, z: 240, y: 150 },   // just past the runway, low over the city
    { x: 1500, z: -500, y: 220 },  // out over the east beach
    { x: 1200, z: -1250, y: 300 }, // north-east headland
    { x: 100, z: -1350, y: 380 },  // high over the north shore
    { x: -950, z: -950, y: 480 },  // threading the mountain massif
    { x: -1400, z: 150, y: 320 },  // west cliffs
    { x: -1100, z: 1150, y: 240 }, // south-west ridge
    { x: -260, z: 1560, y: 170 },  // the lighthouse
    { x: 350, z: 1250, y: 200 },   // south beach
    { x: 900, z: 950, y: 170 },    // final approach over the bay
    { x: 1500, z: 700, y: 260 },   // wide turn east
    { x: 1750, z: -100, y: 200 },  // back down the coast
  ];
  const picked = kind === 'landing'
    ? [spots[0], spots[4], spots[9]]
    : spots.slice(0, count);
  return picked.map((s, i) => ({
    x: s.x, z: s.z, y: Math.max(s.y, terrainHeight(s.x, s.z) + 90),
    radius: i === 0 ? 26 : 22, index: i,
  }));
}

export class Mission {
  constructor(kind, scene) {
    this.kind = kind;
    this.def = MISSIONS[kind];
    this.rings = ringCourse(this.def.ringCount, kind);
    this.nextRing = 0;
    this.score = 0;
    this.timeLeft = this.def.timeLimit;
    this.elapsed = 0;
    this.ringsHit = 0;
    this.finished = false;
    this.outcome = null; // 'complete' | 'timeout' | 'crash' | 'fuel'
    this.group = new THREE.Group();
    this.group.name = 'rings';
    this.meshes = this.rings.map((r, i) => {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(r.radius, 1.6, 10, 40),
        new THREE.MeshStandardMaterial({
          color: 0x18c8f0, emissive: 0x0a7fa8, emissiveIntensity: 0.9,
          roughness: 0.3, metalness: 0.2, transparent: true, opacity: 0.92,
        })
      );
      mesh.position.set(r.x, r.y, r.z);
      // Face each ring along the route so the pilot flies through it.
      const nxt = this.rings[Math.min(i + 1, this.rings.length - 1)];
      mesh.lookAt(nxt.x, nxt.y, nxt.z);
      this.group.add(mesh);
      // A soft glow disc inside the ring.
      const glow = new THREE.Mesh(
        new THREE.CircleGeometry(r.radius - 2, 28),
        new THREE.MeshBasicMaterial({
          color: 0x66e0ff, transparent: true, opacity: 0.10,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      glow.position.copy(mesh.position);
      glow.quaternion.copy(mesh.quaternion);
      this.group.add(glow);
      return { mesh, glow };
    });
    this.markNext();
    scene.add(this.group);
  }
  markNext() {
    this.meshes.forEach((m, i) => {
      const active = i === this.nextRing;
      const done = i < this.nextRing;
      m.mesh.material.color.setHex(active ? 0xffc93c : done ? 0x2f9e44 : 0x18c8f0);
      m.mesh.material.emissive.setHex(active ? 0xa86a00 : done ? 0x0f5c1e : 0x0a7fa8);
      m.mesh.material.emissiveIntensity = active ? 1.6 : 0.7;
      m.glow.material.opacity = active ? 0.22 : 0.08;
    });
  }
  dispose(scene) {
    scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); }
    });
  }
  // Returns 'ring' when the plane passes through the next ring this frame.
  update(dt, planePos, prevPos) {
    if (this.finished) return null;
    this.timeLeft -= dt;
    this.elapsed += dt;
    if (this.timeLeft <= 0) {
      this.finished = true;
      this.outcome = 'timeout';
      return 'timeout';
    }
    // Pulse the active ring.
    const t = performance.now() / 1000;
    const active = this.meshes[this.nextRing];
    if (active) {
      const s = 1 + Math.sin(t * 4) * 0.04;
      active.mesh.scale.set(s, s, s);
    }
    // Ring pass test: did the segment prev->now cross the ring's plane
    // within its radius?
    const r = this.rings[this.nextRing];
    if (!r) return null;
    const c = new THREE.Vector3(r.x, r.y, r.z);
    const axis = new THREE.Vector3();
    const nxt = this.rings[Math.min(this.nextRing + 1, this.rings.length - 1)];
    axis.set(nxt.x - r.x, nxt.y - r.y, nxt.z - r.z).normalize();
    const dPrev = new THREE.Vector3().subVectors(prevPos, c).dot(axis);
    const dNow = new THREE.Vector3().subVectors(planePos, c).dot(axis);
    if (dPrev > 0 !== dNow > 0) {
      const f = dPrev / (dPrev - dNow);
      const hit = new THREE.Vector3().lerpVectors(prevPos, planePos, f);
      if (hit.distanceTo(c) < r.radius) {
        this.ringsHit++;
        const timeBonus = Math.max(0, Math.round(this.timeLeft / 6));
        this.score += 100 + timeBonus;
        this.nextRing++;
        if (this.nextRing >= this.rings.length) {
          if (this.kind === 'landing') {
            // Landing mission: rings done, now the runway decides.
            this.markNext();
            return 'rings-done';
          }
          this.finished = true;
          this.outcome = 'complete';
          return 'complete';
        }
        this.markNext();
        return 'ring';
      }
    }
    return null;
  }
  landingScore(flight) {
    // Quality of the touchdown: slow, level, centred, gear down.
    let s = 200;
    s += Math.max(0, 120 - Math.round(flight.speed * 2.2));
    s += Math.max(0, 80 - Math.round(Math.abs(flight.roll) * 120));
    const dz = Math.abs(flight.position.z - RUNWAY.z);
    s += Math.max(0, 100 - Math.round(dz * 2.5));
    if (flight.gearDown) s += 50;
    return Math.min(500, Math.max(120, s));
  }
  finishLanding(flight) {
    this.score += this.landingScore(flight);
    this.finished = true;
    this.outcome = 'complete';
  }
}

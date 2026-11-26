// plane.js — the Kestrel: a built-from-primitives prop plane + arcade flight model.
import * as THREE from 'three';
import { terrainHeight, RUNWAY, SEA_LEVEL } from './world.js';

export const MAX_SPEED = 92;    // m/s at full throttle (~179 kt)
export const MIN_FLY_SPEED = 24;
export const MAX_FUEL = 100;

export function buildPlaneMesh() {
  const g = new THREE.Group();
  g.name = 'kestrel';
  const paint = new THREE.MeshStandardMaterial({ color: 0xd8482f, roughness: 0.45, metalness: 0.25 });
  const cream = new THREE.MeshStandardMaterial({ color: 0xf3e9d2, roughness: 0.5, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c3138, roughness: 0.6, metalness: 0.3 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fd4ff, roughness: 0.1, metalness: 0.6 });

  // Fuselage: tapered body from a cylinder + nose cone.
  const body = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 0.55, 6.4, 12), paint);
  body.rotation.x = Math.PI / 2;
  body.position.z = 0.4;
  g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.05, 2.2, 12), cream);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = 4.7;
  g.add(nose);
  const tailCone = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.4, 10), paint);
  tailCone.rotation.x = Math.PI / 2;
  tailCone.position.z = -4.0;
  g.add(tailCone);
  // Canopy.
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.85, 14, 10), glass);
  canopy.scale.set(0.9, 0.75, 1.7);
  canopy.position.set(0, 0.95, 1.4);
  g.add(canopy);
  // Main wings with cream tips.
  const wingGeo = new THREE.BoxGeometry(11.5, 0.22, 2.1);
  const wing = new THREE.Mesh(wingGeo, paint);
  wing.position.set(0, -0.1, 0.9);
  g.add(wing);
  for (const s of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.24, 2.1), cream);
    tip.position.set(s * 5.4, -0.1, 0.9);
    g.add(tip);
    // Wingtip nav lights: red left, green right.
    const nav = new THREE.Mesh(
      new THREE.SphereGeometry(0.16, 8, 6),
      new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff2a2a : 0x2aff66 })
    );
    nav.position.set(s * 6.1, -0.05, 0.9);
    g.add(nav);
  }
  // Tailplane + fin.
  const tail = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 1.3), paint);
  tail.position.set(0, 0.25, -4.6);
  g.add(tail);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.0, 1.7), cream);
  fin.position.set(0, 1.0, -4.7);
  g.add(fin);
  // Propeller: hub + two blades, spins with throttle.
  const prop = new THREE.Group();
  prop.name = 'propeller';
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 10), dark);
  hub.rotation.x = -Math.PI / 2;
  hub.position.z = 0.4;
  prop.add(hub);
  const bladeGeo = new THREE.BoxGeometry(0.34, 3.4, 0.12);
  for (const a of [0, Math.PI / 2]) {
    const blade = new THREE.Mesh(bladeGeo, dark);
    blade.rotation.z = a;
    blade.position.z = 0.55;
    prop.add(blade);
  }
  prop.position.z = 5.6;
  g.add(prop);
  // Landing gear: two mains + nose wheel, lowered/raised with G.
  const gear = new THREE.Group();
  gear.name = 'gear';
  for (const s of [-1, 1]) {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.1, 6), dark);
    strut.position.set(s * 1.1, -1.0, 1.2);
    gear.add(strut);
    const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10), dark);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(s * 1.1, -1.55, 1.2);
    gear.add(wheel);
  }
  const noseStrut = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.0, 6), dark);
  noseStrut.position.set(0, -0.95, 3.6);
  gear.add(noseStrut);
  const noseWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 10), dark);
  noseWheel.rotation.z = Math.PI / 2;
  noseWheel.position.set(0, -1.45, 3.6);
  gear.add(noseWheel);
  g.add(gear);
  // Landing light under the left wing.
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xfff6c8 })
  );
  lamp.position.set(-2.4, -0.25, 1.6);
  g.add(lamp);
  g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  return { group: g, propeller: prop, gear };
}

export class FlightState {
  constructor() {
    this.resetOnRunway();
  }
  resetOnRunway() {
    this.position = new THREE.Vector3(RUNWAY.x - RUNWAY.length / 2 + 40, RUNWAY.elevation + 2.2, RUNWAY.z);
    this.heading = Math.PI / 2; // facing +x (runway 09, east)
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.gearDown = true;
    this.fuel = MAX_FUEL;
    this.damage = 0;
    this.onGround = true;
    this.verticalSpeed = 0;
    this.crashed = false;
    this.landed = false;
  }
  // Arcade flight model: pitch/roll inputs, throttle -> speed, bank -> turn.
  // Returns an event string: 'stall' | 'ground' | 'crash' | null.
  update(dt, input) {
    if (this.crashed) return 'crash';
    // Throttle.
    this.throttle = THREE.MathUtils.clamp(this.throttle + input.throttle * dt * 0.7, 0, 1);
    const targetSpeed = this.throttle * MAX_SPEED;
    const accel = this.onGround ? 14 : 9;
    this.speed += THREE.MathUtils.clamp(targetSpeed - this.speed, -accel * dt, accel * dt);
    // Fuel burn scales with throttle; empty tank means no thrust.
    if (this.throttle > 0.05 && this.speed > 1) {
      this.fuel = Math.max(0, this.fuel - dt * (0.35 + this.throttle * 0.85));
    }
    const thrust = this.fuel <= 0 ? 0 : 1;
    // Pitch / roll are target-based: holding a key holds an attitude, not a
    // runaway rate, so a glidepath is flyable and a flare answers at once.
    const authority = THREE.MathUtils.clamp(this.speed / 45, 0.15, 1);
    const targetPitch = input.pitch * 0.5;
    const targetRoll = input.roll * 0.9;
    const pitchStep = 1.6 * authority * dt;
    const rollStep = 2.4 * authority * dt;
    this.pitch += THREE.MathUtils.clamp(targetPitch - this.pitch, -pitchStep, pitchStep);
    this.roll += THREE.MathUtils.clamp(targetRoll - this.roll, -rollStep, rollStep);
    // Coordinated turn: banking right turns right (compass heading = heading rad).
    this.heading += Math.sin(this.roll) * (this.speed / 55) * dt * 0.9;
    // Lift vs gravity.
    const liftFactor = THREE.MathUtils.clamp(this.speed / MIN_FLY_SPEED, 0, 1.25);
    const climb = Math.sin(this.pitch) * this.speed * liftFactor * thrust;
    const sink = (1 - liftFactor) * 9.5 + (this.fuel <= 0 ? 4 : 0);
    this.verticalSpeed = climb - sink * (this.onGround ? 0 : 1);
    if (this.onGround) {
      // Takeoff roll: lift off once fast enough and pitched up.
      if (this.speed > MIN_FLY_SPEED + 4 && this.pitch > 0.06) {
        this.onGround = false;
      } else {
        this.verticalSpeed = 0;
        // Only pin the nose down while slow; at speed the pitch must be
        // allowed to build or the plane can never rotate for takeoff.
        if (this.speed < MIN_FLY_SPEED) this.pitch = 0;
      }
    }
    const dir = new THREE.Vector3(
      Math.sin(this.heading) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.heading) * Math.cos(this.pitch)
    );
    // NOTE: heading convention — forward is (sin h, 0, -cos h), so h = 0 is
    // north (-z) and h = PI/2 is east (+x); runway 09 faces +x at h = PI/2.
    this.position.addScaledVector(dir, this.speed * dt);
    this.position.y += this.verticalSpeed * dt * (this.onGround ? 0 : 1);
    // Terrain / sea contact.
    const ground = Math.max(terrainHeight(this.position.x, this.position.z), SEA_LEVEL);
    const clearance = this.position.y - ground;
    if (clearance <= 1.6 && !this.onGround) {
      const hard = this.verticalSpeed < -11 || Math.abs(this.roll) > 0.9 || this.speed > 78;
      const onStrip = this.overRunway();
      if (onStrip && this.gearDown && this.verticalSpeed > -8 && Math.abs(this.roll) < 0.35) {
        this.onGround = true;
        this.landed = true;
        this.pitch = 0;
        this.roll = 0;
        this.position.y = RUNWAY.elevation + 2.2;
        this.speed = Math.max(this.speed * 0.94, 0);
        return 'ground';
      }
      if (hard || clearance <= 0.4) {
        this.crashed = true;
        this.damage = 100;
        return 'crash';
      }
      // Soft brush with rough ground: damage, bounce back up a little.
      this.damage = Math.min(100, this.damage + 22);
      this.position.y = ground + 1.7;
      this.verticalSpeed = 2;
      if (this.damage >= 100) { this.crashed = true; return 'crash'; }
      return 'ground';
    }
    if (this.onGround) {
      // Rolling on the runway: bleed speed without thrust, steer with rudder.
      if (this.throttle < 0.15) this.speed = Math.max(0, this.speed - 9 * dt);
      this.position.y = RUNWAY.elevation + 2.2;
    }
    // World bounds: turn back with a gentle nudge.
    const half = 2050;
    if (Math.abs(this.position.x) > half || Math.abs(this.position.z) > half) {
      this.heading += Math.PI * dt * 0.25;
    }
    return this.speed < MIN_FLY_SPEED && !this.onGround && this.position.y - ground < 60 ? 'stall' : null;
  }
  overRunway() {
    const dx = this.position.x - RUNWAY.x;
    const dz = this.position.z - RUNWAY.z;
    return Math.abs(dx) < RUNWAY.length / 2 && Math.abs(dz) < RUNWAY.width / 2 + 6;
  }
  // Readouts for the HUD.
  get knots() { return Math.round(this.speed * 1.944); }
  get altitudeFt() { return Math.max(0, Math.round((this.position.y - RUNWAY.elevation) * 3.281)); }
  get headingDeg() {
    let d = ((this.heading * 180) / Math.PI) % 360;
    if (d < 0) d += 360;
    return Math.round(d);
  }
}

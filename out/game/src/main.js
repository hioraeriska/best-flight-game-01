// main.js — Skyline Run: bootstrap, game loop, input, cameras, menus,
// screenshot presets (?shot=1..4) and the mission state machine.
import * as THREE from 'three';
import { buildTerrain, buildRunway, buildCity, buildClouds, buildSky, RUNWAY, terrainHeight } from './world.js';
import { buildPlaneMesh, FlightState, MAX_FUEL } from './plane.js';
import { Mission, MISSIONS } from './missions.js';
import { Hud } from './hud.js';
import { AudioEngine } from './audio.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot') ? parseInt(params.get('shot'), 10) : 0;

const sceneCanvas = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ canvas: sceneCanvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 12000);

buildSky(scene);
buildTerrain(scene);
buildRunway(scene);
buildCity(scene);
const clouds = buildClouds(scene);

const { group: planeMesh, propeller, gear } = buildPlaneMesh();
planeMesh.rotation.order = 'YXZ';
scene.add(planeMesh);

const hud = new Hud(document.getElementById('hud'));
const audio = new AudioEngine();

const flight = new FlightState();
let mission = null;
let mode = 'menu'; // menu | flying | paused | over
let cameraMode = 'chase'; // chase | cockpit
let lookYaw = 0, lookPitch = 0; // mouse-look offsets, decay to 0
let stallFlag = false;
let lastTime = performance.now();
let shotTaken = false;
let snapCamera = false; // set after a teleport so the camera jumps, not lerps

const menuEl = document.getElementById('menu');
const overEl = document.getElementById('over');
const bannerEl = document.getElementById('banner');
const toastEl = document.getElementById('toast');
let bannerTimer = 0, toastTimer = 0;

function showBanner(text, ms) {
  bannerEl.textContent = text;
  bannerEl.classList.remove('hidden');
  bannerTimer = ms || 1800;
}
function showToast(text, ms) {
  toastEl.textContent = text;
  toastEl.classList.remove('hidden');
  toastTimer = ms || 2600;
}

const keys = {};
window.addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  if (e.repeat) return;
  keys[e.key] = true;
  audio.ensure();
  if (e.key === 'p' || e.key === 'P') togglePause();
  if (e.key === 'c' || e.key === 'C') {
    cameraMode = cameraMode === 'chase' ? 'cockpit' : 'chase';
    showToast(cameraMode === 'chase' ? 'Chase camera' : 'Cockpit camera', 1200);
  }
  if (e.key === 'g' || e.key === 'G') {
    flight.gearDown = !flight.gearDown;
    showToast(flight.gearDown ? 'Gear down' : 'Gear up', 1200);
    audio.click();
  }
  if (e.key === 'm' || e.key === 'M') {
    showToast(audio.toggleMute() ? 'Sound off' : 'Sound on', 1200);
  }
  if (e.key === 'r' || e.key === 'R') resetFlight();
  if (e.key === 'Enter' && mode === 'menu') startMission('rings');
});
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

// Mouse drag looks around; the view eases back to centre.
let dragging = false, lastX = 0, lastY = 0;
sceneCanvas.addEventListener('mousedown', (e) => { dragging = true; lastX = e.clientX; lastY = e.clientY; });
window.addEventListener('mouseup', () => { dragging = false; });
window.addEventListener('mousemove', (e) => {
  if (!dragging) return;
  lookYaw -= (e.clientX - lastX) * 0.004;
  lookPitch = THREE.MathUtils.clamp(lookPitch + (e.clientY - lastY) * 0.003, -0.5, 0.5);
  lastX = e.clientX; lastY = e.clientY;
});
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  hud.resize();
});

document.querySelectorAll('.mission').forEach((btn) => {
  btn.addEventListener('click', () => startMission(btn.dataset.mission));
});
document.getElementById('againBtn').addEventListener('click', () => {
  if (mission) startMission(mission.kind);
});
document.getElementById('menuBtn').addEventListener('click', () => {
  mode = 'menu';
  overEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
  resetFlight();
});

function resetFlight() {
  flight.resetOnRunway();
  if (mission) { mission.dispose(scene); mission = null; }
  mode = 'menu';
  menuEl.classList.remove('hidden');
  overEl.classList.add('hidden');
  lookYaw = 0; lookPitch = 0;
}

function startMission(kind) {
  audio.ensure();
  if (audio.ctx && audio.ctx.state === 'suspended') audio.ctx.resume();
  if (mission) mission.dispose(scene);
  flight.resetOnRunway();
  flight.fuel = MISSIONS[kind].startFuel;
  mission = new Mission(kind, scene);
  mode = 'flying';
  menuEl.classList.add('hidden');
  overEl.classList.add('hidden');
  cameraMode = 'chase';
  showBanner(MISSIONS[kind].name.toUpperCase(), 2000);
  showToast(MISSIONS[kind].blurb, 3600);
  audio.click();
}

function togglePause() {
  if (mode === 'flying') { mode = 'paused'; showBanner('PAUSED', 60000); }
  else if (mode === 'paused') { mode = 'flying'; bannerEl.classList.add('hidden'); }
}

function endMission(outcome, detail) {
  mode = 'over';
  const title = document.getElementById('overTitle');
  const text = document.getElementById('overText');
  const stats = document.getElementById('overStats');
  const timeUsed = mission ? Math.round(mission.elapsed) : 0;
  if (outcome === 'complete') {
    title.textContent = 'MISSION COMPLETE';
    text.textContent = detail || 'Superb flying, captain. Coral Bay salutes you.';
  } else if (outcome === 'crash') {
    title.textContent = 'YOU CRASHED';
    text.textContent = detail || 'The Kestrel is a write-off — but the pilot walked away. Fly again?';
    audio.crash();
  } else if (outcome === 'timeout') {
    title.textContent = 'OUT OF TIME';
    text.textContent = 'The clock beat you this time. The rings are still out there.';
  } else if (outcome === 'fuel') {
    title.textContent = 'OUT OF FUEL';
    text.textContent = 'The tanks ran dry. Next time, land on the runway to refuel.';
  }
  stats.innerHTML = 'Score <b>' + (mission ? mission.score : 0) + '</b> &nbsp;·&nbsp; Rings <b>'
    + (mission ? mission.ringsHit + '/' + mission.rings.length : '0')
    + '</b> &nbsp;·&nbsp; Time <b>' + timeUsed + 's</b> &nbsp;·&nbsp; Damage <b>'
    + Math.round(flight.damage) + '%</b>';
  overEl.classList.remove('hidden');
}

function placePlaneForShot(n) {
  // Cinematic poses used by ?shot=N: real game state, no staging tricks.
  // Ring 1 sits at (1050, 150, 240); poses aim the plane at it or at landmarks.
  const spots = [
    { p: [800, 175, 60], h: 2.23, pitch: -0.05, roll: -0.22, thr: 0.8, cam: 'chase' },
    { p: [820, 210, -30], h: 2.35, pitch: -0.02, roll: 0.1, thr: 0.75, cam: 'cockpit' },
    { p: [500, 90, 60], h: Math.PI / 2, pitch: -0.03, roll: 0, thr: 0.65, cam: 'chase' },
    { p: [-260, 190, 1150], h: 2.4, pitch: -0.05, roll: -0.2, thr: 0.7, cam: 'chase' },
  ];
  const s = spots[(n - 1) % spots.length];
  flight.position.set(s.p[0], s.p[1], s.p[2]);
  flight.heading = s.h;
  flight.pitch = s.pitch;
  flight.roll = s.roll;
  flight.throttle = s.thr;
  flight.speed = 62;
  flight.onGround = false;
  flight.fuel = 78;
  cameraMode = s.cam;
  snapCamera = true;
}

function updateCamera(dt) {
  const fwd = new THREE.Vector3(Math.sin(flight.heading), 0, -Math.cos(flight.heading));
  const snap = snapCamera;
  if (snap) snapCamera = false;
  if (cameraMode === 'cockpit') {
    // Nose-mounted cockpit camera: just past the cowling, high enough that
    // the nose stays out of frame and only the prop crosses the view.
    const eye = flight.position.clone()
      .addScaledVector(fwd, 4.6)
      .add(new THREE.Vector3(0, 2.3, 0));
    const look = flight.position.clone()
      .addScaledVector(fwd, 80)
      .add(new THREE.Vector3(0, 80 * Math.sin(flight.pitch) - 5, 0));
    if (snap) camera.position.copy(eye);
    else camera.position.lerp(eye, Math.min(1, dt * 14));
    const m = new THREE.Matrix4().lookAt(camera.position, look, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    if (snap) camera.quaternion.copy(q);
    else camera.quaternion.slerp(q, Math.min(1, dt * 14));
    camera.position.y = Math.max(camera.position.y, terrainHeight(camera.position.x, camera.position.z) + 1.5);
  } else {
    const back = 15.5, up = 5.2;
    const target = flight.position.clone()
      .addScaledVector(fwd, -back)
      .add(new THREE.Vector3(0, up + flight.pitch * 4, 0));
    const ground = terrainHeight(target.x, target.z) + 2.2;
    if (target.y < ground) target.y = ground;
    if (snap) camera.position.copy(target);
    else camera.position.lerp(target, Math.min(1, dt * 5.5));
    const look = flight.position.clone()
      .addScaledVector(fwd, 26)
      .add(new THREE.Vector3(0, 1.2 + flight.pitch * 10, 0));
    const m = new THREE.Matrix4().lookAt(camera.position, look, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    if (snap) camera.quaternion.copy(q);
    else camera.quaternion.slerp(q, Math.min(1, dt * 6));
    // Mouse-look: rotate the camera around the plane.
    if (Math.abs(lookYaw) > 0.001 || Math.abs(lookPitch) > 0.001) {
      camera.rotateY(lookYaw);
      camera.rotateX(lookPitch * 0.5);
      lookYaw *= Math.pow(0.05, dt);
      lookPitch *= Math.pow(0.05, dt);
    }
  }
}

function tick(now) {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;
  if (bannerTimer > 0) {
    bannerTimer -= dt * 1000;
    if (bannerTimer <= 0) bannerEl.classList.add('hidden');
  }
  if (toastTimer > 0) {
    toastTimer -= dt * 1000;
    if (toastTimer <= 0) toastEl.classList.add('hidden');
  }
  // Clouds drift slowly.
  clouds.children.forEach((c) => {
    c.position.x += c.userData.drift * dt;
    if (c.position.x > 2800) c.position.x = -2800;
  });
  // Propeller spin + gear animation.
  propeller.rotation.z += dt * (4 + flight.throttle * 55);
  gear.position.y += ((flight.gearDown ? 0 : 1.35) - gear.position.y) * Math.min(1, dt * 4);

  if (mode === 'flying' && mission) {
    const prevPos = flight.position.clone();
    const input = {
      pitch: (keys['ArrowUp'] ? 1 : 0) - (keys['ArrowDown'] ? 1 : 0),
      roll: (keys['ArrowRight'] ? 1 : 0) - (keys['ArrowLeft'] ? 1 : 0),
      throttle: ((keys['w'] || keys['W'] || keys['Shift']) ? 1 : 0)
        - ((keys['s'] || keys['S'] || keys['Control']) ? 1 : 0),
    };
    const event = flight.update(dt, input);
    stallFlag = event === 'stall';
    if (event === 'crash') {
      mission.outcome = 'crash';
      endMission('crash');
    } else if (event === 'ground' && flight.landed && mission.kind === 'landing' && mission.nextRing >= mission.rings.length) {
      mission.finishLanding(flight);
      audio.touchdown();
      endMission('complete', 'Wheels down on runway 09 — a textbook landing.');
    } else if (event === 'ground' && flight.onGround) {
      if (flight.speed > 12) audio.touchdown();
    }
    if (mode === 'flying') {
      const mev = mission.update(dt, flight.position, prevPos);
      if (mev === 'ring') {
        showBanner('RING ' + mission.ringsHit + '  +100', 1400);
        audio.ring();
      } else if (mev === 'rings-done') {
        showBanner('ALL RINGS CLEAR — LAND NOW', 2600);
        showToast('Bring her down on runway 09, gear down, nice and slow.', 4000);
        audio.ring();
      } else if (mev === 'complete') {
        audio.ring();
        endMission('complete');
      } else if (mev === 'timeout') {
        endMission('timeout');
      }
      if (flight.fuel <= 0 && !flight.onGround && flight.speed < 8 && flight.position.y - terrainHeight(flight.position.x, flight.position.z) < 3) {
        endMission('fuel');
      }
      // Refuel on the runway.
      if (flight.onGround && flight.overRunway() && flight.speed < 12) {
        flight.fuel = Math.min(MAX_FUEL, flight.fuel + dt * 14);
      }
    }
    audio.setFlight(flight.throttle, flight.speed, !flight.onGround);
  }

  // Pose the plane mesh from the flight state.
  planeMesh.position.copy(flight.position);
  planeMesh.rotation.y = Math.PI - flight.heading;
  planeMesh.rotation.x = -flight.pitch;
  planeMesh.rotation.z = -flight.roll;
  updateCamera(dt);

  // HUD state (hidden behind the menu).
  if (mode === 'menu') {
    hud.ctx.clearRect(0, 0, hud.w, hud.h);
  } else {
    let nextRingAngle = null, nextRingDist = 0;
    if (mission && mode !== 'menu' && mission.nextRing < mission.rings.length) {
      const r = mission.rings[mission.nextRing];
      const dx = r.x - flight.position.x;
      const dz = r.z - flight.position.z;
      const dy = r.y - flight.position.y;
      const worldAngle = Math.atan2(dx, -dz); // compass bearing to ring
      let rel = worldAngle - flight.heading;
      nextRingAngle = Math.atan2(Math.sin(rel), Math.cos(rel));
      nextRingDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    hud.draw({
      flight,
      score: mission ? mission.score : 0,
      missionName: mission ? MISSIONS[mission.kind].name : 'SKYLINE RUN',
      ringsLeft: mission ? mission.rings.length - mission.nextRing : 0,
      landingPhase: mission ? mission.kind === 'landing' && mission.nextRing >= mission.rings.length : false,
      timeLeft: mission ? mission.timeLeft : 0,
      stall: stallFlag,
      nextRingAngle,
      nextRingDist,
    });
  }

  renderer.render(scene, camera);

  // Screenshot presets: start the mission and pose the plane on first frames.
  if (SHOT && !shotTaken) {
    shotTaken = true;
    const kind = SHOT === 3 ? 'landing' : SHOT === 4 ? 'tour' : 'rings';
    startMission(kind);
    placePlaneForShot(SHOT);
    if (SHOT === 3) {
      // Low over the runway on final: show the strip ahead.
      flight.position.set(260, 55, 240);
      flight.heading = Math.PI / 2;
      flight.pitch = -0.04;
      flight.roll = 0;
      flight.speed = 55;
      flight.throttle = 0.6;
      flight.onGround = false;
      cameraMode = 'chase';
    }
    document.title = 'Skyline Run — shot ' + SHOT;
  }
}

// Debug hook for automated playtests (read-only state snapshot).
window.__skylineDebug = () => {
  const fwd = new THREE.Vector3();
  camera.getWorldDirection(fwd);
  return {
    mode, cameraMode, speed: flight.speed, alt: flight.position.y,
    fuel: flight.fuel, score: mission ? mission.score : 0,
    ringsHit: mission ? mission.ringsHit : 0, crashed: flight.crashed,
    onGround: flight.onGround, heading: flight.headingDeg, throttle: flight.throttle,
    camPos: camera.position.toArray().map((v) => Math.round(v)),
    camFwd: fwd.toArray().map((v) => +v.toFixed(2)),
    planePos: flight.position.toArray().map((v) => Math.round(v)),
  };
};

// Menu backdrop: park the plane on the runway, chase camera, slow orbit.
flight.position.set(RUNWAY.x - 200, RUNWAY.elevation + 2.2, RUNWAY.z);
flight.heading = Math.PI / 2;
requestAnimationFrame(tick);

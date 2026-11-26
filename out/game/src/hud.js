// hud.js — the glass cockpit: a 2D overlay with a lit artificial horizon,
// compass tape, speed/altitude tapes, throttle, fuel and warning lamps.
export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
  }
  draw(state) {
    const { ctx, w, h } = this;
    const f = state.flight;
    ctx.clearRect(0, 0, w, h);
    if (!f) return;
    ctx.save();
    ctx.font = '600 13px "Segoe UI", Verdana, sans-serif';
    // --- Artificial horizon, centre-left ---
    const hx = w / 2, hy = h - 132, hr = 62;
    ctx.save();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(hx, hy);
    ctx.rotate(-f.roll);
    const pitchPx = THREE_PITCH_PX * f.pitch;
    ctx.translate(0, pitchPx);
    ctx.fillStyle = '#2f7fc4';
    ctx.fillRect(-hr - 4, -hr * 2 - 4, hr * 2 + 8, hr * 2 + 4);
    ctx.fillStyle = '#7a5a34';
    ctx.fillRect(-hr - 4, 0, hr * 2 + 8, hr * 2 + 4);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1;
    for (const deg of [-30, -20, -10, 10, 20, 30]) {
      const y = -deg * 2.2;
      const len = deg % 20 === 0 ? 26 : 15;
      ctx.beginPath();
      ctx.moveTo(-len, y); ctx.lineTo(len, y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.beginPath();
    ctx.arc(hx, hy, hr, 0, Math.PI * 2);
    ctx.strokeStyle = '#bfe9ff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Fixed wings marker.
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(hx - hr + 6, hy); ctx.lineTo(hx - 14, hy);
    ctx.moveTo(hx + 14, hy); ctx.lineTo(hx + hr - 6, hy);
    ctx.stroke();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath(); ctx.arc(hx, hy, 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9fd4ef';
    ctx.font = '600 11px "Segoe UI", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ATT', hx, hy - hr - 6);
    // --- Compass tape, top centre ---
    const cx = w / 2, cy = 26;
    ctx.fillStyle = 'rgba(8,24,42,0.6)';
    roundRect(ctx, cx - 196, cy - 16, 392, 48, 8);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - 190, cy - 14, 380, 30);
    ctx.clip();
    const deg = f.headingDeg;
    for (let d = deg - 60; d <= deg + 60; d += 5) {
      const dd = ((d % 360) + 360) % 360;
      const x = cx + (d - deg) * 3.1;
      const major = dd % 30 === 0;
      ctx.strokeStyle = major ? '#eaf4ff' : 'rgba(234,244,255,0.45)';
      ctx.lineWidth = major ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(x, cy + 12); ctx.lineTo(x, cy + (major ? 2 : 7));
      ctx.stroke();
      if (major) {
        const label = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd] || String(dd / 10).padStart(2, '0');
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 13px "Segoe UI", Verdana, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(label, x, cy - 1);
      }
    }
    ctx.restore();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '700 15px "Segoe UI", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(deg).padStart(3, '0') + '°', cx, cy + 30);
    // --- Speed tape (left) and altitude tape (right) ---
    this.tape(28, h / 2 - 90, f.knots, 'KT', 20, 'SPD', 1.1);
    this.tape(w - 118, h / 2 - 90, f.altitudeFt, 'FT', 100, 'ALT', 0.55);
    // --- Throttle + fuel, bottom left ---
    const bx = 28, by = h - 96;
    ctx.fillStyle = 'rgba(8,24,42,0.72)';
    roundRect(ctx, bx - 8, by - 26, 190, 84, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,210,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#9fd4ef';
    ctx.textAlign = 'left';
    ctx.font = '600 12px "Segoe UI", Verdana, sans-serif';
    ctx.fillText('THR', bx, by - 8);
    ctx.fillStyle = '#12324a';
    ctx.fillRect(bx + 44, by - 18, 120, 12);
    ctx.fillStyle = '#3fa9e0';
    ctx.fillRect(bx + 44, by - 18, 120 * f.throttle, 12);
    ctx.fillStyle = '#eaf4ff';
    ctx.fillText(Math.round(f.throttle * 100) + '%', bx + 44, by + 14);
    ctx.fillStyle = '#9fd4ef';
    ctx.fillText('FUEL', bx, by + 30);
    ctx.fillStyle = '#12324a';
    ctx.fillRect(bx + 44, by + 20, 120, 12);
    const fuelCol = f.fuel < 25 ? '#ff5a4a' : f.fuel < 50 ? '#ffb347' : '#57d977';
    ctx.fillStyle = fuelCol;
    ctx.fillRect(bx + 44, by + 20, 120 * (f.fuel / 100), 12);
    ctx.fillStyle = '#eaf4ff';
    ctx.fillText(Math.round(f.fuel) + '%', bx + 44, by + 48);
    // --- Score / mission, top right ---
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(8,24,42,0.72)';
    roundRect(ctx, w - 218, 12, 206, 78, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,210,255,0.5)';
    ctx.stroke();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '700 20px "Segoe UI", Verdana, sans-serif';
    ctx.fillText('SCORE ' + state.score, w - 28, 38);
    ctx.fillStyle = '#9fd4ef';
    ctx.font = '600 13px "Segoe UI", Verdana, sans-serif';
    ctx.fillText(state.missionName, w - 28, 58);
    const rings = state.ringsLeft;
    ctx.fillText(rings > 0 ? 'RINGS LEFT ' + rings : state.landingPhase ? 'LAND ON RUNWAY 09' : 'ALL RINGS CLEAR', w - 28, 76);
    // --- Timer, top left ---
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(8,24,42,0.72)';
    roundRect(ctx, 12, 12, 120, 46, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,210,255,0.5)';
    ctx.stroke();
    const t = Math.max(0, Math.ceil(state.timeLeft));
    const mm = String(Math.floor(t / 60)).padStart(1, '0');
    const ss = String(t % 60).padStart(2, '0');
    ctx.fillStyle = t < 30 ? '#ff8a7a' : '#eaf4ff';
    ctx.font = '700 22px "Segoe UI", Verdana, sans-serif';
    ctx.fillText(mm + ':' + ss, 26, 42);
    // --- Warning lamps, bottom centre-right ---
    const lamps = [
      { label: 'STALL', on: state.stall, color: '#ff5a4a' },
      { label: 'GEAR', on: !f.gearDown, color: '#ffb347' },
      { label: 'LOW FUEL', on: f.fuel < 25, color: '#ff5a4a' },
      { label: 'DMG ' + Math.round(f.damage) + '%', on: f.damage > 0, color: '#ff8a7a' },
    ];
    let lx = w / 2 + 84;
    ctx.font = '700 12px "Segoe UI", Verdana, sans-serif';
    ctx.textAlign = 'center';
    for (const lamp of lamps) {
      ctx.fillStyle = lamp.on ? lamp.color : 'rgba(60,80,100,0.55)';
      ctx.shadowColor = lamp.on ? lamp.color : 'transparent';
      ctx.shadowBlur = lamp.on ? 12 : 0;
      roundRect(ctx, lx, h - 52, 74, 24, 6);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = lamp.on ? '#101820' : '#8fa8bc';
      ctx.fillText(lamp.label, lx + 37, h - 36);
      lx += 82;
    }
    // --- Centre reticle + next-ring pointer ---
    ctx.strokeStyle = 'rgba(234,244,255,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2 - 8, 12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(w / 2 - 20, h / 2 - 8); ctx.lineTo(w / 2 - 8, h / 2 - 8);
    ctx.moveTo(w / 2 + 8, h / 2 - 8); ctx.lineTo(w / 2 + 20, h / 2 - 8);
    ctx.moveTo(w / 2, h / 2 - 28); ctx.lineTo(w / 2, h / 2 - 16);
    ctx.stroke();
    if (state.nextRingAngle !== null && state.nextRingDist > 0) {
      const a = state.nextRingAngle;
      const px = w / 2 + Math.sin(a) * 150;
      const py = h / 2 - 8 - Math.cos(a) * 110;
      ctx.fillStyle = '#ffc93c';
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(a);
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(9, 8); ctx.lineTo(-9, 8);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffe9a8';
      ctx.font = '600 13px "Segoe UI", Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(state.nextRingDist) + ' m', px, py + 26);
    }
    ctx.restore();
  }
  tape(x, y, value, unit, step, label, pxPerUnit) {
    const { ctx } = this;
    const TAPE_H = 180, TAPE_W = 90;
    const span = 90 / pxPerUnit; // half-range in units shown above/below centre
    ctx.fillStyle = 'rgba(8,24,42,0.72)';
    roundRect(ctx, x, y, TAPE_W, TAPE_H, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,210,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, TAPE_W, TAPE_H);
    ctx.clip();
    ctx.font = '600 13px "Segoe UI", Verdana, sans-serif';
    ctx.textAlign = 'right';
    for (let v = Math.floor((value - span) / step) * step; v <= value + span; v += step) {
      if (v < 0) continue;
      const yy = y + TAPE_H / 2 - (v - value) * pxPerUnit;
      ctx.strokeStyle = 'rgba(234,244,255,0.5)';
      ctx.beginPath(); ctx.moveTo(x + 8, yy); ctx.lineTo(x + 20, yy); ctx.stroke();
      ctx.fillStyle = '#cfeaff';
      ctx.fillText(String(v), x + TAPE_W - 12, yy + 4);
    }
    ctx.restore();
    ctx.fillStyle = '#ffe9a8';
    ctx.font = '700 17px "Segoe UI", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(value), x + TAPE_W / 2, y - 8);
    ctx.fillStyle = '#9fd4ef';
    ctx.font = '600 11px "Segoe UI", Verdana, sans-serif';
    ctx.fillText(label + ' · ' + unit, x + TAPE_W / 2, y + TAPE_H + 14);
    // Centre marker.
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.moveTo(x + 2, y + TAPE_H / 2); ctx.lineTo(x + 10, y + TAPE_H / 2 - 6);
    ctx.lineTo(x + 10, y + TAPE_H / 2 + 6); ctx.closePath(); ctx.fill();
  }
}

const THREE_PITCH_PX = 90;

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

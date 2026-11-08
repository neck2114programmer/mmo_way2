import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ZONES } from "../game/data/zones";
import { MOBS } from "../game/data/world";
import { REGION } from "../game/data/gen";
import type { ZoneId } from "../game/types";
import { SPAWN, ZONE_NAMES } from "../game/meta";
import { EV_WARN, EVENT_ZONES, director, fmtHour, isEventZone, nightOf, playerPos, type WorldEvent } from "../game/events";

export function useDirector() {
  useSyncExternalStore(director.subscribe, director.getVersion);
  const [, setT] = useState(0);
  useEffect(() => { const i = setInterval(() => setT((x) => x + 1), 500); return () => clearInterval(i); }, []);
  return director;
}

export const fmtTime = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
export const STATUS_LABEL: Record<WorldEvent["status"], string> = { upcoming: "Скоро начнётся", active: "Идёт сейчас", done: "Отражено", failed: "Провалено" };
export const STATUS_COLOR: Record<WorldEvent["status"], string> = { upcoming: "#ffc247", active: "#ff5a3c", done: "#58e08a", failed: "#8a8f9c" };

// ---------------------------------------------------------------- маршрут
export function zoneRoute(from: ZoneId, to: ZoneId): ZoneId[] {
  if (from === to) return [from];
  const prev = new Map<ZoneId, ZoneId>([[from, from]]);
  const q: ZoneId[] = [from];
  while (q.length) {
    const c = q.shift()!;
    for (const p of ZONES[c].portals) if (!prev.has(p.to)) { prev.set(p.to, c); q.push(p.to); }
  }
  if (!prev.has(to)) return [];
  const out: ZoneId[] = [to];
  while (out[0] !== from) out.unshift(prev.get(out[0])!);
  return out;
}
export interface RouteStep { zone: ZoneId; text: string; dist: number }
export function routeSteps(ev: WorldEvent): RouteStep[] {
  const route = zoneRoute(playerPos.zone, ev.zone);
  const steps: RouteStep[] = [];
  let px = playerPos.x, pz = playerPos.z;
  for (let i = 0; i < route.length; i++) {
    const z = route[i];
    if (i === route.length - 1) {
      const d = Math.hypot(ev.pos.x - px, ev.pos.z - pz);
      steps.push({ zone: z, text: i === 0 ? `Идите к месту события (${ev.kind === "raid" ? "центр поселения" : "район охоты"})` : `Из точки входа идите к месту события`, dist: d });
    } else {
      const p = ZONES[z].portals.find((pp) => pp.to === route[i + 1])!;
      steps.push({ zone: z, text: `Портал «${p.label}» → ${ZONE_NAMES[route[i + 1]]}`, dist: Math.hypot(p.x - px, p.z - pz) });
      const back = ZONES[route[i + 1]].portals.find((pp) => pp.to === z);
      px = back ? back.tx ?? SPAWN[route[i + 1]].x : SPAWN[route[i + 1]].x; pz = back ? back.tz ?? SPAWN[route[i + 1]].z : SPAWN[route[i + 1]].z;
      const dest = ZONES[z].portals.find((pp) => pp.to === route[i + 1])!; px = dest.tx; pz = dest.tz;
    }
  }
  return steps;
}

// ---------------------------------------------------------------- рельеф (кэш)
const terrainCache = new Map<ZoneId, HTMLCanvasElement>();
const N = 400;
function terrain(id: ZoneId): HTMLCanvasElement {
  const hit = terrainCache.get(id); if (hit) return hit;
  const z = ZONES[id], S = z.half * 2;
  const c = document.createElement("canvas"); c.width = c.height = N;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(N, N);
  const H = new Float32Array(N * N);
  let mn = 1e9, mx = -1e9;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = z.height(((i + 0.5) / N) * S - z.half, ((j + 0.5) / N) * S - z.half);
    H[j * N + i] = h; if (h < mn) mn = h; if (h > mx) mx = h;
  }
  const hex = (s: string) => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
  const g = { low: hex(z.ground.low), mid: hex(z.ground.mid), high: hex(z.ground.high), rock: hex(z.ground.rock), sand: hex(z.ground.sand), water: hex(z.waterColor), deep: hex(z.waterDeep) };
  const mixc = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const range = Math.max(1, Math.min(mx, 30) - Math.max(mn, z.waterLevel - 1));
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const h = H[j * N + i];
    const hx = H[j * N + Math.min(N - 1, i + 1)] - H[j * N + Math.max(0, i - 1)], hz = H[Math.min(N - 1, j + 1) * N + i] - H[Math.max(0, j - 1) * N + i];
    const slope = Math.hypot(hx, hz) / ((S / N) * 2);
    const light = Math.max(-0.5, Math.min(0.5, (-hx + -hz) * 0.12));
    let col: number[];
    if (!z.cave && h < z.waterLevel) col = mixc(g.water, g.deep, Math.min(1, (z.waterLevel - h) / 2.5));
    else {
      const t = Math.min(1, Math.max(0, (h - z.waterLevel) / range));
      col = t < 0.08 ? mixc(g.sand, g.low, t / 0.08) : t < 0.5 ? mixc(g.low, g.mid, (t - 0.08) / 0.42) : mixc(g.mid, g.high, (t - 0.5) / 0.5);
      col = mixc(col, g.rock, Math.min(0.85, Math.max(0, (slope - 0.35) * 1.4)));
      col = col.map((v) => v * (1 + light * 0.5));
    }
    const o = (j * N + i) * 4; img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  terrainCache.set(id, c);
  return c;
}

// ---------------------------------------------------------------- маркер события
function drawBadge(ctx: CanvasRenderingContext2D, x: number, y: number, ev: WorldEvent, t: number, big = false) {
  const col = STATUS_COLOR[ev.status], R = big ? 17 : 13;
  const pulse = (t % 1.6) / 1.6;
  if (ev.status === "active" || ev.status === "upcoming") {
    for (let k = 0; k < 2; k++) { const p = (pulse + k * 0.5) % 1; ctx.strokeStyle = col; ctx.globalAlpha = (1 - p) * 0.7; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, R + p * 26, 0, 7); ctx.stroke(); }
    ctx.globalAlpha = 1;
  }
  // подложка: щит с остриём вниз
  ctx.save(); ctx.translate(x, y); ctx.shadowColor = "rgba(0,0,0,.7)"; ctx.shadowBlur = 8;
  ctx.fillStyle = "#14101c"; ctx.strokeStyle = col; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-R, -R * 0.8); ctx.quadraticCurveTo(0, -R * 1.25, R, -R * 0.8); ctx.lineTo(R, R * 0.15); ctx.quadraticCurveTo(R * 0.7, R * 0.9, 0, R * 1.35); ctx.quadraticCurveTo(-R * 0.7, R * 0.9, -R, R * 0.15); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 2.2; ctx.lineCap = "round";
  const s = R / 13;
  if (ev.status === "done") { ctx.beginPath(); ctx.moveTo(-6 * s, 0); ctx.lineTo(-1.5 * s, 5 * s); ctx.lineTo(7 * s, -6 * s); ctx.stroke(); }
  else if (ev.status === "failed") { ctx.beginPath(); ctx.moveTo(-5 * s, -5 * s); ctx.lineTo(5 * s, 5 * s); ctx.moveTo(5 * s, -5 * s); ctx.lineTo(-5 * s, 5 * s); ctx.stroke(); }
  else if (ev.status === "upcoming") { ctx.beginPath(); ctx.arc(0, 0, 6.5 * s, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -4 * s); ctx.lineTo(0, 0); ctx.lineTo(3.5 * s, 2 * s); ctx.stroke(); }
  else if (ev.kind === "raid") { // скрещённые мечи
    ctx.beginPath(); ctx.moveTo(-6 * s, -7 * s); ctx.lineTo(6 * s, 6 * s); ctx.moveTo(6 * s, -7 * s); ctx.lineTo(-6 * s, 6 * s); ctx.stroke();
    ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-8 * s, 2 * s); ctx.lineTo(-3.5 * s, -2 * s); ctx.moveTo(8 * s, 2 * s); ctx.lineTo(3.5 * s, -2 * s); ctx.stroke();
  } else { // череп охотника
    ctx.beginPath(); ctx.arc(0, -1.5 * s, 6 * s, 0, 7); ctx.fill(); ctx.fillRect(-3.5 * s, 2 * s, 7 * s, 5 * s);
    ctx.fillStyle = "#14101c"; ctx.beginPath(); ctx.arc(-2.4 * s, -1.5 * s, 1.7 * s, 0, 7); ctx.arc(2.4 * s, -1.5 * s, 1.7 * s, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// ---------------------------------------------------------------- карта локации
export interface ZoneMapProps {
  zone: ZoneId; mini?: boolean; selected?: string | null; onSelect?: (id: string | null) => void;
  layers?: { spawns: boolean; paths: boolean; buildings: boolean; portals: boolean; route: boolean };
  className?: string; follow?: boolean;
}
export function ZoneMap({ zone, mini, selected, onSelect, layers, className, follow }: ZoneMapProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const view = useRef({ k: 1, ox: 0, oz: 0 }); // k — масштаб, (ox,oz) — мировая точка в центре
  const hover = useRef<{ ev: WorldEvent; x: number; y: number } | null>(null);
  const [tip, setTip] = useState<{ ev: WorldEvent; x: number; y: number } | null>(null);
  const L = layers ?? { spawns: !mini, paths: true, buildings: true, portals: true, route: true };
  const props = useRef({ selected, L, onSelect, follow, mini });
  props.current = { selected, L, onSelect, follow, mini };
  const z = ZONES[zone];

  useEffect(() => { view.current = { k: mini ? 1.6 : 1, ox: 0, oz: 0 }; }, [zone, mini]);

  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext("2d")!;
    let raf = 0, last = performance.now(), T = 0;
    const base = terrain(zone);
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const now = performance.now(); T += (now - last) / 1000; last = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = cv.clientWidth, Hh = cv.clientHeight;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(Hh * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const P = props.current, v = view.current;
      if (P.follow && playerPos.zone === zone) { v.ox = playerPos.x; v.oz = playerPos.z; }
      const span = z.half * 2, fit = Math.min(W, Hh) / span;
      const sc = fit * v.k; // пикселей на метр
      const wx = (x: number) => W / 2 + (x - v.ox) * sc, wz = (zz: number) => Hh / 2 + (zz - v.oz) * sc;
      ctx.fillStyle = "#0b0a12"; ctx.fillRect(0, 0, W, Hh);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(base, wx(-z.half), wz(-z.half), span * sc, span * sc);
      // рамка карты и сетка 100 м
      ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 1;
      if (!P.mini) for (let g = -Math.floor(z.half / 100) * 100; g <= z.half; g += 100) { ctx.beginPath(); ctx.moveTo(wx(g), wz(-z.half)); ctx.lineTo(wx(g), wz(z.half)); ctx.moveTo(wx(-z.half), wz(g)); ctx.lineTo(wx(z.half), wz(g)); ctx.stroke(); }
      ctx.strokeStyle = "rgba(255,220,150,.45)"; ctx.lineWidth = 2; ctx.strokeRect(wx(-z.half), wz(-z.half), span * sc, span * sc);
      // дороги
      if (P.L.paths) { ctx.lineCap = "round"; ctx.lineJoin = "round"; for (const path of z.paths) { ctx.beginPath(); path.forEach(([x, zz], i) => (i ? ctx.lineTo(wx(x), wz(zz)) : ctx.moveTo(wx(x), wz(zz)))); ctx.strokeStyle = "rgba(20,14,8,.5)"; ctx.lineWidth = Math.max(2, 3.2 * sc * 1.6); ctx.stroke(); ctx.strokeStyle = "#d8c08a"; ctx.lineWidth = Math.max(1, 3.2 * sc); ctx.stroke(); } }
      // зоны монстров
      if (P.L.spawns) for (const s of z.mobs) { const m = MOBS[s.mob]; ctx.fillStyle = m?.boss ? "rgba(255,60,200,.14)" : "rgba(255,70,70,.10)"; ctx.strokeStyle = m?.boss ? "rgba(255,90,220,.5)" : "rgba(255,90,90,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(wx(s.x), wz(s.z), s.r * sc, 0, 7); ctx.fill(); ctx.stroke(); }
      // постройки
      if (P.L.buildings) { ctx.fillStyle = "rgba(30,22,16,.9)"; ctx.strokeStyle = "#e9d7a8"; ctx.lineWidth = 1; for (const b of z.buildings) { const s = Math.max(3, 5 * sc * (b.s ?? 1)); ctx.save(); ctx.translate(wx(b.x), wz(b.z)); ctx.rotate(b.ry ?? 0); ctx.fillRect(-s / 2, -s / 2, s, s); ctx.strokeRect(-s / 2, -s / 2, s, s); ctx.restore(); } }
      // поселение
      if (!P.mini) {
        const town = (REGION as Record<string, { town?: string }>)[zone]?.town ?? (zone === "meadow" ? "Лагерь Рассвета" : zone === "desert" ? "Оазис Ал-Хазар" : zone === "forest" ? "Поселение друидов" : zone === "capital" ? "Эльдория" : "Подземелье");
        ctx.strokeStyle = "rgba(255,230,160,.7)"; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(wx(z.hub.x), wz(z.hub.z), z.hub.r * sc, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = "700 12px Georgia, serif"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.fillStyle = "#ffeec2"; ctx.strokeText(town, wx(z.hub.x), wz(z.hub.z) + z.hub.r * sc + 14); ctx.fillText(town, wx(z.hub.x), wz(z.hub.z) + z.hub.r * sc + 14);
      }
      // порталы
      if (P.L.portals) for (const p of z.portals) {
        const x = wx(p.x), y = wz(p.z); ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4); ctx.fillStyle = "#6b3bd0"; ctx.strokeStyle = "#d9c4ff"; ctx.lineWidth = 2; ctx.fillRect(-6, -6, 12, 12); ctx.strokeRect(-6, -6, 12, 12); ctx.restore();
        if (!P.mini) { ctx.font = "600 11px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 3; ctx.strokeStyle = "#000"; ctx.fillStyle = "#e8dcff"; ctx.strokeText(`→ ${ZONE_NAMES[p.to]}`, x, y - 12); ctx.fillText(`→ ${ZONE_NAMES[p.to]}`, x, y - 12); }
      }
      // события
      const evs = director.events.filter((e) => e.zone === zone);
      const hits: { ev: WorldEvent; x: number; y: number }[] = [];
      for (const ev of evs) {
        const col = STATUS_COLOR[ev.status];
        const cx = wx(ev.area.x), cy = wz(ev.area.z), r = ev.area.r * sc;
        // граница зоны события
        ctx.save();
        const pulse = 0.5 + 0.5 * Math.sin(T * 3);
        ctx.fillStyle = col + (ev.status === "active" ? Math.round(18 + pulse * 18).toString(16).padStart(2, "0") : "14");
        ctx.strokeStyle = col; ctx.lineWidth = ev.status === "active" ? 2.5 : 1.5; ctx.setLineDash(ev.status === "active" ? [14, 8] : [4, 6]); ctx.lineDashOffset = -T * 20;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.fill(); ctx.stroke(); ctx.restore();
        if (ev.kind === "raid") { // внутренняя цель — поселение под угрозой
          ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(wx(ev.hub.x), wz(ev.hub.z), ev.hub.r * sc, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
          // стрелки нападающих к центру
          if (ev.status === "active") for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283 + T * 0.1, r0 = ev.area.r * sc * 0.92, r1 = ev.area.r * sc * (0.5 + 0.3 * ((T * 0.5 + i * 0.13) % 1) * 0); void r1; const q = ((T * 0.45 + i * 0.125) % 1); const rr = r0 * (1 - q * 0.6); ctx.fillStyle = col; ctx.globalAlpha = 1 - q; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 3, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
        }
        const mx = wx(ev.pos.x), my = wz(ev.pos.z);
        const sel = P.selected === ev.id;
        if (sel) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(mx, my, 25, 0, 7); ctx.stroke(); }
        drawBadge(ctx, mx, my - 6, ev, T, sel);
        // подпись с таймером
        const left = director.remaining(ev);
        const label = ev.status === "active" ? `⏱ ${fmtTime(left)}` : ev.status === "upcoming" ? `через ${fmtTime(left)}` : ev.status === "done" ? "победа" : "завершено";
        if (!P.mini || sel) { ctx.font = "800 12px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.fillStyle = col; ctx.strokeText(label, mx, my + 28); ctx.fillText(label, mx, my + 28); }
        hits.push({ ev, x: mx, y: my - 6 });
      }
      // игрок + маршрут
      const here = playerPos.zone === zone;
      if (P.L.route && P.selected) {
        const ev = director.events.find((e) => e.id === P.selected && e.zone === zone);
        if (ev) {
          let sx = playerPos.x, sz = playerPos.z, ok = here;
          if (!here) { const route = zoneRoute(playerPos.zone, zone); const prevZone = route[route.length - 2]; if (prevZone) { const e = ZONES[prevZone].portals.find((p) => p.to === zone)!; sx = e.tx; sz = e.tz; ok = true; } }
          if (ok) {
            ctx.strokeStyle = "#7fe8ff"; ctx.lineWidth = 3; ctx.setLineDash([2, 8]); ctx.lineCap = "round"; ctx.lineDashOffset = -T * 30;
            ctx.beginPath(); ctx.moveTo(wx(sx), wz(sz)); ctx.lineTo(wx(ev.pos.x), wz(ev.pos.z)); ctx.stroke(); ctx.setLineDash([]);
            if (!P.mini) { const d = Math.hypot(ev.pos.x - sx, ev.pos.z - sz); const mx = (wx(sx) + wx(ev.pos.x)) / 2, my = (wz(sz) + wz(ev.pos.z)) / 2; ctx.font = "700 12px system-ui"; ctx.textAlign = "center"; ctx.lineWidth = 4; ctx.strokeStyle = "#000"; ctx.fillStyle = "#7fe8ff"; ctx.strokeText(`${Math.round(d)} м`, mx, my - 6); ctx.fillText(`${Math.round(d)} м`, mx, my - 6); }
            if (!here) { ctx.fillStyle = "#6b3bd0"; ctx.strokeStyle = "#7fe8ff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(wx(sx), wz(sz), 7, 0, 7); ctx.fill(); ctx.stroke(); }
          }
        }
      }
      if (here) {
        const x = wx(playerPos.x), y = wz(playerPos.z);
        ctx.save(); ctx.translate(x, y); ctx.rotate(-playerPos.yaw + Math.PI); ctx.fillStyle = "#4dd2ff"; ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.shadowColor = "#000"; ctx.shadowBlur = 5;
        ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6.5, 7); ctx.lineTo(0, 3.5); ctx.lineTo(-6.5, 7); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      // «зона недоступна» для подземелий
      if (!isEventZone(zone) && !P.mini) { ctx.fillStyle = "rgba(10,8,18,.72)"; ctx.fillRect(10, 10, 270, 26); ctx.fillStyle = "#b9b4cc"; ctx.font = "600 12px system-ui"; ctx.textAlign = "left"; ctx.fillText("🔒 В подземельях ночные события не проводятся", 18, 28); }
      (cv as HTMLCanvasElement & { __hits?: typeof hits; __tr?: object }).__hits = hits;
      (cv as HTMLCanvasElement & { __tr?: object }).__tr = { W, Hh, sc, ox: v.ox, oz: v.oz };
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [zone, z]);

  // pan/zoom
  useEffect(() => {
    const cv = ref.current!;
    if (mini) return;
    let drag: { x: number; y: number; ox: number; oz: number } | null = null, moved = 0;
    const sc = () => (cv as HTMLCanvasElement & { __tr?: { sc: number } }).__tr?.sc ?? 1;
    const md = (e: PointerEvent) => { drag = { x: e.clientX, y: e.clientY, ox: view.current.ox, oz: view.current.oz }; moved = 0; cv.setPointerCapture(e.pointerId); };
    const mm = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
      if (drag) { moved += Math.abs(e.movementX) + Math.abs(e.movementY); view.current.ox = drag.ox - (e.clientX - drag.x) / sc(); view.current.oz = drag.oz - (e.clientY - drag.y) / sc(); }
      const hs = (cv as HTMLCanvasElement & { __hits?: { ev: WorldEvent; x: number; y: number }[] }).__hits ?? [];
      const h = hs.find((q) => Math.hypot(q.x - px, q.y - py) < 20);
      cv.style.cursor = h ? "pointer" : drag ? "grabbing" : "grab";
      hover.current = h ? { ev: h.ev, x: px, y: py } : null; setTip(hover.current);
    };
    const mu = () => {
      if (drag && moved < 5) { props.current.onSelect?.(hover.current ? hover.current.ev.id : null); }
      drag = null;
    };
    const wh = (e: WheelEvent) => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), px = e.clientX - r.left - r.width / 2, py = e.clientY - r.top - r.height / 2;
      const v = view.current, before = sc(), k2 = Math.min(8, Math.max(0.6, v.k * (e.deltaY < 0 ? 1.18 : 1 / 1.18))), after = before * (k2 / v.k);
      v.ox += px / before - px / after; v.oz += py / before - py / after; v.k = k2;
    };
    cv.addEventListener("pointerdown", md); cv.addEventListener("pointermove", mm); cv.addEventListener("pointerup", mu); cv.addEventListener("wheel", wh, { passive: false });
    return () => { cv.removeEventListener("pointerdown", md); cv.removeEventListener("pointermove", mm); cv.removeEventListener("pointerup", mu); cv.removeEventListener("wheel", wh); };
  }, [mini]);

  const resetView = (focus?: { x: number; z: number }, k = 2.2) => { view.current = { k, ox: focus?.x ?? 0, oz: focus?.z ?? 0 }; };
  // центрирование на выбранном событии
  useEffect(() => {
    if (!selected || mini) return;
    const ev = director.events.find((e) => e.id === selected && e.zone === zone);
    if (ev) resetView(ev.area, ev.kind === "raid" ? 1.6 : 2.6);
  }, [selected, zone, mini]);

  return (
    <div className={`relative ${className ?? ""}`} style={{ touchAction: "none" }}>
      <canvas ref={ref} className="h-full w-full rounded-lg" />
      {!mini && <div className="absolute bottom-2 right-2 flex gap-1">
        <button className="btn-s" onClick={() => resetView(undefined, 1)}>⌂ Вся карта</button>
        <button className="btn-s" onClick={() => resetView({ x: z.hub.x, z: z.hub.z }, 2.2)}>Поселение</button>
        {playerPos.zone === zone && <button className="btn-s" onClick={() => resetView({ x: playerPos.x, z: playerPos.z }, 3)}>Я здесь</button>}
      </div>}
      {tip && !mini && (
        <div className="pointer-events-none absolute z-10 w-60 rounded-lg border border-white/15 bg-[#120f1ccc] p-2 text-xs backdrop-blur" style={{ left: Math.min(tip.x + 14, 9999), top: tip.y + 14 }}>
          <div className="font-bold" style={{ color: STATUS_COLOR[tip.ev.status] }}>{tip.ev.title}</div>
          <div className="text-white/70">{ZONE_NAMES[tip.ev.zone]} • ур. {tip.ev.lvl} • x {Math.round(tip.ev.pos.x)}, z {Math.round(tip.ev.pos.z)}</div>
          <div>{STATUS_LABEL[tip.ev.status]}{tip.ev.status === "active" || tip.ev.status === "upcoming" ? ` — ${fmtTime(director.remaining(tip.ev))}` : ""}</div>
          <div className="text-white/70">{tip.ev.info}</div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- карта мира
const NODES: Record<ZoneId, [number, number]> = {
  capital: [540, 330], meadow: [350, 345], desert: [195, 265], forest: [105, 140], crypt: [255, 58],
  coast: [440, 170], highlands: [440, 505], mines: [290, 575], swamp: [640, 150], sunken: [690, 48],
  volcano: [790, 245], dragon: [905, 130], tundra: [775, 455], void: [905, 545],
};
export function WorldMapView({ selectedZone, onZone, selectedEvent, onEvent }: { selectedZone: ZoneId; onZone: (z: ZoneId) => void; selectedEvent: string | null; onEvent: (id: string) => void }) {
  const d = useDirector();
  const links = useMemo(() => { const s = new Set<string>(); const out: [ZoneId, ZoneId][] = []; for (const id of Object.keys(ZONES) as ZoneId[]) for (const p of ZONES[id].portals) { const k = [id, p.to].sort().join("|"); if (!s.has(k)) { s.add(k); out.push([id, p.to]); } } return out; }, []);
  return (
    <svg viewBox="0 0 1000 640" className="h-full w-full rounded-lg" style={{ background: "radial-gradient(ellipse at 50% 45%, #3a2f22 0%, #241c15 60%, #15110d 100%)" }}>
      <defs>
        <filter id="rough"><feTurbulence baseFrequency="0.03" numOctaves="3" seed="4" /><feDisplacementMap in="SourceGraphic" scale="8" /></filter>
        <pattern id="paper" width="6" height="6" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.6" fill="#ffffff10" /></pattern>
      </defs>
      <rect width="1000" height="640" fill="url(#paper)" />
      {links.map(([a, b]) => <line key={a + b} x1={NODES[a][0]} y1={NODES[a][1]} x2={NODES[b][0]} y2={NODES[b][1]} stroke="#cdb787" strokeOpacity={0.55} strokeWidth={3} strokeDasharray="2 7" strokeLinecap="round" />)}
      {(Object.keys(NODES) as ZoneId[]).map((id) => {
        const [x, y] = NODES[id], zn = ZONES[id], ok = isEventZone(id), sel = selectedZone === id;
        const evs = d.events.filter((e) => e.zone === id);
        const live = evs.find((e) => e.status === "active") ?? evs.find((e) => e.status === "upcoming") ?? evs[0];
        return (
          <g key={id} transform={`translate(${x} ${y})`} onClick={() => onZone(id)} style={{ cursor: "pointer" }}>
            <ellipse rx={62} ry={42} fill={zn.ground.mid} stroke={sel ? "#fff" : "#2a2016"} strokeWidth={sel ? 3 : 2} opacity={ok ? 0.95 : 0.72} filter="url(#rough)" />
            <ellipse rx={40} ry={26} cy={-4} fill={zn.ground.high} opacity={0.5} />
            <ellipse rx={22} ry={12} cx={-14} cy={10} fill={zn.waterColor} opacity={zn.waterLevel > -5 ? 0.5 : 0} />
            {!ok && <text y={6} textAnchor="middle" fontSize={20}>🕳️</text>}
            <text y={58} textAnchor="middle" fontSize={13} fontWeight={700} fill="#f6e8c6" stroke="#000" strokeWidth={3} paintOrder="stroke">{ZONE_NAMES[id]}</text>
            <text y={72} textAnchor="middle" fontSize={10} fill="#cbbf9f" stroke="#000" strokeWidth={2.5} paintOrder="stroke">ур. {zn.levels}</text>
            {live && (
              <g transform="translate(34 -34)" onClick={(e) => { e.stopPropagation(); onZone(id); onEvent(live.id); }}>
                {(live.status === "active" || live.status === "upcoming") && <circle r={16} fill="none" stroke={STATUS_COLOR[live.status]} strokeWidth={2.5} className="pulse-ring" />}
                <circle r={15} fill="#14101c" stroke={STATUS_COLOR[live.status]} strokeWidth={3} />
                <text y={5.5} textAnchor="middle" fontSize={15}>{live.status === "done" ? "✔" : live.status === "failed" ? "✖" : live.status === "upcoming" ? "⏳" : live.kind === "raid" ? "⚔" : "☠"}</text>
                <text y={31} textAnchor="middle" fontSize={11} fontWeight={800} fill={STATUS_COLOR[live.status]} stroke="#000" strokeWidth={3} paintOrder="stroke">{live.status === "active" || live.status === "upcoming" ? fmtTime(d.remaining(live)) : live.status === "done" ? "победа" : "конец"}</text>
                {evs.length > 1 && <text x={14} y={-10} fontSize={10} fontWeight={800} fill="#fff" stroke="#000" strokeWidth={3} paintOrder="stroke">×{evs.length}</text>}
                {selectedEvent === live.id && <circle r={21} fill="none" stroke="#fff" strokeWidth={2} />}
              </g>
            )}
          </g>
        );
      })}
      <g transform="translate(70 590)" opacity={0.85}>
        <circle r={26} fill="none" stroke="#cdb787" strokeWidth={1.5} /><path d="M0 -22 L5 0 L0 22 L-5 0Z" fill="#cdb787" /><path d="M-22 0 L0 -4 L22 0 L0 4Z" fill="#cdb78788" />
        <text y={-30} textAnchor="middle" fontSize={11} fill="#cdb787">С</text>
      </g>
      <text x={990} y={625} textAnchor="end" fontSize={11} fill="#cdb787aa">{fmtHour(d.tod)} • {nightOf(d.tod) > 0.6 ? "ночь" : "день"}</text>
    </svg>
  );
}
export { EVENT_ZONES, EV_WARN };

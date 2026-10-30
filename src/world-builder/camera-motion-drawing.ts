import { cameraProgress, type CameraProgressVec3 } from "./camera-progress";
import {
  CAMERA_MOVE_BY_KEY,
  type CameraMove,
  type CameraMoveKey,
} from "./camera-moves";

export type Pose = {
  x: number;
  y: number;
  z: number;
  key: CameraMoveKey | "origin";
  label: string;
};

type LayerTrace = {
  pose: Pose;
  current: Pose;
  weight: number;
  color: string;
};

type ViewMode = "top" | "side";

const WORLD_RANGE = 28;
const HEIGHT_RANGE = 26;
const ORIGIN_POSE: Pose = { x: 0, y: 0, z: 0, key: "origin", label: "Subject" };
const LAYER_COLORS = [
  "rgba(136,219,244,0.72)",
  "rgba(237,177,92,0.62)",
  "rgba(255,255,255,0.34)",
  "rgba(136,219,244,0.38)",
];

export function drawRadar(
  canvas: HTMLCanvasElement,
  mode: ViewMode,
  poseState: { start: Pose; current: Pose; target: Pose },
  layers: LayerTrace[],
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.clientWidth || 300;
  const h = canvas.clientHeight || 132;
  const cx = w / 2;
  const cy = mode === "top" ? h / 2 : h - 20;

  ctx.clearRect(0, 0, w, h);

  if (mode === "top") {
    drawTopRadar(ctx, w, h, poseState, layers);
    return;
  }

  drawGrid(ctx, mode, w, h, cx, cy);
  drawPath(
    ctx,
    mode,
    w,
    h,
    poseState.start,
    poseState.target,
    "rgba(136,219,244,0.9)",
    0.95,
    2,
  );

  for (const layer of layers) {
    drawPath(
      ctx,
      mode,
      w,
      h,
      ORIGIN_POSE,
      layer.pose,
      layer.color,
      0.2 + layer.weight * 0.58,
      1.5,
    );
    drawMarker(
      ctx,
      projectPose(layer.current, mode, w, h),
      layer.color,
      3.4,
      "dot",
      0.48 + layer.weight * 0.44,
    );
  }

  const origin = projectPose(ORIGIN_POSE, mode, w, h);
  const start = projectPose(poseState.start, mode, w, h);
  const current = projectPose(poseState.current, mode, w, h);
  const target = projectPose(poseState.target, mode, w, h);

  drawMarker(ctx, origin, "rgba(226,112,176,0.95)", 4, "dot", 1);
  drawMarker(ctx, start, "rgba(255,255,255,0.42)", 3.2, "dot", 1);
  drawMarker(ctx, target, "rgba(237,177,92,0.98)", 5, "diamond", 1);
  drawMarker(ctx, current, "#88DBF4", 5.5, "dot", 1);

  drawLabel(
    ctx,
    "GROUND",
    origin.x + 7,
    origin.y - 6,
    "rgba(255,255,255,0.42)",
  );
  drawLabel(ctx, "NOW", current.x + 7, current.y - 6, "#88DBF4");
  drawLabel(ctx, "END", target.x + 7, target.y + 12, "#EDB15C");
}

function drawTopRadar(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  poseState: { start: Pose; current: Pose; target: Pose },
  layers: LayerTrace[],
): void {
  const cx = w / 2;
  const cy = h / 2;
  const maxR = Math.min(w, h) / 2 - 13;
  const currentPolar = topPolar(poseState.current);
  const targetPolar = topPolar(poseState.target);
  const startPolar = topPolar(poseState.start);
  const activeRadius = maxR * Math.max(0.28, targetPolar.radius);

  drawGrid(ctx, "top", w, h, cx, cy);

  ctx.save();
  ctx.fillStyle = "rgba(136,219,244,0.08)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, activeRadius, startPolar.angle, currentPolar.angle, false);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(237,177,92,0.08)";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, activeRadius, currentPolar.angle, targetPolar.angle, false);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = "rgba(136,219,244,0.72)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, activeRadius, startPolar.angle, currentPolar.angle, false);
  ctx.stroke();

  ctx.strokeStyle = "rgba(237,177,92,0.74)";
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(cx, cy, activeRadius, currentPolar.angle, targetPolar.angle, false);
  ctx.stroke();
  ctx.setLineDash([]);

  for (const layer of layers) {
    const layerPolar = topPolar(layer.pose);
    const layerCurrent = topPolar(layer.current);
    const layerR = maxR * Math.max(0.22, layerPolar.radius);
    ctx.globalAlpha = 0.2 + layer.weight * 0.45;
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(cx, cy, layerR, -Math.PI / 2, layerCurrent.angle, false);
    ctx.stroke();
  }
  ctx.restore();

  const origin = { x: cx, y: cy };
  const start = polarPoint(cx, cy, maxR, startPolar);
  const current = polarPoint(cx, cy, maxR, currentPolar);
  const target = polarPoint(cx, cy, maxR, targetPolar);

  drawMarker(ctx, origin, "rgba(226,112,176,0.95)", 4, "dot", 1);
  drawMarker(ctx, start, "rgba(255,255,255,0.42)", 3.2, "dot", 1);
  drawMarker(ctx, target, "rgba(237,177,92,0.98)", 5, "diamond", 1);
  drawMarker(ctx, current, "#88DBF4", 5.5, "dot", 1);

  ctx.save();
  ctx.strokeStyle = "rgba(136,219,244,0.46)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(origin.x, origin.y);
  ctx.lineTo(current.x, current.y);
  ctx.stroke();
  ctx.restore();

  drawLabel(ctx, "NOW", current.x + 7, current.y - 6, "#88DBF4");
  drawLabel(ctx, "END", target.x + 7, target.y + 12, "#EDB15C");
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  mode: ViewMode,
  w: number,
  h: number,
  cx: number,
  cy: number,
): void {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;

  if (mode === "top") {
    const maxR = Math.min(w, h) / 2 - 13;
    for (const r of [0.34, 0.62, 0.9]) {
      ctx.beginPath();
      ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - maxR, cy);
    ctx.lineTo(cx + maxR, cy);
    ctx.moveTo(cx, cy - maxR);
    ctx.lineTo(cx, cy + maxR);
    ctx.stroke();
  } else {
    const padX = 12;
    const top = 18;
    const bottom = h - 20;
    const step = (bottom - top) / 3;
    for (let i = 0; i <= 3; i += 1) {
      const y = top + step * i;
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(w - padX, y);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx, top);
    ctx.lineTo(cx, bottom);
    ctx.moveTo(padX, bottom);
    ctx.lineTo(w - padX, bottom);
    ctx.stroke();
  }

  ctx.restore();
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  mode: ViewMode,
  w: number,
  h: number,
  from: Pose,
  to: Pose,
  color: string,
  alpha: number,
  lineWidth: number,
): void {
  const start = projectPose(from, mode, w, h);
  const end = projectPose(to, mode, w, h);
  const control = {
    x: (start.x + end.x) / 2,
    y: (start.y + end.y) / 2 - (mode === "top" ? 18 : 10),
  };

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.quadraticCurveTo(control.x, control.y, end.x, end.y);
  ctx.stroke();
  drawArrowHead(ctx, control, end, color);
  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
): void {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const size = 6;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - Math.cos(angle - 0.55) * size,
    to.y - Math.sin(angle - 0.55) * size,
  );
  ctx.lineTo(
    to.x - Math.cos(angle + 0.55) * size,
    to.y - Math.sin(angle + 0.55) * size,
  );
  ctx.closePath();
  ctx.fill();
}

function drawMarker(
  ctx: CanvasRenderingContext2D,
  point: { x: number; y: number },
  color: string,
  size: number,
  shape: "dot" | "diamond",
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.42)";
  ctx.lineWidth = 1;
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;

  ctx.beginPath();
  if (shape === "diamond") {
    ctx.moveTo(point.x, point.y - size);
    ctx.lineTo(point.x + size, point.y);
    ctx.lineTo(point.x, point.y + size);
    ctx.lineTo(point.x - size, point.y);
    ctx.closePath();
  } else {
    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(text, x, y);
  ctx.restore();
}

function projectPose(
  pose: Pose,
  mode: ViewMode,
  w: number,
  h: number,
): { x: number; y: number } {
  if (mode === "top") {
    const scale = Math.min(
      (w - 28) / (WORLD_RANGE * 2),
      (h - 28) / (WORLD_RANGE * 2),
    );
    return {
      x: w / 2 + pose.x * scale,
      y: h / 2 + pose.z * scale,
    };
  }

  const scaleX = (w - 28) / (WORLD_RANGE * 2);
  const scaleY = (h - 36) / HEIGHT_RANGE;
  return {
    x: w / 2 + pose.z * scaleX,
    y: h - 20 - Math.max(0, pose.y) * scaleY,
  };
}

function topPolar(pose: Pose): { angle: number; radius: number } {
  const distance = Math.hypot(pose.x, pose.z);
  return {
    angle: distance < 0.001 ? -Math.PI / 2 : Math.atan2(pose.z, pose.x),
    radius: Math.min(Math.max(distance / WORLD_RANGE, 0.06), 1),
  };
}

function polarPoint(
  cx: number,
  cy: number,
  maxR: number,
  polar: { angle: number; radius: number },
): { x: number; y: number } {
  const r = maxR * Math.max(0.18, polar.radius);
  return {
    x: cx + Math.cos(polar.angle) * r,
    y: cy + Math.sin(polar.angle) * r,
  };
}

export function readLayerTraces(): LayerTrace[] {
  const traces: LayerTrace[] = [];
  for (let i = 0; i < cameraProgress.comboLayerKeys.length; i += 1) {
    const key = normaliseMoveKey(cameraProgress.comboLayerKeys[i]);
    if (!key) continue;
    const pose = poseForKey(key);
    const progress = clamp01(cameraProgress.comboLayerProgress[i] ?? 0);
    const weight = clamp01(cameraProgress.comboLayerWeights[i] ?? 0);
    traces.push({
      pose,
      current: lerpPose(ORIGIN_POSE, pose, progress),
      weight,
      color: LAYER_COLORS[i % LAYER_COLORS.length],
    });
  }
  return traces;
}

export function poseForKey(key: CameraMoveKey): Pose {
  const move = CAMERA_MOVE_BY_KEY[key];
  if (!move) return poseForMove(CAMERA_MOVE_BY_KEY.reset);
  return poseForMove(move);
}

export function poseFromVec3(
  position: CameraProgressVec3,
  key: CameraMoveKey,
  label = CAMERA_MOVE_BY_KEY[key]?.label ?? key,
): Pose {
  return {
    x: position[0],
    y: position[1],
    z: position[2],
    key,
    label,
  };
}

function poseForMove(move: CameraMove): Pose {
  if (move.kind === "static") {
    return {
      x: move.position[0],
      y: move.position[1],
      z: move.position[2],
      key: move.key,
      label: move.label,
    };
  }

  if (move.kind === "follow") {
    return {
      x: move.offset[0],
      y: move.offset[1],
      z: move.offset[2],
      key: move.key,
      label: move.label,
    };
  }

  const baseAngle = -Math.PI / 2;
  const angle = baseAngle + (move.degrees * Math.PI) / 180;
  return {
    x: Math.sin(angle) * move.radius,
    y: move.height,
    z: Math.cos(angle) * move.radius,
    key: move.key,
    label: move.label,
  };
}

export function lerpPose(from: Pose, to: Pose, progress: number): Pose {
  const t = clamp01(progress);
  return {
    x: from.x + (to.x - from.x) * t,
    y: from.y + (to.y - from.y) * t,
    z: from.z + (to.z - from.z) * t,
    key: to.key,
    label: to.label,
  };
}

export function normaliseMoveKey(key: string | null): CameraMoveKey | null {
  return key && key in CAMERA_MOVE_BY_KEY ? (key as CameraMoveKey) : null;
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function sizeCanvas(canvas: HTMLCanvasElement): void {
  // Scoped to the canvas's own window (not the bare global) so this still
  // reads the right DPR when popped into a Document PiP window.
  const dpr =
    (canvas.ownerDocument.defaultView ?? window).devicePixelRatio || 1;
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
}

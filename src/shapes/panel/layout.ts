// Flat panel dimensions: the light box (base and hood round the picture) and the open stand.
import { bool, num, round } from '../../core/shape';
import type { Message, ParamValues } from '../../core/types';
import { cableSlot, type CableSlot } from '../common/base';
import { PILLAR, POWER_FIT, POWER_LEDGE, POWER_WALL, powerLayout, type PowerLayout } from '../common/power';
import { jointLayout, type JointLayout, type LatchFace, type Socket } from '../common/lid';

/** Colours of the preview parts. */
export const COLORS = { base: '#c9ccd3', power: '#9aa3b5', hood: '#e9a23b', holder: '#e9a23b', panel: '#fff4dc', lamp: '#8fb7ff', text: '#3b4150' };

/** Fit of the hood walls on the base ledge. */
export const FIT = 0.3;
/** Material behind the picture's edges, so the posts hold it from both sides. */
export const LIP = 2;
/** Top plate above the picture's groove. */
const TOP = 3;
/** Minimum printed wall round a closure's socket. */
const WALL = 1.2;
/** The corner blocks are this much larger than the posts: part of each is the hood wall. */
const BLOCK = 2;
/** Stand: foot beyond the picture on each side, and behind the holder. */
export const SIDE = 3;
const BACK = 4;
/** Stand: notch in the holder's cup rim for the lamp's cable. */
export const NOTCH = 8;
/** Stand: floor of the holder's socket in the foot. */
export const SOCKET_FLOOR = 1.2;

export interface PanelLayout {
  outerX: number;
  outerY: number;
  totalHeight: number;
  panelW: number;
  panelH: number;
  thick: number;
  gap: number;
  engage: number;
  wall: number;
  /** Mid-plane of the picture (negative: towards the front). */
  planeY: number;
  /** Centre of the lamp seat along Y. */
  lampY: number;
  baseTop: number;
  /** Bottom of the hood walls, standing on the ledge round the base. */
  hoodBottom: number;
  panelBottom: number;
  panelTop: number;
  /** Underside of the hood's top plate. */
  topInner: number;
  top: number;
  /** Corner blocks inside the hood (behind the front posts, in the back corners): their size. */
  block: number;
  /** The hood's closure on the base: sizes, a socket in each corner block, latch faces on the side walls. */
  joint: JointLayout;
  sockets: Socket[];
  latches: LatchFace[];
  /** Battery tray under the base, as under the box. */
  power: PowerLayout | null;
  cable: CableSlot;
  warnings: Message[];
}

export function panelLayout(p: ParamValues): PanelLayout {
  const warnings: Message[] = [];
  const panelW = num(p, 'panelWidth');
  const panelH = num(p, 'panelHeight');
  const thick = num(p, 'panelThickness');
  const gap = num(p, 'slotClearance') / 2;
  const engage = num(p, 'slotEngage');
  const post = Math.max(num(p, 'postSize'), engage + 2);
  const inset = num(p, 'faceInset');
  const wall = num(p, 'wallThickness');
  const depth = num(p, 'lightDepth');
  const groove = num(p, 'baseGroove');

  const outerX = panelW + 2 * (post - engage);
  const outerY = inset + thick + 2 * gap + LIP + depth + wall;
  const planeY = -outerY / 2 + inset + thick / 2;
  const chamberFront = planeY + thick / 2 + gap + LIP;
  const chamberBack = outerY / 2 - wall;
  const lampY = (chamberFront + chamberBack) / 2;

  const baseTop = num(p, 'baseHeight');
  const panelBottom = baseTop - groove;
  const panelTop = panelBottom + panelH;
  const topInner = panelTop - groove;
  const top = panelTop + TOP;

  if (groove + num(p, 'lampSeatDepth') > baseTop - 1) warnings.push({ key: 'warn.baseTooThin' });
  // the lamp must fit between the picture's lip and the back wall, and between the side walls
  // (and between the corner blocks that hold the hood's closure)
  const block = post + BLOCK;
  const room = Math.min(chamberBack - chamberFront, outerX - 2 * (wall + FIT), outerX - 2 * block) - 2;
  if (num(p, 'lampDiameter') > room)
    warnings.push({ key: 'warn.lampTooBig', vars: { max: round(room) } });
  // the cable hole stops short of the back wall's ledge
  const cable = cableSlot(p, chamberBack - FIT - 1.5 - lampY, warnings);

  // The hood closes on the base like a lid on its posts: a socket in each corner block (whose
  // outer strip is the hood wall standing on the base's ledge), latch arms on the side walls.
  const hx = outerX / 2, hy = outerY / 2;
  const free = block - wall - FIT;
  const sx = hx - (block + wall + FIT) / 2;
  const ys = [chamberFront + block / 2, hy - (block + wall + FIT) / 2];
  const latchWidth = block - 2 * WALL;
  const hoodBottom = baseTop - groove;
  const joint = jointLayout(p, baseTop, free - 2 * WALL, post, latchWidth, warnings);
  // a latch arm hangs from the hood wall into a recess in the base's side: it must end above the floor
  if (joint.joint === 'latch' && hoodBottom - num(p, 'latchLength') - 1.5 < 0.6) warnings.push({ key: 'warn.noRoom' });
  const sockets: Socket[] = [], latches: LatchFace[] = [];
  for (const s of [1, -1])
    for (const y of ys) {
      sockets.push({ x: s * sx, y, rot: 0 });
      latches.push({ x: s * hx, y, nx: s, ny: 0, z: hoodBottom });
    }

  let power: PowerLayout | null = null;
  if (bool(p, 'powerBase')) {
    const grow = 2 * (POWER_WALL + POWER_FIT);
    const corner = (sx: number, sy: number): [number, number] => [sx * (outerX / 2 - PILLAR / 2 - 1), sy * (outerY / 2 - PILLAR / 2 - 1)];
    power = powerLayout(p, {
      size: [outerX + grow, outerY + grow],
      innerW: outerX - 2 * POWER_LEDGE,
      innerL: outerY - 2 * POWER_LEDGE,
      pillars: [corner(1, 1), corner(-1, 1), corner(-1, -1), corner(1, -1)],
      post,
      baseTop,
    }, warnings);
  }

  return {
    outerX, outerY, totalHeight: top, panelW, panelH, thick, gap, engage, wall, planeY, lampY,
    baseTop, hoodBottom, panelBottom, panelTop, topInner, top, block, joint, sockets, latches, power, cable, warnings,
  };
}

export interface StandLayout {
  outerX: number;
  outerY: number;
  totalHeight: number;
  panelW: number;
  panelH: number;
  thick: number;
  gap: number;
  planeY: number;
  baseTop: number;
  panelBottom: number;
  panelTop: number;
  holderW: number;
  /** Front face of the holder, where the cup opens towards the picture. */
  holderFront: number;
  holderBack: number;
  /** Centre height of the cup. */
  lampZ: number;
  holderTop: number;
  warnings: Message[];
}

export function standLayout(p: ParamValues): StandLayout {
  const warnings: Message[] = [];
  const panelW = num(p, 'panelWidth');
  const panelH = num(p, 'panelHeight');
  const thick = num(p, 'panelThickness');
  const gap = num(p, 'slotClearance') / 2;
  const inset = num(p, 'faceInset');
  const wall = num(p, 'wallThickness');
  const groove = num(p, 'baseGroove');
  const baseTop = num(p, 'baseHeight');
  const lampR = num(p, 'lampDiameter') / 2;
  // the cup floor also takes the steel disc recess
  const floor = bool(p, 'steelDisc') ? Math.max(wall, num(p, 'discDepth') + 1.2) : wall;

  const holderW = 2 * (lampR + wall);
  const outerX = Math.max(panelW + 2 * (SIDE + gap), holderW + 2 * SIDE);
  const outerY = inset + thick + 2 * gap + num(p, 'lampDistance') + num(p, 'holderDepth') + floor + BACK;
  const planeY = -outerY / 2 + inset + thick / 2;
  const holderFront = planeY + thick / 2 + gap + num(p, 'lampDistance');
  const holderBack = holderFront + num(p, 'holderDepth') + floor;

  const panelBottom = baseTop - groove;
  const panelTop = panelBottom + panelH;
  // the lamp faces the middle of the picture, but never lower than the holder allows
  const lampZ = Math.max((panelBottom + panelTop) / 2, baseTop + lampR + wall);
  const holderTop = lampZ + lampR + wall;

  if (groove > baseTop - 1 || baseTop < SOCKET_FLOOR + 3) warnings.push({ key: 'warn.baseTooThin' });

  return {
    outerX, outerY, totalHeight: Math.max(panelTop, holderTop), panelW, panelH, thick, gap, planeY, baseTop,
    panelBottom, panelTop, holderW, holderFront, holderBack, lampZ, holderTop, warnings,
  };
}

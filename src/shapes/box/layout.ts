// Pure dimension math for the box, kept apart from the solid modelling so it
// can be unit-tested and shown in the UI without the geometry kernel.
//
// Model space: millimetres, Z up, box centred on x = y = 0, standing on z = 0.
// Front/back panels run along X ("width"), left/right panels along Y.
// The cable leaves towards +Y (the back).
import { bool, num, round, str } from '../../core/shape';
import type { Message, ParamValues } from '../../core/types';
import { cableSlot, type CableSlot } from '../common/base';
import { jointLayout, type LidJoint } from '../common/lid';
import { PILLAR, POWER_FIT, POWER_LEDGE, POWER_WALL, powerLayout, type PowerLayout } from '../common/power';

export type { LidJoint, PowerLayout };

export interface BoxLayout {
  /** Outer footprint. */
  outerX: number;
  outerY: number;
  totalHeight: number;
  /** Panel sizes as the user must make them. */
  panelW: number;
  panelD: number;
  panelH: number;
  thick: number;
  /** Half the slot clearance: gap on each side of a panel. */
  gap: number;
  post: number;
  engage: number;
  /** Distance of each panel's mid-plane from the centre. */
  planeX: number; // side panels (left/right) sit at x = ±planeX
  planeY: number; // front/back panels sit at y = ±planeY
  baseTop: number;
  panelBottom: number;
  panelTop: number;
  lidBottom: number;
  lidTop: number;
  joint: LidJoint;
  /** Free square in each post beyond the slot ends: centre and size. */
  socketCx: number;
  socketCy: number;
  socketTop: number;
  socketDepth: number;
  plugTop: number;
  plugTip: number;
  plugDepth: number;
  magnetsFit: boolean;
  /** Snap latch arm on the ±X faces of the posts: centre along Y and width. */
  latchCy: number;
  latchWidth: number;
  /** Cable hole (stadium) along +Y: width, length, centre distance. */
  cable: CableSlot;
  /** Top lithophane size (equals the side panels when it fits). */
  topW: number;
  topD: number;
  power: PowerLayout | null;
  warnings: Message[];
}

const WALL = 1.2; // minimum printed wall around sockets

export function boxLayout(p: ParamValues): BoxLayout {
  const warnings: Message[] = [];
  const panelW = num(p, 'panelWidth');
  const panelD = bool(p, 'rectangular') ? num(p, 'sideWidth') : panelW;
  const panelH = num(p, 'panelHeight');
  const thick = num(p, 'panelThickness');
  const gap = num(p, 'slotClearance') / 2;
  const engage = num(p, 'slotEngage');
  const post = num(p, 'postSize');
  const inset = num(p, 'faceInset');
  const r = num(p, 'cornerRadius');
  const joint = str(p, 'lidJoint') as LidJoint;

  // Panel edges reach `engage` into the posts.
  const outerX = panelW + 2 * (post - engage);
  const outerY = panelD + 2 * (post - engage);
  const planeY = outerY / 2 - inset - thick / 2;
  const planeX = outerX / 2 - inset - thick / 2;

  // The slot coming in from one side must not cut into the other panel's slot.
  if (engage + gap > post - inset - thick - gap - WALL)
    warnings.push({ key: 'warn.postTooThin', vars: { min: round(engage + inset + thick + 2 * gap + WALL) } });

  const baseTop = num(p, 'baseHeight');
  const panelBottom = baseTop - num(p, 'baseGroove');
  const panelTop = panelBottom + panelH;
  const lidGroove = num(p, 'lidGroove');
  const lidBottom = panelTop - lidGroove;
  const lidThick = num(p, 'lidThickness');
  const lidTop = lidBottom + lidThick;

  if (num(p, 'baseGroove') + num(p, 'lampSeatDepth') > baseTop - 1) warnings.push({ key: 'warn.baseTooThin' });
  if (lidGroove + 0.6 > lidThick) warnings.push({ key: 'warn.lidTooThin' });

  // Free square in the post beyond the slot ends (sockets, pockets, pegs go here).
  const socketTop = Math.max(0, post - engage - gap - 2 * WALL);
  const socketCx = outerX / 2 - WALL - socketTop / 2;
  const socketCy = outerY / 2 - WALL - socketTop / 2;

  // Latch arms sit on the flat part of the post's outer ±X face, past the side panel slot.
  const latchY0 = outerY / 2 - post + engage + gap + WALL;
  const latchY1 = outerY / 2 - Math.max(r, WALL);
  const latchWidth = latchY1 - latchY0 - 0.6;
  const latchCy = (latchY0 + latchY1) / 2;
  const J = jointLayout(p, lidBottom, socketTop, post, latchWidth, warnings);
  const { plugTop, plugTip, plugDepth, socketDepth, magnetsFit } = J;

  // the cable slot runs towards the back panel; it must stop short of that panel's groove
  const cable = cableSlot(p, planeY - thick / 2 - gap - 1.5, warnings);
  // the lamp seat must stay inside the panel grooves
  const innerSpace = 2 * Math.min(planeX, planeY) - thick - 2 * gap - 2;
  if (num(p, 'lampDiameter') > innerSpace) warnings.push({ key: 'warn.lampTooBig', vars: { max: round(innerSpace) } });

  let topW = panelW;
  let topD = panelD;
  const topRoomX = outerX - 2 * (inset + thick + 2 * gap + WALL);
  const topRoomY = outerY - 2 * (inset + thick + 2 * gap + WALL);
  if (bool(p, 'topPanel') && (topW + 2 * gap > topRoomX || topD + 2 * gap > topRoomY)) {
    topW = Math.min(topW, topRoomX - 2 * gap);
    topD = Math.min(topD, topRoomY - 2 * gap);
  }
  if (bool(p, 'topPanel') && thick + 0.2 + 1.2 > lidThick) warnings.push({ key: 'warn.lidTooThin' });

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

  const bed = num(p, 'bedSize');
  const widest = Math.max(outerX, outerY, power ? Math.max(power.outerX, power.outerY) : 0);
  if (widest > bed) warnings.push({ key: 'warn.bed', vars: { size: round(widest), bed } });

  return {
    outerX, outerY, totalHeight: lidTop, panelW, panelD, panelH, thick, gap, post, engage,
    planeX, planeY, baseTop, panelBottom, panelTop, lidBottom, lidTop, joint,
    socketCx, socketCy, socketTop, socketDepth, plugTop, plugTip, plugDepth, magnetsFit,
    latchCy, latchWidth, cable,
    topW: round(topW), topD: round(topD), power, warnings,
  };
}


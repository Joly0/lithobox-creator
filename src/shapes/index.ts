// Registry of available shapes. Add new shapes here.
import type { ShapeDefinition } from '../core/shape';
import { boxShape } from './box';
import { panelShape } from './panel';
import { cylinderShape } from './cylinder';
import { arcShape } from './arc';
import { polygonShape } from './polygon';
import { shadeShape } from './shade';
import { sphereShape } from './sphere';
import { ornamentShape } from './ornament';
import { heartShape } from './heart';

export const shapes: ShapeDefinition[] = [boxShape, panelShape, cylinderShape, arcShape, polygonShape, shadeShape, sphereShape, ornamentShape, heartShape];

export function getShape(id: string): ShapeDefinition {
  return shapes.find((s) => s.id === id) ?? shapes[0];
}

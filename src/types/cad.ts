export interface Point {
  x: number;
  y: number;
}

export type SnapType =
  | 'endpoint'
  | 'midpoint'
  | 'center'
  | 'quadrant'
  | 'intersection'
  | 'perpendicular'
  | 'dimAlign'
  | 'grid';

export interface SnapPoint {
  point: Point;
  type: SnapType;
  label: string;
  entityId?: string;
  alignGuideLine?: [Point, Point];
}

export type LineType = 'continuous' | 'dashed' | 'center' | 'dotted';

export type RectangleMode = 'corner' | 'center';

export interface CadLayer {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  locked: boolean;
  lineType: LineType;
  lineWeight: number; // in mm, e.g. 0.15, 0.25, 0.35, 0.50
}

export type EntityType =
  | 'line'
  | 'polyline'
  | 'rectangle'
  | 'circle'
  | 'arc'
  | 'polygon'
  | 'dimension'
  | 'text'
  | 'group';

export interface BaseEntity {
  id: string;
  type: EntityType;
  layerId: string;
  color?: string; // undefined = ByLayer
  lineType?: LineType; // undefined = ByLayer
  lineWeight?: number; // undefined = ByLayer
}

export interface LineEntity extends BaseEntity {
  type: 'line';
  p1: Point;
  p2: Point;
}

export interface PolylineEntity extends BaseEntity {
  type: 'polyline';
  points: Point[];
  closed: boolean;
}

export interface RectangleEntity extends BaseEntity {
  type: 'rectangle';
  p1: Point;
  p2: Point;
  rectangleMode?: RectangleMode;
}

export interface CircleEntity extends BaseEntity {
  type: 'circle';
  center: Point;
  radius: number;
}

export interface ArcEntity extends BaseEntity {
  type: 'arc';
  center: Point;
  radius: number;
  startAngle: number; // radians, CCW from startAngle to endAngle
  endAngle: number; // radians
  p1?: Point;
  p2?: Point;
  p3?: Point;
}

export interface PolygonEntity extends BaseEntity {
  type: 'polygon';
  center: Point;
  radius: number;
  sides: number;
  rotation: number; // radians
}

export interface DimensionEntity extends BaseEntity {
  type: 'dimension';
  p1: Point;
  p2: Point;
  offsetPoint: Point;
  textOverride?: string;
  fontSize?: number; // default 11
}

export interface TextEntity extends BaseEntity {
  type: 'text';
  position: Point;
  content: string;
  fontSize: number;
  rotation: number; // degrees
}

export interface GroupEntity extends BaseEntity {
  type: 'group';
  children: CadEntity[];
  name?: string;
}

export type CadEntity =
  | LineEntity
  | PolylineEntity
  | RectangleEntity
  | CircleEntity
  | ArcEntity
  | PolygonEntity
  | DimensionEntity
  | TextEntity
  | GroupEntity;

export type ToolType =
  | 'select'
  | 'pan'
  | 'zoomWindow'
  | 'line'
  | 'polyline'
  | 'rectangle'
  | 'circle'
  | 'arc'
  | 'polygon'
  | 'dimension'
  | 'text'
  | 'measure'
  | 'erase'
  | 'move'
  | 'copy'
  | 'rotate'
  | 'mirror'
  | 'offset'
  | 'trim'
  | 'extend'
  | 'join';

export interface DraftingSettings {
  grid: boolean;
  snap: boolean;
  snapStep: number;
  ortho: boolean;
  polar: boolean;
  polarAngle: number;
  osnap: boolean;
  osnapModes: {
    endpoint: boolean;
    midpoint: boolean;
    center: boolean;
    quadrant: boolean;
    intersection: boolean;
  };
  dynInput: boolean;
  showLineWeight: boolean;
}

export interface CommandLogItem {
  id: string;
  timestamp: string;
  text: string;
  type: 'command' | 'info' | 'error' | 'success';
}

export interface GripHandle {
  entityId: string;
  gripIndex: number;
  point: Point;
  type: 'vertex' | 'midpoint' | 'center' | 'radius';
  label?: string;
}

export interface BlueprintTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  entities: CadEntity[];
}

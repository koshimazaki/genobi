import type { Color, Group } from "three";
export function buildRoom(
  room: Group,
  width: number,
  length: number,
  height: number,
  accentColor: Color,
  darkColor: Color,
  isDry: boolean,
): void;
export function buildOutside(
  room: Group,
  atmosphere: Group,
  theme: (name: string) => Color,
  width: number,
  length: number,
  accentColor: Color,
  darkColor: Color,
  timeOfDay?: string,
): void;
export function buildDualDelay(
  room: Group,
  width: number,
  length: number,
  height: number,
  accentColor: Color,
  darkColor: Color,
): void;

import * as T from "three";
import type { Shape } from "./recipe";
export function geometryFor(shape: Shape) {
  switch (shape) {
    case "box":
      return new T.BoxGeometry(1, 1, 1);
    case "sphere":
      return new T.SphereGeometry(0.65, 32, 24);
    case "cylinder":
      return new T.CylinderGeometry(0.75, 0.75, 0.35, 32);
    case "cone":
      return new T.ConeGeometry(0.7, 1.4, 32);
    case "plane":
      return new T.PlaneGeometry(2, 2);
    case "torus":
      return new T.TorusGeometry(0.65, 0.2, 16, 40);
    case "tetrahedron":
      return new T.TetrahedronGeometry(0.8);
    case "dodecahedron":
      return new T.DodecahedronGeometry(0.8);
  }
}

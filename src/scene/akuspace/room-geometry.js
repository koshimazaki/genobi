/**
 * The original AKUSPACE room, outdoor and dual-delay geometry, split out of
 * RoomScene unchanged. Each builder adds meshes to the groups it is given.
 */
import * as THREE from "three";

export function buildRoom(
  room,
  width,
  length,
  height,
  accentColor,
  darkColor,
  isDry,
) {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length, 12, 12),
    new THREE.MeshStandardMaterial({
      color: darkColor,
      roughness: 0.78,
      metalness: 0.08,
      transparent: true,
      opacity: isDry ? 0.34 : 0.82,
    }),
  );
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);

  const grid = new THREE.GridHelper(
    Math.max(width, length),
    16,
    accentColor,
    darkColor.clone().offsetHSL(0, 0, 0.13),
  );
  grid.material.transparent = true;
  grid.material.opacity = isDry ? 0.06 : 0.16;
  grid.position.y = 0.006;
  room.add(grid);

  const box = new THREE.BoxGeometry(width, height, length);
  const walls = new THREE.Mesh(
    box,
    new THREE.MeshPhysicalMaterial({
      color: accentColor,
      transparent: true,
      opacity: isDry ? 0.025 : 0.085,
      side: THREE.BackSide,
      roughness: 0.24,
      transmission: isDry ? 0 : 0.18,
      depthWrite: false,
    }),
  );
  walls.position.y = height / 2;
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: isDry ? 0.14 : 0.72,
    }),
  );
  edges.position.y = height / 2;
  room.add(walls, edges);
}

export function buildOutside(
  room,
  atmosphere,
  theme,
  width,
  length,
  accentColor,
  darkColor,
  timeOfDay,
) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length, 20, 20),
    new THREE.MeshPhysicalMaterial({
      color: darkColor,
      transparent: true,
      opacity: 0.72,
      roughness: 0.78,
      metalness: 0.04,
    }),
  );
  ground.rotation.x = -Math.PI / 2;
  room.add(ground);

  const grid = new THREE.GridHelper(
    Math.max(width, length),
    20,
    accentColor,
    darkColor,
  );
  grid.material.transparent = true;
  grid.material.opacity = timeOfDay === "night" ? 0.15 : 0.1;
  grid.position.y = 0.006;
  room.add(grid);

  const horizon = new THREE.Mesh(
    new THREE.TorusGeometry(Math.max(width, length) * 0.43, 0.012, 8, 96),
    new THREE.MeshBasicMaterial({
      color: accentColor,
      transparent: true,
      opacity: 0.42,
    }),
  );
  horizon.rotation.x = Math.PI / 2;
  horizon.position.y = 0.04;
  room.add(horizon);

  const count = timeOfDay === "night" ? 74 : 28;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    positions[index * 3] = (Math.random() - 0.5) * width * 1.8;
    positions[index * 3 + 1] = 0.8 + Math.random() * 4.6;
    positions[index * 3 + 2] = (Math.random() - 0.5) * length * 1.2;
  }
  const pointsGeometry = new THREE.BufferGeometry();
  pointsGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3),
  );
  const points = new THREE.Points(
    pointsGeometry,
    new THREE.PointsMaterial({
      color: timeOfDay === "night" ? theme("--soft") : accentColor,
      size: timeOfDay === "night" ? 0.035 : 0.022,
      transparent: true,
      opacity: timeOfDay === "night" ? 0.78 : 0.32,
    }),
  );
  atmosphere.add(points);

  const isNight = timeOfDay === "night";
  const sunRadius = isNight ? 0.22 : 0.5;
  const sunColor = isNight ? theme("--soft") : theme("--accent");
  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(sunRadius, 24, 24),
    new THREE.MeshBasicMaterial({
      color: sunColor,
      transparent: true,
      opacity: isNight ? 0.88 : 1,
      toneMapped: false,
    }),
  );
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(sunRadius * (isNight ? 1.65 : 2.25), 24, 24),
    new THREE.MeshBasicMaterial({
      color: sunColor,
      transparent: true,
      opacity: isNight ? 0.08 : 0.13,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  sun.add(halo);
  sun.position.set(-width * 0.38, 3.8, -length * 0.32);
  atmosphere.add(sun);
}

export function buildDualDelay(
  room,
  width,
  length,
  height,
  accentColor,
  darkColor,
) {
  buildRoom(room, width, length, height, accentColor, darkColor, false);
  const laneMaterial = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
  });
  const echoMaterial = new THREE.MeshBasicMaterial({
    color: accentColor,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });

  [-1, 1].forEach((direction, laneIndex) => {
    const lane = new THREE.Mesh(
      new THREE.BoxGeometry(0.035, 0.035, length * 0.72),
      laneMaterial.clone(),
    );
    lane.position.set(direction * width * 0.2, 0.16 + laneIndex * 0.08, 0);
    room.add(lane);

    for (let echoIndex = 0; echoIndex < 5; echoIndex += 1) {
      const echo = new THREE.Mesh(
        new THREE.TorusGeometry(0.26 + echoIndex * 0.09, 0.012, 8, 48),
        echoMaterial.clone(),
      );
      echo.rotation.x = Math.PI / 2;
      echo.position.set(
        direction * width * 0.2,
        0.18 + laneIndex * 0.08,
        -length * 0.25 + echoIndex * length * 0.125,
      );
      room.add(echo);
    }
  });
  laneMaterial.dispose();
  echoMaterial.dispose();
}

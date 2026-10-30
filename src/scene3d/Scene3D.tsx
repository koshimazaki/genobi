/**
 * The 3D camera panel (#18): pick a scene and one of ten camera plates, set
 * the curve and combo, add gestures, read the radar, and render a playblast
 * into the Director. Mounted by the studio shell into the 3D section.
 */
import { useEffect, useMemo, useState } from "react";
import {
  PLAYBLAST_DEFAULT_SECONDS,
  PLAYBLAST_FORMAT,
  PLAYBLAST_FPS,
  PLAYBLAST_SIZES,
  PLAYBLAST_VERSION,
  playblastFrames,
} from "../../shared/camera-path-playblast";
import { sceneSubject, type SubjectChoice } from "../../shared/scene/subject";
import { CastCredits } from "./CastCredits";
import { creatureMotionReceipt } from "./creature-fbx";
import { CREATURE_SHA256 } from "./creature-file";
import type { CharacterPose } from "../../shared/scene/characters";
import { CreatureFile } from "./CreatureFile";
import { CastPicker } from "./CastPicker";
import { StudioPanel } from "../studio/ShellContext";
import { DEFAULT_RIG, sampleRig, type RigSettings } from "./combo";
import { CurvePicker } from "./CurvePicker";
import { GESTURE_BY_ID, objectPose } from "./gestures";
import { LayerStack } from "./LayerStack";
import { LtxKit } from "./LtxKit";
import { AcousticsReadout } from "./AcousticsReadout";
import { GesturePicker, LOADED, PlatePicker, ScenePicker } from "./Pickers";
import { PLATE_BY_ID, PLATES } from "./plates";
import {
  idleClock,
  pauseClock,
  pickClock,
  playClock,
  rescaleClock,
  seekClock,
  tickClock,
} from "./plate-clock";
import { plateCameraPath, platePose, plateTrace } from "./plate-path";
import { PlayblastControls } from "./PlayblastControls";
import { Radar } from "./Radar";
import { SceneFile, readSceneFile } from "./SceneFile";
import { useProjectScene } from "./useProjectScene";
import { recordWorldScene } from "../studio/world-record";
import { SCENE_BY_ID, SCENES, type SceneSpec } from "./scenes";
import { usePlayblast } from "./usePlayblast";
import { useReducedMotion, useStage } from "./useStage";
import "./scene3d.css";

export default function Scene3D({ active = true }: { active?: boolean }) {
  const reduced = useReducedMotion();
  const [creaturePose, setCreaturePose] = useState<CharacterPose>();
  const [archetype, setArchetype] = useState<SubjectChoice>("saved");
  const [sceneId, setSceneId] = useState(SCENES[0].id);
  // Loaded scenes are kept for this visit only; nothing is persisted.
  const [loaded, setLoaded] = useState<SceneSpec[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The open project's scene (an opened bundle's) joins the loaded scenes.
  useProjectScene(setLoaded);
  const [plateId, setPlateId] = useState(PLATES[0].id);
  const [gestureIds, setGestureIds] = useState<string[]>([]);
  const [seconds, setSeconds] = useState(PLAYBLAST_DEFAULT_SECONDS);
  const [sizeId, setSizeId] = useState<string>(PLAYBLAST_SIZES[0].id);
  const [rigPatch, setRigPatch] = useState<Partial<RigSettings>>({});
  const [clock, setClock] = useState(idleClock);
  const { t, playing } = clock;
  const baseScene =
    loaded.find((s) => `${LOADED}${s.id}` === sceneId) ??
    SCENE_BY_ID[sceneId] ??
    SCENES[0];
  const scene = useMemo(() => {
    const result = sceneSubject(baseScene, archetype);
    return archetype === "creature" && creaturePose
      ? {
          ...result,
          characters: result.characters?.map((c) => ({
            ...c,
            pose: creaturePose,
          })),
        }
      : result;
  }, [baseScene, archetype, creaturePose]);
  const plate = PLATE_BY_ID[plateId];
  const rig = useMemo(
    () => ({ ...DEFAULT_RIG, ...rigPatch, duration: seconds }),
    [rigPatch, seconds],
  );
  const gestures = useMemo(
    () => gestureIds.map((id) => GESTURE_BY_ID[id]),
    [gestureIds],
  );
  const pose = useMemo(
    () => platePose(plate, scene, rig, gestures, t),
    [plate, scene, rig, gestures, t],
  );
  const object = useMemo(
    () => objectPose(gestures, t, scene.scale),
    [gestures, t, scene],
  );
  const trace = useMemo(
    () => plateTrace(plate, scene, rig, gestures),
    [plate, scene, rig, gestures],
  );
  const reading = useMemo(() => sampleRig(plate, rig, t), [plate, rig, t]);
  const radar = useMemo(
    () => ({ trace, t, layers: reading.layers }),
    [trace, t, reading],
  );
  const kitPath = useMemo(
    () =>
      plateCameraPath(plate, scene, rig, gestures, playblastFrames(seconds)),
    [plate, scene, rig, gestures, seconds],
  );
  const { canvas, stage, failed, ready, assetError, retry } = useStage(
    scene,
    pose,
    object,
    t * seconds,
  );
  const blast = usePlayblast();

  // Playback runs the plate once in real time; it never starts on its own
  // under reduced motion, and stops when the section is hidden. Each frame
  // reads the latest clock, so a new pick restarts from zero.
  useEffect(() => {
    if (!active) setClock(pauseClock);
  }, [active]);
  useEffect(() => {
    setClock((c) => rescaleClock(c, performance.now(), seconds));
  }, [seconds]);
  useEffect(() => {
    if (!playing || !active) return;
    let frame = requestAnimationFrame(function tick(now) {
      setClock((c) => tickClock(c, now, seconds));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [playing, active, seconds]);

  function pick(id: string) {
    setPlateId(id);
    setClock(pickClock(performance.now(), reduced));
  }

  function load(file: File) {
    readSceneFile(file).then(
      (spec) => {
        setLoaded((list) => [...list.filter((s) => s.id !== spec.id), spec]);
        recordWorldScene(spec);
        setSceneId(`${LOADED}${spec.id}`);
        setArchetype("saved");
        setLoadError(null);
      },
      (error: unknown) =>
        setLoadError(error instanceof Error ? error.message : String(error)),
    );
  }

  function render() {
    const size = PLAYBLAST_SIZES.find((s) => s.id === sizeId)!;
    const frames = playblastFrames(seconds);
    const blastRig = { ...rig, duration: (frames - 1) / PLAYBLAST_FPS };
    setClock(pauseClock);
    const base = `playblast-${plate.id}-${scene.id}`;
    void blast.run(
      () => {
        if (!stage.current || !ready)
          throw new Error("The 3D view is not ready.");
        return {
          title: `Playblast · ${plate.label}`,
          capture: stage.current.capture(scene, size.width, size.height),
          receipt: {
            format: PLAYBLAST_FORMAT,
            version: PLAYBLAST_VERSION,
            scene: scene.id,
            plate: plate.id,
            gestures: gestureIds,
            ease: rig.ease,
            fps: PLAYBLAST_FPS,
            frames,
            width: size.width,
            height: size.height,
            ...(scene.characters?.some((c) => c.asset === "creature")
              ? {
                  creature: {
                    sha256: CREATURE_SHA256,
                    motions: creatureMotionReceipt(),
                  },
                }
              : {}),
            cameraPath: plateCameraPath(
              plate,
              scene,
              blastRig,
              gestures,
              frames,
            ),
          },
          frame: (i) => ({
            pose: platePose(plate, scene, blastRig, gestures, i / (frames - 1)),
            object: objectPose(gestures, i / (frames - 1), scene.scale),
          }),
        };
      },
      `${base}.mp4`,
      `Playblast · ${plate.label}`,
    );
  }

  return (
    <>
      <StudioPanel id="plateView">
        <div className="s3d-frame">
          <div className="s3d" data-playing={playing || undefined}>
            <div className="s3d-view">
              <div className="s3d-canvas">
                <canvas
                  ref={canvas}
                  role="img"
                  aria-label={`3D camera scene: ${scene.label}, ${plate.label}`}
                  hidden={failed}
                />
                {failed && (
                  <p className="s3d-unavailable">
                    3D preview unavailable in this browser.
                  </p>
                )}
              </div>
              {assetError && (
                <p className="s3d-status" role="alert">
                  {assetError}{" "}
                  <button type="button" onClick={retry}>
                    Retry scene
                  </button>
                </p>
              )}
              <div className="s3d-transport">
                <button
                  type="button"
                  aria-pressed={playing}
                  onClick={() =>
                    setClock((c) =>
                      c.playing
                        ? pauseClock(c)
                        : playClock(c, performance.now(), seconds),
                    )
                  }
                >
                  {playing ? "Pause" : "Play"}
                </button>
                <label>
                  <span className="s3d-visually-hidden">Plate time</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.001}
                    value={t}
                    onChange={(e) =>
                      setClock(seekClock(Number(e.target.value)))
                    }
                  />
                </label>
                <output>{(t * seconds).toFixed(2)} s</output>
              </div>
            </div>
          </div>
        </div>
      </StudioPanel>
      <StudioPanel id="plates">
        <div className="s3d-frame">
          <div className="s3d s3d-controls">
            <div className="s3d-side">
              <details className="s3d-fold" open>
                <summary>Scene & camera movement</summary>
                <div className="s3d-fold-body">
                  <ScenePicker
                    value={sceneId}
                    loaded={loaded}
                    onChange={(id) => {
                      setSceneId(id);
                      setArchetype("saved");
                    }}
                  />
                  <CastPicker
                    value={archetype}
                    onChange={(value) => {
                      try {
                        sceneSubject(baseScene, value);
                        setArchetype(value);
                        setLoadError(null);
                      } catch (cause) {
                        setLoadError(
                          cause instanceof Error
                            ? cause.message
                            : "Subject could not load.",
                        );
                      }
                    }}
                  />
                  <CreatureFile
                    onLoad={(pose) => {
                      setCreaturePose(pose);
                      setArchetype("creature");
                      retry();
                    }}
                  />
                  <SceneFile scene={scene} error={loadError} onFile={load} />
                  <PlatePicker value={plateId} onPick={pick} />
                  <LayerStack
                    plate={plate}
                    layers={reading.layers}
                    rig={rig}
                    onRig={(patch) => setRigPatch((r) => ({ ...r, ...patch }))}
                  />
                  <Radar label={plate.label} input={radar} />
                </div>
              </details>
              <details className="s3d-fold">
                <summary>Curves</summary>
                <div className="s3d-fold-body">
                  <CurvePicker
                    value={rig.ease}
                    onChange={(ease) => setRigPatch((r) => ({ ...r, ease }))}
                  />
                </div>
              </details>
              <details className="s3d-fold">
                <summary>Gestures</summary>
                <div className="s3d-fold-body">
                  <GesturePicker
                    value={gestureIds}
                    onToggle={(id) =>
                      setGestureIds((ids) =>
                        ids.includes(id)
                          ? ids.filter((g) => g !== id)
                          : [...ids, id],
                      )
                    }
                  />
                </div>
              </details>
              <details className="s3d-fold">
                <summary>Room acoustics</summary>
                <div className="s3d-fold-body">
                  <AcousticsReadout scene={scene} />
                </div>
              </details>
              <PlayblastControls
                ready={ready}
                seconds={seconds}
                size={sizeId}
                state={blast.state}
                fileBase={`playblast-${plate.id}-${scene.id}`}
                onSeconds={setSeconds}
                onSize={setSizeId}
                onRender={render}
                onCancel={blast.cancel}
              />
              <CastCredits scene={scene} />
              <LtxKit
                scene={scene}
                ready={ready}
                capture={() => {
                  if (!stage.current || !ready)
                    throw new Error("The scene is not ready.");
                  return stage.current.capture(scene, 1280, 704);
                }}
                pose={platePose(plate, scene, rig, gestures, 0)}
                object={objectPose(gestures, 0, scene.scale)}
                cameraPath={kitPath}
                camera={plate.summary}
                duration={seconds}
              />
            </div>
          </div>
        </div>
      </StudioPanel>
    </>
  );
}

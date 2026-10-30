import * as T from "three";
import { VRMSpringBoneJoint, VRMSpringBoneManager } from "@pixiv/three-vrm";
import { expect, it } from "vitest";
import { springSampler } from "../src/scene3d/creature-springs";
it("secondary motion is independent and repeatable after backwards seeks", () => {
  function actor() {
    const model = new T.Group(),
      joint = new T.Bone(),
      tail = new T.Bone();
    joint.position.y = 1;
    tail.position.y = 0.5;
    joint.add(tail);
    model.add(joint);
    const springs = new VRMSpringBoneManager();
    springs.addJoint(
      new VRMSpringBoneJoint(joint, tail, {
        stiffness: 1,
        dragForce: 0.3,
        gravityPower: 0.4,
        gravityDir: new T.Vector3(1, -1, 0).normalize(),
      }),
    );
    const sampler = springSampler(model, springs, (time) => {
      model.position.x = Math.sin(time * 3) * 0.2;
    });
    return { model, joint, ...sampler };
  }
  const a = actor(),
    b = actor();
  a.sample(0);
  b.sample(0);
  const rest = a.joint.quaternion.toArray();
  a.sample(0.7);
  expect(a.joint.quaternion.toArray()).not.toEqual(rest);
  expect(b.joint.quaternion.toArray()).toEqual(rest);
  b.sample(0.7);
  expect(a.joint.quaternion.toArray()).toEqual(b.joint.quaternion.toArray());
  a.sample(1.4);
  a.sample(0.7);
  expect(a.joint.quaternion.toArray()).toEqual(b.joint.quaternion.toArray());
});

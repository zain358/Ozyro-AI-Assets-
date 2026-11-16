import { DataTexture, FloatType, Matrix4, Quaternion, RGBAFormat, Vector3 } from 'three';

const _v1 = new Vector3();
const _v2 = new Vector3();
const _v3 = new Vector3();
const _q1 = new Quaternion();
const _m1 = new Matrix4();
const _m2 = new Matrix4();

export class WiggleJoint {
  index: number;
  parent: WiggleJoint | null = null;
  children: WiggleJoint[] = [];
  primaryChild: WiggleJoint | null = null;
  worldPosition = new Vector3();
  previousWorldPosition = new Vector3();
  worldQuaternion = new Quaternion();
  force = new Vector3();
  localRestMatrix = new Matrix4();
  strictWorldMatrix = new Matrix4();
  strictWorldQuaternion = new Quaternion();
  inverseBindMatrix = new Matrix4();
  localAnimatedQuaternion = new Quaternion();
  boneLength = 0;
  restDirection = new Vector3();
  mass = 1;
  stiffnessMultiplier = 1;
  dampingMultiplier = 1;

  constructor(index: number) {
    this.index = index;
  }

  applyForce(force: Vector3): void {
    this.force.add(force);
  }
}

export class WiggleSystem {
  jointCount: number;
  joints: WiggleJoint[] = [];
  stiffness = 150;
  damping = 10;
  positions: Float32Array;
  quaternions: Float32Array;
  boneMatrices: Float32Array;
  dataTexture: DataTexture;

  constructor(jointPositions: ArrayLike<number>, bones: number[][]) {
    this.jointCount = jointPositions.length / 3;
    this.positions = new Float32Array(this.jointCount * 3);
    this.quaternions = new Float32Array(this.jointCount * 4);
    this.boneMatrices = new Float32Array(this.jointCount * 16);
    this.dataTexture = new DataTexture(this.boneMatrices, 4, this.jointCount, RGBAFormat, FloatType);
    this._initializeJoints(jointPositions, bones);
  }

  private _initializeJoints(jointPositions: ArrayLike<number>, bones: number[][]): void {
    for (let i = 0; i < this.jointCount; i++) {
      const joint = new WiggleJoint(i);
      joint.worldPosition.set(
        jointPositions[i * 3],
        jointPositions[i * 3 + 1],
        jointPositions[i * 3 + 2],
      );
      joint.previousWorldPosition.copy(joint.worldPosition);
      this.joints.push(joint);
    }
    for (const chain of bones) {
      for (let i = 0; i < chain.length - 1; i++) {
        const parent = this.joints[chain[i]];
        const child = this.joints[chain[i + 1]];
        if (parent.children.length === 0) parent.primaryChild = child;
        if (!parent.children.includes(child)) {
          parent.children.push(child);
          child.parent = parent;
        }
      }
    }
    for (let i = 0; i < this.jointCount; i++) {
      const joint = this.joints[i];
      joint.worldQuaternion.identity();
      joint.strictWorldQuaternion.identity();
      joint.strictWorldMatrix.compose(joint.worldPosition, joint.worldQuaternion, _v1.set(1, 1, 1));
      joint.inverseBindMatrix.copy(joint.strictWorldMatrix).invert();
      if (joint.parent) {
        _m1.copy(joint.parent.strictWorldMatrix).invert();
        joint.localRestMatrix.multiplyMatrices(_m1, joint.strictWorldMatrix);
        _v1.copy(joint.worldPosition).sub(joint.parent.worldPosition);
        joint.boneLength = _v1.length();
        if (joint.boneLength > 1e-4) joint.restDirection.copy(_v1).normalize();
      }
    }
  }

  setRootTransform(position: Vector3, quaternion: Quaternion): void {
    const root = this.joints[0];
    root.worldPosition.copy(position);
    root.worldQuaternion.copy(quaternion);
    root.strictWorldQuaternion.copy(quaternion);
    root.strictWorldMatrix.compose(position, quaternion, _v1.set(1, 1, 1));
  }

  update(dt: number, steps = 3): void {
    if (dt <= 0) return;
    const stepDt = dt / steps;
    for (let i = 0; i < steps; i++) this._stepPhysics(stepDt);
    this._updateOutputs();
  }

  private _stepPhysics(dt: number): void {
    for (let i = 1; i < this.jointCount; i++) {
      const joint = this.joints[i];
      const parent = joint.parent;
      if (joint.parent) {
        _m1.makeRotationFromQuaternion(joint.localAnimatedQuaternion);
        _m2.multiplyMatrices(joint.localRestMatrix, _m1);
        joint.strictWorldMatrix.multiplyMatrices(parent!.strictWorldMatrix, _m2);
        joint.strictWorldQuaternion.setFromRotationMatrix(joint.strictWorldMatrix);
      }
    }
    for (let i = 1; i < this.jointCount; i++) {
      const joint = this.joints[i];
      const parent = joint.parent;
      if (!parent) continue;
      _v2.setFromMatrixPosition(joint.strictWorldMatrix);
      _v1.copy(_v2).sub(joint.worldPosition);
      const stiffness = this.stiffness * joint.stiffnessMultiplier;
      _v1.multiplyScalar(stiffness * dt);
      _v3.copy(joint.worldPosition).sub(joint.previousWorldPosition);
      const damping = this.damping * joint.dampingMultiplier;
      _v3.multiplyScalar(Math.max(1 - damping * dt, 0));
      _v3.add(_v1);
      _v2.copy(joint.force).multiplyScalar((dt * dt) / joint.mass);
      _v3.add(_v2);
      joint.previousWorldPosition.copy(joint.worldPosition);
      joint.worldPosition.add(_v3);
      joint.force.set(0, 0, 0);
      _v1.copy(joint.worldPosition).sub(parent.worldPosition);
      const length = _v1.length();
      if (length > 1e-4) {
        _v1.multiplyScalar(joint.boneLength / length);
      } else {
        _v1.set(0, -joint.boneLength, 0);
      }
      joint.worldPosition.copy(parent.worldPosition).add(_v1);
    }
    for (let i = 0; i < this.jointCount; i++) {
      const joint = this.joints[i];
      if (i !== 0 && joint.parent) {
        _v1.copy(joint.restDirection).applyQuaternion(joint.parent.strictWorldQuaternion);
        _v2.copy(joint.worldPosition).sub(joint.parent.worldPosition).normalize();
        _q1.setFromUnitVectors(_v1, _v2);
        joint.worldQuaternion.copy(joint.strictWorldQuaternion).premultiply(_q1);
      }
    }
  }

  private _updateOutputs(): void {
    for (let i = 0; i < this.jointCount; i++) {
      const joint = this.joints[i];
      this.positions[i * 3] = joint.worldPosition.x;
      this.positions[i * 3 + 1] = joint.worldPosition.y;
      this.positions[i * 3 + 2] = joint.worldPosition.z;
      this.quaternions[i * 4] = joint.worldQuaternion.x;
      this.quaternions[i * 4 + 1] = joint.worldQuaternion.y;
      this.quaternions[i * 4 + 2] = joint.worldQuaternion.z;
      this.quaternions[i * 4 + 3] = joint.worldQuaternion.w;
      _m1.compose(joint.worldPosition, joint.worldQuaternion, _v1.set(1, 1, 1));
      _m2.multiplyMatrices(_m1, joint.inverseBindMatrix);
      _m2.toArray(this.boneMatrices, i * 16);
    }
    this.dataTexture.needsUpdate = true;
  }
}
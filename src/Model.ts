import { mat4, quat, vec3 } from "gl-matrix"

export type GpuBufferView = {
    buff: GPUBuffer, //base buffer
    offset: number, //byte offset
    size: number, //byte size
}

export const MODELTYPE: {
    ENV_MAPPED: 0,
    GENERAL: 1,
    ENV_DEBUG: 2,
} = {
    ENV_MAPPED: 0,
    GENERAL: 1,
    ENV_DEBUG: 2,
}

export type ModelType = 0 | 1 | 2;
// export type ModelType = {
//     ENV_MAPPED: 0,
//     GENERAL: 1,
//     ENV_DEBUG: 2,
// }

export default class Model {
    public offset: vec3;
    public rotation: vec3;
    public scale: vec3;
    public constructor(
        private readonly device: GPUDevice,
        public readonly indices: GpuBufferView, 
        public readonly vertices: GpuBufferView, 
        public readonly uniform: GpuBufferView,
        public readonly binds: GPUBindGroup[],
        public readonly shader: ModelType,
    ){
        this.offset = [0,0,0];
        this.rotation = [0,0,0];
        this.scale = [1,1,1];
    }

    public update_uniform() {
        this.device.queue.writeBuffer(this.uniform.buff, this.uniform.offset, new Float32Array(this.model_matrix()), 0);
    }

    private model_matrix(): mat4 {
        let mat = mat4.create();
        let q = quat.create();
        quat.fromEuler(q, this.rotation[0], this.rotation[1], this.rotation[2]);
        return mat4.fromRotationTranslationScale(mat, q, this.offset, this.scale);
    }
}
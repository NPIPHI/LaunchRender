import { mat4, quat, vec3 } from "gl-matrix"
import { RenderPipeline } from "./RenderPass";

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
        public readonly shader: RenderPipeline,
        public readonly indices: GpuBufferView, 
        public readonly vertices: GpuBufferView, 
        public readonly uniform: GpuBufferView,
        public readonly binds: GPUBindGroup[],
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

export class BasicModel extends Model {
    constructor(
        device: GPUDevice,
        pipeline: RenderPipeline,
        indices: GpuBufferView, 
        vertices: GpuBufferView, 
        uniform: GpuBufferView,
        diffuse: GPUTexture,
        ){
            const binds = [device.createBindGroup({
                    layout: pipeline.getBindGroup(1),
                    entries: [
                        { 
                            binding: 2,
                            resource: {
                                buffer: uniform.buff,
                                offset: uniform.offset,
                                size: uniform.size
                            }
                        },
                        {
                            binding: 3, 
                            resource: diffuse.createView()
                        }
                    ]
                })];
            super(device, pipeline, indices, vertices, uniform, binds);
        }
}


export class EnvDebugModel extends Model {
    constructor(
        device: GPUDevice,
        pipeline: RenderPipeline,
        indices: GpuBufferView, 
        vertices: GpuBufferView, 
        uniform: GpuBufferView,
        public env_map: GPUTexture,
        ){
            const binds = [device.createBindGroup({
                    layout: pipeline.getBindGroup(1),
                    entries: [
                        { 
                            binding: 2,
                            resource: env_map.createView({dimension: "cube"})
                        },
                    ]
                })];
            super(device, pipeline, indices, vertices, uniform, binds);
        }
}


export class EnvModel extends Model {
    public readonly env_map: GPUTexture;
    public readonly env_depth: GPUTexture;
    constructor(
        device: GPUDevice,
        pipeline: RenderPipeline,
        indices: GpuBufferView, 
        vertices: GpuBufferView, 
        uniform: GpuBufferView,
        diffuse: GPUTexture){
            const env = device.createTexture({
                size: [512,512,6],
                format: "rgba8unorm",
                usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
            });
            const binds = [device.createBindGroup({
                layout: pipeline.getBindGroup(1),
                entries: [
                    {
                        binding: 2,
                        resource: env.createView({dimension: "cube"})
                    },
                    { 
                        binding: 3,
                        resource: {
                            buffer: uniform.buff,
                            offset: uniform.offset,
                            size: uniform.size
                        }
                    },
                    {
                        binding: 4, 
                        resource: diffuse.createView()
                    }
                ]
            })];
            super(device, pipeline, indices, vertices, uniform, binds);
            this.env_map = env;
            this.env_depth = device.createTexture({
                size: [512,512,6],
                format: "depth32float",
                usage: GPUTextureUsage.RENDER_ATTACHMENT
            })
        }
}
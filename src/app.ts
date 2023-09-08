import { mat4, quat, vec3 } from "gl-matrix";
import { Camera } from "./Camera";
import { RenderPipeline, Vertexformats } from "./RenderPass";
import env_mapped_src from "./shaders/env_mapped.wgsl";
import env_debug_src from "./shaders/env_debug.wgsl";
import general_src from "./shaders/general.wgsl";
import Model, { BasicModel, EnvDebugModel, EnvModel, MODELTYPE, ModelType } from "./Model";
import { LoadFile } from "./Loader";

const B = GPUBufferUsage;
const T = GPUTextureUsage;

export class App {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private ctx: GPUCanvasContext;
    
    private sampler: GPUSampler;
    private pipelines: RenderPipeline[];

    private settings_uniform: GPUBuffer;
    private depth_buffer: GPUTexture;

    private models: Model[];

    private width: number;
    private height: number;

    constructor(canvas: HTMLCanvasElement, device: GPUDevice) {
        this.device = device;
        this.canvas = canvas;
        this.width = this.canvas.width = this.canvas.clientWidth;
        this.height = this.canvas.height = this.canvas.clientHeight;
        this.ctx = canvas.getContext("webgpu");
        this.models = [];
        const canvas_format = "rgba8unorm";
        this.ctx.configure({
            device: this.device,
            format: canvas_format,
            alphaMode: "premultiplied"
        });

        this.pipelines = [];
        this.pipelines[MODELTYPE.ENV_MAPPED] = new RenderPipeline(this.device, env_mapped_src, {
            targets: [{format: canvas_format}],
            vertex_layout: Vertexformats.V3DFULL,
            cullMode: "back"
        }, "env mapped");

        this.pipelines[MODELTYPE.ENV_DEBUG] = new RenderPipeline(this.device, env_debug_src, {
            targets: [{format: canvas_format}],
            vertex_layout: Vertexformats.V3DFULL
        }, "env debug");

        this.pipelines[MODELTYPE.GENERAL] = new RenderPipeline(this.device, general_src, {
            targets: [{format: canvas_format}],
            vertex_layout: Vertexformats.V3DFULL
        }, "general");

        this.make_buffers();
        this.make_bindgroups();
    }

    private make_bindgroups(){
        this.sampler = this.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge",
            mipmapFilter: "linear"
        })


        // this.bind_groups = new Map(this.pipelines.map(p=>{
        //     const primary = this.device.createBindGroup({
        //         layout: p.getBindGroup(0),
        //         entries: [
        //             {
        //                 binding: 0,
        //                 resource: {
        //                     buffer: this.settings_uniform,
        //                     offset: 0,
        //                     size: 256
        //                 }
        //             },
        //             {
        //                 binding: 1,
        //                 resource: this.sampler
        //             },
        //         ]
        //     });

        //     const env_maps = new Array(6).fill(0).map((_,i)=>this.device.createBindGroup({
        //         layout: p.getBindGroup(0),
        //         entries: [
        //             {
        //                 binding: 0,
        //                 resource: {
        //                     buffer: this.settings_uniform,
        //                     offset: i * 256 + 256,
        //                     size: 256
        //                 }
        //             },
        //             {
        //                 binding: 1,
        //                 resource: this.sampler
        //             }
        //         ]
        //     }));

        //     return [p, {primary, env_maps}];
        // }));
    }

    

    private make_buffers(){
        this.settings_uniform = this.alloc_buffer(256*256, B.COPY_DST | B.UNIFORM);
      
        this.depth_buffer = this.device.createTexture({
            size: [this.width, this.height],
            format: "depth32float",
            usage: T.RENDER_ATTACHMENT,
        })
    }

    private buffer(data: ArrayBuffer, usage: number){
        const buff = this.device.createBuffer({
            size: data.byteLength,
            usage: usage | B.COPY_DST,
        });

        this.device.queue.writeBuffer(buff, 0, data);
        return buff;
    }

    private alloc_buffer(size: number, usage: number) {
        return this.device.createBuffer({size,usage});
    }

    add_model(model: Model) {
        this.models.push(model);
    }

    async load_model(path: string, type: ModelType): Promise<Model> {
        let {indices, vertices, diffuse} = await LoadFile(path);
        
        let uniform_off = Math.ceil((vertices.byteLength + indices.byteLength)/256)*256;
        let uniform_size = 256;

        let gpu_buff = this.alloc_buffer(uniform_off + uniform_size, B.INDEX | B.VERTEX | B.UNIFORM | B.COPY_DST);
        this.device.queue.writeBuffer(gpu_buff, 0, vertices);
        this.device.queue.writeBuffer(gpu_buff, vertices.byteLength, indices);


        let index_view = {buff: gpu_buff, offset: vertices.byteLength, size: indices.byteLength};
        let vertex_view = {buff: gpu_buff, offset: 0, size: vertices.byteLength};
        let uniform_view = {buff: gpu_buff, offset: uniform_off, size: uniform_size};
        let tex = this.texture(diffuse);

        if(type == MODELTYPE.GENERAL){
            return new BasicModel(this.device, this.pipelines[type], index_view, vertex_view, uniform_view, tex);
        } else if(type == MODELTYPE.ENV_MAPPED){
            return new EnvModel(this.device, this.pipelines[type], index_view, vertex_view, uniform_view, tex);
        }
    }

    private texture(img: ImageBitmap): GPUTexture {
        if(img == null){
            return this.device.createTexture({
                size: [2,2],
                usage: T.TEXTURE_BINDING,
                format: "rgba8unorm"
            });
        }
        let tex = this.device.createTexture({
            size: [img.width, img.height],
            usage: T.COPY_DST | T.RENDER_ATTACHMENT | T.TEXTURE_BINDING,
            format: "rgba8unorm"
        });

        this.device.queue.copyExternalImageToTexture({source: img}, {texture: tex}, [img.width, img.height]);

        return tex;
    }

    set_camera(camera: Camera){
        const mvp = mat4.create();
        const perspective = mat4.create();
        mat4.perspective(perspective, Math.PI/2, this.width/this.height, 0.001, Infinity);
        mat4.multiply(mvp, perspective, camera.view());
        
        this.device.queue.writeBuffer(this.settings_uniform, 0, new Float32Array([...mvp,...camera.get_pos()]));
    }

    private env_map_settings(model: Model, side: number): Float32Array {
        const camera_rot_table = [
            [0,90,180],
            [0,-90,180],
            [-90,0,180],
            [90,0,180],
            [0,180,0],
            [0,0,0],
        ]

        const camera_flip_table: vec3[] = [
            [1,-1,1],
            [1,-1,1],
            [-1,1,1],
            [-1,1,1],
            [-1,1,1],
            [-1,1,1],
        ]

        const mvp = mat4.create();
        const cam = mat4.create();
        const off = vec3.create();
        vec3.multiply(off, model.offset, [-1,-1,-1]);
        const q = quat.create();
        const r = camera_rot_table[side];
        quat.fromEuler(q, r[0], r[1], r[2]);
        mat4.fromRotationTranslation(cam, q, [0,0,0]);
        mat4.scale(cam, cam, camera_flip_table[side]);
        mat4.translate(cam, cam, off);
        const perspective = mat4.create();
        mat4.perspective(perspective, Math.PI/2, 1, 0.001, Infinity);
        mat4.multiply(mvp, perspective, cam);

        return new Float32Array([...mvp,...model.offset]);
    }

    private env_uniform(pipeline: RenderPipeline, uniform_offset: number) {
        return this.device.createBindGroup({
            layout: pipeline.getBindGroup(0),
            entries: [
                {
                    binding: 0,
                    resource: {
                        buffer: this.settings_uniform,
                        offset: uniform_offset,
                        size: 256
                    }
                },
                {
                    binding: 1,
                    resource: this.sampler
                }
            ]
        });
    }

    draw() {
        const encoder = this.device.createCommandEncoder();

        let uniform_idx = 1;
        this.models.forEach(m=>{
            if(!(m instanceof EnvModel)){
                return;
            }
            for(let side = 0; side < 6; side++){
                const pass = encoder.beginRenderPass({
                    colorAttachments: [
                        {
                            view: m.env_map.createView({
                                dimension: "2d",
                                baseArrayLayer: side,
                                arrayLayerCount: 1,
                                format: "rgba8unorm"
                            }),
                            clearValue: [0.2,0.2,0.2,1],
                            loadOp: "clear",
                            storeOp: "store",
                        }
                    ],
                    depthStencilAttachment: {
                        view: m.env_depth.createView({
                            dimension: "2d", 
                            baseArrayLayer: side, 
                            arrayLayerCount: 1
                        }),
                        depthClearValue: 1.0,
                        depthLoadOp: "clear",
                        depthStoreOp: "discard"
                    }
                });

                this.device.queue.writeBuffer(this.settings_uniform, 256 + 256 * uniform_idx, this.env_map_settings(m, side));
    
                this.models.filter(m=>m instanceof BasicModel).forEach(m=>{
                    m.update_uniform();
                    pass.setPipeline(m.shader.getPipeline());
                    pass.setBindGroup(0, this.env_uniform(m.shader, 256 + 256 * uniform_idx));
                    m.binds.forEach((b,i)=>pass.setBindGroup(i+1,b));
                    pass.setVertexBuffer(0, m.vertices.buff, m.vertices.offset, m.vertices.size);
                    pass.setIndexBuffer(m.indices.buff,"uint32", m.indices.offset, m.indices.size);
                    pass.drawIndexed(m.indices.size / 4);
                })
                pass.end();
                uniform_idx++;
            }
        })

        const pass1 = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.ctx.getCurrentTexture().createView(),
                    clearValue: [0.2,0.2,0.2,1],
                    loadOp: "clear",
                    storeOp: "store",
                }
            ],


            depthStencilAttachment: {
                view: this.depth_buffer.createView(),
                depthClearValue: 1.0,
                depthLoadOp: "clear",
                depthStoreOp: "discard"
            }
        })

        this.models.forEach(m=>{
            m.update_uniform();
            pass1.setPipeline(m.shader.getPipeline());
            pass1.setBindGroup(0, this.env_uniform(m.shader, 0));
            m.binds.forEach((b,i)=>pass1.setBindGroup(i+1,b));
            pass1.setVertexBuffer(0, m.vertices.buff, m.vertices.offset, m.vertices.size);
            pass1.setIndexBuffer(m.indices.buff,"uint32", m.indices.offset, m.indices.size);
            pass1.drawIndexed(m.indices.size / 4);
        })

        pass1.end();

        this.device.queue.submit([encoder.finish()]);
    }
}
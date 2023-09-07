import { mat4, quat, vec3 } from "gl-matrix";
import { Camera } from "./Camera";
import { RenderPipeline, Vertexformats } from "./RenderPass";
import env_mapped_src from "./shaders/env_mapped.wgsl";
import env_debug_src from "./shaders/env_debug.wgsl";
import general_src from "./shaders/general.wgsl";
import Model, { MODELTYPE, ModelType } from "./Model";
import { LoadFile } from "./Loader";

const B = GPUBufferUsage;
const T = GPUTextureUsage;

export class App {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private ctx: GPUCanvasContext;
    
    private pipelines: RenderPipeline[];
    private bind_groups: {primary: GPUBindGroup, env_maps: GPUBindGroup[]}[];
    
    private settings_uniform: GPUBuffer;
    private depth_buffer: GPUTexture;
    private env_depth_buffers: GPUTexture;

    private models: Model[];
    private environment_map: GPUTexture;

    private width: number;
    private height: number;

    constructor(canvas: HTMLCanvasElement, device: GPUDevice) {
        this.device = device;
        this.canvas = canvas;
        this.width = this.canvas.width = this.canvas.clientWidth;
        this.height = this.canvas.height = this.canvas.clientHeight;
        // this.width = this.canvas.width = 512;
        // this.height = this.canvas.height = 512;
        this.ctx = canvas.getContext("webgpu");
        this.models = [];
        // const canvas_format = navigator.gpu.getPreferredCanvasFormat();
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
        }, "env mapped pipeline");

        this.pipelines[MODELTYPE.ENV_DEBUG] = new RenderPipeline(this.device, env_debug_src, {
            targets: [{format: canvas_format}],
            vertex_layout: Vertexformats.V3DFULL
        }, "env pipeline");

        this.pipelines[MODELTYPE.GENERAL] = new RenderPipeline(this.device, general_src, {
            targets: [{format: canvas_format}],
            vertex_layout: Vertexformats.V3DFULL
        }, "general pipeline");

        this.make_buffers();
        this.make_bindgroups();
    }

    private make_bindgroups(){
        let sampler = this.device.createSampler({
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
            addressModeW: "clamp-to-edge",
            mipmapFilter: "linear"
        })


        this.bind_groups = this.pipelines.map(p=>{
            const primary = this.device.createBindGroup({
                layout: p.getBindGroup(0),
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.settings_uniform,
                            offset: 0,
                            size: 256
                        }
                    },
                    {
                        binding: 1,
                        resource: sampler
                    },
                ]
            });

            const env_maps = new Array(6).fill(0).map((_,i)=>this.device.createBindGroup({
                layout: p.getBindGroup(0),
                entries: [
                    {
                        binding: 0,
                        resource: {
                            buffer: this.settings_uniform,
                            offset: i * 256 + 256,
                            size: 256
                        }
                    },
                    {
                        binding: 1,
                        resource: sampler
                    }
                ]
            }));

            return {primary, env_maps};
        });
    }

    

    private make_buffers(){
        this.settings_uniform = this.alloc_buffer(256*256, B.COPY_DST | B.UNIFORM);
        this.environment_map = this.device.createTexture({
            size: [512,512,6],
            format: "rgba8unorm",
            usage: T.TEXTURE_BINDING | T.COPY_DST | T.RENDER_ATTACHMENT
        });
        this.env_depth_buffers = this.device.createTexture({
            size: [512,512,6],
            format: "depth32float",
            usage: T.RENDER_ATTACHMENT
        });
        let data = new Uint8Array(512*512*6*4);
        for(let i = 0; i < 512*512*6*4; i+=4){
            let x = (i/4) % 512 / 512;
            let y = ((i/5/512) | 0)%512 / 512;
            data[i] = 40 * ((i / (512*512*4)) | 0);
            data[i+1] = Math.sin(y*6)*255;
            data[i+2] = Math.cos(x*6) * 255;
        }
        this.device.queue.writeTexture({texture: this.environment_map}, data, {offset: 0, bytesPerRow: 2048, rowsPerImage: 512}, [512,512,6]);
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

        let binds;
        switch(type){
            case MODELTYPE.ENV_MAPPED:
                binds = [this.device.createBindGroup({
                    layout: this.pipelines[type].getBindGroup(1),
                    entries: [
                        {
                            binding: 2,
                            resource: this.environment_map.createView({dimension: "cube"})
                        },
                        { 
                            binding: 3,
                            resource: {
                                buffer: gpu_buff,
                                offset: uniform_view.offset,
                                size: uniform_view.size
                            }
                        },
                        {
                            binding: 4, 
                            resource: tex.createView()
                        }
                    ]
                })];
            break;
            case MODELTYPE.GENERAL:
                binds = [this.device.createBindGroup({
                    layout: this.pipelines[type].getBindGroup(1),
                    entries: [
                        { 
                            binding: 2,
                            resource: {
                                buffer: gpu_buff,
                                offset: uniform_view.offset,
                                size: uniform_view.size
                            }
                        },
                        {
                            binding: 3, 
                            resource: tex.createView()
                        }
                    ]
                })];
            break;
            case MODELTYPE.ENV_DEBUG:
                binds = [this.device.createBindGroup({
                    layout: this.pipelines[type].getBindGroup(1),
                    entries: [
                        {
                            binding: 2,
                            resource: this.environment_map.createView({dimension: "cube"})
                        },
                    ]
                })];
            break;
        }

        

        return new Model(this.device, index_view, vertex_view, uniform_view, binds, type);
    }

    private texture(img: ImageBitmap): GPUTexture {
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

    draw() {
        const encoder = this.device.createCommandEncoder();

        this.models.filter(m=>m.shader == MODELTYPE.ENV_MAPPED).forEach(m=>{
            for(let side = 0; side < 6; side++){
                const pass = encoder.beginRenderPass({
                    colorAttachments: [
                        {
                            view: this.environment_map.createView({
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
                        view: this.env_depth_buffers.createView({
                            dimension: "2d", 
                            baseArrayLayer: side, 
                            arrayLayerCount: 1
                        }),
                        depthClearValue: 1.0,
                        depthLoadOp: "clear",
                        depthStoreOp: "discard"
                    }
                });


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
                vec3.multiply(off, m.offset, [-1,-1,-1]);
                const q = quat.create();
                const r = camera_rot_table[side];
                quat.fromEuler(q, r[0], r[1], r[2]);
                mat4.fromRotationTranslation(cam, q, [0,0,0]);
                mat4.scale(cam, cam, camera_flip_table[side]);
                mat4.translate(cam, cam, off);
                const perspective = mat4.create();
                mat4.perspective(perspective, Math.PI/2, 1, 0.001, Infinity);
                mat4.multiply(mvp, perspective, cam);

                this.device.queue.writeBuffer(this.settings_uniform, 256 + 256 * side, new Float32Array([...mvp,...m.offset]));
    
                this.models.filter(m=>m.shader == MODELTYPE.GENERAL).forEach(m=>{
                    m.update_uniform();
                    pass.setPipeline(this.pipelines[m.shader].getPipeline());
                    pass.setBindGroup(0, this.bind_groups[m.shader].env_maps[side]);
                    m.binds.forEach((b,i)=>pass.setBindGroup(i+1,b));
                    pass.setVertexBuffer(0, m.vertices.buff, m.vertices.offset, m.vertices.size);
                    pass.setIndexBuffer(m.indices.buff,"uint32", m.indices.offset, m.indices.size);
                    pass.drawIndexed(m.indices.size / 4);
                })
                pass.end();
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
            pass1.setPipeline(this.pipelines[m.shader].getPipeline());
            pass1.setBindGroup(0, this.bind_groups[m.shader].primary);
            m.binds.forEach((b,i)=>pass1.setBindGroup(i+1,b));
            pass1.setVertexBuffer(0, m.vertices.buff, m.vertices.offset, m.vertices.size);
            pass1.setIndexBuffer(m.indices.buff,"uint32", m.indices.offset, m.indices.size);
            pass1.drawIndexed(m.indices.size / 4);
        })

        pass1.end();

        this.device.queue.submit([encoder.finish()]);
    }
}
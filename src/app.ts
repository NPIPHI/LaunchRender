import { mat4, quat, vec3 } from "gl-matrix";
import { Camera } from "./Camera";
import { ComputePipeline, RenderPipeline, Vertexformats } from "./RenderPass";
import env_mapped_src from "./shaders/env_mapped.wgsl";
import skybox_src from "./shaders/skybox.wgsl";
import general_src from "./shaders/general.wgsl";
import post_src from "./shaders/post.wgsl";
import optical_depth_src from "./shaders/optical_depth.wgsl";
import blur_src from "./shaders/blur.wgsl";
import Model, { BasicModel, EnvModel, MODELTYPE, ModelType, SkyBoxModel } from "./Model";
import { LoadFile } from "./Loader";
import { HDR_FORMAT } from "./HDR";

const B = GPUBufferUsage;
const T = GPUTextureUsage;

export class App {
    private device: GPUDevice;
    private canvas: HTMLCanvasElement;
    private ctx: GPUCanvasContext;
    
    private sampler: GPUSampler;
    private pipelines: RenderPipeline[];
    private optical_depth_pipeline: ComputePipeline;
    private blur_pipeline1: ComputePipeline;
    private blur_pipeline2: ComputePipeline;
    private post_pipeline: RenderPipeline;

    private settings_uniform: GPUBuffer;
    private depth_buffer: GPUTexture;
    private optiacl_depth_tex: GPUTexture;
    private hdr_buffer: GPUTexture;
    private blur_tex1: GPUTexture;
    private blur_tex2: GPUTexture;
    private post_bind: GPUBindGroup;
    private blur_bind1: GPUBindGroup;
    private blur_bind2: GPUBindGroup;
    private env_uniform_cache: Map<RenderPipeline, GPUBindGroup[]>;
    private optical_depth_lookup_size = [512,8192];

    private models: Model[];

    private img_width: number;
    private img_height: number;
    private height: number;

    constructor(canvas: HTMLCanvasElement, device: GPUDevice) {
        this.device = device;
        this.canvas = canvas;
        this.img_width = this.canvas.width = this.canvas.clientWidth;
        this.img_height = this.canvas.height = this.canvas.clientHeight;
        this.height = 0;
        this.ctx = canvas.getContext("webgpu");
        this.models = [];
        const canvas_format = navigator.gpu.getPreferredCanvasFormat();
        this.ctx.configure({
            device: this.device,
            format: canvas_format,
            alphaMode: "premultiplied"
        });

        this.pipelines = [];
        this.pipelines[MODELTYPE.ENV_MAPPED] = new RenderPipeline(this.device, env_mapped_src, {
            targets: [{format: HDR_FORMAT}],
            vertex_layout: Vertexformats.V3DFULL,
            cullMode: "back"
        }, "env mapped");

        this.pipelines[MODELTYPE.SKYBOX] = new RenderPipeline(this.device, skybox_src, {
            targets: [{format: HDR_FORMAT}],
            vertex_layout: Vertexformats.V3DFULL,
            depthWrite: false,
            // depthCompare: "equal",
            // depthBias: 2,
            // depthBiasClamp: 1
        }, "env debug");

        this.pipelines[MODELTYPE.GENERAL] = new RenderPipeline(this.device, general_src, {
            targets: [{format: HDR_FORMAT}],
            vertex_layout: Vertexformats.V3DFULL,
        }, "general");

        this.post_pipeline = new RenderPipeline(this.device, post_src, {
            targets: [{format: canvas_format}],
            vertex_layout: Vertexformats.EMPTY,
            no_depth: true
        }, "post");

        this.blur_pipeline1 = new ComputePipeline(this.device, blur_src, {entry_point: "mainX"}, "blur1");
        this.blur_pipeline2 = new ComputePipeline(this.device, blur_src, {entry_point: "mainY"}, "blur2");

        this.optical_depth_pipeline = new ComputePipeline(this.device, optical_depth_src, {}, "optical depth");

        this.env_uniform_cache = new Map();

        this.make_buffers();
        this.make_bindgroups();
        this.make_screen_size_buffers();
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
    }

    resize(){
        this.img_width = this.canvas.width = this.canvas.clientWidth;
        this.img_height = this.canvas.height = this.canvas.clientHeight;
        this.make_screen_size_buffers();
    }

    private make_screen_size_buffers(){
        this.depth_buffer = this.device.createTexture({
            size: [this.img_width, this.img_height],
            format: "depth32float",
            usage: T.RENDER_ATTACHMENT,
        });
        this.hdr_buffer = this.device.createTexture({
            size: [this.img_width, this.img_height],
            format: "rgba16float",
            usage: T.RENDER_ATTACHMENT | T.TEXTURE_BINDING
        });
        this.blur_tex1 = this.device.createTexture({
            size: [this.img_width, this.img_height],
            format: "rgba16float",
            usage: T.STORAGE_BINDING | T.TEXTURE_BINDING
        });
        this.blur_tex2 = this.device.createTexture({
            size: [this.img_width, this.img_height],
            format: "rgba16float",
            usage: T.STORAGE_BINDING | T.TEXTURE_BINDING
        });
        this.post_bind = this.device.createBindGroup({
            layout: this.post_pipeline.getBindGroup(0),
            entries: [
                {
                    binding: 0,
                    resource: this.hdr_buffer.createView()
                },
                {
                    binding: 1,
                    resource: this.blur_tex2.createView()
                }
            ],
            label: "post bind"
        })
        this.blur_bind1 = this.device.createBindGroup({
            layout: this.blur_pipeline1.getBindGroup(0),
            entries: [
                {
                    binding: 0,
                    resource: this.hdr_buffer.createView()
                },
                {
                    binding: 1,
                    resource: this.blur_tex1.createView()
                }
            ]
        })
        this.blur_bind2 = this.device.createBindGroup({
            layout: this.blur_pipeline2.getBindGroup(0),
            entries: [
                {
                    binding: 0,
                    resource: this.blur_tex1.createView()
                },
                {
                    binding: 1,
                    resource: this.blur_tex2.createView()
                }
            ]
        })
    }

    private make_buffers(){
        this.settings_uniform = this.alloc_buffer(256*1024, B.COPY_DST | B.UNIFORM);
        //set quality = high
        this.device.queue.writeBuffer(this.settings_uniform, 76, new Uint32Array([1]));
        this.optiacl_depth_tex = this.device.createTexture({
            size: this.optical_depth_lookup_size,
            usage: T.STORAGE_BINDING | T.TEXTURE_BINDING,
            format: "r32float"
        });

        const encoder = this.device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        const bind = this.device.createBindGroup({
            layout: this.optical_depth_pipeline.getBindGroup(0),
            entries: [
                {
                    binding: 0,
                    resource: this.optiacl_depth_tex.createView()
                }
            ]
        })

        pass.setPipeline(this.optical_depth_pipeline.getPipeline());
        pass.setBindGroup(0, bind);
        pass.dispatchWorkgroups(this.optical_depth_lookup_size[0]/8,this.optical_depth_lookup_size[1]/8);
        pass.end();
        this.device.queue.submit([encoder.finish()]);
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
        } else if(type == MODELTYPE.SKYBOX){
            return new SkyBoxModel(this.device, this.pipelines[type], index_view, vertex_view, uniform_view, this.optiacl_depth_tex);
        }
    }

    private texture(img: ImageBitmap): GPUTexture {
        if(img == null){
            return this.device.createTexture({
                size: [2,2],
                usage: T.TEXTURE_BINDING,
                format: "rgba8unorm",
                label: "missing tex"
            });
        }
        let tex = this.device.createTexture({
            size: [img.width, img.height],
            usage: T.COPY_DST | T.RENDER_ATTACHMENT | T.TEXTURE_BINDING,
            format: "rgba8unorm",
            label: "model tex"
        });

        this.device.queue.copyExternalImageToTexture({source: img}, {texture: tex}, [img.width, img.height]);

        return tex;
    }

    set_camera(camera: Camera){
        const mvp = mat4.create();
        const perspective = mat4.create();
        mat4.perspective(perspective, Math.PI/2, this.img_width/this.img_height, 0.001, Infinity);
        mat4.multiply(mvp, perspective, camera.view());
        
        this.device.queue.writeBuffer(this.settings_uniform, 0, new Float32Array([...mvp,...camera.get_pos()]));
    }

    set_height(height: number) {
        this.height = height;
        this.device.queue.writeBuffer(this.settings_uniform, 80, new Float32Array([height]));
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

        return new Float32Array([...mvp,...model.offset, this.height]);
    }

    private env_uniform(pipeline: RenderPipeline, uniform_offset: number) {
        let cache = this.env_uniform_cache.get(pipeline);
        if(!cache){
            cache = [];
            this.env_uniform_cache.set(pipeline, cache);
        }

        if(cache[uniform_offset]){
            return cache[uniform_offset];
        }
        let bind = this.device.createBindGroup({
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

        cache[uniform_offset] = bind;
        return bind;
    }

    private render_model(pass: GPURenderPassEncoder, model: Model){
        model.update_uniform();
        pass.setPipeline(model.shader.getPipeline());
        pass.setBindGroup(0, this.env_uniform(model.shader, 0));
        model.binds.forEach((b,i)=>pass.setBindGroup(i+1,b));
        pass.setVertexBuffer(0, model.vertices.buff, model.vertices.offset, model.vertices.size);
        pass.setIndexBuffer(model.indices.buff,"uint32", model.indices.offset, model.indices.size);
        pass.drawIndexed(model.indices.size / 4);
    }

    draw() {
        const encoder = this.device.createCommandEncoder();

        let uniform_idx = 1;
        let draw_calls = 0;
        let render_passes = 0;
        let rendered_tris = 0;
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
                                format: HDR_FORMAT
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
                    },
                    label: "env map pass"
                });

                this.device.queue.writeBuffer(this.settings_uniform, 256 + 256 * uniform_idx, this.env_map_settings(m, side));
    
                this.models.forEach(model=>{
                    if(model == m) return;
                    model.update_uniform();
                    pass.setPipeline(model.shader.getPipeline());
                    pass.setBindGroup(0, this.env_uniform(model.shader, 256 + 256 * uniform_idx));
                    model.binds.forEach((b,i)=>pass.setBindGroup(i+1,b));
                    pass.setVertexBuffer(0, model.vertices.buff, model.vertices.offset, model.vertices.size);
                    pass.setIndexBuffer(model.indices.buff,"uint32", model.indices.offset, model.indices.size);
                    pass.drawIndexed(model.indices.size / 4);
                    rendered_tris += model.indices.size / 4;
                    draw_calls++;
                })
                pass.end();
                render_passes++;
                uniform_idx++;
            }
        })

        const primary_pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.hdr_buffer.createView({
                        format: HDR_FORMAT
                    }),
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
            },

            label: "primary pass"
        })
     
        this.models.forEach(m=>{
            this.render_model(primary_pass, m);
        });
        
        primary_pass.end();
        render_passes++;

        const blur_pass1 = encoder.beginComputePass();
        blur_pass1.setPipeline(this.blur_pipeline1.getPipeline());
        blur_pass1.setBindGroup(0, this.blur_bind1);
        blur_pass1.dispatchWorkgroups(Math.ceil(this.img_width/8),Math.ceil(this.img_height/8));
        blur_pass1.end();

        const blur_pass2 = encoder.beginComputePass();
        blur_pass2.setPipeline(this.blur_pipeline2.getPipeline());
        blur_pass2.setBindGroup(0, this.blur_bind2);
        blur_pass2.dispatchWorkgroups(Math.ceil(this.img_width/8),Math.ceil(this.img_height/8));
        blur_pass2.end();

        const post_pass = encoder.beginRenderPass({
            colorAttachments: [
                {
                    view: this.ctx.getCurrentTexture().createView(),
                    clearValue: [0,0,0,0],
                    loadOp: "clear",
                    storeOp: "store",
                }
            ],

            label: "post pass"
        })

        post_pass.setPipeline(this.post_pipeline.getPipeline());
        post_pass.setBindGroup(0, this.post_bind);
        post_pass.draw(3);
        post_pass.end();

        this.device.queue.submit([encoder.finish()]);


        // console.log({draw_calls, render_passes, rendered_tris})
    }
}
@group(0) @binding(0)
var<uniform> settings: Settings;

@group(0) @binding(1)
var tex_sampler: sampler;

@group(1) @binding(2)
var env_map: texture_cube<f32>;

@group(1) @binding(3)
var<uniform> local_settings: Settings2;

@group(1) @binding(4)
var diffuse_tex: texture_2d<f32>;

struct Settings {
    camera: mat4x4f,
    view_pos: vec3f,
}

struct Settings2 {
    model: mat4x4f,
}

struct VertexOut {
    @builtin(position) screen_pos: vec4f,
    @location(0) uv: vec2f,
    @location(1) norm: vec3f,
    @location(2) pos: vec3f,
}

struct FragmentOut {
    @location(0) color: vec4f,
}

@vertex
fn vertex_main(
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec3f,
    @location(3) tangent: vec3f,
    @location(4) bitangent: vec3f,
) -> VertexOut {
    var out: VertexOut;
    
    let trans_pos = local_settings.model * vec4f(position, 1);
    let trans_norm = local_settings.model * vec4f(normal, 0);
    out.screen_pos = settings.camera * trans_pos;
    out.norm = trans_norm.xyz;
    out.uv = vec2f(uv.x, uv.y);
    out.pos = trans_pos.xyz;

    return out;
}

@fragment
fn fragment_main(
    data: VertexOut
) -> FragmentOut {
    var out: FragmentOut;

    let view_dir = -normalize(settings.view_pos - data.pos);
    let norm = normalize(data.norm);
    let reflection_dir = reflect(view_dir, norm);
    let reflection = textureSample(env_map, tex_sampler, reflection_dir).xyz;
    let color = textureSample(diffuse_tex, tex_sampler, data.uv).xyz;

    out.color = vec4f(mix(color, reflection, 0.5), 1);

    return out;
}
@group(0) @binding(0)
var<uniform> settings: Settings;

@group(0) @binding(1)
var tex_sampler: sampler;

@group(1) @binding(2)
var env_map: texture_cube<f32>;

struct Settings {
    camera: mat4x4f
}

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) world_pos: vec3f,
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
    
    out.pos = settings.camera * vec4f(position * 10000, 1);
    out.world_pos = position;

    return out;
}

@fragment
fn fragment_main(
    data: VertexOut
) -> FragmentOut {
    var out: FragmentOut;
    let reflection = textureSample(env_map, tex_sampler, data.world_pos).xyz;

    out.color = vec4f(reflection*0.8, 1);

    return out;
}
@group(0) @binding(0)
var<uniform> settings: Settings;

struct Settings {
    camera: mat4x4f
}

struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

struct FragmentOut {
    @location(0) color: vec4f,
}

@vertex
fn vertex_main(
    @location(0) pos: vec3f,
    @location(1) uv: vec2f,
) -> VertexOut {
    var out: VertexOut;
    
    out.pos = settings.camera * vec4f(pos, 1);
    out.uv = uv;

    return out;
}

@fragment
fn fragment_main(
    data: VertexOut
) -> FragmentOut {
    var out: FragmentOut;

    out.color = vec4f(data.uv, 0, 1);

    return out;
}
@group(0) @binding(0)
var hdr_tex: texture_2d<f32>;

@group(0) @binding(1)
var gauss_tex: texture_2d<f32>;
struct VertexOut {
    @builtin(position) pos: vec4f,
    @location(0) uv: vec2f,
}

@vertex
fn vertex_main(@builtin(vertex_index) vertex_id: u32) -> VertexOut {
    if(vertex_id == 0){
        return VertexOut(vec4f(-1,-1,0,1), vec2f(0,1));
    } else if(vertex_id == 1){
        return VertexOut(vec4f(-1,3,0,1), vec2f(0,-1));
    } else {
        return VertexOut(vec4f(3,-1,0,1), vec2f(2,1));
    }
}

fn luminance(color: vec3f) -> f32 {
    return dot(color, vec3f(0.2126, 0.7152, 0.0722));
}

fn tonemap(color: vec3f) -> vec3f {
    // return color / (1 + luminance(color));
    return color / (1 + color);
}

fn gammacorrect(color: vec3f) -> vec3f {
    return pow(color, vec3f(1 / 2.2));
}


@fragment
fn fragment_main(data: VertexOut) -> @location(0) vec4f {
    let dims = textureDimensions(hdr_tex);
    let iuv = vec2u(data.uv * vec2f(dims));
    let sample = textureLoad(hdr_tex, iuv, 0);
    let blur_sample = textureLoad(gauss_tex, iuv, 0);

    let color = mix(sample.xyz, blur_sample.xyz, 0.1);
    
    return vec4f(tonemap(color), 1);
}
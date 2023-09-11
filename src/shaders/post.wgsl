@group(0) @binding(0)
var hdr_tex: texture_2d<f32>;

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
    return color / (1 + luminance(color));
}

// const GAUSS: array<f32,15> = array(0.00874063,0.017996989,0.033159046,0.054670025,0.080656908,0.106482669,0.125794409,0.13298076,0.125794409,0.106482669,0.080656908,0.054670025,0.033159046,0.017996989,0.00874063);
const GAUSS: array<f32,31> = array(0.002921383,0.004370315,0.006358771,0.008998494,0.012385194,0.016579523,0.021586266,0.027335012,0.033666448,0.040328454,0.046985313,0.053241334,0.058677554,0.062897205,0.065573286,0.06649038,0.065573286,0.062897205,0.058677554,0.053241334,0.046985313,0.040328454,0.033666448,0.027335012,0.021586266,0.016579523,0.012385194,0.008998494,0.006358771,0.004370315,0.002921383);
fn calcbloom(uv: vec2f) -> vec3f {
    let rad = 16;
    let dims = textureDimensions(hdr_tex);
    let iuv = vec2i(uv * vec2f(dims));

    var accum: vec3f;
    for(var y = -rad + 1; y < rad; y++){
        for(var x = -rad + 1; x < rad; x++){
            let val = max(textureLoad(hdr_tex, iuv+vec2i(x,y), 0).xyz * (1/f32((2*rad+1)*(2*rad+1))), vec3f(1,1,1)) - vec3f(1,1,1);
            accum += val * GAUSS[x+rad-1] * GAUSS[y + rad-1];
        }
    }
    
    return accum;
}

@fragment
fn fragment_main(data: VertexOut) -> @location(0) vec4f {
    let dims = textureDimensions(hdr_tex);
    let iuv = vec2u(data.uv * vec2f(dims));
    let sample = textureLoad(hdr_tex, iuv, 0);
    let bloom = calcbloom(data.uv);

    let color = mix(sample.xyz, bloom, 0.1);
    
    return vec4f(tonemap(color), 1);
}
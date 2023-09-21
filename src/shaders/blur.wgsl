@group(0) @binding(0)
var in_tex: texture_2d<f32>;


@group(0) @binding(1)
var out_tex: texture_storage_2d<rgba16float, write>;

const RAD = 16;
const GAUSS: array<f32,2 * RAD - 1> = array(
0.00088637
,0.00158309
,0.002716594
,0.004478906
,0.007094919
,0.010798193
,0.015790032
,0.022184167
,0.029945493
,0.038837211
,0.048394145
,0.057938311
,0.066644921
,0.073654028
,0.078208539
,0.079788456
,0.078208539
,0.073654028
,0.066644921
,0.057938311
,0.048394145
,0.038837211
,0.029945493
,0.022184167
,0.015790032
,0.010798193
,0.007094919
,0.004478906
,0.002716594
,0.00158309
,0.00088637
);

fn calcbloomX(uv: vec2u, dims: vec2u) -> vec4f {
    let iuv = vec2i(uv);
    var accum: vec4f;
    for(var x = -RAD + 1; x < RAD; x++){
        let pt = iuv + vec2i(x, 0);
        if(pt.x < 0 || pt.x >= i32(dims.x)){
            continue;
        }
        let sample = textureLoad(in_tex, pt, 0);
        let val = max(sample, vec4f(1)) - vec4f(1);
        accum += val * GAUSS[x+RAD-1];
    }
    
    return accum;
}

fn calcbloomY(uv: vec2u, dims: vec2u) -> vec4f {
    let iuv = vec2i(uv);
    var accum: vec4f;
    for(var y = -RAD + 1; y < RAD; y++){
        let pt = iuv + vec2i(0, y);
        if(pt.y < 0 || pt.y >= i32(dims.y)){
            continue;
        }
        let sample = textureLoad(in_tex, pt, 0);
        accum += sample * GAUSS[y+RAD-1];
    }
    
    return accum;
}


@compute @workgroup_size(8,8)
fn mainX(@builtin(global_invocation_id) global_id: vec3u) {
    let dims = textureDimensions(in_tex);
    if(global_id.x >= dims.x || global_id.y >= dims.y) {
        return;
    }

    let blured = calcbloomX(global_id.xy, dims);
    textureStore(out_tex, global_id.xy, vec4f(blured));
}


@compute @workgroup_size(8,8)
fn mainY(@builtin(global_invocation_id) global_id: vec3u) {
    let dims = textureDimensions(in_tex);
    if(global_id.x >= dims.x || global_id.y >= dims.y) {
        return;
    }

    let blured = calcbloomY(global_id.xy, dims);
    textureStore(out_tex, global_id.xy, vec4f(blured));
}
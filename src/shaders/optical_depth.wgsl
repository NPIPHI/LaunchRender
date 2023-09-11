@group(0) @binding(0)
var output: texture_storage_2d<r32float, write>;

const OPTICAL_INTEGRATE_COUNT = 128;
const EARTH_RADIUS = 6371000.0;
const EARTH_ATMOSPHERE_RADIUS = 6471000.0;
const DENSITY_FACTOR = 0.0001;

fn atmo_distance(p: vec3f, d: vec3f) -> f32 {
    let r2 = sq(EARTH_ATMOSPHERE_RADIUS);
    let pd = dot(p,d);
    let pd2 = 2 * pd;

    return 0.5 * (sqrt(sq(pd2) - 4 * (dot(p,p) - r2)) - pd2);
}

fn optical_depth(pos: vec3f, d: vec3f, len: f32) -> f32 {
    var pt = pos;
    let step_size = len / (OPTICAL_INTEGRATE_COUNT - 1);
    var opticalDepth = 0.0;

    for(var i = 0; i < OPTICAL_INTEGRATE_COUNT; i++){
        opticalDepth += density(pt) * step_size;
        pt += d * step_size;
    }
    return opticalDepth;
}

fn density(pos: vec3f) -> f32 {
    let h = max(length(pos) - EARTH_RADIUS,0);
    return DENSITY_FACTOR * exp(-h / 9300);
}

fn sq(v: f32) -> f32 {
    return v * v;
}

@compute @workgroup_size(8,8)
fn main(
    @builtin(global_invocation_id) global_id: vec3u
){
    let dims = textureDimensions(output);

    if(global_id.x >= dims.x || global_id.y >= dims.y){
        return;
    }

    let x = f32(global_id.x) / f32(dims.x);
    let y = f32(global_id.y) / f32(dims.y);

    let height = y * (EARTH_ATMOSPHERE_RADIUS - EARTH_RADIUS) + EARTH_RADIUS;
    let z = x * 2 - 1;
    let pos = vec3f(0,0,height);
    let dir = vec3f(sqrt(1-z*z),0,z);

    let optical_d = optical_depth(pos, dir, atmo_distance(pos, dir));

    textureStore(output, global_id.xy, vec4f(optical_d));
}
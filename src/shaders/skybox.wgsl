@group(0) @binding(0)
var<uniform> settings: Settings;

@group(0) @binding(1)
var tex_sampler: sampler;

@group(1) @binding(2)
var<uniform> local_settings: Settings2;

@group(1) @binding(3)
var optical_depth_tex: texture_2d<f32>;

struct Settings {
    camera: mat4x4f,
    view_pos: vec3f,
    quality: u32,
}

struct Settings2 {
    model: mat4x4f,
    sun_dir: vec3f,
}

struct VertexOut {
    @builtin(position) screen_pos: vec4f,
    @location(0) pos: vec3f,
}

struct FragmentOut {
    @location(0) color: vec4f,
}

const SUN_DIR = normalize(vec3f(1,0,0));

@vertex
fn vertex_main(
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec3f,
    @location(3) tangent: vec3f,
    @location(4) bitangent: vec3f,
) -> VertexOut {
    var out: VertexOut;
    
    _ = tex_sampler;
    _ = optical_depth_tex;
    let trans_pos = local_settings.model * vec4f(position, 1);
    out.screen_pos = settings.camera * trans_pos;
    out.pos = trans_pos.xyz;

    return out;
}

const PI = 3.1415926535;
const EARTH_RADIUS = 6371000.0;
const EARTH_ATMOSPHERE_RADIUS = 6471000.0;
const SCATTER_COUNT = 20;
const SCATTER_COUNT_CHEAP = 10;
const RED_WAVELENGTH = 700.0;
const GREEN_WAVELENGTH = 530.0;
const BLUE_WAVELENGTH = 440.0;
const SCATTER_STRENGTH = 0.08;
const SCATTER_BIAS = 800.0;
const SUN_INTENSITY = 100000.0;
const SUN_RADIUS = 2 * PI / 180;

const SCATTER_RED = pow(SCATTER_BIAS/RED_WAVELENGTH, 4) * SCATTER_STRENGTH;
const SCATTER_GREEN = pow(SCATTER_BIAS/GREEN_WAVELENGTH, 4) * SCATTER_STRENGTH;
const SCATTER_BLUE = pow(SCATTER_BIAS/BLUE_WAVELENGTH, 4) * SCATTER_STRENGTH;
const SCATTER_COEFF = vec3f(SCATTER_RED, SCATTER_GREEN, SCATTER_BLUE);
const DENSITY_FACTOR = 0.0001;

fn density(pos: vec3f) -> f32 {
    let h = max(length(pos) - EARTH_RADIUS,0);
    return DENSITY_FACTOR * exp(-h / 9300);
}

fn sample_optical(uv: vec2f) -> f32 {
    let dims = textureDimensions(optical_depth_tex);
    let iuv = uv * vec2f(dims);
    let f = fract(iuv);
    let s00 = textureLoad(optical_depth_tex, vec2u(iuv), 0).x;
    // let s01 = textureLoad(optical_depth_tex, min(vec2u(iuv)+vec2u(0,1), vec2u(dims.x-1,dims.y-1)), 0).x;
    // let s10 = textureLoad(optical_depth_tex, min(vec2u(iuv)+vec2u(1,1), vec2u(dims.x-1,dims.y-1)), 0).x;
    // let s11 = textureLoad(optical_depth_tex, min(vec2u(iuv)+vec2u(1,1), vec2u(dims.x-1,dims.y-1)), 0).x;
    return s00;
    // return (s00 * (1-f.x) + s10 * f.x) * (1-f.y) + (s01 * (1-f.x) + s11 * f.x) * f.y;
}

fn precalc_optical_depth(pos: vec3f, d: vec3f) -> f32 {
    var h = (length(pos) - EARTH_RADIUS) / (EARTH_ATMOSPHERE_RADIUS - EARTH_RADIUS);
    var dir = (dot(normalize(pos), d) + 1) / 2;
    let sample = sample_optical(vec2f(dir,h));
    return sample;
}

// fn optical_depth(pos: vec3f, d: vec3f, len: f32) -> f32 {
//     var pt = pos;
//     let step_size = len / (OPTICAL_INTEGRATE_COUNT - 1);
//     var opticalDepth = 0.0;

//     for(var i = 0; i < OPTICAL_INTEGRATE_COUNT; i++){
//         opticalDepth += density(pt) * step_size;
//         pt += d * step_size;
//     }
//     return opticalDepth;
// }

fn sq(v: f32) -> f32 {
    return v * v;
}

fn atmo_distance(p: vec3f, d: vec3f) -> f32 {
    let r2 = sq(EARTH_ATMOSPHERE_RADIUS);
    let pd = dot(p,d);
    let pd2 = 2 * pd;

    return 0.5 * (sqrt(sq(pd2) - 4 * (dot(p,p) - r2)) - pd2);
}

fn cheap_calc_light(o: vec3f, d: vec3f, len: f32) -> vec3f {
    var in_scatter_pt = o;
    var in_scattered_light: vec3f;
    let step_size = len / (SCATTER_COUNT_CHEAP - 1);
    let sun_dir = local_settings.sun_dir;
    let full_depth = precalc_optical_depth(o, d);
    for(var i =  0; i < SCATTER_COUNT_CHEAP; i++){
        let view_optical_depth = full_depth - precalc_optical_depth(in_scatter_pt, d);
        let local_density = density(in_scatter_pt);
        let sun_optical_depth = precalc_optical_depth(in_scatter_pt, sun_dir);
        let transmittance = exp(-(sun_optical_depth + view_optical_depth) * SCATTER_COEFF);
        in_scattered_light += local_density * transmittance * SCATTER_COEFF * step_size;
        in_scatter_pt += d * step_size;
    }

    return vec3f(in_scattered_light);
}

fn calc_light(o: vec3f, d: vec3f, len: f32) -> vec3f {
    var in_scatter_pt = o;
    var in_scattered_light: vec3f;
    let step_size = len / (SCATTER_COUNT - 1);
    let sun_dir = local_settings.sun_dir;
    let tangent = normalize(cross(sun_dir, vec3f(0.3,0.2,0.1)));
    let bitangent = cross(sun_dir, tangent);
    let full_depth = precalc_optical_depth(o, d);
    for(var i =  0; i < SCATTER_COUNT; i++){
        let view_optical_depth = full_depth - precalc_optical_depth(in_scatter_pt, d);
        let local_density = density(in_scatter_pt);
        let sample_ct = 6;
        for(var j = 0; j < sample_ct; j++){
            let sun_size = 0.15;
            let t = f32(j) * 6.28 / f32(sample_ct);
            let sample_dir = normalize(sun_dir + sun_size*cos(t) * tangent + sun_size*sin(t) * bitangent);
            let sun_optical_depth = precalc_optical_depth(in_scatter_pt, sample_dir);
            let transmittance = exp(-(sun_optical_depth + view_optical_depth) * SCATTER_COEFF);
            in_scattered_light += local_density * transmittance * SCATTER_COEFF * step_size / f32(sample_ct);
        }
        in_scatter_pt += d * step_size;
    }

    return vec3f(in_scattered_light);
}

@fragment
fn fragment_main(
    data: VertexOut
) -> FragmentOut {
    var out: FragmentOut;
    let dir = normalize(data.pos);
    let earth_pos = vec3f(0,0,EARTH_RADIUS);
    let sun_dir = local_settings.sun_dir;
    var light: vec3f;

    let d = atmo_distance(earth_pos, dir);
    let optical_d = precalc_optical_depth(earth_pos, dir);
    if(settings.quality == 0){
        light += cheap_calc_light(earth_pos, dir, d);
    } else {
        light += calc_light(earth_pos, dir, d);
    }
    if(dot(dir, local_settings.sun_dir) > cos(SUN_RADIUS)){
        light += 
            exp(-optical_d*SCATTER_COEFF)
            * SUN_INTENSITY
            * vec3f(255, 249, 230)
            / 255.0;
    }

    out.color = vec4f(light, 1);

    return out;
}
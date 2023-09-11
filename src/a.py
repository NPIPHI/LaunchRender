import numpy as np
# from sympy import *
import random

EARTH_ATMOSPHERE_RADIUS = 6471000.0
EARTH_RADIUS = 6371000.0
DENSITY_FACTOR = 0.0001
OPTICAL_INTEGRATE_DEPTH = 50

# fn atmo_distance(p: vec3f, d: vec3f) -> f32 {
#     let r = sq(EARTH_ATMOSPHERE_RADIUS);
#     let a = 2*dot(d,d);
#     let b = sq(2 * dot(p,d));
#     let c = dot(d,d)*(dot(p,p) - r);
#     let e = 2 * dot(p,d);

#     let x = (1.0 / a) * (-sqrt(b - 4 * c) - e);

#     return x;
# }


# fn optical_depth(pos: vec3f, d: vec3f, len: f32) -> f32 {
#     var pt = pos;
#     let step_size = len / (OPTICAL_INTEGRATE_COUNT - 1);
#     var opticalDepth = 0.0;

#     for(var i = 0; i < OPTICAL_INTEGRATE_COUNT; i++){
#         opticalDepth += density(pt) * step_size;
#         pt += d * step_size;
#     }
#     return opticalDepth;
# }

# fn density(pos: vec3f) -> f32 {
#     let h = max(length(pos) - EARTH_RADIUS,0);
#     return DENSITY_FACTOR * exp(-h / 9300);
# }

def optical_depth(pos, d, len):
    pt = np.array(pos)
    d = np.array(d)
    step_size = len / (OPTICAL_INTEGRATE_DEPTH - 1)
    optical_depth = 0.0

    for i in range(OPTICAL_INTEGRATE_DEPTH):
        optical_depth += density(pt) * step_size
        pt += d * step_size

    return optical_depth

def density(pos):
    h = max(np.linalg.norm(pos) - EARTH_RADIUS, 0)
    return DENSITY_FACTOR * np.exp(-h / 9300) 

def atmo_distance(p, d):
    r2 = EARTH_ATMOSPHERE_RADIUS**2
    pd = np.dot(p,d)
    pd2 = 2 * pd

    x = 0.5 * (np.sqrt(pd2**2 - 4 * (np.dot(p,p) - r2)) - pd2);

    return x;

def to_2d(pos, dir):
    h = (np.linalg.norm(pos) - EARTH_RADIUS) / (EARTH_ATMOSPHERE_RADIUS - EARTH_RADIUS)
    d = (np.dot(pos, dir) / np.linalg.norm(pos) + 1) / 2

    return [d,h]

def from_2d(x, y):
    height = y * (EARTH_ATMOSPHERE_RADIUS - EARTH_RADIUS) + EARTH_RADIUS
    z = x * 2 - 1
    pos = [0,0,height]
    dir = [np.sqrt(1-z*z),0,z]
    return [pos, dir]


# print(atmo_distance([0, 0, EARTH_RADIUS], [0,1,0]));
# print(atmo_distance([0, 0, EARTH_RADIUS], [1,0,0]));
# print(atmo_distance([0, 0, EARTH_RADIUS], [0,0,1]));


# pos = [random.random()*100000,random.random()*100000,EARTH_RADIUS+random.random()*(EARTH_ATMOSPHERE_RADIUS - EARTH_RADIUS)]
# dir = [random.random()*2-1, random.random()*2-1, random.random()*2-1]
pos = [0, 0, EARTH_RADIUS]
dir = [0, 0, 1]
dir = np.array(dir) / np.linalg.norm(dir)
[x,y] = to_2d(pos,dir)
[pos2, dir2] = from_2d(x,y)
# print(pos, dir)
# print(pos2, dir2)
print(optical_depth(pos,dir, atmo_distance(pos,dir)));
print(optical_depth(pos2,dir2, atmo_distance(pos2,dir2)));

# x1, x2, x3 = symbols("x1 x2 x3")
# v1, v2, v3 = symbols("v1 v2 v3")
# r = symbols("r", positive=True)
# f = symbols("f", positive=True)
# df = symbols("df", positive=True)
# x = symbols("x")
# h = sqrt((x1+v1*x)**2+(x2+v2*x)**2+(x3+v3*x)**2)
# eq = df * exp(-(h - r) / f)
# print(eq)
# eq = eq.subs([(r, EARTH_RADIUS),(f,9300),(df, DENSITY_FACTOR),(x1,pos[0]),(x2,pos[1]),(x3,pos[2]),(v1,pos[0]),(v2,pos[1]),(v3,pos[2])])
# inter = integrate(eq, (x, 0, oo))
# print("--")
# print(inter)

# print(lambdify((), inter)())


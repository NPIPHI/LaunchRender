const TYPE_INDEX = 1;
const TYPE_VERTEX = 2;
const TYPE_IMAGE_PNG = 3;

class Indices {
    constructor(public indices: Uint32Array){};
}

class Vertices {
    constructor(public vertices: Uint8Array){};
}

class Image {
    constructor(public image: ImageBitmap){};
}

export type ModelData = {
    diffuse: ImageBitmap,
    indices: Uint32Array,
    vertices: Uint8Array
}

type Section = Indices | Vertices | Image;
type ParseResult = {section: Section, ptr: number}

function LoadIndices(buff: ArrayBuffer, off: number) : ParseResult {
    let u32 = new Uint32Array(buff, off);
    let type = u32[0];
    if(type != TYPE_INDEX){
        throw new Error("Type mismatch");
    }
    let len = u32[1];
    console.log(`INDICES ${off} ${len*4}`);
    return {section: new Indices(new Uint32Array(buff, off + 8, len)), ptr: off + len * 4 + 8};
}

function LoadVertices(buff: ArrayBuffer, off: number) : ParseResult {
    let u32 = new Uint32Array(buff, off);
    let type = u32[0];
    if(type != TYPE_VERTEX){
        throw new Error("Type mismatch");
    }
    let len = u32[1];
    console.log(`VERTICES ${off} ${len*60}`);
    return {section: new Vertices(new Uint8Array(buff, off + 8, len * 60)), ptr: off + len * 60 + 8};
}

async function LoadImgPNG(buff: ArrayBuffer, off: number) : Promise<ParseResult> {
    let u32 = new Uint32Array(buff, off);
    let type = u32[0];
    if(type != TYPE_IMAGE_PNG){
        throw new Error("Type mismatch");
    }
    let len = u32[1];
    let aligned_len = Math.ceil(len/4)*4;
    console.log(`IMAGE ${off} ${len}`);

    let blob = new Blob([new Uint8Array(buff, off + 8, len)]);
    let img = await createImageBitmap(blob, {colorSpaceConversion: "none"});
    return {section: new Image(img), ptr: off + 8 + aligned_len};
}

async function LoadPart(buff: ArrayBuffer, off: number): Promise<ParseResult> {
    if(off % 4 != 0){
        throw new Error("Unaligned Offset");
    }
    let u32 = new Uint32Array(buff);
    let type = u32[off/4];
    switch(type){
        case TYPE_INDEX:
            return LoadIndices(buff, off);
        case TYPE_VERTEX:
            return LoadVertices(buff, off);
        case TYPE_IMAGE_PNG:
            return await LoadImgPNG(buff, off);
        default:
            throw new Error(`Unknown type ${type}`);
    }
}

export async function LoadFile(path: string): Promise<ModelData> {
    let data = await fetch(path);
    let buff = await data.arrayBuffer();

    let ret: ModelData = {
        indices: null,
        vertices: null,
        diffuse: null
    };
    let off = 0;
    while(off < buff.byteLength){
        let {section, ptr} = await LoadPart(buff, off);
        off = ptr;

        if(section instanceof Image){
            ret.diffuse = section.image
        } else if(section instanceof Vertices){
            ret.vertices = section.vertices
        } else if(section instanceof Indices){
            ret.indices = section.indices
        }
    }

    return ret;
}
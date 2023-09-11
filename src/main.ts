import { App } from "./app";
import { Camera } from "./Camera";
import Model, { MODELTYPE } from "./Model";

async function main() {
    const canvas = <HTMLCanvasElement>document.getElementById("canvas");
    const gpu = navigator.gpu;
    if(!gpu){
        throw new Error("WebGPU not supported");
    }


    const adapter = await gpu.requestAdapter({powerPreference: "high-performance"});
    const device = await adapter.requestDevice({label: "GPU Device"});


    const app = new App(canvas, device);
    const camera = new Camera();
    let rocket: Model;
    let spheres: Model[] = [];
    const run = (time: number)=>{
        spheres.forEach((s,i)=>{
            let x = i % 8;
            let y = (i - x) / 8;
            // s.offset = [x*4,y*4,Math.sin(time/1000+i)];
        })
        // if(rocket) {
        //     rocket.offset = [0,0,0*Math.sin(time/1000)];
        //     rocket.rotation = [90,0,time/1000];
        //     // camera.set_pos(rocket.offset);
        // }
        camera.update(0.008);
        app.set_camera(camera);
        app.draw();
        requestAnimationFrame(run);
    }
    window.addEventListener("resize", ()=>app.resize());
    requestAnimationFrame(run);

    for(let i = 0; i < 1; i++){
        app.load_model("sphere.bin", MODELTYPE.ENV_MAPPED).then(model=>{
            app.add_model(model);
            model.rotation = [90,0,0];
            spheres.push(model);
        });
    }

    // app.load_model("cube.bin", MODELTYPE.ENV_DEBUG).then(model=>app.add_model(model));
    app.load_model("satground.bin", MODELTYPE.GENERAL).then(model=>{
        app.add_model(model);
        model.offset = [0,0,-3];
        model.rotation = [90,0,0];
        model.scale = [10,10,10];
    });

    app.load_model("cube.bin", MODELTYPE.SKYBOX).then(model=>{
        app.add_model(model);
        model.scale = [1000,1000,1000];
    })
}

window.onload = main;

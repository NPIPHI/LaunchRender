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
    app.set_height(0);
    const camera = new Camera();
    let height = 0;
    let ground: Model;
    const run = (time: number)=>{
        // if(ground){
        //     height += 0.1;
        //     ground.offset = [0,0,-height]
        // }
        // app.set_height(height);
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

    app.load_model("intrepid.bin", MODELTYPE.ENV_MAPPED).then(model=>{
        app.add_model(model);
        model.rotation = [90,0,0];
    });

    // app.load_model("cube.bin", MODELTYPE.ENV_DEBUG).then(model=>app.add_model(model));
    app.load_model("satground2.bin", MODELTYPE.GENERAL).then(model=>{
        app.add_model(model);
        ground = model
        model.offset = [0,0,-100];
        model.rotation = [90,0,0];
        model.scale = [1000,1,1000];
    });

    app.load_model("cube.bin", MODELTYPE.SKYBOX).then(model=>{
        app.add_model(model);
        model.scale = [10000,10000,10000];
    })
}

window.onload = main;

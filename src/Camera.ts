import { mat4, vec3 } from "gl-matrix"

export class Camera {
    private keymap: Map<string, boolean>;
    private pos: vec3;
    private speed: number = 1;
    private pitch_sensitivity = 0.01;
    private yaw_sensitivity = 0.01;
    private pitch: number = 0;
    private yaw: number = 0;
    private mouse_down: boolean = false;
    n: boolean = false;
    constructor(){
        this.pitch =  -0.53;
        this.yaw =  -2.7199999999999966;
        this.pos = [0,1.4,1.2]
        this.speed = 3;
        //[-0.0016491291680722497, 0.9704154129140079, 0.7839999897405505] -0.8800000000000003 -2.259999999999999
        this.keymap = new Map();
        let element = document.getElementById("canvas");
        document.addEventListener('keydown', (ev)=>{
            this.handle_evenet(ev, true);
        })
        document.addEventListener('keyup', (ev)=>{
            this.handle_evenet(ev, false);
        })
        document.addEventListener("pointerdown", (ev)=>{
            this.mouse_down = true;
        })
        document.addEventListener("pointerup", (ev)=>{
            this.mouse_down = false;
        })
        element.addEventListener('mousemove', (ev)=>{
            if(this.mouse_down){
                this.handle_mouse(ev);
            }
        })
    }

    public set_pos(pos: vec3){
        this.pos = pos;
    }

    public get_pos(): vec3 {
        return this.pos;
    }

    private handle_evenet(ev: KeyboardEvent, pressed: boolean){
        if(ev.key == "t"){
            console.log([...this.pos], this.pitch, this.yaw);
        }
        this.keymap.set(ev.key, pressed);
    }

    private handle_mouse(ev: MouseEvent){
        this.yaw += this.yaw_sensitivity * -ev.movementX;
        this.pitch += this.pitch_sensitivity * -ev.movementY;
        this.pitch = Math.max(Math.min(1.5, this.pitch), -1.5);
    }

    public update(dt: number){
        let movement = vec3.create();
        if(this.keymap.get('w')) movement[1] += 1;
        if(this.keymap.get('s')) movement[1] -= 1;
        if(this.keymap.get('d')) movement[0] += 1;
        if(this.keymap.get('a')) movement[0] -= 1;
        if(this.keymap.get('e')) movement[2] += 1;
        if(this.keymap.get('q')) movement[2] -= 1;

        vec3.rotateZ(movement, movement, [0,0,0], this.yaw);
        vec3.scale(movement, movement, dt * this.speed * (this.keymap.get("c") ? 100 : 1));
        vec3.add(this.pos, this.pos, movement);
    }

    public view(): mat4 {
        const m = mat4.create();
        const focus = vec3.fromValues(0,1,0);
        vec3.rotateX(focus, focus, [0,0,0], this.pitch);
        vec3.rotateZ(focus, focus, [0,0,0], this.yaw);
        vec3.add(focus, focus, this.pos);
        return mat4.lookAt(m, this.pos, focus, [0,0,1]);
    }
}
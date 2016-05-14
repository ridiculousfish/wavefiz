/// <reference path="../typings/threejs/three.d.ts"/>
/// <reference path="./algorithms.ts"/>

module visualizing {

    // helpers
    export import Vector3 = THREE.Vector3
    export import Complex = algorithms.Complex
    
    export function vector3(x:number, y:number, z:number): THREE.Vector3 {
        return new THREE.Vector3(x, y, z)
    }

    export interface Draggable {
        dragStart(raycaster: THREE.Raycaster): void
        dragEnd(): void
        dragged(raycaster: THREE.Raycaster): void
        hitTestDraggable(raycaster: THREE.Raycaster): Draggable // or null
    }


    /* A class to help with animations. Adds callbacks (which trigger requestAnimationFrame) */
    export interface AnimatorClient {
        advanceAnimation(when: number)
    }

    export class Visualizable {
        valueAt: (index: number, time: number) => Complex = undefined
    }

    export class Animator {
        public clock = new THREE.Clock(false)
        private clients_: AnimatorClient[] = []
        private rerender_: () => void
        // clock stopping and starting doesn't adjust elapsed time
        // so we have to do that ourselves
        private elapsed_: number

        constructor(public params: Parameters, rerender: () => void) {
            this.rerender_ = rerender
            this.elapsed_ = this.clock.getElapsedTime()
        }

        schedule(client: AnimatorClient) {
            if (this.clients_.length === 0 && !this.paused()) {
                window.requestAnimationFrame(() => this.fireClients())
            }
            this.clients_.push(client)
        }

        setPaused(flag: boolean) {
            if (flag) {
                this.clock.stop()
            } else {
                this.clock.start()
                if (this.clients_.length > 0) {
                    window.requestAnimationFrame(() => this.fireClients())
                }
            }
        }

        reset() {
            this.elapsed_ = 0
        }

        paused(): boolean {
            return !this.clock.running
        }

        lastTime(): number {
            return this.elapsed_
        }

        fireClients() {
            let locals = this.clients_
            const dt = this.clock.getDelta() * this.params.timescale
            this.elapsed_ += dt
            this.clients_ = []
            let processed = []
            locals.forEach((client: AnimatorClient) => {
                // deduplicate to avoid multiple schedules of the same object
                for (let i = 0; i < processed.length; i++) {
                    if (processed[i] === client) {
                        return
                    }
                }
                client.advanceAnimation(this.elapsed_)
                processed.push(client)
            })
            this.rerender_()
        }
    }
    
    export let USE_POINTS = true

    export class VisLine2 {
        public positions: Float32Array
        public geometry = new THREE.Geometry()
        public particles: THREE.Points
        
        constructor(public length:number, material:any) {
            for (let i=0; i < length; i++) {
                this.geometry.vertices.push(new THREE.Vector3(0, 0, 0))
            }
            material["size"] = 8.0
            this.particles = new THREE.Points( this.geometry, new THREE.PointCloudMaterial(material) );
        }
        
        public update(cb: (index:number) => THREE.Vector3) {
            
            for (let i = 0; i < this.length; i++) {
                let vec = cb(i);
                (this.particles.geometry as any).vertices[i].set(vec.x, vec.y, vec.z)
            };
            (this.particles.geometry as any).verticesNeedUpdate = true
        }
        
        setVisible(flag:boolean) {
            this.particles.visible = flag
        }
        
        public removeFromGroup(group:THREE.Group) {
            group.remove(this.particles)
        }
        
        public addToGroup(group:THREE.Group) {
            group.add(this.particles)
        }
    }

    export class VisLine {
        public vertices: THREE.Vector3[] = []
        public mesh: THREE.Mesh
        public lineWidth: number
        
        constructor(public length: number, material: any) {
            const zero = new THREE.Vector3(0, 0, 0)
            for (let i = 0; i < length; i++) {
                this.vertices.push(zero)
            }
            this.lineWidth = material["linewidth"]
            this.mesh = new THREE.Mesh(this.makeGeometry() as any, new THREE.MeshBasicMaterial(material))
        }
        
        makeGeometry() : THREE.TubeGeometry {
            let curve = new THREE.CatmullRomCurve3(this.vertices)
            let geometry = new THREE.TubeGeometry(
                curve as any,
                this.length, // segments
                this.lineWidth, // radius
                3, // radius segments
                false // closed
            );
            (geometry as any).dynamic = true
            return geometry
        }

        public update(cb: (index:number) => THREE.Vector3) {
            
            for (let i = 0; i < this.length; i++) {
                this.vertices[i] = cb(i)
            }
            
            let geometry = this.makeGeometry()
            let length = geometry.vertices.length
            let meshGeometry = this.mesh.geometry as any 
            for (let i=0; i < length; i++) {
                let geoVert = geometry.vertices[i]
                meshGeometry.vertices[i].set(geoVert.x, geoVert.y, geoVert.z)
            }
            meshGeometry.verticesNeedUpdate = true
        }
        
        setVisible(flag:boolean) {
            this.mesh.visible = flag
        }
        
        public addToGroup(group:THREE.Group) {
            group.add(this.mesh)
        }

        public removeFromGroup(group:THREE.Group) {
            group.remove(this.mesh)
        }
    }

    export class Parameters {
        public xScale = 1
        public yScale = 1 // multiply to go from potential to graphical point
        public width: number = 800
        public height: number = 600
        public maxX: number = 20 // maximum X value
        public timescale: number = 1.0 / 3.0
        public meshDivision: number = 800 // how many points are in our mesh
        public psiScale: number = 250 // how much scale we visually apply to the wavefunction

        public showPsi = !false // show position psi(x)
        public showPsiAbs = false // show position probability |psi(x)|^2
        public showPhi = false // show momentum phi(x)
        public showPhiAbs = false // show momentum probability |phi(x)|^2

        public paused = false

        public centerForMeshIndex(idx: number): number {
            assert(idx >= 0 && idx < this.meshDivision, "idx out of range")
            let meshWidth = this.width / this.meshDivision
            return idx * meshWidth + meshWidth / 2.0
        }

        public convertYToVisualCoordinate(y: number) {
            return this.height - this.yScale * y
        }

        public convertYFromVisualCoordinate(y: number) {
            return (this.height - y) / this.yScale
        }

        public convertXToVisualCoordinate(x: number) {
            return (x / this.meshDivision) * this.width
        }
    }
    
    // Builds a potential based on a function
    // let f be a function that accepts an x position, and optionally the x fraction (in the range [0, 1))
    // returns the new potential
    export function buildPotential(params:Parameters, f:((x:number, xfrac?:number) => number)) {
        let potentialMesh: number[] = []
        for (let i = 0; i < params.meshDivision; i++) {
            const x = params.centerForMeshIndex(i)
            const xfrac = i / params.meshDivision
            potentialMesh.push(f(x, xfrac))
        }
        return potentialMesh
    }

    export interface InputState {
        potential: number[]
    }

    export function assert(condition, message) {
        if (!condition) {
            throw message || "Assertion failed"
        }
    }
    
    function timeThing(iters:number, funct: (() => void)) {
        const start = new Date().getTime()
        for (let iter=0; iter < iters; iter++) {
            funct()
        }
        const end = new Date().getTime()
        const duration = (end - start) / iters
        return duration
    } 
    
    function benchmarkImpl(forProfiling: boolean):string {
        const params = new Parameters()
        
        // SHO-type potential
        const baseEnergy = 0.25
        const xScaleFactor = 1.0 / 4.0
        const potential = buildPotential(params, (x: number) => {
            // x is a value in [0, this.potential_.width)
            // we have a value of 1 at x = width/2
            const offsetX = params.width / 2
            const scaledX = (x - offsetX) * params.maxX / params.width
            return baseEnergy + xScaleFactor * (scaledX * scaledX / 2.0)
        })
        
        const center = algorithms.indexOfMinimum(potential)
        const energy = 2.5
        const input = {
            potentialMesh: potential,
            energy: energy,
            maxX: params.maxX
        }
        
        let psi = algorithms.classicallyResolvedAveragedNumerov(input)
        const maxIter = forProfiling ? 1024 : 32
        let duration1 = timeThing(maxIter, () => {
            let phi = psi.fourierTransformOptimized(center, .5)
        })
        
        let text = duration1.toFixed(2) + " ms"
        if (!forProfiling) {
            let duration2 = timeThing(maxIter, () => {
                let phi = psi.fourierTransform(center, .5)
            })
            text += "/ " + duration2.toFixed(2) + " ms"
        }

        return text 
    }
    
    export function benchmark(): string {
        return benchmarkImpl(false)
    }
    
    export function runForProfiling(): string {
        return benchmarkImpl(true)
    }
}

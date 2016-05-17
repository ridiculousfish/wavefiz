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
    
    /* Use particles */
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

    /* Use tube geometry */
    export class VisLine3 {
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
        
        public setVisible(flag:boolean) {
            this.mesh.visible = flag
        }
        
        public addToGroup(group:THREE.Group) {
            group.add(this.mesh)
        }

        public removeFromGroup(group:THREE.Group) {
            group.remove(this.mesh)
        }
    }
    
    /* Use native lines */
    export class VisLine5 {
        public geometry: THREE.Geometry
        public line: THREE.Line
        constructor(public length: number, material: THREE.LineBasicMaterialParameters) {
            this.geometry = new THREE.Geometry()
            const zero = new THREE.Vector3(0, 0, 0)
            for (let i = 0; i < length; i++) {
                this.geometry.vertices.push(zero)
            };
            (this.geometry as any).dynamic = true
            this.line = new THREE.Line(this.geometry, new THREE.LineBasicMaterial(material))
        }

        public update(cb: (index) => THREE.Vector3) {
            for (let i = 0; i < this.length; i++) {
                this.geometry.vertices[i] = cb(i)
            }
            this.geometry.verticesNeedUpdate = true
        }
        
        public addToGroup(group:THREE.Group) {
            group.add(this.line)
        }

        public removeFromGroup(group:THREE.Group) {
            group.remove(this.line)
        }
        
        public setVisible(flag:boolean) {
            this.line.visible = flag
        }
    }
    
    /* Use a 2d mesh */
    export class VisLineMesh {
        public geometry = new THREE.Geometry()
        public mesh: THREE.Mesh
        constructor(public length: number, material: THREE.LineBasicMaterialParameters) {
            for (let i = 0; i < 2*length; i++) {
                this.geometry.vertices.push(new THREE.Vector3(0, 0, 0))
            }
            for (let i=0; i+1 < length; i++) {
                let ul = i * 2
                this.geometry.faces.push(new THREE.Face3(ul, ul+1, ul+2))
                this.geometry.faces.push(new THREE.Face3(ul+2, ul+1, ul+3))
            };
            (this.geometry as any).dynamic = true
            this.mesh = new THREE.Mesh(this.geometry, 
                new THREE.MeshBasicMaterial({color: material.color, side:THREE.DoubleSide}));
        }
        public update(cb: (index) => THREE.Vector3) {
            let path : THREE.Vector3[] = []
            for (let i = 0; i < this.length; i++) {
                path.push(cb(i))
            }
            let geometry = this.mesh.geometry as any
            for (let i = 0; i < this.length; i++) {
                let pt = path[i]
                let vertIdx = i * 2
                geometry.vertices[vertIdx].set(pt.x, pt.y, pt.z)
                geometry.vertices[vertIdx+1].set(pt.x+5, pt.y+5, pt.z)                
            }
            geometry.verticesNeedUpdate = true
        }
        
        public addToGroup(group:THREE.Group) {
            group.add(this.mesh)
        }

        public removeFromGroup(group:THREE.Group) {
            group.remove(this.mesh)
        }
        
        public setVisible(flag:boolean) {
            this.mesh.visible = flag
        }
    }
    
    // does not handle copying within self
    function copyToFrom(dst:Float32Array, src:Float32Array, dstStart:number, srcStart:number, amount:number = Number.MAX_VALUE) {
        const effectiveAmount = Math.min(amount, dst.length - dstStart, src.length - srcStart)
        for (let i=0; i < effectiveAmount; i++) {
            dst[i + dstStart] = src[i + srcStart]
        } 
    }
    
    let Shaders = {
        fragmentCode:
        `
            uniform vec3 color;
            varying float zdepth;

            void main() {
                vec3 mungedColor = color;
                //mungedColor += 10.0 * smoothstep(-50.0, 500., gl_FragCoord.z);
                mungedColor *= (1.0 + smoothstep(-80.0, 80.0, zdepth)) / 2.0;
                gl_FragColor = vec4(mungedColor, 1.0);
            }
        `,
        
        vertexCode:
        `
            attribute float direction;
            uniform float thickness;
            attribute vec3 next;
            attribute vec3 prev;
            varying float zdepth;
            
            void main() {
                zdepth = position.z;
                
                float aspect = 800.0 / 600.0;
                vec2 aspectVec = vec2(aspect, 1.0);
                mat4 projViewModel = projectionMatrix * modelViewMatrix;
                vec4 previousProjected = projViewModel * vec4(prev, 1.0);
                vec4 currentProjected = projViewModel * vec4(position, 1.0);
                vec4 nextProjected = projViewModel * vec4(next, 1.0);
                
                //get 2D screen space with W divide and aspect correction
                vec2 currentScreen = currentProjected.xy / currentProjected.w * aspectVec;
                vec2 previousScreen = previousProjected.xy / previousProjected.w * aspectVec;
                vec2 nextScreen = nextProjected.xy / nextProjected.w * aspectVec;
                
                float len = thickness;
                
                // Use the average of the normals
                // This helps us handle 90 degree turns correctly
                vec2 dir1 = normalize(nextScreen - currentScreen);
                vec2 dir2 = normalize(currentScreen - previousScreen);
                vec2 dir = normalize(dir1 + dir2); 
                vec2 normal = vec2(-dir.y, dir.x);
                normal *= len/2.0;
                normal.x /= aspect;
                
                vec4 offset = vec4(normal * direction, 0.0, 1.0);
                gl_Position = currentProjected + offset;
            }
        `
    }
    
    /* Use shaders */
    export class VisLine {
        public geometry = new THREE.BufferGeometry()
        public mesh: THREE.Mesh
        constructor(public length: number, material: THREE.LineBasicMaterialParameters) {
            // Length is the length of the path
            // Use two vertices for each element of our path
            // (and each vertex has 3 coordinates)
            const vertexCount = 2 * length
            let positions = new Float32Array(vertexCount*3)
            this.geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3))
            
            let thickness = Math.max(2, material.linewidth || 0)

            
            // set face indexes
            // we draw two faces (triangles) between every two elements of the path
            // each face has 3 vertices, since it's a triangle
            const faceCount = 2 * (length - 1) 
            let faces = new Uint32Array(3 * faceCount)
            let faceVertIdx = 0
            for (let i=0; i+1 < length; i++) {
                let startVertex = i * 2
                faces[faceVertIdx++] = startVertex + 0
                faces[faceVertIdx++] = startVertex + 1
                faces[faceVertIdx++] = startVertex + 2
                faces[faceVertIdx++] = startVertex + 2
                faces[faceVertIdx++] = startVertex + 1
                faces[faceVertIdx++] = startVertex + 3
            }
            this.geometry.setIndex(new THREE.BufferAttribute(faces, 1));
            
            // compute the "direction" attribute, alternating 1 and -1 for each vertex
            let directions = new Float32Array(vertexCount)
            for (let i=0; i < length; i++) {
                directions[i*2] = 1.0
                directions[i*2+1] = -1.0
            }
            this.geometry.addAttribute('direction', new THREE.BufferAttribute(directions, 1));
            
            // compute "next" and "previous" locations
            // next is shifted left, and previous shifted right
            let nexts = new Float32Array(vertexCount*3)
            let prevs = new Float32Array(vertexCount*3)
            // nexts.copyWithin(0, 3) // shift elements left by 3, duplicating the last 3
            // prevs.copyWithin(3, 0) // shift elements right by 3, duplicating the first 3            
            this.geometry.addAttribute('next', new THREE.BufferAttribute(nexts, 3))
            this.geometry.addAttribute('prev', new THREE.BufferAttribute(prevs, 3))
            
            ;(this.geometry as any).dynamic = true
            if ("abc".length > 100) {
                this.mesh = new THREE.Mesh(this.geometry, 
                    new THREE.MeshBasicMaterial({color: material.color, side:THREE.DoubleSide, wireframe:false}));        
            } else {
                let sm = new THREE.ShaderMaterial({
                    side:THREE.DoubleSide,
                    uniforms: {
                        color: { type: 'c', value: new THREE.Color( material.color as number ) },
                        thickness: { type: 'f', value: thickness}
                    },
                    vertexShader: Shaders.vertexCode,
                    fragmentShader: Shaders.fragmentCode
                })
                this.mesh = new THREE.Mesh(this.geometry, sm)
            }
        }
        public update(cb: (index) => THREE.Vector3) {
            let attrs = (this.geometry as any).attributes
            let positions = attrs.position.array
            let path : THREE.Vector3[] = []
            for (let i = 0; i < this.length; i++) {
                path.push(cb(i))
            }
            let positionIdx = 0
            for (let i = 0; i < this.length; i++) {
                let pt = path[i]
                positions[positionIdx++] = pt.x
                positions[positionIdx++] = pt.y
                positions[positionIdx++] = pt.z
                positions[positionIdx++] = pt.x
                positions[positionIdx++] = pt.y
                positions[positionIdx++] = pt.z
            }
            
            let nexts = attrs.next.array
            copyToFrom(nexts, positions, 0, 6) // shifted left
            copyToFrom(nexts, positions, nexts.length - 6, positions.length - 6) // duplicate 6 at end

            let prevs = attrs.prev.array
            copyToFrom(prevs, positions, 6, 0) // shifted right
            copyToFrom(prevs, positions, 0, 0, 6) // duplicate 6 at beginning
            
            attrs.position.needsUpdate = true
            attrs.next.needsUpdate = true
            attrs.prev.needsUpdate = true    
        }
        
        public addToGroup(group:THREE.Group) {
            group.add(this.mesh)
        }

        public removeFromGroup(group:THREE.Group) {
            group.remove(this.mesh)
        }
        
        public setVisible(flag:boolean) {
            this.mesh.visible = flag
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
        public absScale: number = 1.5 // how much additional scale we visually apply to the psiAbs and phiAbs

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

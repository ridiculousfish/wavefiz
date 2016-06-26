/// <reference path="../typings/threejs/three.d.ts"/>
/// <reference path="./algorithms.ts"/>
/// <reference path="./potentials.ts"/>

module visualizing {
    function useNativeLines() {
        return false
    }
    
    // Base class for drawing lines
    export abstract class VisLine {
        protected object:THREE.Object3D
        constructor(protected length:number) {}

        public abstract update(cb: (index) => THREE.Vector3);

        public setVisible(flag:boolean) {
            this.object.visible = flag
        }
        
        public setRenderOrder(val:number) {
            this.object.renderOrder = val
        }

        public addToGroup(group:THREE.Group) {
            group.add(this.object)
        }

        public removeFromGroup(group:THREE.Group) {
            group.remove(this.object)
        }

        // Creation entry point, that chooses the best subclass
        public static create(length: number, material: THREE.LineBasicMaterialParameters): VisLine {
            if (useNativeLines()) {
                return new VisLineNative(length, material)
            } else {
                return new VisLineShader(length, material)
            }
        }
    }

    // Use native lines
    class VisLineNative extends VisLine {
        private geometry: THREE.Geometry = new THREE.Geometry()
        private line: THREE.Line
        constructor(length: number, material: THREE.LineBasicMaterialParameters) {
            super(length)
            const zero = new THREE.Vector3(0, 0, 0)
            for (let i = 0; i < length; i++) {
                this.geometry.vertices.push(zero)
            };
            (this.geometry as any).dynamic = true
            this.line = new THREE.Line(this.geometry, new THREE.LineBasicMaterial(material))

            // tell our superclass which element to operate on
            this.object = this.line
        }

        public update(cb: (index) => THREE.Vector3) {
            for (let i = 0; i < this.length; i++) {
                this.geometry.vertices[i] = cb(i)
            }
            this.geometry.verticesNeedUpdate = true
        }
    }
        
    let Shaders = {
        fragmentCode:
        `
            uniform vec3 color;
            varying float projectedDepth;

            void main() {
                vec3 mungedColor = color;
                //mungedColor += 10.0 * smoothstep(-50.0, 500., gl_FragCoord.z);
                
                //mungedColor *= (1.0 + smoothstep(-80.0, 80.0, zdepth)) / 2.0;
                
                float cameraDistance = 400.0;
                float psiScale = 250.0;
                float totalScale = psiScale * .5;
                float depthScale = smoothstep(-totalScale, totalScale, cameraDistance - projectedDepth);
                
                mungedColor *= (1.0 + depthScale) / 2.0;
                gl_FragColor = vec4(mungedColor, 1.0);
            }
        `,
        
        vertexCode:
        `
            attribute float direction;
            uniform float thickness;
            attribute vec3 next;
            attribute vec3 prev;
            varying float projectedDepth;
            
            void main() {
                float aspect = 800.0 / 600.0;
                vec2 aspectVec = vec2(aspect, 1.0);
                mat4 projViewModel = projectionMatrix * modelViewMatrix;
                vec4 previousProjected = projViewModel * vec4(prev, 1.0);
                vec4 currentProjected = projViewModel * vec4(position, 1.0);
                vec4 nextProjected = projViewModel * vec4(next, 1.0);
                
                projectedDepth = currentProjected.w;                

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
    
    // does not handle copying within self
    function copyToFrom(dst:Float32Array, src:Float32Array, dstStart:number, srcStart:number, amount:number = Number.MAX_VALUE) {
        const effectiveAmount = Math.min(amount, dst.length - dstStart, src.length - srcStart)
        for (let i=0; i < effectiveAmount; i++) {
            dst[i + dstStart] = src[i + srcStart]
        } 
    }
    
    // Use shaders
    export class VisLineShader extends VisLine {
        public geometry = new THREE.BufferGeometry()
        public mesh: THREE.Mesh
        constructor(length: number, material: THREE.LineBasicMaterialParameters) {
            super(length)
            // Length is the length of the path
            // Use two vertices for each element of our path
            // (and each vertex has 3 coordinates)
            const vertexCount = 2 * length
            let positions = new Float32Array(vertexCount*3)
            this.geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3))
            
            let thickness = Math.max(1, material["linewidth"] || 0)
            let depthWrite = material.hasOwnProperty("depthWrite") ? material["depthWrite"] : true
            
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
            this.geometry.addAttribute('next', new THREE.BufferAttribute(nexts, 3))
            this.geometry.addAttribute('prev', new THREE.BufferAttribute(prevs, 3))
            
            ;(this.geometry as any).dynamic = true
            let sm = new THREE.ShaderMaterial({
                side:THREE.DoubleSide,
                uniforms: {
                    color: { type: 'c', value: new THREE.Color( material.color as number ) },
                    thickness: { type: 'f', value: thickness}
                },
                vertexShader: Shaders.vertexCode,
                fragmentShader: Shaders.fragmentCode,
                depthWrite: depthWrite
            })
            this.mesh = new THREE.Mesh(this.geometry, sm)

            // tell superclass which object to operate on
            this.object = this.mesh
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
    }
}
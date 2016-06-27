/// <reference path="../typings/threejs/three.d.ts"/>

module visualizing {
    function useNativeLines() {
        return false
    }
    
    // Base class for drawing lines
    // "Line" here means a list of 3d points.
    // This could be a fancy function plot, or just a straight line.
    // Lines have a fixed count of points, but those points can change
    // We have a couple of strategies, depending on our client, hence this base class.
    export abstract class Polyline {
        // Our object is a mesh or similar
        // Base class methods like setVisible can operate on this without
        // knowing its dynamic type
        protected object:THREE.Object3D

        // The group into which this line has been installed
        private parent: THREE.Group = null
        
        // Lines have a fixed length. It cannot be updated.
        // This reflects the GL observation that instead of resizing a buffer,
        // you might as well create a new one
        constructor(protected length:number) {}

        // Entry point for line updates
        // This takes a function which in turn takes the point index
        // The output is the point 
        public abstract update(cb: (index:number) => THREE.Vector3)

        // Convenience function. Assuming this line is exactly 2 points long,
        // make it horizontal from X=0 -> width, with Y=yOffset and Z=0
        public makeHorizontal(width, yOffset) {
            assert(this.length == 2, "Line not of length 2")
            this.update((i: number) => vector3(i * width, yOffset, 0))
        }

        // Convenience function. Assuming this line is exactly 2 points long,
        // make it vertical from Y=0 -> width, with X=xOffset and Z=0
        public makeVertical(height, xOffset) {
            assert(this.length == 2, "Line not of length 2")
            this.update((i: number) => vector3(xOffset, i * height, 0))
        }

        // Make our line visible or not
        public setVisible(flag:boolean) {
            this.object.visible = flag
        }
        
        // Set our line's render order
        // Smaller values are rendered first
        public setRenderOrder(val:number) {
            this.object.renderOrder = val
        }

        // Remove our line from its parent if it has one
        public remove() {
            if (this.parent) {
                this.parent.remove(this.object)
                this.parent = null
            }
        }

        // Creation entry point, that chooses the best subclass
        // Creates a line of the given length, adds it to the given parent group
        public static create(length: number, parent: THREE.Group, material: THREE.LineBasicMaterialParameters): Polyline {
            let result : Polyline
            if (useNativeLines()) {
                result = new PolylineNative(length, material)
            } else {
                result = new PolylineShader(length, material)
            }
            if (parent) {
                result.parent = parent
                parent.add(result.object)
            }
            return result
        }
    }

    // Line subclass that uses native WebGL lines
    // Note that Chrome on Windows does not support these well
    // https://bugs.chromium.org/p/chromium/issues/detail?id=60124
    class PolylineNative extends Polyline {
        private geometry: THREE.Geometry = new THREE.Geometry()
        private line: THREE.Line
        constructor(length: number, material: THREE.LineBasicMaterialParameters) {
            super(length)
            const zero = new THREE.Vector3(0, 0, 0)
            for (let i = 0; i < length; i++) {
                this.geometry.vertices.push(zero)
            }
            this.line = new THREE.Line(this.geometry, new THREE.LineBasicMaterial(material))

            // tell our superclass which element to operate on
            this.object = this.line
        }

        // Simple update() implementation
        public update(cb: (index) => THREE.Vector3) {
            for (let i = 0; i < this.length; i++) {
                this.geometry.vertices[i] = cb(i)
            }
            this.geometry.verticesNeedUpdate = true
        }
    }

    // Line subclass that uses shaders
    // This uses the "screen space projected lines" technique described here:
    // https://mattdesl.svbtle.com/drawing-lines-is-hard
    export class PolylineShader extends Polyline {
        public geometry = new THREE.BufferGeometry()
        public mesh: THREE.Mesh

        constructor(length: number, material: THREE.LineBasicMaterialParameters) {
            super(length)

            // Length is the length of the path
            // We use two vertices for each element of our path,
            // and each vertex has 3 coordinates.
            const vertexCount = 2 * length
            let positions = new Float32Array(vertexCount*3)
            this.geometry.addAttribute('position', new THREE.BufferAttribute(positions, 3))
            
            // Determine the line thickness, or use 1
            const thickness = Math.max(1, material['linewidth'] || 0)
            const depthWrite = material.hasOwnProperty('depthWrite') ? material['depthWrite'] : true
            
            // Set face indexes
            // we draw two faces (triangles) for each line segment of our path
            // each face has 3 vertices, since it's a triangle
            //                                              
            //    0__2                  
            //    | /|
            //    |/ |
            //    1--3
            //
            const lineSegmentCount = length - 1
            const faceCount = 2 * lineSegmentCount
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
            
            // Compute the "direction" attribute, alternating 1 and -1 for each vertex
            // This tells our shader which way to push each vertex along the normal
            let directions = new Float32Array(vertexCount)
            for (let i=0; i < vertexCount; i++) {
                directions[i] = (i & 1) ? -1.0 : 1.0
            }
            this.geometry.addAttribute('direction', new THREE.BufferAttribute(directions, 1));
            
            // compute "next" and "previous" locations
            // This is a separate vertex array that is just our original shifted
            // next is shifted left, and previous shifted right
            let nexts = new Float32Array(vertexCount*3)
            let prevs = new Float32Array(vertexCount*3)
            this.geometry.addAttribute('next', new THREE.BufferAttribute(nexts, 3))
            this.geometry.addAttribute('prev', new THREE.BufferAttribute(prevs, 3))
            
            // Construct our shader
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
            // The attributes of a geometry are runtime dynamic
            // Do some casting shenanigans to get the types we want
            let attrs = this.geometry.attributes as any as LineBufferAttributeSet
            
            // Helper function to set vertices at a given index
            // Each point is associated with six vertices
            function setVertices(vertices: Float32Array, pointIndex:number, point:THREE.Vector3) {
                let vertexIdx = pointIndex * 6
                const {x, y, z} = point
                vertices[vertexIdx++] = x
                vertices[vertexIdx++] = y
                vertices[vertexIdx++] = z
                vertices[vertexIdx++] = x
                vertices[vertexIdx++] = y
                vertices[vertexIdx++] = z
            }

            // Fetch our positions, prevs, and nexts array, and update them
            let positions = attrs.position.array
            let prevs = attrs.prev.array
            let nexts = attrs.next.array
            const lastIdx = this.length - 1
            for (let i = 0; i < this.length; i++) {
                const pt: THREE.Vector3 = cb(i)
                // Our positions array stores the point
                // Our nexts array is positions shifted left
                // Our prevs array is positions shifted right
                setVertices(positions, i, pt)
                if (i > 0) setVertices(nexts, i-1, pt)
                if (i < lastIdx) setVertices(prevs, i+1, pt)

                // The first/last points logically have no previous/next point, respectively
                // Just duplicate the current point for them
                if (i === 0) setVertices(prevs, i, pt)
                if (i === lastIdx) setVertices(nexts, i, pt)
            }

            attrs.position.needsUpdate = true
            attrs.next.needsUpdate = true
            attrs.prev.needsUpdate = true    
        }
    }

    // The attributes that our line buffer uses
    // These is a more convenient typing than what our threejs typing provides
    interface LineBufferAttributeSet {
        next: { array: Float32Array; needsUpdate: boolean; } 
        prev: { array: Float32Array; needsUpdate: boolean; }
        position: { array: Float32Array; needsUpdate: boolean; } 
    }

    // The shaders we use
    const Shaders = {
        // The fragment shader is responsible for shading more distant points darker,
        // To give a 3d effect
        // This is a sort of psuedo-lighting
        // Note that we duplicate some fields from Parameters here
        fragmentCode:
        `
            uniform vec3 color;
            varying float projectedDepth; // depth of the corresponding vertex

            void main() {
                float cameraDistance = 400.0;
                float psiScale = 250.0; // maximum size of psi
                float totalScale = psiScale * .5; // maximum distance that psi can be from its baseline
                float depthScale = smoothstep(-totalScale, totalScale, cameraDistance - projectedDepth);
                
                vec3 mungedColor = color * (1.0 + depthScale) / 2.0;
                gl_FragColor = vec4(mungedColor, 1.0);
            }
        `,
        
        // The vertex shader is fancier
        // This is responsible for drawing lines of fixed thickness, regardless of depth
        // We have a path, containing a list of points
        // Each point has two vertices at that point
        // Each vertex is also given the previous and next vertex, along that path
        // This allows us to compute the normal (in screen space!) of that path
        // We then push the two points along the normal, in opposite directions
        // See "Screen-Space Projected Lines" from https://mattdesl.svbtle.com/drawing-lines-is-hard
        // Note that this shader also steals some values from the Params. These ought to be passed in.
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
                
                // Project all of our points to model space
                vec4 previousProjected = projViewModel * vec4(prev, 1.0);
                vec4 currentProjected = projViewModel * vec4(position, 1.0);
                vec4 nextProjected = projViewModel * vec4(next, 1.0);
                
                // Pass the projected depth to the fragment shader
                projectedDepth = currentProjected.w;                

                // Get 2D screen space with W divide and aspect correction
                vec2 currentScreen = currentProjected.xy / currentProjected.w * aspectVec;
                vec2 previousScreen = previousProjected.xy / previousProjected.w * aspectVec;
                vec2 nextScreen = nextProjected.xy / nextProjected.w * aspectVec;
                                
                // Use the average of the normals
                // This helps us handle 90 degree turns correctly
                vec2 tangent1 = normalize(nextScreen - currentScreen);
                vec2 tangent2 = normalize(currentScreen - previousScreen);
                vec2 averageTangent = normalize(tangent1 + tangent2);
                vec2 normal = vec2(-averageTangent.y, averageTangent.x);
                normal *= thickness/2.0;
                normal.x /= aspect;
                
                // Offset our position along the normal
                vec4 offset = vec4(normal * direction, 0.0, 1.0);
                gl_Position = currentProjected + offset;
            }
        `
    }
}
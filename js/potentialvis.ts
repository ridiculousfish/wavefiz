/// <reference path='./commonvis.ts'/>

module visualizing {

    // This is the DOM id of the "Draw" text that appears
    // when we start sketching
    const DRAW_TEXT_ID = "draw_text"

    // PotentialVisualiazer is a component responsible for showing the
    // current potential and the "sketched potential"
    export class PotentialVisualizer {
        // The group containing all of our visual elements
        // The parent visualizer should add this to the appropriate scene
        public group: THREE.Group = new THREE.Group()

        // The line that draws the potential
        private potentialLine_: VisLine

        // The background
        private background_: THREE.Mesh
        
        // When sketching a potential, this is the line that draws the sketch
        private sketchLine_: VisLine

        // When sketching, the "graph paper" mesh effect
        private sketchGrid_: THREE.GridHelper

        // The state of the visualizer
        private state_: State = new State()

        constructor(public params: Parameters) {
            // Construct the line showing the potential
            this.potentialLine_ = new VisLine(this.params.meshDivision, {
                color: 0xFF00FF,
                linewidth: 5,
                depthWrite: false
            })
            this.potentialLine_.setRenderOrder(-5000)
            this.potentialLine_.addToGroup(this.group)

            // Construct the line showing the current sketch 
            this.sketchLine_ = new VisLine(this.params.meshDivision, {
                color: 0x00FFFF,
                linewidth: 8
            })
            this.sketchLine_.addToGroup(this.group)

            // Construct our background
            let planeGeo = new THREE.PlaneGeometry(this.params.width * 2, this.params.height * 2)
            let planeMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
            this.background_ = new THREE.Mesh(planeGeo, planeMat)
            this.background_.position.set(this.params.width / 2, this.params.height / 2, 0)
            this.background_.renderOrder = -10000
            this.group.add(this.background_)

            // Construct our "graph paper"" grid
            const gridSize = Math.max(this.params.width, this.params.height)
            const gridStep = 20
            this.sketchGrid_ = new THREE.GridHelper(gridSize, gridStep)
            this.sketchGrid_.setColors(0x000000, 0x006385)
            this.sketchGrid_.renderOrder = -9999
            this.sketchGrid_.rotation.x = Math.PI/2
            this.group.add(this.sketchGrid_)
        }

        // Entry point for all state updates 
        public setState(state:State) {
            this.state_ = state
            this.sketchGrid_.visible = this.state_.sketching
            this.setDrawTextShown(state.sketching && state.sketchLocations.length == 0)
            this.redrawPotentialLine()
            this.redrawSketchLine() 
        }

        // Called from state update, update the line representing the sketch
        private redrawSketchLine() {
            const hasPoints = this.state_.sketchLocations.length > 0
            this.sketchLine_.setVisible(hasPoints)
            if (hasPoints) {
                this.sketchLine_.update((i: number) => {
                    // Lines cannot be resized
                    // Thus we allocate our line to be the maximum number of points we care to support
                    // If our true line has fewer points, just repeat the last line
                    const clampedIdx = Math.min(i, this.state_.sketchLocations.length - 1)
                    return this.state_.sketchLocations[clampedIdx]
                })
            }
        }

        // Called from state update. Update the line representing our potential
        private redrawPotentialLine() {
            const mesh = this.state_.potential
            const hasPotential = (mesh.length > 0)
            this.potentialLine_.setVisible(hasPotential) 
            if (hasPotential) {
                assert(mesh.length == this.params.meshDivision, "Bad potential length")
                this.potentialLine_.update((index: number) => {
                    const value = mesh[index]
                    const x = this.params.centerForMeshIndex(index)
                    const y = this.params.convertYToVisualCoordinate(value)
                    const z = 0
                    return vector3(x, y, z)
                })
            }
        }

        // Called from state update, update the "Draw" text overlay
        private setDrawTextShown(flag:boolean) {
            document.getElementById(DRAW_TEXT_ID).style['visibility'] = flag ? 'visible' : 'hidden'
        }

        // Draggable implementation
        // Here the user has started dragging
        public dragStart(raycaster: THREE.Raycaster) {
            if (this.state_.sketching) {
                this.state_.modify(this.params, (st:State) => {
                    st.sketchLocations = []
                })
            }
        }

        // The user dragged to a new location
        // Append that location to the state
        public dragged(raycaster: THREE.Raycaster) {
            if (! this.state_.sketching) return
            let intersections = raycaster.intersectObject(this.background_, false)
            if (intersections.length > 0) {
                const where = intersections[0].point
                const newLoc = vector3(where.x + this.params.width / 2, where.y + this.params.height / 2, 0) 
                this.state_.modify(this.params, (st:State) => {
                    st.sketchLocations = st.sketchLocations.concat([newLoc]) 
                })
            }
        }

        // The user stopped dragging. Clear the sketch line and build a potential from it!
        public dragEnd() {
            // Do nothing unless we're sketching
            if (! this.state_.sketching) return
            
            // We are going to construct the new potential from the drag location
            // We do this with a "SampledPotential" potential builder, which builds a potential
            // by interpolating between sampled points.
            // Our drag locations have x in the range [0, params.width), and y in [0, params.height)
            // map to the range [0, 1], and flip the y coordinate so that zero is at the bottom
            let samples = this.state_.sketchLocations.map((vec:Vector3) => {
                return {x: vec.x / this.params.width, y: 1.0 - vec.y / this.params.height}
            })
            this.state_.modify(this.params, (st:State) => {
                st.sketching = false
                st.sketchLocations = []
                // If we have no samples, it's because the user didn't draw any
                // Don't replace the potential in that case 
                if (samples.length > 0) { 
                    st.potentialBuilder = algorithms.SampledPotential(samples)
                }
            })
        }

        // Perform hit testing
        public hitTestDraggable(raycaster: THREE.Raycaster): Draggable {
            let intersections = raycaster.intersectObject(this.background_, false)
            return intersections.length > 0 ? this : null
        }
    }
}

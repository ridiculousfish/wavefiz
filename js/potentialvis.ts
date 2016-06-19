/// <reference path='./commonvis.ts'/>

module visualizing {

    const DRAW_TEXT_ID = "draw_text"
    
    export class PotentialVisualizer {
        private dragLocations_: Vector3[] = []
        private dragLine_: VisLine
        private potentialLine_: VisLine
        private background_: THREE.Mesh
        private sketchGrid_: THREE.GridHelper
        private sketching_ = false
        private DRAG_STROKE_WIDTH = 5

        // callback for when the potential is updated
        public potentialUpdatedCallback: ((n: Vector3[]) => void) = undefined

        // the values of our mesh, stored unflipped (0 at bottom)
        private potentialMesh_: number[]
        constructor(public params: Parameters) {
            // note line geometries cannot be resized            
            this.dragLine_ = new VisLine(this.params.meshDivision, {
                color: 0x00FFFF,
                linewidth: 8
            })
            this.potentialLine_ = new VisLine(this.params.meshDivision, {
                color: 0xFF00FF,
                linewidth: 5,
                depthWrite: false
            })
            this.potentialLine_.setRenderOrder(-5000)

            let planeGeo = new THREE.PlaneGeometry(this.params.width * 2, this.params.height * 2)
            let planeMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
            this.background_ = new THREE.Mesh(planeGeo, planeMat)
            this.background_.position.set(this.params.width / 2, this.params.height / 2, 0)
            this.background_.renderOrder = -10000

            // This is the "graph paper" grid
            const gridSize = Math.max(this.params.width, this.params.height)
            const gridStep = 20
            this.sketchGrid_ = new THREE.GridHelper(gridSize, gridStep)
            this.sketchGrid_.setColors(0x000000, 0x006385)
            this.sketchGrid_.renderOrder = -9999
            this.sketchGrid_.rotation.x = Math.PI/2
            this.sketchGrid_.visible = false
        }

        private interpolateY(p1: THREE.Vector3, p2: THREE.Vector3, x: number): number {
            let d1 = Math.abs(p1.x - x)
            let d2 = Math.abs(p2.x - x)
            let distance = d1 + d2
            let leftWeight = (distance == 0 ? 1.0 : 1.0 - (d1 / distance))
            return p1.y * leftWeight + p2.y * (1.0 - leftWeight)
        }

        // builds a potential mesh of size meshDivision_
        // locs is relative to upper left: smaller values are more north
        private buildMeshFromDragPoints(locs: Vector3[]): number[] {
            let potentialMesh: number[] = []

            for (let meshIdx = 0; meshIdx < this.params.meshDivision; meshIdx++) {
                let meshCenterX = this.params.centerForMeshIndex(meshIdx)
                // find the drag points
                var candidates = []
                for (let i = 1; i < locs.length; i++) {
                    let p1 = locs[i - 1], p2 = locs[i]
                    if (p1.x <= meshCenterX && p2.x >= meshCenterX ||
                        p2.x <= meshCenterX && p1.x >= meshCenterX) {
                        candidates.push(this.interpolateY(p1, p2, meshCenterX))
                    }
                }
                if (candidates.length == 0) {
                    // use closest point
                    let closest = locs[0]
                    for (let i = 1; i < locs.length; i++) {
                        if (Math.abs(meshCenterX - locs[i].x) < Math.abs(meshCenterX - closest.x)) {
                            closest = locs[i]
                        }
                    }
                    candidates.push(closest.y)
                }

                // use the largest potential
                let minCandidate = Math.min(...candidates)

                // convert from candidate to potential
                const potential = this.params.height - minCandidate

                potentialMesh.push(potential)
            }
            return potentialMesh
        }

        // Draggable implementations
        dragStart(raycaster: THREE.Raycaster) {
            if (! this.sketching_) return
            this.clearDragLocations(false)
        }

        dragEnd() {
            if (! this.sketching_) return
            if (this.dragLocations_.length == 0) {
                return
            }
            this.sketching_ = false
            this.setDrawTextShown(false)
            this.sketchGrid_.visible = false

            const locs = this.dragLocations_.slice()
            this.potentialMesh_ = this.buildMeshFromDragPoints(locs)
            this.clearDragLocations(true)
            this.redrawPotentialMesh()
            this.announceNewPotential(locs)
        }

        dragged(raycaster: THREE.Raycaster) {
            if (! this.sketching_) return
            let intersections = raycaster.intersectObject(this.background_, false)
            if (intersections.length > 0) {
                this.setDrawTextShown(false)
                let where = intersections[0].point
                this.dragLocations_.push(vector3(where.x + this.params.width / 2, where.y + this.params.height / 2, 0))
                this.redrawDragLine()
            }
        }

        hitTestDraggable(raycaster: THREE.Raycaster): Draggable {
            let intersections = raycaster.intersectObject(this.background_, false)
            return intersections.length > 0 ? this : null
        }

        private clearDragLocations(animate: boolean) {
            if (this.dragLocations_.length > 0) {
                this.dragLocations_.length = 0
                this.redrawDragLine()
            }
        }

        private redrawDragLine() {
            const hasPoints = this.dragLocations_.length > 0
            this.dragLine_.setVisible(hasPoints)
            if (hasPoints) {
                this.dragLine_.update((i: number) => {
                    return this.dragLocations_[Math.min(i, this.dragLocations_.length - 1)]
                })
            }
        }

        private redrawPotentialMesh() {
            const hasPotential = (this.potentialMesh_.length > 0)
            this.potentialLine_.setVisible(hasPotential) 
            if (hasPotential) {
                this.potentialLine_.update((index: number) => {
                    const value = this.potentialMesh_[index]
                    const x = this.params.centerForMeshIndex(index)
                    const y = this.params.convertYToVisualCoordinate(value)
                    const z = 0
                    return vector3(x, y, z)
                })
            }
        }

        private announceNewPotential(locs:Vector3[]) {
            if (this.potentialUpdatedCallback) {
                this.potentialUpdatedCallback(locs)
            }
        }

        public addToGroup(group: THREE.Group) {
            group.add(this.background_)
            group.add(this.sketchGrid_)
            this.potentialLine_.addToGroup(group)
            this.dragLine_.addToGroup(group)
        }

        public setPotential(potentialMesh: number[]) {
            this.potentialMesh_ = potentialMesh
            this.redrawPotentialMesh()
        }

        private setDrawTextShown(flag:boolean) {
            document.getElementById(DRAW_TEXT_ID).style['visibility'] = flag ? 'visible' : 'hidden'
        }

        public beginSketch() {
            this.sketching_ = true
            this.setDrawTextShown(true)
            this.setPotential([])
            this.sketchGrid_.visible = true 
        }
    }
}

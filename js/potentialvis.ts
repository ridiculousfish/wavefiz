/// <reference path='./commonvis.ts'/>

module visualizing {
    
    export class PotentialVisualizer {
        private dragLocations_: Vector3[] = []
        private dragLine_: VisLine
        private potentialLine_: VisLine
        private background_: THREE.Mesh
        private DRAG_STROKE_WIDTH = 5

        // callback for when the potential is updated
        public potentialUpdatedCallback: ((n: number[]) => void) = undefined

        // the values of our mesh, stored unflipped (0 at bottom)
        private potentialMesh_: number[]
        constructor(public params: Parameters) {
            this.init()
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
                const potential = (this.params.height - minCandidate) / this.params.yScale

                potentialMesh.push(potential)
            }
            return potentialMesh
        }

        // Draggable implementations
        dragStart(raycaster: THREE.Raycaster) {
            this.clearDragLocations(false)
        }

        dragEnd() {
            this.potentialMesh_ = this.buildMeshFromDragPoints(this.dragLocations_)
            this.clearDragLocations(true)
            this.redrawPotentialMesh()
            this.announceNewPotential()
        }

        dragged(raycaster: THREE.Raycaster) {
            let intersections = raycaster.intersectObject(this.background_, false)
            if (intersections.length > 0) {
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
            this.potentialLine_.update((index: number) => {
                const value = this.potentialMesh_[index]
                const x = this.params.centerForMeshIndex(index)
                const y = this.params.convertYToVisualCoordinate(value)
                const z = 0
                return vector3(x, y, z)
            })
        }

        private announceNewPotential() {
            if (this.potentialUpdatedCallback) {
                this.potentialUpdatedCallback(this.potentialMesh_)
            }
        }

        private init() {
            // note line geometries cannot be resized            
            this.dragLine_ = new VisLine(this.params.meshDivision, {
                color: 0x00FFFF,
                linewidth: 8
            })
            this.potentialLine_ = new VisLine(this.params.meshDivision, {
                color: 0xFF00FF,
                linewidth: 5
            })

            let planeGeo = new THREE.PlaneGeometry(this.params.width * 2, this.params.height * 2)
            let planeMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
            this.background_ = new THREE.Mesh(planeGeo, planeMat)
            this.background_.position.set(this.params.width / 2, this.params.height / 2, 0)
            this.background_.renderOrder = -10000
        }

        public addToGroup(group: THREE.Group) {
            group.add(this.background_)
            this.potentialLine_.addToGroup(group)
            this.dragLine_.addToGroup(group)
        }

        public setPotential(potentialMesh: number[]) {
            this.potentialMesh_ = potentialMesh
            this.redrawPotentialMesh()
            this.announceNewPotential()
        }
    }
}

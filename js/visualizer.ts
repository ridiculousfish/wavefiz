/// <reference path="../typings/d3/d3.d.ts"/>
/// <reference path='./algorithms.ts'/>
/// <reference path='./dragging.ts'/>

module visualizing {
    
    export class Parameters {
        public xScale = 1
        public yScale = 1 // multiply to go from potential to graphical point
        public width : number = 800
        public height : number = 600
        public meshDivision : number = 1025 // how many points are in our mesh. Must be odd.
        public psiScale: number = 150 // how much scale we apply to the wavefunction
        
        public showPsi = true
        public showPsi2 = false
        
        public centerForMeshIndex(idx:number):number {
            assert(idx >= 0 && idx < this.meshDivision, "idx out of range")
            let meshWidth = this.width / this.meshDivision
            return idx * meshWidth + meshWidth / 2.0
        }
        
        public convertYToVisualCoordinate(y:number) {
            return this.height - this.yScale * y
        }
        
        public convertYFromVisualCoordinate(y:number) {
            return (this.height - y) / this.yScale
        }
        
        public convertXToVisualCoordinate(x:number) {
            return (x / this.meshDivision) * this.width
        }
    }
    
    interface InputState {
        potential: number[],
        energy: number
    }

    function assert(condition, message) {
        if (!condition) {
            throw message || "Assertion failed"
        }
    }

    class Point { 
        constructor(public x: number, public y: number) { }
        
        toString() : string {
            return "x: " + this.x + ", y: " + this.y
        }
        
        copy() : Point {
            return new Point(this.x, this.y)
        }
    }

    class PotentialVisualizer {
        private container_: d3.Selection<any>
        private dragLocations_ : Point[] = []
        private lineGraph_ : d3.Selection<any>
        private potentialGraph_ : d3.Selection<any>
        
        // callback for when the potential is updated
        public potentialUpdatedCallback : ((n:number[]) => void) = undefined
        
        // the values of our mesh, stored unflipped (0 at bottom)
        private potentialMesh_ : number[]
        constructor(container: d3.Selection<any>, public params : Parameters) {
            this.container_ = container
            this.init()
        }
        
        private interpolateY(p1:Point, p2:Point, x:number) {
            let d1 = Math.abs(p1.x - x)
            let d2 = Math.abs(p2.x - x)
            let distance = d1 + d2
            let leftWeight = (distance == 0 ? 1.0 : 1.0 - (d1 / distance))
            return p1.y * leftWeight + p2.y * (1.0 - leftWeight)
        }
        
        // builds a potential mesh of size meshDivision_
        // locs is relative to upper left: smaller values are more north
        private buildMeshFromDragPoints(locs:Point[]) : number[] {
            let potentialMesh : number[] = []
                                    
            for (let meshIdx = 0; meshIdx < this.params.meshDivision; meshIdx++) {
                let meshCenterX = this.params.centerForMeshIndex(meshIdx)
                // find the drag points
                var candidates = []
                for (let i=1; i < locs.length; i++) {
                    let p1 = locs[i-1], p2 = locs[i]
                    if (p1.x <= meshCenterX && p2.x >= meshCenterX ||
                        p2.x <= meshCenterX && p1.x >= meshCenterX) {
                        candidates.push(this.interpolateY(p1, p2, meshCenterX))
                    }
                }
                if (candidates.length == 0) {
                    // use closest point
                    let closest = locs[0]
                    for (let i=1; i < locs.length; i++) {
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
        
        private doDrag() {
            let _this = this
            let pos = d3.mouse(this.container_.node())
            let where = new Point(pos[0], pos[1])
            this.dragLocations_.push(where)
            
            let lineFunction = d3.svg.line()
                          .x(function(d) { return (d as any).x })
                          .y(function(d) { return (d as any).y })
                          .interpolate("linear")

            _this.lineGraph_.attr("d", lineFunction(this.dragLocations_ as any))
        }
        
        private redrawPotentialMesh() {
            let points : [number, number][] = this.potentialMesh_.map((value, index) => {
                let result :[number, number] =  [this.params.centerForMeshIndex(index), this.params.convertYToVisualCoordinate(value)]
                return result
            })
            let lineFunction = d3.svg.line()
                          .x(function(d) { return d[0] })
                          .y(function(d) { return d[1] })
                          .interpolate("basis-open")
            this.potentialGraph_.attr("d", lineFunction(points))
        }
        
        private announceNewPotential() {
            if (this.potentialUpdatedCallback) {
                this.potentialUpdatedCallback(this.potentialMesh_)
            }
        }

        private init() {
            let _this = this
            let dragHandler = () => _this.doDrag() 
            
            let drag = d3.behavior.drag()
                .on("drag", dragHandler)
                .on("dragstart", () => {
                    // clear last drag
                    _this.dragLocations_.length = 0
                    _this.potentialMesh_ = []
                    _this.redrawPotentialMesh()
                    _this.announceNewPotential()
                })
                .on("dragend", () => {
                    // smooth points
                    _this.potentialMesh_ = _this.buildMeshFromDragPoints(_this.dragLocations_)
                    _this.dragLocations_.length = 0
                    _this.redrawPotentialMesh()
                    _this.announceNewPotential()
                })
              
            this.container_.call(drag)         
            
            _this.lineGraph_ = this.container_.append("path")
                              .attr("stroke", "cyan")
                              .attr("stroke-width", 5)
                              .attr("fill", "none")
                              
            _this.potentialGraph_ = this.container_.append("path")
                              .attr("stroke", "purple")
                              .attr("stroke-width", 2)
                              .attr("fill", "none")
        }
        
        loadFrom(f:((x:number) => number)) {
            // given a function that maps x to a potential, builds the full potential
            let potentialMesh : number[] = []
            for (let i=0; i < this.params.meshDivision; i++) {
                const x = this.params.centerForMeshIndex(i)
                potentialMesh.push(f(x))
            }
            this.potentialMesh_ = potentialMesh
            this.redrawPotentialMesh()
            this.announceNewPotential()
        } 
    }
    
    class WavefunctionVisualizer {
        private wavefunction_: Wavefunction = null
        private resolvedWavefunction_ : ResolvedWavefunction = null
        private psiGraph_ : d3.Selection<any>
        private psi2Graph_ : d3.Selection<any>
        private psiBaseline_ : d3.Selection<any>
                
        constructor(container: d3.Selection<any>, public params: Parameters, public color: string) {                                             
            this.psiGraph_ = container.append("path")
                                .attr("id", "psi")
                                .attr("stroke", this.color)
                                .attr("stroke-width", 5)
                                .attr("fill", "none")
                                
            this.psi2Graph_ = container.append("path")
                                .attr("id", "psi2")
                                .attr("stroke", this.color)
                                .attr("stroke-width", 8)
                                .attr("stroke-opacity", .75)
                                .attr("fill", "none")
                                 
            this.psiBaseline_ = container.append("line")
                                 .attr("id", "psiBaseline")
                                 .attr("stroke", this.color)
                                 .attr("stroke-width", .5)
                                 .attr("fill", "none")

        }
        
        setWavefunction(psi:Wavefunction) {
            this.wavefunction_ = psi
            this.resolvedWavefunction_ = psi.resolveAtClassicalTurningPoints()
            this.redraw()
        }
        
        clear() {
            this.wavefunction_ = null
            this.resolvedWavefunction_ = null
            this.redraw()
        }
                
        redraw() {
            if (this.wavefunction_ === null) {
                this.psiGraph_.attr("d", [] as any)
                this.psiBaseline_.attr("visibility", "hidden")
                return
            }
            
            let lineFunction = d3.svg.line()
                          .x(function(d) { return d[0] })
                          .y(function(d) { return d[1] })
                          .interpolate("linear")
            
            const cleanValue = (value:number) => {
                const limit = this.params.height/2
                if (isNaN(value)) {
                    value = limit
                }
                return Math.max(-limit, Math.min(limit, value))
            }

            const psiScale = this.params.psiScale
            const psi = this.resolvedWavefunction_.values
            let points : [number, number][] = psi.map((value, index) => {
                let result :[number, number] = [this.params.centerForMeshIndex(index), cleanValue(psiScale * value)]
                return result
            })
            this.psiGraph_
                .attr("d", lineFunction(points))
                .attr("visibility", this.params.showPsi ? "visible" : "hidden")

            let points2 : [number, number][] = psi.map((value, index) => {
                let result:[number, number] = [this.params.centerForMeshIndex(index), cleanValue(psiScale * -(value * value))]
                return result
            })            
            this.psi2Graph_
                .attr("d", lineFunction(points2))
                .attr("visibility", this.params.showPsi2 ? "visible" : "hidden")
            
            this.psiBaseline_.attr("x1", 0)
                             .attr("y1", 0)
                             .attr("x2", this.params.width)
                             .attr("y2", 0)
                             .attr("visibility", "visible")
        }
    }

    export class Visualizer {
        private container_: d3.Selection<any>
        private potential_ : PotentialVisualizer
        
        private wavefunction_ : WavefunctionVisualizer
        private wavefunction2_ : WavefunctionVisualizer
        
        private energyDragger_ : dragger.Dragger
        
        private leftTurningPoint_: d3.Selection<any>
        private rightTurningPoint_: d3.Selection<any>
                
        public maxX : number = 20
        public params  = new Parameters()
        
        public state : InputState = {potential: [], energy: 2.5} 

        constructor(container: string) {
            this.init(container)
        }

        private init(containerName: string) {
            
            this.params.width = 800
            this.params.height = 600
            this.params.meshDivision = 1025
            
            this.container_ = d3.select(containerName)
            let group = this.container_
                            .append('g')
                            .attr("id", "Group")
                    
            // background
            group.append('rect')
                  .attr({"width": 800,
                         "height": 600,
                          "fill": "steelblue"})
                          
            // Potential Visualizer
            this.potential_ = new PotentialVisualizer(group, this.params)
            this.potential_.potentialUpdatedCallback = (v:number[]) => { 
                this.state.potential = v.slice()
                this.computeAndShowWavefunction()
            }
            
            // Wavefunction Visualizer
            const centerY = this.params.height / 2
            let psiGroup = group.append('g')
                                .attr("transform", "translate(0, " + (centerY - 125) + ")")
            this.wavefunction_ = new WavefunctionVisualizer(psiGroup, this.params, "orange")

            let psiGroup2 = group.append('g')
                                .attr("transform", "translate(0, " + (centerY + 125) + ")")            
            this.wavefunction2_ = new WavefunctionVisualizer(psiGroup2, this.params, "yellow")
            
            // Turning points
            this.leftTurningPoint_ = group.append("line").attr("class", "turningpoint")
            this.rightTurningPoint_ = group.append("line").attr("class", "turningpoint")
            group.selectAll(".turningpoint").attr({
                x1:-1,
                x2:-1,
                y1:0,
                y2:this.params.height,
                "stroke-width": 1,
                stroke:"black",
                "stroke-opacity": .3,
                visibility: "hidden",
            })
            
            // Energy dragger
            this.energyDragger_ = new dragger.Dragger("Energy", false,  this.container_, this.params)
            this.energyDragger_.attr({visibility: "hidden"})
            this.energyDragger_.positionUpdated = (proposedY:number) => {
                // the user dragged the energy to a new value, expressed our "height" coordinate system
                // compute a new wavefunction
                const proposedE = this.params.convertYFromVisualCoordinate(proposedY)
                this.state.energy = proposedE 
                this.computeAndShowWavefunction()
            }            
        }
        
        private computeAndShowWavefunction() {
            if (this.state.potential.length == 0) {
                // clear everything
                this.wavefunction_.clear()
                this.wavefunction2_.clear()
                this.energyDragger_.attr({visibility: "hidden"})
                this.container_.selectAll(".turningpoint").attr({
                    x1:-1,
                    x2:-1
                })
                return
            }
            // update wavefunctions
            const psiInputs = {
                potentialMesh:this.state.potential,
                energy:this.state.energy,
                xMax: this.maxX
            }
            let psi = NumerovIntegrator(true).computeWavefunction(psiInputs)
            this.wavefunction_.setWavefunction(psi)
            
            let psi2 = NumerovIntegrator(false).computeWavefunction(psiInputs)
            this.wavefunction2_.setWavefunction(psi2)
            
            // update energy
            const visEnergy = this.params.convertYToVisualCoordinate(this.state.energy)
            this.energyDragger_.update(visEnergy, this.state.energy)
            this.energyDragger_.attr({visibility: "visible"})
            
            // update turning points
            const turningPoints = psi.classicalTurningPoints()
            const leftV = this.params.convertXToVisualCoordinate(turningPoints.left)
            const rightV = this.params.convertXToVisualCoordinate(turningPoints.right)
            this.leftTurningPoint_.attr({x1:leftV, x2:leftV, visibility:"visible"})
            this.rightTurningPoint_.attr({x1:rightV, x2:rightV, visibility:"visible"})
        }
        
        public setShowPsi(flag:boolean) {
            this.params.showPsi = flag
            this.computeAndShowWavefunction()
        }
        
        public setShowPsi2(flag:boolean) {
            this.params.showPsi2 = flag
            this.computeAndShowWavefunction()
        }
        
        public loadSHO() {
            // Simple Harmonic Oscillator
            this.params.yScale = 400 / 25
            this.potential_.loadFrom((x:number) => {
                // x is a value in [0, this.potential_.width)
                // we have a value of 0 at x = width/2
                const offsetX = this.params.width / 2
                const scaledX =  (x - offsetX) * this.maxX / this.params.width
                return (scaledX * scaledX / 2.0) 
            })
        }
        
        public loadISW() {
            // Infinite square well
            this.params.yScale = 50
            const widthRatio = 1.0 / 5.0
            this.potential_.loadFrom((x:number) => {
                // x is a value in [0, this.params.width)
                const width = this.params.width
                if (x < width * widthRatio || x > width - (width * widthRatio)) {
                    return 1000
                }
                return 1
            })
        }
        
        public loadFSW() {
            // Finite square well
            this.params.yScale = 50
            const widthRatio = 1.0 / 5.0
            this.potential_.loadFrom((x:number) => {
                // x is a value in [0, this.params.width)
                const width = this.params.width
                if (x < width * widthRatio || x > width - (width * widthRatio)) {
                    return 7
                }
                return 1
            })
        }
    }
}

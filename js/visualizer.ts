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
        public phiScale: number = 100 // how much scale we apply to the wavefunction
        
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

    class Potential {
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
                })
                .on("dragend", () => {
                    // smooth points
                    _this.potentialMesh_ = _this.buildMeshFromDragPoints(_this.dragLocations_)
                    _this.redrawPotentialMesh()
                    _this.announceNewPotential()
                })
              
            this.container_.call(drag)         
            
            _this.lineGraph_ = this.container_.append("path")
                              .attr("stroke", "yellow")
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
        private wavefunction_: Wavefunction = undefined
        private resolvedWavefunction_ : ResolvedWavefunction = undefined
        private container_: d3.Selection<any>
        private phiGraph_ : d3.Selection<any>
        private phiBaseline_ : d3.Selection<any>
                
        constructor(container: d3.Selection<any>, public params: Parameters) {
            this.container_ = container
                                             
            this.phiGraph_ = this.container_.append("path")
                                .attr("id", "phi")
                                .attr("stroke", "orange")
                                .attr("stroke-width", 5)
                                .attr("fill", "none")
                                 
            this.phiBaseline_ = this.container_.append("line")
                                 .attr("id", "phiBaseline")
                                 .attr("stroke", "yellow")
                                 .attr("stroke-width", .5)
                                 .attr("fill", "none")


        }
        
        setWavefunction(phi:Wavefunction) {
            this.wavefunction_ = phi
            this.resolvedWavefunction_ = phi.resolveAtClassicalTurningPoints()
            this.redraw()
        }
                
        redraw() {
            
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

            const centerY = this.params.height / 2
            const phiScale = this.params.phiScale
            const phi = this.resolvedWavefunction_.values
            let points : [number, number][] = phi.map((value, index) => {
                let result :[number, number] = [this.params.centerForMeshIndex(index), centerY + cleanValue(phiScale * value)]
                return result
            })            
            this.phiGraph_.attr("d", lineFunction(points))
            
            this.phiBaseline_.attr("x1", 0)
                             .attr("y1", centerY)
                             .attr("x2", this.params.width)
                             .attr("y2", centerY)                             
        }
    }

    export class Visualizer {
        private container_: string
        private group_: d3.Selection<any>
        private potentialGroup_: d3.Selection<any>
        private potential_ : Potential
        
        private wavefunctionGroup_: d3.Selection<any>
        private wavefunction_ : WavefunctionVisualizer
        
        private energyDragger_ : dragger.Dragger
        
        public maxX : number = 20
        public params  = new Parameters()
        
        public state : InputState = {potential: [], energy: 2.5} 

        constructor(container: string) {
            this.init(container)
        }

        private init(container: string) {
            
            this.params.width = 800
            this.params.height = 600
            this.params.meshDivision = 1025
            
            this.container_ = container
            this.potentialGroup_ = d3.select(this.container_).append('g')
            this.potentialGroup_.append('rect')
                                .attr({"width": 800,
                                       "height": 600,
                                       "fill": "steelblue"})
            this.potential_ = new Potential(this.potentialGroup_, this.params)
            this.potential_.potentialUpdatedCallback = (v:number[]) => { 
                this.state.potential = v.slice()
                this.computeAndShowWavefunction()
            }
            
            this.wavefunctionGroup_ = d3.select(this.container_).append('g')
            this.wavefunction_ = new WavefunctionVisualizer(this.potentialGroup_, this.params)

            this.energyDragger_ = new dragger.Dragger("Energy", false,  d3.select(this.container_), this.params)
            this.energyDragger_.attr({visibility: "hidden"})
            
            this.energyDragger_.positionUpdated = (proposedY:number) => {
                // the user dragged the energy to a new value, expressed our "height" coordinate system
                // compute a new wavefunction
                const proposedE = this.params.convertYFromVisualCoordinate(proposedY)
                this.state.energy = proposedE 
                this.computeAndShowWavefunction()
            }
            
            this.group_ = d3.select(this.container_).append('g')
        }
        
        private computeAndShowWavefunction() {
            const integrator = NumerovIntegrator(true)
            let phi = integrator.computeWavefunction({
                potentialMesh:this.state.potential,
                energy:this.state.energy,
                xMax: this.maxX
            })
            this.wavefunction_.setWavefunction(phi)
            const visEnergy = this.params.convertYToVisualCoordinate(phi.energy)
            this.energyDragger_.update(visEnergy, phi.energy)
            this.energyDragger_.attr({visibility: "visible"})
        }
        
        public loadSHO() {
            // Load the simple harmonic oscillator potential
            this.params.yScale = 300 / 25
            this.potential_.loadFrom((x:number) => {
                // x is a value in [0, this.potential_.width)
                // we have a value of 0 at x = width/2
                const offsetX = this.params.width / 2
                const scaledX =  (x - offsetX) * this.maxX / this.params.width
                return scaledX * scaledX / 2.0 
            })
        }

        draw() {
            return
            let scale = d3.scale.linear();

            scale.domain([0, 1])
            scale.range([0, 800])
            var axis = d3.svg.axis()
            axis.scale(scale)
            this.group_.call(axis)
        }
    }
}

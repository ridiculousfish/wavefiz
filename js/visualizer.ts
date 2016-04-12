/// <reference path="../typings/d3/d3.d.ts"/>

module visualizing {

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

    export class Potential {
        private container_: d3.Selection<any>
        private dragLocations_ : Point[] = []
        private lineGraph_ : d3.Selection<any>
        private potentialGraph_ : d3.Selection<any>
        // how many points are in our mesh
        private meshDivision_ :number = 1024
        // the values of our mesh
        private potentialMesh_ : number[]
        constructor(container: d3.Selection<any>, public width:number, public height:number) {
            this.container_ = container
            this.init()
        }
        
        private meshCenterForIndex(idx:number):number {
            assert(idx >= 0 && idx < this.meshDivision_, "idx out of range")
            let meshWidth = this.width / this.meshDivision_
            return idx * meshWidth + meshWidth / 2.0
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
            let _this = this
            let potentialMesh : number[] = []
                                    
            for (let meshIdx = 0; meshIdx < this.meshDivision_; meshIdx++) {
                let meshCenterX = this.meshCenterForIndex(meshIdx)
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
                
                // use the largest potential, which is the northernmost candidate, hence Math.min
                var maxPotential = Math.min(...candidates)
                potentialMesh.push(maxPotential)
            }
            return potentialMesh
        }
        
        private doDrag() {
            let _this = this
            let pos = d3.mouse(this.container_.node())
            let where = new Point(pos[0], pos[1])
            console.log("Pos: " + where.toString())
            this.dragLocations_.push(where)
            
            let lineFunction = d3.svg.line()
                          .x(function(d) { return (d as any).x })
                          .y(function(d) { return (d as any).y })
                          .interpolate("linear")

            _this.lineGraph_.attr("d", lineFunction(this.dragLocations_ as any))
        }
        
        private redrawPotentialMesh() {
            let points : [number, number][] = this.potentialMesh_.map((value, index) => {
                let result :[number, number] =  [this.meshCenterForIndex(index), value]
                return result
            })
            let lineFunction = d3.svg.line()
                          .x(function(d) { return d[0] })
                          .y(function(d) { return d[1] })
                          .interpolate("basis-open")
            this.potentialGraph_.attr("d", lineFunction(points))
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
    }

    export class Visualizer {
        private container_: string
        private group_: d3.Selection<any>
        private potentialGroup_: d3.Selection<any>
        private potential_ : Potential

        constructor(container: string) {
            this.init(container)
        }

        private init(container: string) {
            this.container_ = container
            this.potentialGroup_ = d3.select(this.container_).append('g')
            this.potentialGroup_.append('rect')
                                .attr({"width": 800,
                                       "height": 600,
                                       "fill": "steelblue"})
            this.potential_ = new Potential(this.potentialGroup_, 800, 600)
            
            this.group_ = d3.select(this.container_).append('g')
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

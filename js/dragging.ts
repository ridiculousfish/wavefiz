/// <reference path="../typings/d3/d3.d.ts"/>
/// <reference path="visualizer.ts"/>

module dragger {
    export class Dragger {
        public element : d3.Selection<any>
        public positionUpdated : (position:number) => void
        public value = 0
        public position = 0
        
        // horizontal means we drag horizontally, i.e. our line is vertical
        constructor(public label: string, public horizontal:boolean, public container: d3.Selection<any>, public params:visualizing.Parameters) {
            this.element = container.append('g')
            this.positionUpdated = (_:number) => {}
            
            let grippy = this.element.append('defs')
                .append('pattern')
                .attr('id', 'grippy')
                .attr('patternUnits', 'userSpaceOnUse')
                .attr('width', 4)
                .attr('height', 4)

            grippy.append('rect')
                  .attr({width: 4, height:4})
                  .attr('fill', '#999')                
             grippy.append('line')
                   .attr({x1: 0, x2:4, y1:0, y2:0})
                   .attr('stroke', '#000000')
                   .attr('stroke-width', 1)

            
            this.element.append("line")
                                .attr("id", "line")
                                .attr("stroke", "red")
                                .attr("stroke-width", 1.5)
                                .attr("fill", "none")
                                .attr("x1", 0)
                                .attr("y1", 0)
                                .attr("x2", this.params.width)
                                .attr("y2", 0)
           
           const handleWidth = 19, handleHeight = 15
           this.element.append("rect")
                       .attr("id", "draghandle")
                       .attr("fill", "url(#grippy)")
                       .attr("stroke-width", 1.0)
                       .attr("stroke", "#777")
                       .attr("cursor", "ns-resize")
                       .attr("height", handleHeight)
                       .attr("width", handleWidth)
                       .attr("x", this.params.width + 0.5)
                       .attr("y", -handleHeight/2)
                       .attr("shape-rendering", "crispEdges")
                       
          const textPadding = 5
          this.element.append("text")
                      .attr("id", "label")
                      .attr("x", this.params.width + handleWidth + textPadding)
                      .attr("y", 2)
                      .attr("alignment-baseline", "middle")
                      .attr("font-size", "19")
                      .attr("font-family", "Helvetica")
                      .text(this.annotatedLabel())
                      
          // setup dragging
          var drag = d3.behavior.drag()
                        .origin((d, i) => {return {x:0, y:0}})
                        .on("drag", () => {
                            const dy = (d3.event as any).y
                            this.positionUpdated(this.position+dy)
                        })
          drag.call(this.element.select("#draghandle"))
        }
        
        private annotatedLabel() : string {
            const formattedValue = this.value.toFixed(2)
            return this.label + ": " + formattedValue
        }
        
        update(position: number, value:number) {
            this.value = value
            this.position = position
            this.element.select("text").text(this.annotatedLabel())
            const dx = this.horizontal ? position : 0
            const dy = !this.horizontal ? position : 0 
            this.element.attr("transform", "translate(" + dx + "," + dy + ")")
        }
        
        public attr(vals:any) : Dragger {
            this.element.attr(vals)
            return this
        }
    }
}

/// <reference path='./visualizer.ts'/>

module energy {
    
    function assert(condition:boolean, message?:string) {
        if (!condition) {
            throw message || "Assertion failed"
        }
    }
    
    export class EnergySlider {
        public position:number
        public value:number
        constructor(public element:HTMLElement, position:number, value:number) {
            this.update(position, value)
        }
        
        update(position:number, value:number) {
            this.value = value
            this.position = position
            const valueStr = value.toFixed(2)
            const labelFieldNodeList = this.element.getElementsByClassName("value_text")
            for (let i=0; i < labelFieldNodeList.length; i++) {
                labelFieldNodeList[i].textContent = valueStr 
            }
            this.element.style.top = position + "px"
        }
    }
    
    export class EnergyVisualizer {
        // Function property. Given a position, returns the value
        public positionUpdated : (slider:EnergySlider, position:number) => number
        
        sliders: EnergySlider[] = []
        private draggedSlider: EnergySlider = null
        private lastY = 0
        private unconstrainedPosition = 0
        
        constructor(public container: HTMLElement, public sliderPrototype: HTMLElement, public params:visualizing.Parameters) {
            // Default position update handler
            this.positionUpdated = (slider:EnergySlider, pos:number) => pos
            assert(this.container != null, "Energy slider could not find container")
            assert(this.sliderPrototype != null, "Energy slider could not find prototype")
            
            document.addEventListener('mousemove', (evt:MouseEvent) => this.tryDrag(evt))
            document.addEventListener('mouseup', () => this.stopDragging())
        }
        
        public addSlider(position, value) : EnergySlider {
            const sliderElem = this.sliderPrototype.cloneNode(true) as HTMLElement
            const slider = new EnergySlider(sliderElem, position, value)
            this.sliders.push(slider)
            this.container.appendChild(sliderElem)
            this.beginWatching(slider)
            sliderElem.style.display = "inline-block"
            return slider
        }
        
        public removeSlider(slider:EnergySlider) {
            let index = this.sliders.indexOf(slider)
            if (index >= 0) {
                let slider = this.sliders[index]
                this.sliders.splice(index, 1)
                this.endWatching(slider)
                this.container.removeChild(slider.element)
            }
        }
        
        private beginWatching(slider:EnergySlider) {
            slider.element.onmousedown = (evt:MouseEvent) => this.startDragging(slider, evt)
        }
        
        private endWatching(slider:EnergySlider) {
            slider.element.onmousedown = null
        }
        
        private getY(evt:MouseEvent) : number {
            return evt.pageY - this.container.offsetTop
        }
        
        private startDragging(slider:EnergySlider, evt:MouseEvent) {
            assert(slider != null)
            this.draggedSlider = slider
            this.lastY = this.getY(evt)
            this.unconstrainedPosition = slider.position
            this.container.style.cursor = "ns-resize"
            evt.preventDefault() // keeps the cursor from becoming an IBeam
        }
        
        private stopDragging() {
            this.draggedSlider = null
            this.container.style.cursor = "default"
        }
        
        private tryDrag(evt:MouseEvent) {
            const slider = this.draggedSlider
            if (slider != null) {
                const y = this.getY(evt)
                const dy = y - this.lastY
                this.lastY = y
                this.unconstrainedPosition += dy
                const position = Math.min(Math.max(this.unconstrainedPosition, 0), this.params.height)
                const value = this.positionUpdated(slider, position)
                slider.update(position, value)
            }
        }
    }
}

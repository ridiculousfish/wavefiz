/// <reference path='./visualizer.ts'/>
/// <reference path='./ui.ts'/>

module visualizing {
    
    function assert(condition:boolean, message?:string) {
        if (!condition) {
            throw message || "Assertion failed"
        }
    }
    
    export class EnergyBar {
        public line: VisLine
        
        constructor(public slider: ui.Slider, public energy: number, public params: Parameters) {
            this.line = new VisLine(2, { color: 0xFF0000 })
        }
        setPositionAndEnergy(position: number, energy: number) {
            this.energy = energy
            this.line.update((idx:number) => vector3(idx * this.params.width, position, 0))
            this.slider.update(position, this.energy)
        }
    }
    
    export class EnergyVisualizer {
        // Function property. Given a position, returns the value
        public positionUpdated: (slider:ui.Slider, position:number) => number
        
        sliders: ui.Slider[] = []
        private draggedSlider: ui.Slider = null
        private lastY = 0
        private unconstrainedPosition = 0
        
        constructor(public container: HTMLElement, public sliderPrototype: HTMLElement, public params:visualizing.Parameters) {
            // Default position update handler
            this.positionUpdated = (slider:ui.Slider, pos:number) => pos
            assert(this.container != null, "Energy slider could not find container")
            assert(this.sliderPrototype != null, "Energy slider could not find prototype")
            
            document.addEventListener('mousemove', (evt:MouseEvent) => this.tryDrag(evt))
            document.addEventListener('mouseup', () => this.stopDragging())
        }
        
        public addSlider(position, value): ui.Slider {
            const sliderElem = this.sliderPrototype.cloneNode(true) as HTMLElement
            const slider = new ui.Slider(sliderElem, position, value)
            this.sliders.push(slider)
            this.container.appendChild(sliderElem)
            this.beginWatching(slider)
            sliderElem.style.display = "inline-block"
            return slider
        }
        
        public removeSlider(slider:ui.Slider) {
            let index = this.sliders.indexOf(slider)
            if (index >= 0) {
                let slider = this.sliders[index]
                this.sliders.splice(index, 1)
                this.endWatching(slider)
                this.container.removeChild(slider.element)
            }
        }
        
        private beginWatching(slider:ui.Slider) {
            slider.element.onmousedown = (evt:MouseEvent) => this.startDragging(slider, evt)
            slider.element.ontouchstart = (evt:TouchEvent) => this.startDragging(slider, evt)
            slider.element.ontouchmove = (evt:TouchEvent) => this.tryDrag(evt)
            slider.element.ontouchend = () => this.stopDragging()
            slider.element.ontouchcancel = () => this.stopDragging()
        }
        
        private endWatching(slider:ui.Slider) {
            slider.element.onmousedown = null
            slider.element.ontouchstart = null
            slider.element.ontouchmove = null
            slider.element.ontouchend = null
            slider.element.ontouchcancel = null
        }
        
        private getY(evt:MouseEvent|TouchEvent): number {
            if ((evt as TouchEvent).targetTouches) {
                // Touch event
                return (evt as TouchEvent).targetTouches[0].pageY - this.container.offsetTop
            } else {
                // Mouse event
                return (evt as MouseEvent).pageY - this.container.offsetTop
            }
            
        }
        
        private startDragging(slider:ui.Slider, evt:MouseEvent|TouchEvent) {
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
        
        private tryDrag(evt:MouseEvent|TouchEvent) {
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

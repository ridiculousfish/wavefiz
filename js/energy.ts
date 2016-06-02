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
        sliders: ui.Slider[] = []
        private draggedSlider: ui.Slider = null
        private unconstrainedPosition = 0
        
        constructor(public container: HTMLElement,
                    public sliderPrototype: HTMLElement,
                    public params:visualizing.Parameters,
                    public positionUpdated: (slider:ui.Slider, position:number) => number) {
            assert(this.container != null, "Energy slider could not find container")
            assert(this.sliderPrototype != null, "Energy slider could not find prototype")
        }
        
        public addSlider(position, value): ui.Slider {
            const sliderElem = this.sliderPrototype.cloneNode(true) as HTMLElement
            const slider = new ui.Slider(sliderElem, position, value, this.positionUpdated)
            this.sliders.push(slider)
            this.container.appendChild(sliderElem)
            sliderElem.style.display = "inline-block"
            return slider
        }
        
        public removeSlider(slider:ui.Slider) {
            let index = this.sliders.indexOf(slider)
            if (index >= 0) {
                let slider = this.sliders[index]
                this.sliders.splice(index, 1)
                slider.remove()
                this.container.removeChild(slider.element)
            }
        }
    }
}

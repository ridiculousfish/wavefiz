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
        private unscaledEnergy: number
        
        constructor(public slider: ui.Slider, position: number, energy: number, public params: Parameters) {
            this.unscaledEnergy = energy
            this.line = new VisLine(2, { color: 0xFF0000 })
            this.line.update((idx:number) => vector3(idx * this.params.width, position, 0))
        }
        setPositionAndEnergy(position: number, energy: number) {
            this.unscaledEnergy = energy
            this.line.update((idx:number) => vector3(idx * this.params.width, position, 0))
            this.slider.update(position, this.unscaledEnergy * this.params.energyScale)
        }
        
        public energy() {
            return this.unscaledEnergy 
        }
    }
    
    export class EnergyVisualizer {
        sliders: ui.Slider[] = []
        
        constructor(public container: HTMLElement,
                    public sliderPrototype: HTMLElement,
                    public params:visualizing.Parameters,
                    public positionUpdated: (slider:ui.Slider, position:number) => void) {
            assert(this.container != null, "Energy slider could not find container")
            assert(this.sliderPrototype != null, "Energy slider could not find prototype")
        }
        
        public addSlider(position, value): ui.Slider {
            const sliderElem = this.sliderPrototype.cloneNode(true) as HTMLElement
            const slider = new ui.Slider(ui.Orientation.Vertical, sliderElem, position, value, this.positionUpdated)
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

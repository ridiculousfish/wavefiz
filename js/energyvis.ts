/// <reference path='./visualizer.ts'/>
/// <reference path='./ui.ts'/>

module visualizing {
    
    function assert(condition:boolean, message?:string) {
        if (!condition) {
            throw message || "Assertion failed"
        }
    }
    
    class EnergyBar {
        // Horizontal line showing the energy across the visualization 
        public line: VisLine
        
        constructor(public identifier:string, public slider: ui.Slider,
                    group: THREE.Group, public params: Parameters) {
            this.line = new VisLine(2, { color: 0xFF0000 })
            this.line.addToGroup(group)
        }

        public setEnergy(energy: number) {
            const yPosition = this.params.convertYToVisualCoordinate(energy)
            this.line.update((idx:number) => vector3(idx * this.params.width, yPosition, 0))
            this.slider.update(yPosition, energy * this.params.energyScale)
        }
    }
    
    export class EnergyVisualizer {

        // The group containing all of our visual elements
        // The parent visualizer should add this to the appropriate scene
        public group: THREE.Group = new THREE.Group()

        private bars_: { [key:string]:EnergyBar; } = {}
        private state_: State = new State()
        
        constructor(public container: HTMLElement,
                    public sliderPrototype: HTMLElement,
                    public params:visualizing.Parameters,
                    public positionUpdated: (slider:ui.Slider, position:number) => void) {
            assert(this.container != null, "Energy slider could not find container")
            assert(this.sliderPrototype != null, "Energy slider could not find prototype")
        }

        public setState(state:State) {
            this.state_ = state
            this.rationalizeEnergyBars() 
        }

        private rationalizeEnergyBars() {
            const energies = this.state_.energies

            // Remove energy bars not found in the energy state
            Object.keys(this.bars_).forEach((identifier:string) => {
                if (! (identifier in energies)) {
                    console.log("Removing " + identifier + " in " + this.bars_[identifier])
                    this.removeBar(this.bars_[identifier])
                }
            })

            // Add new energy bars not found in our list, and update everyone's energy
            for (let energyID in energies) {
                if (! (energyID in this.bars_)) {
                    this.addEnergyBar(energyID)
                }
                this.bars_[energyID].setEnergy(energies[energyID])
            }
        }

        private addEnergyBar(identifier:string) {
            assert(! (identifier in this.bars_))

            let sliderElem = this.sliderPrototype.cloneNode(true) as HTMLElement
            let slider = new ui.Slider(ui.Orientation.Vertical, sliderElem, 0 /*position*/, 0/*value*/)
            this.container.appendChild(sliderElem)

            // The slider prototype is hidden, so make sure it shows up
            sliderElem.style.display = "inline-block"

            // Build and remember the bar
            let bar = new EnergyBar(identifier, slider, this.group, this.params)
            this.bars_[identifier] = bar

            // Set our callback
            slider.draggedToPositionHandler = (position:number) => {
                const energy = this.params.convertYFromVisualCoordinate(position) // in range [0, 1)
                this.state_.modify(this.params, (st:State) => {
                    st.energies[identifier] = energy
                })
            }
        }
        
        private removeBar(bar:EnergyBar) {
            assert(bar.identifier in this.bars_)
            delete this.bars_[bar.identifier]
            bar.slider.remove()
            bar.line.removeFromGroup(this.group)
        }
    }
}

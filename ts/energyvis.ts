/// <reference path='./linevis.ts'/>
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
            this.line = VisLine.create(2, group, { color: 0xFF0000 })
        }

        public setEnergy(energy: number) {
            const yPosition = this.params.convertYToVisualCoordinate(energy)
            this.line.makeHorizontal(this.params.width, yPosition)
            this.slider.setPosition(yPosition)
            this.slider.setValue(energy * this.params.energyScale)
        }
    }
    
    export class EnergyVisualizer {

        // The group containing all of our visual elements
        // The parent visualizer should add this to the appropriate scene
        public group: THREE.Group = new THREE.Group()

        private bars_: { [key:string]:EnergyBar; } = {}
        private state_: State = new State(this.params)
        
        constructor(public container: HTMLElement,
                    public sliderPrototype: HTMLElement,
                    public params:visualizing.Parameters) {
            assert(this.container != null, "Energy slider could not find container")
            assert(this.sliderPrototype != null, "Energy slider could not find prototype")
        }

        private nextInterestingEnergy() {
            // Find the point in [0, 1) furthest from all other points
            // This is naturally in the midpoint between its two closest neighbors
            // This means we can only track one distance
            let usedEnergies = this.state_.energyValues()
            
            // hack for initial energy
            if (usedEnergies.length == 0) {
                return 0.3
            }
            
            // treat us as if there's a point at each end
            usedEnergies.push(0)
            usedEnergies.push(1)
            usedEnergies.sort()
            
            let indexOfLargestInterval = -1 
            let lengthOfLargestInterval = -1
            for (let i=0; i + 1 < usedEnergies.length; i++) {
                let length = usedEnergies[i+1] - usedEnergies[i]
                assert(length >= 0, "Array not sorted?")
                if (length > lengthOfLargestInterval) {
                    lengthOfLargestInterval = length
                    indexOfLargestInterval = i
                }
            }
            let result = usedEnergies[indexOfLargestInterval] + lengthOfLargestInterval/2.0
            assert(result >= 0 && result < 1, "energy out of range?")
            return result
        }

        public addEnergySlider() {
            const energy = this.nextInterestingEnergy()
            this.state_.modify((st:State) => {
                st.energies[State.newIdentifier()] = energy
            })
        }

        public removeEnergySlider() {
            // Remove the most recently added energy bar, which is the one with the highest identifier
            // Don't delete the last energy!
            const energyIDs = Object.keys(this.state_.energies).map((val) => parseInt(val, 10))
            if (energyIDs.length > 1) {
                const maxID = energyIDs.reduce((a, b) => Math.max(a, b), 0)
                this.state_.modify((st:State) => {                      
                    delete st.energies[maxID]
                })
            }
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
            let slider = new ui.Slider(ui.Orientation.Vertical, sliderElem)
            this.container.appendChild(sliderElem)

            // The slider prototype is hidden, so make sure it shows up
            sliderElem.style.display = "inline-block"

            // Build and remember the bar
            let bar = new EnergyBar(identifier, slider, this.group, this.params)
            this.bars_[identifier] = bar

            // Set our callback
            slider.draggedToPositionHandler = (position:number) => {
                const energy = this.params.convertYFromVisualCoordinate(position) // in range [0, 1)
                this.state_.modify((st:State) => {
                    st.energies[identifier] = energy
                })
            }
        }
        
        private removeBar(bar:EnergyBar) {
            assert(bar.identifier in this.bars_)
            delete this.bars_[bar.identifier]
            bar.slider.remove()
            bar.line.remove()
        }
    }
}

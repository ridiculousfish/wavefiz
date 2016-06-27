/// <reference path='./linevis.ts'/>
/// <reference path='./ui.ts'/>

module visualizing {
    
    // Private class representing a single energy
    // It wraps up a line and a slider
    // It also has an identifier, which acts as glue between the energies in the model and the UI
    class EnergyBar { 
        public line: VisLine
        
        constructor(public identifier:string, public slider: ui.Slider,
                    group: THREE.Group, public params: Parameters) {
            this.line = VisLine.create(2, group, { color: 0xFF0000 })
        }

        // Sets the energy, which means updating our line and slider 
        public setEnergy(energy: number) {
            const yPosition = this.params.convertYToVisualCoordinate(energy)
            this.line.makeHorizontal(this.params.width, yPosition)
            this.slider.setPosition(yPosition)
            this.slider.setValue(energy * this.params.energyScale)
        }
    }
    
    // EnergyVisualizer maintains a list of EnergyBars, and maps between
    // energies in our model State and what's in the UI
    export class EnergyVisualizer {

        // The group containing all of our visual elements
        // The parent visualizer should add this to the appropriate scene
        public group: THREE.Group = new THREE.Group()

        // Dictionary mapping identifiers to Bars
        private bars_: { [key:string]:EnergyBar; } = {}
        
        private state_: State = new State(this.params)
        
        constructor(public container: HTMLElement,
                    public sliderPrototype: HTMLElement,
                    public params:visualizing.Parameters) {
            assert(this.container != null, "Energy slider could not find container")
            assert(this.sliderPrototype != null, "Energy slider could not find prototype")
        }

        // Called when we're creating a new energy bar
        // Pick a nice energy for it to have, that doesn't overlap with any existing energies
        // Note our energies are in the range [0, 1)
        private nextInterestingEnergy() {
            // Find the point in [0, 1) furthest from all other points
            // This is naturally in the midpoint between its two closest neighbors
            // This means we can only track one distance
            let usedEnergies = this.state_.energyValues()
            
            // hack for initial energy
            if (usedEnergies.length == 0) {
                return 0.3
            }
            
            // pretend there's a point at each end
            usedEnergies.push(0, 1)

            // Find the longest interval, then pick its midpoint
            usedEnergies.sort()
            let longestIntervalMidpoint = -1
            let longestIntervalLength = -1
            for (let i=0; i + 1 < usedEnergies.length; i++) {
                const length = usedEnergies[i+1] - usedEnergies[i]
                if (length > longestIntervalLength) {
                    longestIntervalLength = length
                    longestIntervalMidpoint = usedEnergies[i] + length/2
                }
            }
            return longestIntervalMidpoint
        }

        // Entry point from the UI
        // Pick another energy and identifier, and set it in the state - simple!
        public addEnergySlider() {
            const energy = this.nextInterestingEnergy()
            this.state_.modify((st:State) => {
                st.energies[State.newIdentifier()] = energy
            })
        }

        // Entry point from the UI
        // Remove the most recently added energy bar, which is the one with the highest identifier
        // Don't delete the last energy!
        public removeEnergySlider() {
            const energyIDs = Object.keys(this.state_.energies).map((val) => parseInt(val, 10))
            if (energyIDs.length > 1) {
                const maxID = energyIDs.reduce((a, b) => Math.max(a, b), 0)
                this.state_.modify((st:State) => {                      
                    delete st.energies[maxID]
                })
            }
        }

        // Entry point for our state updates
        public setState(state:State) {
            this.state_ = state
            this.applyStateToEnergyBars() 
        }

        // Given our current state, rationalize it against our energy bars
        private applyStateToEnergyBars() {
            const energies = this.state_.energies

            // Remove energy bars not found in the energy state
            Object.keys(this.bars_).forEach((identifier:string) => {
                if (! (identifier in energies)) {
                    this.tearDownEnergyBar(this.bars_[identifier])
                    delete this.bars_[identifier]
                }
            })

            // Add new energy bars not found in our list
            // Also update everyone's energy
            for (let energyID in energies) {
                if (! (energyID in this.bars_)) {
                    this.bars_[energyID] = this.makeEnergyBar(energyID)
                }
                this.bars_[energyID].setEnergy(energies[energyID])
            }
        }

        // Called from the state update.
        // Create a new bar for the given identifier. The caller will install it and set its energy.
        private makeEnergyBar(identifier:string): EnergyBar {
            assert(! (identifier in this.bars_), "Identifier already present in bars")

            // Our Slider is given as a "prototype" element
            // Clone it to make a new one, and add it t oour container
            let sliderElem = this.sliderPrototype.cloneNode(true) as HTMLElement
            let slider = new ui.Slider(ui.Orientation.Vertical, sliderElem)
            this.container.appendChild(sliderElem)

            // The slider prototype is hidden; make sure our bar shows up
            sliderElem.style.display = "inline-block"

            // Set our callback
            // When the slider is dragged, this just updates the energy
            slider.draggedToPositionHandler = (position:number) => {
                const energy = this.params.convertYFromVisualCoordinate(position) // in range [0, 1)
                this.state_.modify((st:State) => {
                    st.energies[identifier] = energy
                })
            }
            return new EnergyBar(identifier, slider, this.group, this.params)
        }
        
        // Called from state update
        // Removes a bar's UI elements
        private tearDownEnergyBar(bar:EnergyBar) {
            bar.slider.remove()
            bar.line.remove()
        }
    }
}

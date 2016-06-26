/// <reference path="../typings/threejs/three.d.ts"/>
/// <reference path='./potentials.ts'/>
/// <reference path='./algorithms.ts'/>
/// <reference path='./energyvis.ts'/>
/// <reference path='./potentialvis.ts'/>
/// <reference path='./wavefunctionvis.ts'/>
/// <reference path='./ui.ts'/>

module visualizing {
    
    // Top level visualization entry point.
    // This coordinates multiple visualizations
    export class Visualizer {

        // Our parameters and state
        private params_ = new Parameters()
        private state_ = new State(this.params_)

        // The full scene that our GL renderer draws
        private topScene_: THREE.Scene = new THREE.Scene()

        // The camera
        private camera_: THREE.Camera

        // Group containing our visualizers' groups
        private group_: THREE.Group = new THREE.Group()

        // The object responsible for scheduling renderings,
        // and keeping track of time
        private animator_: Redrawer
        
        // Our visualizers
        private potentialVisualizer_: PotentialVisualizer
        private wavefunctionAvg_: WavefunctionVisualizer
        private energyVisualizer_: EnergyVisualizer

        // Lines representing the classical turning points
        private leftTurningPointLine_: VisLine
        private rightTurningPointLine_: VisLine

        // The slider at the bottom, for adjusting the potential
        private potentialSlider_: ui.Slider

        constructor(container: HTMLElement, potentialDragger: HTMLElement, energyContainer: HTMLElement, energyDraggerPrototype: HTMLElement) {
            // Hackish
            State.applyStateUpdate = (st:State) => this.setState(st)

            // Initialize our renderer
            let renderer = new THREE.WebGLRenderer({ antialias: true })
            renderer.setClearColor(0x222222, 1)
            renderer.setSize(container.offsetWidth, container.offsetHeight)
            container.appendChild(renderer.domElement)

            // Create the camera
            let fovDegrees = Math.atan2(this.params_.height, this.params_.width) * (180 / Math.PI) * 2.0
            fovDegrees = Math.ceil(fovDegrees) // energy lines disappear without this, unclear why
            this.camera_ = new THREE.PerspectiveCamera(fovDegrees, this.params_.width / this.params_.height, 50, 1000);

            // Position our top group such that it appears centered in the camera
            this.group_.position.x = -this.params_.width / 2
            this.group_.position.y = this.params_.height / 2
            this.group_.scale.y = -1
            this.topScene_.add(this.group_)

            // Initialize our animator / redrawer
            this.animator_ = new Redrawer(this.params_, () => {
                renderer.render(this.topScene_, this.camera_)
            })
            
            // Build the potential slider
            // This is the slider that appears on the bottom of the visualizer,
            // and that sets the value of the potential parameter
            this.potentialSlider_ = new ui.Slider(ui.Orientation.Horizontal, potentialDragger)
            this.potentialSlider_.draggedToPositionHandler = (position: number) => {
                this.state_.modify((st:State) => {
                    st.potentialParameter = position / this.params_.width 
                })
            }

            // Build the potential visualizer
            // This draws the line showing the potential
            this.potentialVisualizer_ = new PotentialVisualizer(this.params_)
            this.group_.add(this.potentialVisualizer_.group)

            // Build a wavefunction visualizer
            // This draws the line showing the wavefunction
            const centerY = this.params_.height / 2
            this.wavefunctionAvg_ = new WavefunctionVisualizer(this.params_, 0xFF7777, this.animator_)
            this.wavefunctionAvg_.group.position.y = centerY
            this.group_.add(this.wavefunctionAvg_.group)

            this.energyVisualizer_ = 
                new EnergyVisualizer(energyContainer, energyDraggerPrototype, this.params_)
            this.group_.add(this.energyVisualizer_.group)

            // Build our two turning point lines
            // These show the classical turning points, where the energy equals the potential
            this.leftTurningPointLine_ = this.createTurningPointLine()
            this.rightTurningPointLine_ = this.createTurningPointLine()

            // Our "sketch a potential" feature is impemented via dragging
            // Set that up
            // Note this installs some event handlers on the container
            // We don't attempt to clean those up
            ui.initDragging(container, this.camera_, [this.potentialVisualizer_])
        }

        private createTurningPointLine(): VisLine {
            let tp = VisLine.create(2, this.group_, {
                color: 0x000000,
                linewidth: 1,
                transparent: true,
                opacity: .5
            })
            tp.update((i: number) => vector3(0, i * this.params_.height, 0))
            return tp
        }

        private applyCameraRotation() {
            // rotate about the y axis
            // rotation of 0 => z = 1 * scale
            const rads = this.state_.cameraRotationRadians
            const scale = this.params_.cameraDistance
            const x = Math.sin(rads) * scale
            const z = Math.cos(rads) * scale
            this.camera_.position.set(x, 0, z)
            this.camera_.lookAt(new THREE.Vector3(0, 0, 0))
        }

        // Entry points from HTML
        public addEnergySlider() {
            this.energyVisualizer_.addEnergySlider()
        }

        public removeEnergySlider() {
            this.energyVisualizer_.removeEnergySlider()
        }

        private updateWavefunctions() {
            if (this.state_.potential.length === 0) {
                return
            }
            
            const energies = this.state_.energyValues()
            const maxEnergy = energies.reduce((a, b) => Math.max(a, b), 0) // 0 if none
            if (energies.length > 0) {
                const center = algorithms.indexOfMinimum(this.state_.potential)
                
                let maxTurningPoints = algorithms.classicalTurningPoints(this.state_.potential, maxEnergy)
                
                // update wavefunctions and collect them all
                let psis = energies.map((energy: number) => {
                    const psiInputs = {
                        potentialMesh: this.state_.potential,
                        energy: energy,
                        maxX: this.params_.maxX
                    }
                    
                    // Here we have a choice as to our turning points, which affects how we stitch
                    // our wavefunctions together.
                    //
                    // One possibility is to resolve all of them at the outermost (highest-energy)
                    // classical turning points. This would result in a single "kink." However, in the
                    // classically forbidden region, we tend to get exponential blowup; this will be
                    // suppressed at our turning points, but the effect will be that small adjustments
                    // in energy will result in large swings towards the edges of the total wavefunction:
                    // 
                    // let resolvedWavefunction = algorithms.resolvedAveragedNumerov(psiInputs, maxTurningPoints)
                    //
                    // The other possibility is to resolve each wavefunction component at its own classical
                    // turning points, and then sum those. This will tend to produce multiple "kinks:" one per
                    // wavefunction. In practice this isn't so bad.
                    
                    let resolvedWavefunction = algorithms.classicallyResolvedAveragedNumerov(psiInputs)
                    return resolvedWavefunction  
                })
                let genPsi = new algorithms.GeneralizedWavefunction(psis)
                this.wavefunctionAvg_.setWavefunction(genPsi, center)
            }

            // update turning points based on maximum energy
            const maxTurningPoints = algorithms.classicalTurningPoints(this.state_.potential, maxEnergy)
            const leftV = this.params_.convertXToVisualCoordinate(maxTurningPoints.left)
            const rightV = this.params_.convertXToVisualCoordinate(maxTurningPoints.right)
            this.leftTurningPointLine_.update((i: number) => vector3(leftV, i * this.params_.height, 0))
            this.rightTurningPointLine_.update((i: number) => vector3(rightV, i * this.params_.height, 0))
        }

        public setState(state:State) {
            this.state_ = state
            this.potentialVisualizer_.setState(state)
            this.wavefunctionAvg_.setState(state)
            this.energyVisualizer_.setState(state)
            this.animator_.setPaused(state.paused)
            this.potentialSlider_.update(state.potentialParameter * this.params_.width)
            this.applyCameraRotation()
            this.updateWavefunctions()
            this.animator_.scheduleRerender()
        }

        public setShowPsi(flag: boolean) {
            this.state_.modify((st:State) => st.showPsi = flag)
        }

        public setShowPsiAbs(flag: boolean) {
            this.state_.modify((st:State) => st.showPsiAbs = flag)
        }

        public setShowPhi(flag: boolean) {
            this.state_.modify((st:State) => st.showPhi = flag)
        }

        public setShowPhiAbs(flag: boolean) {
            this.state_.modify((st:State) => st.showPhiAbs = flag)
        }

        public setPaused(flag: boolean) {
            if (flag) {
                // If we're pausing, jump back to time 0
                this.animator_.reset()
            }
            this.state_.modify((st:State) => st.paused = flag)
        }

        public setRotation(rads: number) {
            this.state_.modify((st:State) => {
                st.cameraRotationRadians = rads
            })
        }
        
        public sketchPotential() {
            this.state_.modify((st:State) => {
                st.potential = []
                st.potentialBuilder = null
                st.sketching = true
            })
        }

        public loadPotentialFromBuilder(pbf:algorithms.PotentialBuilderFunc) {
            this.state_.modify((st:State) => {
                st.sketching = false
                st.sketchLocations = []
                st.potentialBuilder = pbf
            })
        }

        public loadSHO() {
            this.loadPotentialFromBuilder(algorithms.SimpleHarmonicOscillator)
        }

        public loadISW() {
            this.loadPotentialFromBuilder(algorithms.InfiniteSquareWell)
        }

        public loadFSW() {
            this.loadPotentialFromBuilder(algorithms.FiniteSquareWell)
        }

        public load2SW() {
            this.loadPotentialFromBuilder(algorithms.TwoSquareWells)
        }

        public loadRandomPotential() {
            this.loadPotentialFromBuilder(algorithms.RandomPotential())
        }
    }
}

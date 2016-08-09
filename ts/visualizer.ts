/// <reference path="../typings/threejs/three.d.ts"/>
/// <reference path='./potentials.ts'/>
/// <reference path='./commonvis.ts'/>
/// <reference path='./potentialvis.ts'/>
/// <reference path='./wavefunctionvis.ts'/>
/// <reference path='./energyvis.ts'/>
/// <reference path='./polyline.ts'/>
/// <reference path='./ui.ts'/>

module visualizing {
    
    // Top level visualization entry point.
    // This coordinates multiple visualizations
    export class Visualizer {

        // Our parameters and state
        private params_ = new Parameters()
        private state_ = new State(this.params_)

        // The full scene that our GL renderer draws and the camera
        private topScene_: THREE.Scene = new THREE.Scene()
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
        private leftTurningPointLine_: Polyline
        private rightTurningPointLine_: Polyline

        // The slider at the bottom, for adjusting the potential
        private potentialSlider_: ui.Slider

        constructor(container: HTMLElement, potentialDragger: HTMLElement, energyContainer: HTMLElement, energyDraggerPrototype: HTMLElement) {
            // Hackish. Tell State what to do after an update.
            // This will need to be more sophisticated if we ever have multiple visualizers
            State.applyStateUpdate = (st:State) => this.setState(st)

            // Initialize our renderer
            let renderer = new THREE.WebGLRenderer({ antialias: !true })
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
            // Center it vertically
            this.wavefunctionAvg_ = new WavefunctionVisualizer(this.params_, 0xFF7777, this.animator_)
            const centerY = this.params_.height / 2
            this.wavefunctionAvg_.group.position.y = centerY
            this.group_.add(this.wavefunctionAvg_.group)

            // Build the energy visualizer
            // This is responsible for the energy lines and sliders
            this.energyVisualizer_ = 
                new EnergyVisualizer(energyContainer, energyDraggerPrototype, this.params_)
            this.group_.add(this.energyVisualizer_.group)

            // Build our two turning point lines
            // These show the classical turning points, where the energy equals the potential
            let turningPointStyle = {
                color: 0x999999,
                linewidth: 1,
                transparent: true,
                opacity: .5
            }
            this.leftTurningPointLine_ = Polyline.create(2, this.group_, turningPointStyle)
            this.rightTurningPointLine_ = Polyline.create(2, this.group_, turningPointStyle)

            // Our "sketch a potential" feature is impemented via dragging
            // Set that up
            // Note this installs some event handlers on the container
            // We don't attempt to clean those up
            ui.initDragging(container, this.camera_, [this.potentialVisualizer_])
        }

        // Called from state update - reflect the state's camera rotation
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

        // Called from state update - reflect the state's potential and energies
        private applyStateToWavefunction() {
            if (this.state_.potential.length === 0) {
                this.wavefunctionAvg_.setWavefunction(null, 0)
                return
            }
            
            // QM 101
            // We have a list of energies.
            // Each of those energies produces a wavefunction, given our potential
            // These wavefunctions satisfy the time-independent Schrödinger equation
            // We can mix (linearly-combine) one or more to get a wavefunction representing
            // a mixture of the energies. (Here we always pick an even weighting).
            const energies = this.state_.energyValues()
            if (energies.length > 0) {
                const center = algorithms.indexOfMinimum(this.state_.potential)
                
                // update wavefunctions and collect them all
                let psis : algorithms.TimeIndependentWavefunction[] = []
                energies.forEach((energy: number) => {                    
                    // Here we have a choice as to our turning points, which affects how we stitch
                    // our wavefunctions together.
                    //
                    // One possibility is to resolve all of them at the outermost (highest-energy)
                    // classical turning points. This would result in a single "kink." However, in the
                    // classically forbidden region, we tend to get exponential blowup; this will be
                    // suppressed at our turning points, but the effect will be that small adjustments
                    // in energy will result in large swings towards the edges of the total wavefunction.
                    // 
                    // The other possibility is to resolve each wavefunction component at its own classical
                    // turning points, and then sum those. This will tend to produce multiple "kinks:" one per
                    // wavefunction. In practice this isn't so bad and it does illustrate an important physical
                    // principle: that you can't get a solution to the SE by mixing disallowed energies
                    const psiInputs = {
                        potentialMesh: this.state_.potential,
                        energy: energy,
                        maxX: this.params_.maxX
                    } 
                    let timeIndependentPsi = algorithms.classicallyResolvedAveragedNumerov(psiInputs)
                    psis.push(timeIndependentPsi)
                })

                // Now we have the list of wavfunctions in "psis"
                // Produce a single (time-dependent) wavefunction by mixing them
                let timeDependentPsi = new algorithms.Wavefunction(psis)
                this.wavefunctionAvg_.setWavefunction(timeDependentPsi, center)
            }

            // Update our turning point lines
            // Compute our maximum energy (or 0 if we have none)
            // Update our turning point lines to show the points in our potential that equal those energies
            // These are the classical turning points, that demarcate the classically forbidden region
            const maxEnergy = energies.reduce((a, b) => Math.max(a, b), 0)
            const turningPoints = algorithms.classicalTurningPoints(this.state_.potential, maxEnergy)
            const leftX = this.params_.convertXToVisualCoordinate(turningPoints.left)
            const rightX = this.params_.convertXToVisualCoordinate(turningPoints.right)
            this.leftTurningPointLine_.makeVertical(this.params_.height, leftX)
            this.rightTurningPointLine_.makeVertical(this.params_.height, rightX)
        }

        // React-style state update
        // Given a state object, apply it to ourselves and push it to everyone else
        // Note that states are immutable
        public setState(state:State) {
            this.state_ = state

            // Propogate state down
            this.potentialVisualizer_.setState(state)
            this.wavefunctionAvg_.setState(state)
            this.energyVisualizer_.setState(state)

            // Update potential slider
            // Hide the slider if the potential builder does not take the user-defined parameter
            this.potentialSlider_.setPosition(state.potentialParameter * this.params_.width)
            this.potentialSlider_.setVisible(state.potentialBuilder && state.potentialBuilder.length > 1)

            this.applyStateToWavefunction()
            this.applyCameraRotation()
            this.animator_.setPaused(state.paused)
            this.animator_.scheduleRerender()
        }

        // Helper function to set a new potential
        private loadPotentialFromBuilder(pbf:algorithms.PotentialBuilderFunc) {
            this.state_.modify((st:State) => {
                st.sketching = false
                st.sketchLocations = []
                st.potentialBuilder = pbf
            })
        }

        // Public UI entry points
        // These are invoked from the HTML
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
            // When pausing, reset to time zero
            if (flag) this.animator_.reset()
            this.state_.modify((st:State) => st.paused = flag)
        }

        public setRotation(rads: number) {
            this.state_.modify((st:State) => st.cameraRotationRadians = rads)
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

        public addEnergySlider() {
            this.energyVisualizer_.addEnergySlider()
        }

        public removeEnergySlider() {
            this.energyVisualizer_.removeEnergySlider()
        }

        // Entry point to trigger sketching
        public sketchPotential() {
            this.state_.modify((st:State) => {
                st.potential = []
                st.potentialBuilder = null
                st.sketching = true
            })
        }
    }
}

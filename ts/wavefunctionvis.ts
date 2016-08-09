/// <reference path='./algorithms.ts'/>

module visualizing {

    // Helper function type
    // Inputs a number and time, outputs a complex value 
    type ValueAt = (index: number, time: number) => algorithms.Complex

    // Higher level function! Given a ValueAt, returns a new ValueAt representing its magnitude
    function magnitudeSquaredOf(originalFunc:ValueAt): ValueAt {
        return (index:number, time:number) => {
            let mag2 = originalFunc(index, time).magnitudeSquared()
            return new algorithms.Complex(mag2, 0)
        }
    }

    // WavefunctionVisualizer presents a wavefunction
    // It can show psi and psiAbs (position-space wavefunction), and also
    // phi and phiAbs (momentum-space wavefunction)
    // This operates a little differently in that it doesn't do anything in setState()
    // This is because its rendering is time-dependent. Thus it does all of its work
    // at draw time, in prepareForRender().
    export class WavefunctionVisualizer {
        // The group containing all of our visual elements
        // The parent visualizer should add this to the appropriate scene
        public group: THREE.Group = new THREE.Group()

        // Baseline, which looks nice
        private psiBaseline_: Polyline

        // These "visualizables" are the glue between the abstract wavefunction
        // and our four presented wavefunction graphs
        private psiVis_: Visualizable
        private psiAbsVis_: Visualizable
        private phiVis_: Visualizable
        private phiAbsVis_: Visualizable

        // The state tracks which of our four graphs are visible
        private state_ = new State(this.params)

        constructor(public params: Parameters, public color: number, public animator: Redrawer) {
            // Set up materials for our four graphs, and the baseline
            const psiMaterial = {
                color: this.color,
                linewidth: 5,
                depthTest: false
            }
            const psiAbsMaterial = {
                color: this.color,
                linewidth: 8,
                transparent: true,
                opacity: .75,
                depthTest: false
            }
            const phiMaterial = {
                color: 0x0077FF, // this.color,
                linewidth: 5,
                transparent: true,
                opacity: .75,
                depthTest: false
            }
            const phiAbsMaterial = {
                color: 0x0077FF, // this.color,
                linewidth: 8,
                transparent: true,
                opacity: .75,
                depthTest: false
            }
            const baselineMaterial = {
                color: this.color,
                linewidth: .5,
                depthTest: false
            }

            // Our baseline doesn't change, so we can just update it once
            this.psiBaseline_ = Polyline.create(2, this.group, baselineMaterial)
            this.psiBaseline_.update((i: number) => vector3(i * this.params.width, 0, 0))

            // Create our Visualizables 
            this.psiVis_ = new Visualizable(this.params.psiScale, this.params, this.group, psiMaterial)
            this.phiVis_ = new Visualizable(this.params.psiScale, this.params, this.group, phiMaterial)
            this.psiAbsVis_ = new Visualizable(this.params.psiAbsScale, this.params, this.group, psiAbsMaterial)
            this.phiAbsVis_ = new Visualizable(this.params.psiAbsScale, this.params, this.group, phiAbsMaterial)

            // Get told when our animator is going to redraw
            this.animator.addClient(this)
        }

        // Set our global state.
        public setState(state:State) {
            this.state_ = state
            this.psiVis_.visible = this.state_.showPsi
            this.psiAbsVis_.visible = this.state_.showPsiAbs
            this.phiVis_.visible = this.state_.showPhi
            this.phiAbsVis_.visible = this.state_.showPhiAbs
        }

        // Sets the wavefunction. Note that the wavefunction is not stored in the 'state' object,
        // since it requires some computation
        public setWavefunction(psi: algorithms.Wavefunction) {
            if (! psi) {
                this.psiVis_.valueAt = null
                this.psiAbsVis_.valueAt = null
                this.phiVis_.valueAt = null
                this.phiAbsVis_.valueAt = null
            } else {
                assert(psi.length === this.params.meshDivision, "Wavefunction has wrong length")

                // The phi (momentum-space) values are the Fourier transform of the psi (position-space) values
                // The fourier transform is expensive, so perform it only if requested (and cache the result)
                // We compute it based on the center, not the potential minimum, because we want to capture
                // the probability of the particle moving left or right
                let freqWavefunctionCache: algorithms.Wavefunction = null
                let freqWavefunction = () => {
                    if (freqWavefunctionCache === null) {
                        freqWavefunctionCache = 
                            psi.fourierTransform(Math.floor(psi.length/2), this.params.frequencyScale)
                    }
                    return freqWavefunctionCache
                }

                // Set everyone's valueAts
                const psiValueAt = (index: number, time: number) => psi.valueAt(index, time)
                const phiValueAt = (index: number, time: number) => freqWavefunction().valueAt(index, time)
                
                this.psiVis_.valueAt = psiValueAt
                this.psiAbsVis_.valueAt = magnitudeSquaredOf(psiValueAt)
                this.phiVis_.valueAt = phiValueAt
                this.phiAbsVis_.valueAt = magnitudeSquaredOf(phiValueAt)
            }
        }

        // Called by the redrawer right before it triggers rerendering
        // Here we tell our four visualizables to update
        public prepareForRender(time:number) {
            this.psiVis_.update(time)
            this.psiAbsVis_.update(time)
            this.phiVis_.update(time)
            this.phiAbsVis_.update(time)
        }
    }

    // A Visualizable takes a function to calculate a (complex) value
    // at a given x position and time, and then plots that in a Line
    class Visualizable {
        public valueAt: ValueAt = null
        public visible: boolean = true
        private line_: Polyline

        constructor(private scale: number, private params_: Parameters,
                    group: THREE.Group, material: THREE.LineBasicMaterialParameters) {
            this.line_ = Polyline.create(this.params_.meshDivision, group, material)
        }

        // Entry point for updating our line according to our valueAt function
        // valueAt produces a complex value. We show the real part on the y axis,
        // and the imaginary part on the z axis
        public update(time:number) {
            if (!this.visible || this.valueAt === null) {
                this.line_.setVisible(false)
            } else {
                this.line_.setVisible(true)
                this.line_.update((index: number) => {
                    const x = this.params_.centerForMeshIndex(index)
                    const yz = this.valueAt(index, time)
                    const y = -this.scale * yz.re
                    const z = this.scale * yz.im
                    return vector3(x, this.clamp(y), this.clamp(z))
                })
            }
        }

        // Helper function to maintain numerical sanity
        // Things can get crazy when we try to compute wavefunctions where none should exist
        // Ensure NaNs don't sneak in, and that we don't send extreme values to the GL renderer        
        private clamp(value:number): number {
            const limit = this.params_.height / 2
            if (isNaN(value)) value = limit
            return Math.max(-limit, Math.min(limit, value))
        }
    }
}

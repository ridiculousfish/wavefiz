/// <reference path='./algorithms.ts'/>
/// <reference path='./commonvis.ts'/>

module visualizing {

    // WavefunctionVisualizer presents a wavefunction
    // It can show psi and psiAbs (position-space wavefunction)
    // It can also show phi and phiAbs (momentum-space wavefunction)
    export class WavefunctionVisualizer {
        // The group containing all of our visual elements
        // The parent visualizer should add this to the appropriate scene
        public group: THREE.Group = new THREE.Group()

        // Our wavefunction lines
        private psiGraph_: VisLine
        private psiAbsGraph_: VisLine
        private phiGraph_: VisLine
        private phiAbsGraph_: VisLine

        // Baseline, which looks nice
        private psiBaseline_: VisLine

        // These "visualizables" are the glue between our wavefunction
        // and the data each graph displays
        private psiVis_ = new Visualizable()
        private psiAbsVis_ = new Visualizable()
        private phiVis_ = new Visualizable()
        private phiAbsVis_ = new Visualizable()

        // state tracks which graphs are visible
        private state_ = new State(this.params)

        constructor(public params: Parameters, public color: number, public animator: Redrawer) {
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

            this.psiGraph_ = VisLine.create(this.params.meshDivision, this.group, psiMaterial)
            this.psiAbsGraph_ = VisLine.create(this.params.meshDivision, this.group, psiAbsMaterial)
            this.phiGraph_ = VisLine.create(this.params.meshDivision, this.group, phiMaterial)
            this.phiAbsGraph_ = VisLine.create(this.params.meshDivision, this.group, phiAbsMaterial)
            this.psiBaseline_ = VisLine.create(2, this.group, baselineMaterial)

            this.animator.addClient(this)
        }

        public setState(state:State) {
            this.state_ = state
        }

        public setVisible(flag: boolean) {
            this.group.visible = flag
        }

        // Sets the wavefunction. Note that the wavefunction is not stored in the 'state' object.
        public setWavefunction(psi: algorithms.GeneralizedWavefunction, potentialMinimumIndex: number) {
            if (! psi) {
                this.psiVis_.valueAt = null
                this.psiAbsVis_.valueAt = null
                this.phiVis_.valueAt = null
                this.phiAbsVis_.valueAt = null
            } else {
                assert(psi.length === this.params.meshDivision, "Wavefunction has wrong length")

                // The phi (momentum-space) values are the Fourier transform of the psi (position-space) values
                // The fourier transform is expensive, so perform it only if requested (and cache the result)
                let freqWavefunctionVal: algorithms.GeneralizedWavefunction = null
                let freqWavefunction = () => {
                    if (freqWavefunctionVal === null) {
                        const scale = 0.5
                        freqWavefunctionVal = psi.fourierTransformOptimized(potentialMinimumIndex, scale)
                    }
                    return freqWavefunctionVal
                }

                // Set everyone's valueAts
                this.psiVis_.valueAt = (index: number, time: number) => {
                    return psi.valueAt(index, time)
                }
                this.psiAbsVis_.valueAt = (index: number, time: number) => {
                    let mag = psi.valueAt(index, time).magnitudeSquared()
                    return new algorithms.Complex(mag, 0)
                }
                this.phiVis_.valueAt = (index: number, time: number) => {
                    return freqWavefunction().valueAt(index, time)
                }
                this.phiAbsVis_.valueAt = (index: number, time: number) => {
                    let mag = freqWavefunction().valueAt(index, time).magnitudeSquared()
                    return new algorithms.Complex(mag, 0)
                }
            }
        }

        redraw() {

            const time = this.animator.lastTime()
            const cleanValue = (value: number) => {
                // TODO: rationalize this
                const limit = this.params.height / 1.9
                if (isNaN(value)) value = limit
                return Math.max(-limit, Math.min(limit, value))
            }

            let updateVisualizable = (vis: Visualizable, visLine: VisLine, show: boolean, scale: number) => {
                visLine.setVisible(show)
                if (show && vis.valueAt) {
                    visLine.update((index: number) => {
                        const x = this.params.centerForMeshIndex(index)
                        const yz = vis.valueAt(index, time)
                        const y = -scale * yz.re
                        const z = scale * yz.im
                        return new THREE.Vector3(x, cleanValue(y), cleanValue(z))
                    })
                }
            }

            let psiScale = this.params.psiScale
            let psiAbsScale = psiScale * this.params.absScale

            updateVisualizable(this.psiVis_, this.psiGraph_, this.state_.showPsi, psiScale)
            updateVisualizable(this.psiAbsVis_, this.psiAbsGraph_, this.state_.showPsiAbs, psiAbsScale)
            updateVisualizable(this.phiVis_, this.phiGraph_, this.state_.showPhi, psiScale)
            updateVisualizable(this.phiAbsVis_, this.phiAbsGraph_, this.state_.showPhiAbs, psiAbsScale)

            this.psiBaseline_.update((i: number) => vector3(i * this.params.width, 0, 0))
        }

        prepareForRender() {
            this.redraw()
        }
    }

    class Visualizable {
        valueAt: (index: number, time: number) => algorithms.Complex = null
    }
}

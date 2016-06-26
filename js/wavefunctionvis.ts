/// <reference path='./algorithms.ts'/>
/// <reference path='./commonvis.ts'/>

module visualizing {

    export class WavefunctionVisualizer {
        private group_: THREE.Group = new THREE.Group()
        private psiGraph_: VisLine
        private psiAbsGraph_: VisLine
        private phiGraph_: VisLine
        private phiAbsGraph_: VisLine
        private psiBaseline_: VisLine

        private psiVis_ = new Visualizable()
        private psiAbsVis_ = new Visualizable()
        private phiVis_ = new Visualizable()
        private phiAbsVis_ = new Visualizable()

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

            this.psiGraph_ = VisLine.create(this.params.meshDivision, psiMaterial)
            this.psiAbsGraph_ = VisLine.create(this.params.meshDivision, psiAbsMaterial)
            this.phiGraph_ = VisLine.create(this.params.meshDivision, phiMaterial)
            this.phiAbsGraph_ = VisLine.create(this.params.meshDivision, phiAbsMaterial)
            this.psiBaseline_ = VisLine.create(2, baselineMaterial)

            this.animator.addClient(this)
        }

        public setState(state:State) {
            this.state_ = state
        }

        setWavefunction(psi: algorithms.GeneralizedWavefunction, potentialMinimumIndex: number) {
            if (psi == null) {
                this.psiVis_.valueAt = null
                this.psiAbsVis_.valueAt = null
                this.phiVis_.valueAt = null
                this.phiAbsVis_.valueAt = null
                return
            } else {
                assert(psi.length === this.params.meshDivision, "Wavefunction has wrong length")
                this.psiVis_.valueAt = (index: number, time: number) => {
                    return psi.valueAt(index, time)
                }
                this.psiAbsVis_.valueAt = (index: number, time: number) => {
                    let mag = psi.valueAt(index, time).magnitudeSquared()
                    return new algorithms.Complex(mag, 0)
                }

                // perform fourier transform only if necessary
                let freqWavefunctionVal: algorithms.GeneralizedWavefunction = null
                let freqWavefunction = () => {
                    if (freqWavefunctionVal == null) {
                        const scale = 0.5
                        freqWavefunctionVal = psi.fourierTransformOptimized(potentialMinimumIndex, scale)
                    }
                    return freqWavefunctionVal
                }

                const phiHeightScale = .9
                this.phiVis_.valueAt = (index: number, time: number) => {
                    return freqWavefunction().valueAt(index, time).multipliedByReal(phiHeightScale)
                }
                this.phiAbsVis_.valueAt = (index: number, time: number) => {
                    let mag = freqWavefunction().valueAt(index, time).magnitudeSquared() * phiHeightScale
                    return new algorithms.Complex(mag, 0)
                }
            }
            this.redraw()
        }

        setVisible(flag: boolean) {
            this.group_.visible = flag
        }

        clear() {
            this.setWavefunction(null, -1)
        }

        redraw() {

            const time = this.animator.lastTime()
            const cleanValue = (value: number) => {
                // TODO: rationalize this
                const limit = this.params.height / 1.9
                if (isNaN(value)) {
                    value = limit
                }
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

        addToGroup(parentGroup: THREE.Group, yOffset: number) {
            [this.psiGraph_,
                this.psiAbsGraph_,
                this.phiGraph_,
                this.phiAbsGraph_,
                this.psiBaseline_].forEach((vl: VisLine) => {
                    vl.addToGroup(this.group_)
                })
            this.group_.position.y = yOffset
            parentGroup.add(this.group_)
        }
    }
}

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

        constructor(public params: Parameters, public color: number, public animator: Animator) {

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
                color: 0x0077FF,//this.color,
                linewidth: 5,
                transparent: true,
                opacity: .75,
                depthTest: false
            }
            const phiAbsMaterial = {
                color: 0x0077FF,//this.color,
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

            this.psiGraph_ = new VisLine(this.params.meshDivision, psiMaterial)
            this.psiAbsGraph_ = new VisLine(this.params.meshDivision, psiAbsMaterial)
            this.phiGraph_ = new VisLine(this.params.meshDivision, phiMaterial)
            this.phiAbsGraph_ = new VisLine(this.params.meshDivision, phiAbsMaterial)
            this.psiBaseline_ = new VisLine(2, baselineMaterial)
        }

        setWavefunction(psi: algorithms.GeneralizedWavefunction, potentialMinimumIndex: number) {
            if (psi == null) {
                this.psiVis_.valueAt = null
                this.psiAbsVis_.valueAt = null
                this.phiVis_.valueAt = null
                this.phiAbsVis_.valueAt = null
                return
            } else {
                assert(psi.length == this.params.meshDivision, "Wavefunction has wrong length")
                this.psiVis_.valueAt = (index: number, time: number) => {
                    return psi.valueAt(index, time)
                }
                this.psiAbsVis_.valueAt = (index: number, time: number) => {
                    let mag = Math.sqrt(psi.valueAt(index, time).magnitudeSquared())
                    return new Complex(mag, 0)
                }
                
                // perform fourier transform only if necessary
                let freqWavefunctionVal = null
                let freqWavefunction = () => {
                    if (freqWavefunctionVal == null) {
                        freqWavefunctionVal = psi.fourierTransform(potentialMinimumIndex, .5)
                    }
                    return freqWavefunctionVal
                }

                this.phiVis_.valueAt = (index: number, time: number) => {
                    return freqWavefunction().valueAt(index, time)
                }
                this.phiAbsVis_.valueAt = (index: number, time: number) => {
                    let mag = Math.sqrt(freqWavefunction().valueAt(index, time).magnitudeSquared())
                    return new Complex(mag, 0)
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

        redraw(time: number = null) {

            if (time === null) {
                time = this.animator.lastTime()
            }

            const cleanValue = (value: number) => {
                const limit = this.params.height / 2
                if (isNaN(value)) {
                    value = limit
                }
                return Math.max(-limit, Math.min(limit, value))
            }

            let updateVisualizable = (vis: Visualizable, visLine: VisLine, show: boolean) => {
                visLine.line.visible = show
                if (show) {
                    const psiScale = this.params.psiScale
                    for (let index = 0; index < this.params.meshDivision; index++) {
                        const x = this.params.centerForMeshIndex(index)
                        const yz = vis.valueAt(index, time)
                        const y = -cleanValue(psiScale * yz.re)
                        const z = cleanValue(psiScale * yz.im)
                        visLine.geometry.vertices[index] = new THREE.Vector3(x, y, z)
                    }
                    visLine.geometry.verticesNeedUpdate = true
                }
            }

            updateVisualizable(this.psiVis_, this.psiGraph_, this.params.showPsi)
            updateVisualizable(this.psiAbsVis_, this.psiAbsGraph_, this.params.showPsiAbs)
            updateVisualizable(this.phiVis_, this.phiGraph_, this.params.showPhi)
            updateVisualizable(this.phiAbsVis_, this.phiAbsGraph_, this.params.showPhiAbs)

            this.psiBaseline_.update((i: number) => vector3(i * this.params.width, 0, 0))

            this.animator.schedule(this)
        }

        advanceAnimation(when: number) {
            this.redraw(when)
        }

        addToGroup(parentGroup: THREE.Group, yOffset: number) {
            [this.psiGraph_,
                this.psiAbsGraph_,
                this.phiGraph_,
                this.phiAbsGraph_,
                this.psiBaseline_].forEach((vl: VisLine) => {
                    this.group_.add(vl.line)
                })
            this.group_.position.y = yOffset
            parentGroup.add(this.group_)
        }
    }
}
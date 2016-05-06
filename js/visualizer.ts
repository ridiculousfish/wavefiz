/// <reference path="../typings/threejs/three.d.ts"/>
/// <reference path='./algorithms.ts'/>
/// <reference path='./energy.ts'/>
/// <reference path='./potentialvis.ts'/>
/// <reference path='./wavefunctionvis.ts'/>
/// <reference path='./ui.ts'/>

module visualizing {

    // returns the global offset of an HTML element
    function getElementOffset(elem: HTMLElement) {
        let x = 0
        let y = 0
        let cursor = elem as any
        while (cursor != null) {
            x += cursor.offsetLeft
            y += cursor.offsetTop
            cursor = cursor.offsetParent
        }
        return { x: x, y: y }
    }
 
    export class Visualizer {
        private container_: HTMLElement
        private renderer_: THREE.Renderer
        private topScene_: THREE.Scene = new THREE.Scene()
        private topGroup_: THREE.Group = new THREE.Group()
        private camera_: THREE.Camera
        private potential_: PotentialVisualizer
        private animator_: Animator

        private wavefunctionAvg_: WavefunctionVisualizer

        private energyVisualizer_: visualizing.EnergyVisualizer
        private energyBars_: EnergyBar[] = []

        private leftTurningPoint_: VisLine
        private rightTurningPoint_: VisLine

        public maxX: number = 20
        public params = new Parameters()

        public state: InputState = { potential: [] }

        constructor(container: HTMLElement, energyContainer: HTMLElement, energyDraggerPrototype: HTMLElement) {

            this.params.width = 800
            this.params.height = 600

            this.container_ = container

            // Animator
            this.animator_ = new Animator(this.params, () => this.render())

            let renderer = new THREE.WebGLRenderer({ antialias: true })
            renderer.setClearColor(0x222222, 1)
            renderer.setSize(container.offsetWidth, container.offsetHeight)
            this.renderer_ = renderer
            this.container_.appendChild(renderer.domElement)

            const usePerspective = true
            if (usePerspective) {
                this.camera_ = new THREE.PerspectiveCamera(74, this.params.width / this.params.height, 0.1, 1000);
                this.topGroup_.position.x = -this.params.width / 2
                this.topGroup_.position.y = this.params.height / 2
                this.topGroup_.scale.y = -1
            } else {
                this.camera_ = new THREE.OrthographicCamera(0, this.params.width, 0, this.params.height, 0.1, 10000)
            }
            this.setCameraRotation(0)

            this.topScene_.add(this.topGroup_)

            // Potential Visualizer
            this.potential_ = new PotentialVisualizer(this.params)
            this.potential_.potentialUpdatedCallback = (v: number[]) => {
                this.state.potential = v.slice()
                this.rescaleEnergies()
                this.computeAndShowWavefunctions()
            }
            this.potential_.addToGroup(this.topGroup_)

            // Wavefunction Visualizer
            const centerY = this.params.height / 2
            this.wavefunctionAvg_ = new WavefunctionVisualizer(this.params, 0xFF7777, this.animator_)

            this.wavefunctionAvg_.addToGroup(this.topGroup_, centerY)

            // Turning Points
            for (let j = 0; j < 2; j++) {
                let tp = new VisLine(2, {
                    color: 0x000000,
                    linewidth: 1,
                    transparent: true,
                    opacity: .5
                })
                tp.update((i: number) => vector3(this.params.width / 2, i * this.params.height, 0))
                this.topGroup_.add(tp.line)
                if (j == 0) {
                    this.leftTurningPoint_ = tp
                } else {
                    this.rightTurningPoint_ = tp
                }
            }

            // Energy dragger
            this.energyVisualizer_ = new visualizing.EnergyVisualizer(energyContainer, energyDraggerPrototype, this.params)

            this.energyVisualizer_.positionUpdated = (slider: visualizing.EnergySlider, position: number) => {
                // the user dragged the energy to a new value, expressed our "height" coordinate system
                // compute a new wavefunction
                const energy = this.params.convertYFromVisualCoordinate(position)
                this.energyBars_.forEach((bar: EnergyBar) => {
                    if (bar.slider == slider) {
                        bar.setPositionAndEnergy(position, energy)
                    }
                })
                this.computeAndShowWavefunctions()
                return energy
            }

            // Start listening to events
            this.initEvents()
        }

        private initEvents() {
            let mouseIsDown = false
            let dragSelection: Draggable = null
            const element = this.container_
            const getXY = (evt: MouseEvent) => {
                let offset = getElementOffset(element)
                return { x: evt.pageX - offset.x, y: evt.pageY - offset.y }
            }
            const getRaycaster = (evt: MouseEvent): THREE.Raycaster => {
                let {x, y} = getXY(evt)
                let x2 = (x / element.offsetWidth) * 2 - 1
                let y2 = (y / element.offsetHeight) * 2 - 1
                let mouse = new THREE.Vector2(x2, y2)
                let raycaster = new THREE.Raycaster()
                raycaster.setFromCamera(mouse, this.camera_)
                return raycaster
            }
            element.addEventListener('mousemove', (evt: MouseEvent) => {
                let {x, y} = getXY(evt)
                if (mouseIsDown) {
                    if (dragSelection) {
                        dragSelection.dragged(getRaycaster(evt))
                    }
                    this.render()
                }
            })
            element.addEventListener('mousedown', (evt) => {
                let {x, y} = getXY(evt)

                dragSelection = null
                const raycaster = getRaycaster(evt)
                const draggables: Draggable[] = [this.potential_]
                for (let i = 0; i < draggables.length && dragSelection == null; i++) {
                    dragSelection = draggables[i].hitTestDraggable(raycaster)
                }

                if (dragSelection) {
                    dragSelection.dragStart(raycaster)
                }
                mouseIsDown = true
                this.render()
                //                this.animator_.clock.stop()
            })
            document.addEventListener('mouseup', () => {
                if (dragSelection) {
                    dragSelection.dragEnd()
                    dragSelection = null
                    mouseIsDown = false
                    this.render()
                }
                //                this.animator_.clock.start()
            })

        }

        private setCameraRotation(rads: number) {
            // rotate about the y axis
            // rotation of 0 => z = 1 * scale
            const scale = 400
            const x = Math.sin(rads) * scale
            const z = Math.cos(rads) * scale
            this.camera_.position.set(x, 0, z)
            this.camera_.lookAt(new THREE.Vector3(0, 0, 0))
        }

        private render() {
            this.renderer_.render(this.topScene_, this.camera_);
        }

        private nextInterestingEnergy() {
            const usedEnergies = this.energyBars_.map((eb: EnergyBar) => eb.energy)
            const energyIsUsed = (proposedE: number) => {
                const eps = .25
                return usedEnergies.some((energy: number) => Math.abs(proposedE - energy) <= eps)
            }

            const maxEnergy = this.params.height / this.params.yScale
            const startingPoints = [3.0, 1.5, 2.0, 2.5, 1.0, 0.5]
            const offset = 1.3
            for (let i = 0; i < startingPoints.length; i++) {
                for (let proposal = startingPoints[i]; proposal < maxEnergy; proposal += offset) {
                    if (!energyIsUsed(proposal)) {
                        return proposal
                    }
                }
            }
            return maxEnergy / 3; // give up!
        }

        public addEnergySlider() {
            const energy = this.nextInterestingEnergy()
            const position = this.params.convertYToVisualCoordinate(energy)
            const slider = this.energyVisualizer_.addSlider(position, energy)
            const bar = new EnergyBar(slider, energy, this.params)
            this.energyBars_.push(bar)
            bar.setPositionAndEnergy(position, energy) // hack, we shouldn't need to do this
            this.topGroup_.add(bar.line.line)
            this.computeAndShowWavefunctions()
        }

        public removeEnergySlider() {
            // remove the last added one
            if (this.energyBars_.length == 0) {
                return
            }
            const bar = this.energyBars_.pop()
            this.topGroup_.remove(bar.line.line)
            this.energyVisualizer_.removeSlider(bar.slider)
            this.computeAndShowWavefunctions()
        }

        private rescaleEnergies() {
            this.energyBars_.forEach((eb: EnergyBar) => {
                const pos = eb.slider.position
                const energy = this.params.convertYFromVisualCoordinate(pos)
                eb.setPositionAndEnergy(pos, energy)
            })
        }

        private computeAndShowWavefunctions() {
            if (this.state.potential.length == 0) {
                return
            }
            
            if (this.energyBars_.length > 0) {
                const center = algorithms.indexOfMinimum(this.state.potential)
                // update wavefunctions and collect them all
                let psis = this.energyBars_.map((bar: EnergyBar) => {
                    const psiInputs = {
                        potentialMesh: this.state.potential,
                        energy: bar.energy,
                        xMax: this.maxX
                    }
                    let even = algorithms.NumerovIntegrator(true).computeWavefunction(psiInputs).resolveAtClassicalTurningPoints()
                    let odd = algorithms.NumerovIntegrator(false).computeWavefunction(psiInputs).resolveAtClassicalTurningPoints()
                    let resolvedWavefunction = algorithms.averageResolvedWavefunctions(odd, even)
                    bar.wavefunction = resolvedWavefunction
                    return resolvedWavefunction  
                })
                let genPsi = new algorithms.GeneralizedWavefunction(psis)
                this.wavefunctionAvg_.setWavefunction(genPsi, center)
            }
            this.wavefunctionAvg_.setVisible(this.energyBars_.length > 0)

            {
                document.getElementById("statusfield").textContent = ""
            }

            // update turning points based on maximum energy
            let maxEnergy = 0
            this.energyBars_.map((eb:EnergyBar) => maxEnergy = Math.max(maxEnergy, eb.energy))
            const maxTurningPoints = algorithms.classicalTurningPoints(this.state.potential, maxEnergy)

            const leftV = this.params.convertXToVisualCoordinate(maxTurningPoints.left)
            const rightV = this.params.convertXToVisualCoordinate(maxTurningPoints.right)
            this.leftTurningPoint_.update((i: number) => vector3(leftV, i * this.params.height, 0))
            this.rightTurningPoint_.update((i: number) => vector3(rightV, i * this.params.height, 0))

            this.render()
        }

        public setShowPsi(flag: boolean) {
            this.params.showPsi = flag
            this.computeAndShowWavefunctions()
        }

        public setShowPsiAbs(flag: boolean) {
            this.params.showPsiAbs = flag
            this.computeAndShowWavefunctions()
        }

        public setShowPhi(flag: boolean) {
            this.params.showPhi = flag
            this.computeAndShowWavefunctions()
        }

        public setShowPhiAbs(flag: boolean) {
            this.params.showPhiAbs = flag
            this.computeAndShowWavefunctions()
        }

        public setPaused(flag: boolean) {
            this.params.paused = flag
            this.animator_.setPaused(flag)
            if (flag) {
                this.animator_.reset()
            }
        }

        public setRotation(rads: number) {
            this.setCameraRotation(rads)
            this.render()
        }
        
        loadFrom(f: ((x:number, xfrac?:number) => number)) {
            let mesh = buildPotential(f, this.params)
            this.potential_.setPotential(mesh)
        }

        public loadSHO() {
            // Simple Harmonic Oscillator
            this.params.yScale = 80
            const baseEnergy = 0.25
            const xScaleFactor = 1.0 / 4.0
            this.params.timescale = 1.0 / 2.0
            this.loadFrom((x: number) => {
                // x is a value in [0, this.potential_.width)
                // we have a value of 1 at x = width/2
                const offsetX = this.params.width / 2
                const scaledX = (x - offsetX) * this.maxX / this.params.width
                return baseEnergy + xScaleFactor * (scaledX * scaledX / 2.0)
            })
        }

        public loadISW() {
            // Infinite square well
            this.params.yScale = 400
            const baseEnergy = 1 / 16
            this.params.timescale = 1.0
            const widthRatio = 1.0 / 5.0
            this.loadFrom((x: number) => {
                // x is a value in [0, this.params.width)
                const width = this.params.width
                if (x < width * widthRatio || x > width - (width * widthRatio)) {
                    return 1000
                }
                return baseEnergy
            })
        }

        public loadFSW() {
            // Finite square well
            this.params.yScale = 400
            const baseEnergy = 1 / 16
            this.params.timescale = 1.0
            const widthRatio = 1.0 / 5.0
            this.loadFrom((x: number) => {
                // x is a value in [0, this.params.width)
                const width = this.params.width
                if (x < width * widthRatio || x > width - (width * widthRatio)) {
                    return 1.25
                }
                return baseEnergy
            })
        }

        public load2SW() {
            // Two adjacent square wells
            this.params.yScale = 100
            this.params.timescale = 1.0
            const leftBarrierEnd = 1.0 / 5.0
            const rightBarrierStart = 1.0 - 1.0 / 5.0
            const centerBarrierStart = 1.7 / 5.0
            const centerBarrierEnd = 1.85 / 5.0
            this.loadFrom((x: number) => {
                // x is a value in [0, this.params.width)
                const sx = x / this.params.width
                if (sx < leftBarrierEnd || sx > rightBarrierStart) {
                    return 5.0
                } else if (sx >= centerBarrierStart && sx < centerBarrierEnd) {
                    return 4.0
                } else {
                    return .5
                }
            })

        }
    }
}

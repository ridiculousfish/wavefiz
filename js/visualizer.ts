/// <reference path="../typings/threejs/three.d.ts"/>
/// <reference path='./algorithms.ts'/>
/// <reference path='./energy.ts'/>
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
    
    // helpers
    type Vector3 = THREE.Vector3
    function vector3(x:number, y:number, z:number) : THREE.Vector3 {
        return new THREE.Vector3(x, y, z)
    }

    export interface Draggable {
        dragStart(raycaster: THREE.Raycaster): void
        dragEnd(): void
        dragged(raycaster: THREE.Raycaster): void
        hitTestDraggable(raycaster: THREE.Raycaster): Draggable // or null
    }


    /* A class to help with animations. Adds callbacks (which trigger requestAnimationFrame) */
    interface AnimatorClient {
        advanceAnimation(when: number)
    }

    class Visualizable {
        valueAt: (index: number, time: number) => Complex = undefined
    }

    class Animator {
        public clock = new THREE.Clock(false)
        private clients_: AnimatorClient[] = []
        private rerender_: () => void
        // clock stopping and starting doesn't adjust elapsed time
        // so we have to do that ourselves
        private elapsed_: number

        constructor(public params: Parameters, rerender: () => void) {
            this.rerender_ = rerender
            this.elapsed_ = this.clock.getElapsedTime()
        }

        schedule(client: AnimatorClient) {
            if (this.clients_.length == 0 && !this.paused()) {
                window.requestAnimationFrame(() => this.fireClients())
            }
            this.clients_.push(client)
        }

        setPaused(flag: boolean) {
            if (flag) {
                this.clock.stop()
            } else {
                this.clock.start()
                if (this.clients_.length > 0) {
                    window.requestAnimationFrame(() => this.fireClients())
                }
            }
        }

        reset() {
            this.elapsed_ = 0
        }

        paused(): boolean {
            return !this.clock.running
        }

        lastTime(): number {
            return this.elapsed_
        }

        fireClients() {
            let locals = this.clients_
            const dt = this.clock.getDelta() * this.params.timescale
            this.elapsed_ += dt
            this.clients_ = []
            let processed = []
            locals.forEach((client: AnimatorClient) => {
                // deduplicate to avoid multiple schedules of the same object
                for (let i = 0; i < processed.length; i++) {
                    if (processed[i] === client) {
                        return
                    }
                }
                client.advanceAnimation(this.elapsed_)
                processed.push(client)
            })
            this.rerender_()
        }
    }

    export class VisLine {
        public geometry: THREE.Geometry
        public line: THREE.Line
        constructor(public length: number, material: THREE.LineBasicMaterialParameters) {
            this.geometry = new THREE.Geometry()
            const zero = new THREE.Vector3(0, 0, 0)
            for (let i = 0; i < length; i++) {
                this.geometry.vertices.push(zero)
            };
            (this.geometry as any).dynamic = true
            this.line = new THREE.Line(this.geometry, new THREE.LineBasicMaterial(material))
        }

        public update(cb: (index) => THREE.Vector3) {
            for (let i = 0; i < this.length; i++) {
                this.geometry.vertices[i] = cb(i)
            }
            this.geometry.verticesNeedUpdate = true
        }
    }

    export class Parameters {
        public xScale = 1
        public yScale = 1 // multiply to go from potential to graphical point
        public width: number = 800
        public height: number = 600
        public timescale: number = 1.0 / 3.0
        public meshDivision: number = 1025 // how many points are in our mesh. Must be odd.
        public psiScale: number = 250 // how much scale we apply to the wavefunction

        public showPsi = !false // show position psi(x)
        public showPsiAbs = false // show position probability |psi(x)|^2
        public showPhi = true // show momentum phi(x)
        public showPhiAbs = true // show momentum probability |phi(x)|^2

        public showEven = false
        public showOdd = false
        public showAvg = true

        public paused = false

        public centerForMeshIndex(idx: number): number {
            assert(idx >= 0 && idx < this.meshDivision, "idx out of range")
            let meshWidth = this.width / this.meshDivision
            return idx * meshWidth + meshWidth / 2.0
        }

        public convertYToVisualCoordinate(y: number) {
            return this.height - this.yScale * y
        }

        public convertYFromVisualCoordinate(y: number) {
            return (this.height - y) / this.yScale
        }

        public convertXToVisualCoordinate(x: number) {
            return (x / this.meshDivision) * this.width
        }
    }

    interface InputState {
        potential: number[],
        energy: number
    }

    function assert(condition, message) {
        if (!condition) {
            throw message || "Assertion failed"
        }
    }

    class EnergyBar {
        line: VisLine
        constructor(public slider: energy.EnergySlider, public energy: number, public params: Parameters) {
            this.line = new VisLine(2, { color: 0xFF0000 })
        }
        setPositionAndEnergy(position: number, energy: number) {
            this.energy = energy
            this.line.update((idx:number) => vector3(idx * this.params.width, position, 0))
        }
    }

    class PotentialVisualizer {
        private dragLocations_: Vector3[] = []
        private dragLine_: VisLine
        private potentialLine_: VisLine
        private background_: THREE.Mesh
        private DRAG_STROKE_WIDTH = 5

        // callback for when the potential is updated
        public potentialUpdatedCallback: ((n: number[]) => void) = undefined

        // the values of our mesh, stored unflipped (0 at bottom)
        private potentialMesh_: number[]
        constructor(public params: Parameters) {
            this.init()
        }

        private interpolateY(p1: THREE.Vector3, p2: THREE.Vector3, x: number): number {
            let d1 = Math.abs(p1.x - x)
            let d2 = Math.abs(p2.x - x)
            let distance = d1 + d2
            let leftWeight = (distance == 0 ? 1.0 : 1.0 - (d1 / distance))
            return p1.y * leftWeight + p2.y * (1.0 - leftWeight)
        }

        // builds a potential mesh of size meshDivision_
        // locs is relative to upper left: smaller values are more north
        private buildMeshFromDragPoints(locs: Vector3[]): number[] {
            let potentialMesh: number[] = []

            for (let meshIdx = 0; meshIdx < this.params.meshDivision; meshIdx++) {
                let meshCenterX = this.params.centerForMeshIndex(meshIdx)
                // find the drag points
                var candidates = []
                for (let i = 1; i < locs.length; i++) {
                    let p1 = locs[i - 1], p2 = locs[i]
                    if (p1.x <= meshCenterX && p2.x >= meshCenterX ||
                        p2.x <= meshCenterX && p1.x >= meshCenterX) {
                        candidates.push(this.interpolateY(p1, p2, meshCenterX))
                    }
                }
                if (candidates.length == 0) {
                    // use closest point
                    let closest = locs[0]
                    for (let i = 1; i < locs.length; i++) {
                        if (Math.abs(meshCenterX - locs[i].x) < Math.abs(meshCenterX - closest.x)) {
                            closest = locs[i]
                        }
                    }
                    candidates.push(closest.y)
                }

                // use the largest potential
                let minCandidate = Math.min(...candidates)

                // convert from candidate to potential
                const potential = (this.params.height - minCandidate) / this.params.yScale

                potentialMesh.push(potential)
            }
            return potentialMesh
        }

        // Draggable implementations
        dragStart(raycaster: THREE.Raycaster) {
            this.clearDragLocations(false)
        }

        dragEnd() {
            this.potentialMesh_ = this.buildMeshFromDragPoints(this.dragLocations_)
            this.clearDragLocations(true)
            this.redrawPotentialMesh()
            this.announceNewPotential()
        }

        dragged(raycaster: THREE.Raycaster) {
            let intersections = raycaster.intersectObject(this.background_, false)
            if (intersections.length > 0) {
                let where = intersections[0].point
                this.dragLocations_.push(vector3(where.x + this.params.width / 2, where.y + this.params.height / 2, 0))
                this.redrawDragLine()
            }
        }

        hitTestDraggable(raycaster: THREE.Raycaster): Draggable {
            let intersections = raycaster.intersectObject(this.background_, false)
            return intersections.length > 0 ? this : null
        }

        private clearDragLocations(animate: boolean) {
            if (this.dragLocations_.length > 0) {
                this.dragLocations_.length = 0
                this.redrawDragLine()
            }
        }

        private redrawDragLine() {
            const hasPoints = this.dragLocations_.length > 0
            this.dragLine_.line.visible = hasPoints
            if (hasPoints) {
                this.dragLine_.update((i: number) => {
                    return this.dragLocations_[Math.min(i, this.dragLocations_.length - 1)]
                })
            }
        }

        private redrawPotentialMesh() {
            this.potentialLine_.update((index: number) => {
                const value = this.potentialMesh_[index]
                const x = this.params.centerForMeshIndex(index)
                const y = this.params.convertYToVisualCoordinate(value)
                const z = 0
                return vector3(x, y, z)
            })
        }

        private announceNewPotential() {
            if (this.potentialUpdatedCallback) {
                this.potentialUpdatedCallback(this.potentialMesh_)
            }
        }

        private init() {
            // note line geometries cannot be resized            
            this.dragLine_ = new VisLine(this.params.meshDivision, {
                color: 0x00FFFF,
                linewidth: 8
            })
            this.potentialLine_ = new VisLine(this.params.meshDivision, {
                color: 0xFF00FF,
                linewidth: 5
            })

            let planeGeo = new THREE.PlaneGeometry(this.params.width * 2, this.params.height * 2)
            let planeMat = new THREE.MeshBasicMaterial({ visible: false, depthWrite: false })
            this.background_ = new THREE.Mesh(planeGeo, planeMat)
            this.background_.position.set(this.params.width / 2, this.params.height / 2, 0)
            this.background_.renderOrder = -10000
        }

        public addToGroup(group: THREE.Group) {
            group.add(this.background_)
            group.add(this.potentialLine_.line)
            group.add(this.dragLine_.line)
        }

        loadFrom(f: ((x: number) => number)) {
            // given a function that maps x to a potential, builds the full potential
            let potentialMesh: number[] = []
            for (let i = 0; i < this.params.meshDivision; i++) {
                const x = this.params.centerForMeshIndex(i)
                potentialMesh.push(f(x))
            }
            this.potentialMesh_ = potentialMesh
            this.redrawPotentialMesh()
            this.announceNewPotential()
        }
    }

    class WavefunctionVisualizer {
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

        setWavefunction(psi: GeneralizedWavefunction, potentialMinimumIndex: number) {
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
                
                let freqWavefunction = psi.fourierTransform(potentialMinimumIndex, .5)
                this.phiVis_.valueAt = (index: number, time: number) => {
                    return freqWavefunction.valueAt(index, time)
                }
                this.phiAbsVis_.valueAt = (index: number, time: number) => {
                    let mag = Math.sqrt(freqWavefunction.valueAt(index, time).magnitudeSquared())
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
            
            let updateVisualizable = (vis:Visualizable, visLine: VisLine, show:boolean) => {
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

            this.psiBaseline_.update((i: number) => {
                return vector3(i * this.params.width, 0, 0)
            })

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

    export class Visualizer {
        private container_: HTMLElement
        private renderer_: THREE.Renderer
        private topScene_: THREE.Scene = new THREE.Scene()
        private topGroup_: THREE.Group = new THREE.Group()
        private camera_: THREE.Camera
        private potential_: PotentialVisualizer
        private animator_: Animator

        private wavefunctionAvg_: WavefunctionVisualizer

        private energyVisualizer_: energy.EnergyVisualizer
        private energyBars_: EnergyBar[] = []

        private leftTurningPoint_: VisLine
        private rightTurningPoint_: VisLine

        public maxX: number = 20
        public params = new Parameters()

        public state: InputState = { potential: [], energy: 2.5 }

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
            this.energyVisualizer_ = new energy.EnergyVisualizer(energyContainer, energyDraggerPrototype, this.params)

            this.energyVisualizer_.positionUpdated = (slider: energy.EnergySlider, position: number) => {
                // the user dragged the energy to a new value, expressed our "height" coordinate system
                // compute a new wavefunction
                const energy = this.params.convertYFromVisualCoordinate(position)
                this.energyBars_.forEach((bar: EnergyBar) => {
                    if (bar.slider == slider) {
                        bar.setPositionAndEnergy(position, energy)
                        this.state.energy = energy
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
            if (0 && this.state.potential.length == 0) {
                // clear everything
                this.wavefunctionAvg_.clear()
                return
            }

            // update wavefunctions
            const psiInputs = {
                potentialMesh: this.state.potential,
                energy: this.state.energy,
                xMax: this.maxX
            }
            const center = indexOfMinimum(this.state.potential)
            const psiEven = NumerovIntegrator(true).computeWavefunction(psiInputs)
            const psiOdd = NumerovIntegrator(false).computeWavefunction(psiInputs)
            const psiREven = psiEven.resolveAtClassicalTurningPoints()
            const psiROdd = psiOdd.resolveAtClassicalTurningPoints()

            if (this.energyBars_.length > 0) {
                let psis = this.energyBars_.map((bar: EnergyBar) => {
                    const psiInputs = {
                        potentialMesh: this.state.potential,
                        energy: bar.energy,
                        xMax: this.maxX
                    }
                    let even = NumerovIntegrator(true).computeWavefunction(psiInputs).resolveAtClassicalTurningPoints()
                    let odd = NumerovIntegrator(false).computeWavefunction(psiInputs).resolveAtClassicalTurningPoints()
                    return averageResolvedWavefunctions(odd, even)
                })
                let genPsi = new GeneralizedWavefunction(psis)
                this.wavefunctionAvg_.setWavefunction(genPsi, center)
            }
            this.wavefunctionAvg_.setVisible(this.params.showAvg && this.energyBars_.length > 0)

            {
                let disContText = ""
                disContText += "even: " + psiREven.md.leftDerivativeDiscontinuity.toFixed(3) + "," + psiREven.md.rightDerivativeDiscontinuity.toFixed(3)
                disContText += " / "
                disContText += "odd: " + psiROdd.md.leftDerivativeDiscontinuity.toFixed(3) + "," + psiROdd.md.rightDerivativeDiscontinuity.toFixed(3)
                document.getElementById("statusfield").textContent = disContText
            }

            // update turning points
            const turningPoints = psiOdd.classicalTurningPoints()
            const leftV = this.params.convertXToVisualCoordinate(turningPoints.left)
            const rightV = this.params.convertXToVisualCoordinate(turningPoints.right)
            this.leftTurningPoint_.update((i: number) => vector3(leftV, i * this.params.height, 0))
            this.rightTurningPoint_.update((i: number) => vector3(rightV, i * this.params.height, 0))

            // update energy
            const visEnergy = this.params.convertYToVisualCoordinate(this.state.energy)
            //this.energyDragger_.update(visEnergy, this.state.energy)
            //this.energyDragger_.attr({visibility: "visible"})
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

        public loadSHO() {
            // Simple Harmonic Oscillator
            this.params.yScale = 80
            const baseEnergy = 0.25
            const xScaleFactor = 1.0 / 4.0
            this.params.timescale = 1.0 / 2.0
            this.potential_.loadFrom((x: number) => {
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
            this.potential_.loadFrom((x: number) => {
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
            this.potential_.loadFrom((x: number) => {
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
            this.potential_.loadFrom((x: number) => {
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

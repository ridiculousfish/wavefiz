/// <reference path="../typings/threejs/three.d.ts"/>
/// <reference path='./algorithms.ts'/>
/// <reference path='./energy.ts'/>

module visualizing {
    
    function roundForSVG(val:number) : number {
        return Math.round(val * 100) / 100
    }
    
    /* A simple 3D point */
    interface Point3 {
        x:number,
        y:number,
        z:number
    }
    
    export interface Draggable {
        dragStart(dx:number, dy:number) : void
        dragEnd() : void
        dragged(x:number, y:number, dx:number, dy:number): void
        hitTestDraggable(x:number, y:number): Draggable // or null
    }

    
    /* A class to help with animations. Adds callbacks (which trigger requestAnimationFrame) */
    interface AnimatorClient {
        advanceAnimation(when:number)
    }
    
    class Animator {
        public clock = new THREE.Clock(false)
        private clients_: AnimatorClient[] = []
        private rerender_ : () => void
        // clock stopping and starting doesn't adjust elapsed time
        // so we have to do that ourselves
        private elapsed_: number
        
        constructor(public timescale:number, rerender:() => void) {
            this.rerender_ = rerender
            this.elapsed_ = this.clock.getElapsedTime() 
        }
        
        schedule(client: AnimatorClient) {
            if (this.clients_.length == 0 && ! this.paused()) {
                window.requestAnimationFrame(() => this.fireClients())
            }
            this.clients_.push(client)
        }
        
        setPaused(flag:boolean) {
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
        
        paused() : boolean {
            return !this.clock.running
        }
        
        lastTime() : number {
            return this.elapsed_
        }
        
        fireClients() {
            let locals = this.clients_
            const dt = this.clock.getDelta() * this.timescale
            this.elapsed_ += dt
            this.clients_ = []
            let processed = []
            locals.forEach((client:AnimatorClient) => {
                // deduplicate to avoid multiple schedules
                for (let i=0; i < processed.length; i++) {
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
        public geometry : THREE.Geometry
        public line: THREE.Line
        constructor(public length:number, material:THREE.LineBasicMaterialParameters) {
            this.geometry = new THREE.Geometry()
            const zero = new THREE.Vector3(0, 0, 0)
            for (let i=0; i < length; i++) {
                this.geometry.vertices.push(zero)
            };
            (this.geometry as any).dynamic = true 
            this.line = new THREE.Line(this.geometry, new THREE.LineBasicMaterial(material))
        }
        
        public update(cb:(index) => Point3) {
            for (let i=0; i < this.length; i++) {
                let xyz = cb(i)
                this.geometry.vertices[i] = new THREE.Vector3(xyz.x, xyz.y, xyz.z)
            }
            this.geometry.verticesNeedUpdate = true
        }
    }
    
    export class VisRect {
        public mesh: THREE.Mesh
        constructor(public width:number, public height:number, public radius:number, material:THREE.MeshBasicMaterialParameters) {
            material.side = THREE.DoubleSide // hack
            
            let shape = new THREE.Shape();
            if (radius == 0) {
                shape.moveTo(0, 0)
                shape.moveTo(width, 0)
                shape.moveTo(width, height)
                shape.moveTo(0, height)
                shape.moveTo(0, 0)
            } else {
                ( function roundedRect( ctx, x, y, width, height, radius ){

                    ctx.moveTo( x, y + radius );
                    ctx.lineTo( x, y + height - radius );
                    ctx.quadraticCurveTo( x, y + height, x + radius, y + height );
                    ctx.lineTo( x + width - radius, y + height) ;
                    ctx.quadraticCurveTo( x + width, y + height, x + width, y + height - radius );
                    ctx.lineTo( x + width, y + radius );
                    ctx.quadraticCurveTo( x + width, y, x + width - radius, y );
                    ctx.lineTo( x + radius, y );
                    ctx.quadraticCurveTo( x, y, x, y + radius );
                } )( shape, 0, 0, width, height, radius );
            }
            let geometry = shape.makeGeometry()            
            this.mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial(material));
        }
    }
    
    // taken from https://stemkoski.github.io/Three.js/Sprite-Text-Labels.html
    export function makeTextSprite(message:string, parameters ) {
        if ( parameters === undefined ) parameters = {};
        
        var fontface = parameters.hasOwnProperty("fontface") ? 
            parameters["fontface"] : "Arial";
        
        var fontsize = parameters.hasOwnProperty("fontsize") ? 
            parameters["fontsize"] : 18;
                
        var borderColor = parameters.hasOwnProperty("borderColor") ?
            parameters["borderColor"] : { r:0, g:0, b:0, a:0.0 };
        
            
        var canvas = document.createElement('canvas');
        var context = canvas.getContext('2d')
        context.font = "Bold " + fontsize + "px " + fontface;
                
        // get size data (height depends only on font size)
        var metrics = context.measureText(message)
        var textWidth = metrics.width;
        const estimatedHeight = fontsize * 1.4
        const textureWidth = textWidth
        const textureHeight = estimatedHeight
        
        // text color
        const bg = parameters["backgroundColor"] 
        if (bg) { 
            context.fillStyle = "rgba(" + bg.r + "," + bg.g + ","
                                        + bg.b + "," + bg.a + ")"
            context.fillRect(0, 0, textureWidth, textureHeight)
        }
        context.fillStyle = "rgba(0, 0, 0, 1.0)";
        context.fillText( message, 0, fontsize)
        
        let image = context.getImageData(0, 0, textureWidth, textureHeight)
        
        // canvas contents will be used for a texture
        var texture = new THREE.Texture(image as any)
        texture.flipY = false 
        texture.needsUpdate = true

        var spriteMaterial = new THREE.SpriteMaterial( { map: texture } )
        var sprite = new THREE.Sprite( spriteMaterial )
        sprite.scale.set(textureWidth, textureHeight, 1.0)
        return sprite
    }
    
    export class Parameters {
        public xScale = 1
        public yScale = 1 // multiply to go from potential to graphical point
        public width : number = 800
        public height : number = 600
        public meshDivision : number = 1025 // how many points are in our mesh. Must be odd.
        public psiScale: number = 150 // how much scale we apply to the wavefunction
        
        public showPsi = !false // show psi(x)
        public showPsi2 = false // show |psi(x)|^2
        public showPsiT = false // show psi(x,t)
        
        public showEven = false
        public showOdd = false
        public showAvg = true
        
        public paused = false
        
        public centerForMeshIndex(idx:number):number {
            assert(idx >= 0 && idx < this.meshDivision, "idx out of range")
            let meshWidth = this.width / this.meshDivision
            return idx * meshWidth + meshWidth / 2.0
        }
        
        public convertYToVisualCoordinate(y:number) {
            return this.height - this.yScale * y
        }
        
        public convertYFromVisualCoordinate(y:number) {
            return (this.height - y) / this.yScale
        }
        
        public convertXToVisualCoordinate(x:number) {
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
        constructor(public slider:energy.EnergySlider, public energy:number, public params:Parameters) {
            this.line = new VisLine(2, {color: 0xFF0000})
        }
        setPositionAndEnergy(position: number, energy:number) {
            this.energy = energy
            this.line.update((idx:number) => ({x:idx * this.params.width, y:position, z:0}))
        }
    }

    class PotentialVisualizer {
        private dragLocations_ : Point3[] = []
        private dragLine_ : VisLine
        private potentialLine_ : VisLine
        private DRAG_STROKE_WIDTH = 5
        
        // callback for when the potential is updated
        public potentialUpdatedCallback : ((n:number[]) => void) = undefined
        
        // the values of our mesh, stored unflipped (0 at bottom)
        private potentialMesh_ : number[]
        constructor(public params : Parameters) {
            this.init()
        }
        
        private interpolateY(p1:Point3, p2:Point3, x:number) : number {
            let d1 = Math.abs(p1.x - x)
            let d2 = Math.abs(p2.x - x)
            let distance = d1 + d2
            let leftWeight = (distance == 0 ? 1.0 : 1.0 - (d1 / distance))
            return p1.y * leftWeight + p2.y * (1.0 - leftWeight)
        }
        
        // builds a potential mesh of size meshDivision_
        // locs is relative to upper left: smaller values are more north
        private buildMeshFromDragPoints(locs:Point3[]) : number[] {
            let potentialMesh : number[] = []
                                    
            for (let meshIdx = 0; meshIdx < this.params.meshDivision; meshIdx++) {
                let meshCenterX = this.params.centerForMeshIndex(meshIdx)
                // find the drag points
                var candidates = []
                for (let i=1; i < locs.length; i++) {
                    let p1 = locs[i-1], p2 = locs[i]
                    if (p1.x <= meshCenterX && p2.x >= meshCenterX ||
                        p2.x <= meshCenterX && p1.x >= meshCenterX) {
                        candidates.push(this.interpolateY(p1, p2, meshCenterX))
                    }
                }
                if (candidates.length == 0) {
                    // use closest point
                    let closest = locs[0]
                    for (let i=1; i < locs.length; i++) {
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
        dragStart(dx:number, dy:number) {
            this.clearDragLocations(false)
        }
        
        dragEnd() {
            this.potentialMesh_ = this.buildMeshFromDragPoints(this.dragLocations_)
            this.clearDragLocations(true)
            this.redrawPotentialMesh()
            this.announceNewPotential()
        }
        
        dragged(x:number, y:number, dx:number, dy:number) {
            this.dragLocations_.push({x:x, y:y, z:0})
            this.redrawDragLine()
        }
        
        hitTestDraggable(x:number, y:number): Draggable {
            if (x >= 0 && x < this.params.width && y >= 0 && y < this.params.height) {
                return this
            }
            return null
        }
        
        private clearDragLocations(animate:boolean) {
            if (this.dragLocations_.length > 0) {
                this.dragLocations_.length = 0
                this.redrawDragLine()                
            }
        }
        
        private redrawDragLine() {
            const hasPoints = this.dragLocations_.length > 0
            this.dragLine_.line.visible = hasPoints
            if (hasPoints) { 
                this.dragLine_.update((i:number) => {
                    return this.dragLocations_[Math.min(i, this.dragLocations_.length - 1)]                
                })
            }
        }
        
        private redrawPotentialMesh() {
            this.potentialLine_.update((index:number) => {
                const value = this.potentialMesh_[index]
                const x = this.params.centerForMeshIndex(index)
                const y = this.params.convertYToVisualCoordinate(value)
                const z = 0
                return {x:x, y:y, z:z}
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
        }
        
        public addToScene(scene:THREE.Scene) {
            scene.add(this.potentialLine_.line)
            scene.add(this.dragLine_.line)
        }
        
        loadFrom(f:((x:number) => number)) {
            // given a function that maps x to a potential, builds the full potential
            let potentialMesh : number[] = []
            for (let i=0; i < this.params.meshDivision; i++) {
                const x = this.params.centerForMeshIndex(i)
                potentialMesh.push(f(x))
            }
            this.potentialMesh_ = potentialMesh
            this.redrawPotentialMesh()
            this.announceNewPotential()
        } 
    }
    
    class WavefunctionVisualizer {
        private wavefunction_: GeneralizedWavefunction = null
        private group_ : THREE.Group = new THREE.Group()
        private psiGraph_ : VisLine
        private psi2Graph_ : VisLine
        private psiBaseline_ : VisLine
        
        constructor(public params: Parameters, public color: number, public animator:Animator) {
            
            const psiMaterial = {
                color: this.color,
                linewidth: 5,
                depthTest: false
            }
            const psiTMaterial = {
                color: this.color,
                linewidth: 3,
                depthTest: false
            }
            const psi2Material = {
                color: this.color,
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
            this.psi2Graph_ = new VisLine(this.params.meshDivision, psi2Material)
            this.psiBaseline_ = new VisLine(2, baselineMaterial)            
        }
        
        setWavefunction(psi:GeneralizedWavefunction) {
            this.wavefunction_ = psi
            this.redraw()
        }
        
        setVisible(flag:boolean) {
            this.group_.visible = flag
        }
        
        clear() {
            this.wavefunction_ = null
            this.redraw(0)
        }
                
        redraw(time:number = null) {
            if (this.wavefunction_ === null) {
                return
            }
            
            if (time === null) {
                time = this.animator.lastTime()
            }
            
            const cleanValue = (value:number) => {
                const limit = this.params.height/2
                if (isNaN(value)) {
                    value = limit
                }
                return Math.max(-limit, Math.min(limit, value))
            }

            const psiScale = this.params.psiScale
            
            for (let index=0; index < this.wavefunction_.length; index++) {
                const x = this.params.centerForMeshIndex(index)
                const yz = this.wavefunction_.valueAt(index, time)
                const y = cleanValue(psiScale * yz.re)
                const z = cleanValue(psiScale * yz.im)
                const magnitude = -psiScale * Math.sqrt(yz.re * yz.re + yz.im * yz.im)
                
                this.psiGraph_.geometry.vertices[index] = new THREE.Vector3(x, y, z)
                this.psi2Graph_.geometry.vertices[index] = new THREE.Vector3(x, magnitude, 0)
            }
            this.psiGraph_.geometry.verticesNeedUpdate = true
            this.psi2Graph_.geometry.verticesNeedUpdate = true
            
            this.psiGraph_.line.visible = this.params.showPsi
            this.psi2Graph_.line.visible = this.params.showPsi2     
            this.psiBaseline_.update((i:number) => {
                return {x:i*this.params.width, y:0, z:0}
            })
            
            this.animator.schedule(this)
        }
        
        advanceAnimation(when:number) {
            this.redraw(when)
        }
        
        addToScene(scene:THREE.Scene, yOffset:number) {
            [this.psiGraph_,
             this.psi2Graph_,
             this.psiBaseline_].forEach((vl:VisLine) => {
                 this.group_.add(vl.line)
             })
            this.group_.position.y = yOffset
            scene.add(this.group_)
        }
    }

    export class Visualizer {
        private container_: HTMLElement
        private renderer_ : THREE.Renderer
        private scene_ : THREE.Scene
        private camera_: THREE.OrthographicCamera
        private potential_ : PotentialVisualizer
        private animator_ : Animator
        
        private wavefunctionOdd_ : WavefunctionVisualizer
        private wavefunctionEven_ : WavefunctionVisualizer
        private wavefunctionAvg_ : WavefunctionVisualizer
        
        private energyVisualizer_ : energy.EnergyVisualizer
        private energyBars_ : EnergyBar[] = []
        
        private leftTurningPoint_: VisLine
        private rightTurningPoint_: VisLine
                
        public maxX : number = 20
        public params  = new Parameters()
        
        public state : InputState = {potential: [], energy: 2.5} 

        constructor(container: HTMLElement, energyContainer: HTMLElement, energyDraggerPrototype: HTMLElement) {
            
            this.params.width = 800
            this.params.height = 600
            
            this.container_ = container
            
            // Animator
            this.animator_ = new Animator(.3, () => this.render())
            
            let renderer = new THREE.WebGLRenderer({antialias: true})
            renderer.setClearColor(0xAAAAAA, 1)            
            renderer.setSize( container.offsetWidth, container.offsetHeight )
            this.renderer_ = renderer
            this.container_.appendChild( renderer.domElement )
            
            this.scene_ = new THREE.Scene();
            //this.camera_ = new THREE.PerspectiveCamera( 75, this.params.width / this.params.height, 0.1, 1000 );
            this.camera_ = new THREE.OrthographicCamera(0, this.params.width, 0, this.params.height, 0.1, 10000)
            this.camera_.position.set(0, 0, 1000)
            this.camera_.lookAt(new THREE.Vector3(0, 0, 0))
            
            // Background
            let background = new VisRect(this.params.width, this.params.height, 0, {
                color: 0x4682B4,
                side: THREE.DoubleSide
            })
            background.mesh.position.set(0, 0, 0)
            this.scene_.add(background.mesh)
            
            // Potential Visualizer
            this.potential_ = new PotentialVisualizer(this.params)
            this.potential_.potentialUpdatedCallback = (v:number[]) => { 
                this.state.potential = v.slice()
                this.computeAndShowWavefunctions()
            }
            this.potential_.addToScene(this.scene_)

            // Wavefunction Visualizer
            const centerY = this.params.height / 2
            this.wavefunctionOdd_ = new WavefunctionVisualizer(this.params, 0xFFA500, this.animator_) // orange
            this.wavefunctionEven_ = new WavefunctionVisualizer(this.params, 0xFFFF00, this.animator_) // yellow
            this.wavefunctionAvg_ = new WavefunctionVisualizer(this.params, 0xFF7777, this.animator_) 
            
            this.wavefunctionOdd_.addToScene(this.scene_, centerY - 125)
            this.wavefunctionEven_.addToScene(this.scene_, centerY + 125)
            this.wavefunctionAvg_.addToScene(this.scene_, centerY)
            
            // Turning Points
            for (let j=0; j < 2; j++) {
                let tp = new VisLine(2, {
                    color: 0x000000,
                    linewidth: 1,
                    transparent: true,
                    opacity: .5
                })
                tp.update((i:number) => ({x:this.params.width/2, y:i*this.params.height, z:0}))
                this.scene_.add(tp.line)
                if (j == 0) {
                    this.leftTurningPoint_ = tp
                } else {
                    this.rightTurningPoint_ = tp
                }
            }
            
            // Energy dragger
            this.energyVisualizer_ = new energy.EnergyVisualizer(energyContainer, energyDraggerPrototype, this.params)

            this.energyVisualizer_.positionUpdated = (slider:energy.EnergySlider, position:number) => {
                // the user dragged the energy to a new value, expressed our "height" coordinate system
                // compute a new wavefunction
                const energy = this.params.convertYFromVisualCoordinate(position)
                this.energyBars_.forEach((bar:EnergyBar) => {
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
            let dragSelection : Draggable = null
            let lastX = -1, lastY = -1
            const element = this.container_
            const getX = (evt:MouseEvent) => evt.pageX - element.offsetLeft
            const getY = (evt:MouseEvent) => evt.pageY - element.offsetTop
            element.addEventListener('mousemove', (evt:MouseEvent) => {
                const x = getX(evt)
                const y = getY(evt)
                if (mouseIsDown) {
                    if (dragSelection) {
                        dragSelection.dragged(x, y, x - lastX, y - lastY)
                    }
                    lastX = x
                    lastY = y
                    this.render()
                }
            })
            element.addEventListener('mousedown', (evt) => {
                lastX = getX(evt)
                lastY = getY(evt)
                
                dragSelection = null
                const draggables : Draggable[] = [this.potential_]
                for (let i=0; i < draggables.length && dragSelection == null; i++) {
                    dragSelection = draggables[i].hitTestDraggable(lastX, lastY)
                }
                
                if (dragSelection) {
                    dragSelection.dragStart(lastX, lastY)
                }
                mouseIsDown = true
                this.render()
//                this.animator_.clock.stop()
            })
            element.addEventListener('mouseup', () => {
                if (dragSelection) {
                    dragSelection.dragEnd()
                    dragSelection = null   
                }
                lastX = -1
                lastY = -1
                mouseIsDown = false
                this.render()
//                this.animator_.clock.start()
            })

        }
        
        private render() {
            this.renderer_.render(this.scene_, this.camera_);
        }
        
        private nextInterestingEnergy() {
            const usedEnergies = this.energyBars_.map((eb:EnergyBar) => eb.energy)
            const energyIsUsed = (proposedE:number) => {
                const eps = .25
                return usedEnergies.some((energy:number) => Math.abs(proposedE - energy) <= eps)
            }
            
            const maxEnergy = this.params.height / this.params.yScale
            const startingPoints = [3.0, 1.5, 2.0, 2.5, 1.0, 0.5]
            const offset = 1.3
            for (let i=0; i < startingPoints.length; i++) {
                for (let proposal = startingPoints[i]; proposal < maxEnergy; proposal += offset) {
                    if (! energyIsUsed(proposal)) {
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
            this.scene_.add(bar.line.line)
            this.computeAndShowWavefunctions()
        }
        
        public removeEnergySlider() {
            // remove the last added one
            if (this.energyBars_.length == 0) {
                return
            }
            const bar = this.energyBars_.pop()
            this.scene_.remove(bar.line.line)
            this.energyVisualizer_.removeSlider(bar.slider)
            this.computeAndShowWavefunctions()
        }
        
        private computeAndShowWavefunctions() {
            if (0 && this.state.potential.length == 0) {
                // clear everything
                this.wavefunctionOdd_.clear()
                this.wavefunctionEven_.clear()
                this.wavefunctionAvg_.clear()
                return
            }
            
            // update wavefunctions
            const psiInputs = {
                potentialMesh:this.state.potential,
                energy:this.state.energy,
                xMax: this.maxX
            }
            const psiEven = NumerovIntegrator(true).computeWavefunction(psiInputs)
            const psiOdd = NumerovIntegrator(false).computeWavefunction(psiInputs)
            const psiREven = psiEven.resolveAtClassicalTurningPoints()
            const psiROdd = psiOdd.resolveAtClassicalTurningPoints()
            
            this.wavefunctionEven_.setVisible(this.params.showEven)
            this.wavefunctionEven_.setWavefunction(psiREven.asGeneralized())
            
            this.wavefunctionOdd_.setVisible(this.params.showOdd)
            this.wavefunctionOdd_.setWavefunction(psiROdd.asGeneralized())
            
            if (this.energyBars_.length > 0) {
                let psis = this.energyBars_.map((bar:EnergyBar) => {
                    const psiInputs = {
                        potentialMesh:this.state.potential,
                        energy:bar.energy,
                        xMax: this.maxX
                    }
                    let even = NumerovIntegrator(true).computeWavefunction(psiInputs).resolveAtClassicalTurningPoints()
                    let odd = NumerovIntegrator(false).computeWavefunction(psiInputs).resolveAtClassicalTurningPoints()
                    return averageResolvedWavefunctions(odd, even)
                })
                let genPsi = new GeneralizedWavefunction(psis)
                this.wavefunctionAvg_.setWavefunction(genPsi)
            }
            this.wavefunctionAvg_.setVisible(this.params.showAvg && this.energyBars_.length > 0)
            
            {
                let disContText = ""
                disContText += "even: " + psiREven.leftDerivativeDiscontinuity.toFixed(3) + "," + psiREven.rightDerivativeDiscontinuity.toFixed(3)
                disContText += " / "
                disContText += "odd: " + psiROdd.leftDerivativeDiscontinuity.toFixed(3) + "," + psiROdd.rightDerivativeDiscontinuity.toFixed(3)
                document.getElementById("statusfield").textContent = disContText
            }
            
            // update turning points
            const turningPoints = psiOdd.classicalTurningPoints()
            const leftV = this.params.convertXToVisualCoordinate(turningPoints.left)
            const rightV = this.params.convertXToVisualCoordinate(turningPoints.right)
            this.leftTurningPoint_.update((i:number) => ({x:leftV, y:i*this.params.height, z:0}))
            this.rightTurningPoint_.update((i:number) => ({x:rightV, y:i*this.params.height, z:0}))

            // update energy
            const visEnergy = this.params.convertYToVisualCoordinate(this.state.energy)
            //this.energyDragger_.update(visEnergy, this.state.energy)
            //this.energyDragger_.attr({visibility: "visible"})
            this.render()            
        }
        
        public setShowPsi(flag:boolean) {
            this.params.showPsi = flag
            this.computeAndShowWavefunctions()
        }
        
        public setShowPsi2(flag:boolean) {
            this.params.showPsi2 = flag
            this.computeAndShowWavefunctions()
        }
        
        public setShowPsiT(flag:boolean) {
            this.params.showPsiT = flag
            this.computeAndShowWavefunctions()            
        }
        
        public setPaused(flag:boolean) {
            this.params.paused = flag
            this.animator_.setPaused(flag)
            if (flag) {
                this.animator_.reset()
            }
        }
        
        public loadSHO() {
            // Simple Harmonic Oscillator
            this.params.yScale = 20
            this.potential_.loadFrom((x:number) => {
                // x is a value in [0, this.potential_.width)
                // we have a value of 1 at x = width/2
                const offsetX = this.params.width / 2
                const scaledX =  (x - offsetX) * this.maxX / this.params.width
                return 1 + (scaledX * scaledX / 2.0) 
            })
        }
        
        public loadISW() {
            // Infinite square well
            this.params.yScale = 100
            const widthRatio = 1.0 / 5.0
            this.potential_.loadFrom((x:number) => {
                // x is a value in [0, this.params.width)
                const width = this.params.width
                if (x < width * widthRatio || x > width - (width * widthRatio)) {
                    return 1000
                }
                return .5
            })
        }
        
        public loadFSW() {
            // Finite square well
            this.params.yScale = 100
            const widthRatio = 1.0 / 5.0
            this.potential_.loadFrom((x:number) => {
                // x is a value in [0, this.params.width)
                const width = this.params.width
                if (x < width * widthRatio || x > width - (width * widthRatio)) {
                    return 5.0
                }
                return .5
            })
        }
    }
}

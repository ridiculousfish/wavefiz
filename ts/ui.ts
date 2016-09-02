/// <reference path='./visualizer.ts'/>

// HTML and JavaScript UI stuff (not GL)

module ui {

    // Toggle whether events should be routed to iframes
    // This is used during drag-type maneuvers
    function setBlockIFrameEvents(flag:boolean) {
        if (flag) {
            document.body.classList.add("noselect")
        } else {
            document.body.classList.remove("noselect")
        }

        let elems = document.getElementsByTagName('iframe')
        for (let i=0; i < elems.length; i++) {
            if (flag) {
                elems[i].classList.add('no-pointer-events')
            } else {
                elems[i].classList.remove('no-pointer-events')
            }
        }
    }

    // Helper function to get the pageX/pageY of a MouseEvent or TouchEvent
    function getEventPageXY(evt:MouseEvent|TouchEvent): {x:number, y:number} {
        let target : {pageX:number, pageY:number} = null
        if ((evt as TouchEvent).targetTouches) {
            // Touch event
            target = (evt as TouchEvent).targetTouches[0]
        } else {
            // Mouse event
            target = (evt as MouseEvent)
        }
        return {x:target.pageX, y:target.pageY}
    }

    // Helper function to get the global offset of an HTML element
    function getElementOffset(elem: HTMLElement): {x:number, y:number} {
        let result = {x: 0, y: 0}
        let cursor = elem as any
        while (cursor != null) {
            result.x += cursor.offsetLeft
            result.y += cursor.offsetTop
            cursor = cursor.offsetParent
        }
        return result
    }

    // Add event handlers for the rotator knob
    export function setupRotatorKnob(rotator:HTMLElement, onRotate:(rad:number) => void) {
        let dragging = false
        let rotation = 0
        
        const moveHandler = (evt:MouseEvent|TouchEvent) => {
          if (dragging) {
              let pageXY = getEventPageXY(evt)
              const bounds = rotator.getBoundingClientRect()
              const x = pageXY.x - bounds.left - bounds.width/2
              const y = pageXY.y - bounds.top - bounds.height/2
              
              // x is positive east, negative west
              // y is positive north, negative south
              // a rotation of 0 is pointing up
              // determine rotation about the center
              if (x !== 0 && y !== 0) {
                  rotation = Math.atan2(y, x)
                  // Allow snap-to for the four 90 degree rotations
                  // If we're within eps of one of those rotations, snap to it 
                  const eps = .1
                  for (let i=-2; i <= 2; i++) {
                      const snapTo = i * Math.PI/2
                      if (Math.abs(rotation - snapTo) < eps) {
                          rotation = snapTo
                          break
                      } 
                  }
                  
                  // a rotation of 0 should be up
                  rotation += Math.PI / 2
                  
                  rotator.style["transform"] = "rotate(" + rotation + "rad)"
                  if (onRotate) {
                      onRotate(rotation)
                  }
              }
              evt.stopPropagation()
              evt.preventDefault()
          }
        }
        
        let startRotateHandler = () => {
            if (! dragging) {
                dragging = true
                document.body.classList.add('noselect')
                document.addEventListener('mousemove', moveHandler)
                document.addEventListener('touchmove', moveHandler)
                setBlockIFrameEvents(true)
            }    
        }
        
        let stopRotateHandler = () => {
            if (dragging) {
                dragging = false
                document.removeEventListener('mousemove', moveHandler)
                document.removeEventListener('touchmove', moveHandler)
                setBlockIFrameEvents(false)
            }
        }
        
        rotator.addEventListener('mousedown', startRotateHandler)
        rotator.addEventListener('touchstart', startRotateHandler)
         
        document.addEventListener('mouseup', stopRotateHandler)
        rotator.addEventListener('touchend', stopRotateHandler)
        rotator.addEventListener('touchcancel', stopRotateHandler)
    }
    
    export enum Orientation {
        Horizontal,
        Vertical
    }

    // Attach event targets to the element with this class
    const SLIDER_TOUCH_EVENT_TARGET_CLASS = 'touch_event_target'
    const SLIDER_CLICK_EVENT_TARGET_CLASS = 'click_event_target'
    
    // Horizontal and vertical sliders, implemented in HTML
    export class Slider {
        // The position the slider would have if there were no ends
        private unconstrainedPosition: number = -1

        // The actual position of the slider
        private position: number = 0

        // Shared variables
        // Only one Slider can be dragged at a time
        static draggedSlider:Slider = null
        static lastPosition:number = -1
        static globalInitDone = false
        
        // Handler invoked when the slider is dragged
        public draggedToPositionHandler: (position:number) => void = () => {} 
        
        // Construct a Slider either horizontal or vertical, with a Slider element
        constructor(public orientation:Orientation, public element:HTMLElement) {            
            if (! Slider.globalInitDone) {
                Slider.globalInitDone = true
                document.addEventListener('mousemove', (evt:MouseEvent) => {
                    if (Slider.draggedSlider) Slider.draggedSlider.tryDrag(evt)
                })
                document.addEventListener('mouseup', () => {
                    if (Slider.draggedSlider) Slider.draggedSlider.stopDragging()
                })
            }
            this.installEventHandlers()
        }
        
        // Removes the Slider from its parent and discards event handlers
        public remove() {
            this.removeEventHandlers()
            let parent = this.element.parentNode
            if (parent) parent.removeChild(this.element)
        }
        
        // Updates the position of the Slider
        public setPosition(position:number) {
            this.position = position
            if (this.isHorizontal()) {
                this.element.style.left = position + "px"
            } else {
                this.element.style.top = position + "px"
            }
        }
        
        // Sets the value text of the Slider 
        public setValue(value:number) {
            const valueStr = value.toFixed(2)
            const labelFieldNodeList = this.element.getElementsByClassName("value_text")
            for (let i=0; i < labelFieldNodeList.length; i++) {
                labelFieldNodeList[i].textContent = valueStr 
            }
        }

        // Mark the slider visible or not
        public setVisible(flag:boolean) {
            this.element.style.visibility = flag ? "visible" : "hidden"
        }

        // Helper to return the touch and click event targets
        private eventTargets() : {touch:HTMLElement, click:HTMLElement} {
            const getChild = (cn:string) => this.element.getElementsByClassName(cn)[0]
            return {
                touch: getChild(SLIDER_TOUCH_EVENT_TARGET_CLASS) as HTMLElement,
                click: getChild(SLIDER_CLICK_EVENT_TARGET_CLASS) as HTMLElement
            }
        }

        private installEventHandlers() {
            let {touch, click} = this.eventTargets()
            click.onmousedown = (evt:MouseEvent) => this.startDragging(evt)
            Array(touch, click).forEach((target:HTMLElement) => {
                target.ontouchstart = (evt:TouchEvent) => this.startDragging(evt)
                target.ontouchmove = (evt:TouchEvent) => this.tryDrag(evt)
                target.ontouchend = () => this.stopDragging()
                target.ontouchcancel = () => this.stopDragging()
            })
        }

        private removeEventHandlers() {
            let {touch, click} = this.eventTargets()
            Array(touch, click).forEach((target:HTMLElement) => {
                target.onmousedown = null
                target.ontouchstart = null
                target.ontouchmove = null
                target.ontouchend = null
                target.ontouchcancel = null
            })
        }
        
        // Called from event handlers. Mark this Slider as dragging!
        private startDragging(evt:MouseEvent|TouchEvent) {
            Slider.draggedSlider = this
            Slider.lastPosition = this.getEventPosition(evt)
            this.unconstrainedPosition = this.position
            evt.preventDefault() // keeps the cursor from becoming an IBeam
        }
        
        private stopDragging() {
            Slider.draggedSlider = null
        }
        
        // Called during a drag
        // Try to move the Slider to a position
        private tryDrag(evt:MouseEvent|TouchEvent) {
            if (this !== Slider.draggedSlider) {
                return
            }
            evt.preventDefault() // prevents scrolling on mobile?
            const position = this.getEventPosition(evt)
            let positionChange = position - Slider.lastPosition
            
            // adjust for the scaling we do when the window size is reduced
            // scaling assumed to be uniform
            let container = this.container()
            let scale = container.offsetHeight / container.getBoundingClientRect().height
            positionChange *= scale

            Slider.lastPosition = position
            this.unconstrainedPosition += positionChange
            const maxPosition = this.isHorizontal() ? this.container().offsetWidth : this.container().offsetHeight
            const constrainedPosition = Math.min(Math.max(this.unconstrainedPosition, 0), maxPosition)
            this.draggedToPositionHandler(constrainedPosition)
        }
        
        // The container is used for position calculations
        // It is either our parent or ourself (TODO: needs justification)
        private container(): HTMLElement {
            return this.element.parentElement || this.element
        }
        
        private isHorizontal(): Boolean {
            return this.orientation == Orientation.Horizontal
        }
        
        // Returns the event position
        private getEventPosition(evt:MouseEvent|TouchEvent): number {
            const offsetPos = this.isHorizontal() ? this.container().offsetLeft : this.container().offsetTop
            const pageXY = getEventPageXY(evt)
            const pagePos = this.isHorizontal() ? pageXY.x : pageXY.y
            return pagePos - offsetPos
        }
    }

    // We have a notion of a Draggable which is something that implements the following interface
    // This is used to support sketching (e.g. sketching a potential)
    export interface Draggable {
        dragStart(raycaster: THREE.Raycaster): void
        dragEnd(): void
        dragged(raycaster: THREE.Raycaster): void
        hitTestDraggable(raycaster: THREE.Raycaster): Draggable // or null
    }

    // Entry point for initializing dragging 
    export function initDragging(container:HTMLElement, camera:THREE.Camera, draggables:[Draggable]) {
        let dragSelection: Draggable = null
        let mouseIsDown = false
        const getXY = (evt: MouseEvent|TouchEvent) => {
            const offset = getElementOffset(container)
            const pageXY = getEventPageXY(evt)
            return { x: pageXY.x - offset.x, y: pageXY.y - offset.y }
        }
        const getRaycaster = (evt: MouseEvent|TouchEvent): THREE.Raycaster => {
            const {x, y} = getXY(evt)
            const x2 = (x / container.offsetWidth) * 2 - 1
            const y2 = (y / container.offsetHeight) * 2 - 1
            const mouse = new THREE.Vector2(x2, y2)
            let raycaster = new THREE.Raycaster()
            raycaster.setFromCamera(mouse, camera)
            return raycaster
        }
        container.addEventListener('mousemove', (evt: MouseEvent) => {
            if (mouseIsDown) {
                if (dragSelection) {
                    dragSelection.dragged(getRaycaster(evt))
                }
            }
        })
        container.addEventListener('mousedown', (evt) => {
            dragSelection = null
            const raycaster = getRaycaster(evt)
            for (let i = 0; i < draggables.length && dragSelection === null; i++) {
                dragSelection = draggables[i].hitTestDraggable(raycaster)
            }

            if (dragSelection) {
                dragSelection.dragStart(raycaster)
            }
            mouseIsDown = true
        })
        document.addEventListener('mouseup', () => {
            if (dragSelection) {
                dragSelection.dragEnd()
                dragSelection = null
                mouseIsDown = false
            }
        })
    }

    const IPHONE6_INNERHEIGHT_ADDRESS_BAR_HIDDEN = 551
    const IPHONE6_INNERHEIGHT_ADDRESS_BAR_VISIBLE = 486

    let sSmallestClientHeightInLandscape:number = null
    function getEffectiveWindowHeight(): number {
        let height = window.innerHeight
        const isLandscape = window.orientation === 90 || window.orientation === -90
        // Hack: in landscape, avoid address bar autohiding trickiness
        // We do this by remembering the smallest height we've seen in landscape
        // and not using a height larger than that
        if (isLandscape) {
            // Hack for iPhone 6
            // Pretend the address bar is hidden
            if (height === IPHONE6_INNERHEIGHT_ADDRESS_BAR_HIDDEN) {
                height = IPHONE6_INNERHEIGHT_ADDRESS_BAR_VISIBLE
            }
            if (sSmallestClientHeightInLandscape === null || sSmallestClientHeightInLandscape > height) {
                sSmallestClientHeightInLandscape = height
            }
            height = Math.min(height, sSmallestClientHeightInLandscape)
        }
        return height
    }

    let sContainerInitialWidth:number = null, sContainerInitialHeight:number = null
    export function resizeToFitWindowHeight() {
        let scaleTarget = document.getElementById("ui-scale-target")
        let container = document.getElementById("ui-container")
        if (sContainerInitialWidth === null) {
            sContainerInitialWidth = scaleTarget.offsetWidth
            sContainerInitialHeight = scaleTarget.offsetHeight
        }

        // If our window is big enough to accomodate our max height, remove the transform
        let minHeight = 400, maxHeight = sContainerInitialHeight
        let windowHeight = getEffectiveWindowHeight()
        if (windowHeight >= maxHeight) {
            scaleTarget.style.transform = null
            container.style.marginRight = null
            container.style.marginBottom = null
            return
        }

        let height = windowHeight
        height = Math.max(height, minHeight)
        height = Math.min(height, maxHeight)

        let aspectRatio = sContainerInitialWidth / sContainerInitialHeight

        let ratio = height / maxHeight
        let dy = (height - maxHeight)/2, dx = aspectRatio * dy
        let transform = 'translate(' + dx + 'px,' + dy + 'px)'
        transform += ' scale(' + ratio + ',' + ratio + ')'
        scaleTarget.style.transform = transform

        // Adjust the marginRight of the container so that the tutorial
        // can fill the space on the right. This lets us fit both in
        // with the iPhone in landscape mode.
        // Note this makes the margin negative, because dx is negative,
        // and Math.floor makes it more negative
        // Do the same with the marginBottom
        container.style.marginRight = Math.floor(2 * dx) + 'px'
        container.style.marginBottom = Math.floor(2 * dy) + 'px'
    }
}    

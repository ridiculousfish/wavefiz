/// <reference path='./visualizer.ts'/>

module ui {
    
    function assert(condition:boolean, message?:string) {
        if (!condition) {
            throw message || "Assertion failed"
        }
    }
    
    export function setupRotatorKnob(rotator:HTMLElement, knob:HTMLElement, onRotate:(rad:number) => void) {
        let dragging = false
        let rotation = 0
        let lastX = -1, lastY = -1
        
        const moveHandler = (evt:MouseEvent|TouchEvent) => {
          if (dragging) {
              let touchOrMouseEvent : any
              if ((evt as any).targetTouches) {
                  touchOrMouseEvent = (evt as any).targetTouches[0]
              } else {
                  touchOrMouseEvent = evt
              }
              const x = touchOrMouseEvent.pageX - rotator.offsetLeft - rotator.offsetWidth/2
              const y = touchOrMouseEvent.pageY - rotator.offsetTop - rotator.offsetHeight/2
              
              // x is positive east, negative west
              // y is positive north, negative south
              // a rotation of 0 is pointing up
              // determine rotation about the center
              if (x !== 0 && y !== 0) {
                  rotation = Math.atan2(y, x)
                  // Allow snap-to for the four 90 degree rotations
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
                document.body.classList.add("noselect")
                document.addEventListener('mousemove', moveHandler)
                document.addEventListener('touchmove', moveHandler)
            }    
        }
        
        let stopRotateHandler = () => {
            if (dragging) {
                dragging = false
                document.removeEventListener('mousemove', moveHandler)
                document.removeEventListener('touchmove', moveHandler)
                document.body.classList.remove("noselect")
            }
        }
        
        rotator.addEventListener('mousedown', startRotateHandler)
        rotator.addEventListener('touchstart', startRotateHandler)
         
        document.addEventListener("mouseup", stopRotateHandler)
        rotator.addEventListener("touchend", stopRotateHandler)
        rotator.addEventListener("touchcancel", stopRotateHandler)
    }
}    

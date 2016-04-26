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
        
        const moveHandler = (evt:MouseEvent) => {
          if (dragging) {
              const x = evt.pageX - rotator.offsetLeft - rotator.offsetWidth/2
              const y = evt.pageY - rotator.offsetTop - rotator.offsetHeight/2
              
              // x is positive east, negative west
              // y is positive north, negative south
              // a rotation of 0 is pointing up
              // determine rotation about the center
              if (x != 0 && y != 0) {
                  rotation = Math.atan2(y, x) + Math.PI / 2
                  rotator.style["transform"] = "rotate(" + rotation + "rad)"
                  if (onRotate) {
                      onRotate(rotation)
                  }
              }
              evt.stopPropagation()
              evt.preventDefault()
          }
        }
        
        rotator.addEventListener('mousedown', () => {
            if (! dragging) {
                dragging = true
                document.body.classList.add("noselect")
                document.addEventListener('mousemove', moveHandler)
            }    
        })
         
        document.addEventListener("mouseup", () => {
            if (dragging) {
                dragging = false
                document.removeEventListener('mousemove', moveHandler)
                document.body.classList.remove("noselect")
            }
        })
    }
}    

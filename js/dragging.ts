/// <reference path="../typings/threejs/three.d.ts"/>
/// <reference path='./visualizer.ts'/>

module dragger {
    export interface Draggable {
        dragged(dx:number, dy:number): void
        hitTestDraggable(x:number, y:number): Draggable // or null
    }
    
    interface Rect {
        x1: number,
        y1:number,
        x2: number,
        y2: number
    }
    
    export class Dragger {
        public positionUpdated : (position:number) => void
        public value = 0
        public position = 0
        private HANDLE_WIDTH = 24
        private HANDLE_HEIGHT = 18
        private labelSprite: THREE.Sprite = null
        
        private group_ : THREE.Group = new THREE.Group()
        
        // horizontal means we drag horizontally, i.e. our line is vertical
        constructor(public label: string, public horizontal:boolean, public params:visualizing.Parameters) {
            this.positionUpdated = (_:number) => {}
            
            // grip
            let grip = new visualizing.VisRect(this.HANDLE_WIDTH, this.HANDLE_HEIGHT, 4, {
                color: 0x777777
            })
            grip.mesh.position.x = this.params.width
            grip.mesh.position.y -= this.HANDLE_HEIGHT/2
            this.group_.add(grip.mesh)
            
            // indicator line
            let indicator = new visualizing.VisLine(2, {color: 0xFF0000})
            indicator.update((idx:number) => ({x:idx * params.width, y:0, z:0}))
            this.group_.add(indicator.line)
            
            // sprite
            this.updateSprite()                       
        }
        
        private handleRect() : Rect {
            return {
                x1:this.params.width,
                x2:this.params.width + this.HANDLE_WIDTH,
                y1:-this.HANDLE_HEIGHT/2,
                y2:this.HANDLE_HEIGHT
            }
        }
        
        public dragged(dx:number, dy:number) {
            this.positionUpdated(this.position+dy)
        }
        
        public hitTestDraggable(x:number, y:number): Draggable {
            const localY = y - this.position
            const r = this.handleRect()
            if (x >= r.x1 && x < r.x2 && localY >= r.y1 && localY < r.y2) {
                return this
            }
            return null
        }
        
        private annotatedLabel() : string {
            const formattedValue = this.value.toFixed(2)
            return formattedValue
            //return this.label + ": " + formattedValue
        }
        
        private updateSprite() {
            if (this.labelSprite) {
                this.group_.remove(this.labelSprite)
            }
            let sprite = visualizing.makeTextSprite(this.annotatedLabel(), {
                fontsize: 18,
                fontface: "Helvetica",
                borderThickness: 0,
                backgroundColor: { r:170, g:170, b:170, a:1.0 }})
            
            // sprite's position is its center
            // 10 px padding
            sprite.position.set(this.params.width + this.HANDLE_WIDTH + sprite.scale.x/2 + 10, 0, 0)
            this.group_.add(sprite)
            this.labelSprite = sprite

        }
        
        public addToScene(scene:THREE.Scene) {
            scene.add(this.group_)
        }
        
        update(position: number, value:number) {
            this.value = value
            this.position = position
            this.group_.position.y = position
            this.updateSprite()
        }
    }
}

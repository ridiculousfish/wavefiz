module algorithms {

    export interface Point2 {
        x: number,
        y: number
    }

    function smoothstep(p1: Point2, p2:Point2, x: number): number {
        // Given a x value between two points, returns the lerp'd y value
        if (x <= p1.x) return p1.y
        else if (x >= p2.x) return p2.y
        else {
            const percent = (x - p1.x) / (p2.x - p1.x)
            return p1.y * (1.0 - percent) + p2.y * percent
        }
    }

    export interface PotentialBuilderFunc {
        (parameter:number, x:number):number 
    }

    function symmetrize(parameter) {
        // parameter is in the range [0, 1)
        // assume we have a symmetric potential
        // put it in the range [0, .5)
        if (parameter > 0.5) {
            parameter = 1.0 - parameter
        }
        return parameter
    }
    
    export const SimpleHarmonicOscillator = (parameter:number, x:number) => {
        parameter = symmetrize(parameter)
        const baseEnergy = 0.04 
        // x is a value in [0, 1)
        // minimum at x = 0.5
        // formula is, when x = parameter, base + steepness * (x * x / 2) = 1
        // solving: steepness = (1 - base) / (x * x / 2)
        const offsetX = 0.5
        const vparam = parameter - offsetX
        const steepness = Math.min(1E5, (1.0 - baseEnergy) / (vparam * vparam / 2))
        const vx = x - offsetX
        return baseEnergy + steepness * (vx * vx / 2.0)
    }
    
    export const InfiniteSquareWell = (widthRatio:number, x:number) => {
        widthRatio = symmetrize(widthRatio)
        const baseEnergy = 0.05
        // x is a value in [0, 1)
        if (x < widthRatio || x > 1.0 - widthRatio) {
            return 1000
        }
        return baseEnergy
    }
    
    export const FiniteSquareWell = (widthRatio:number, x:number) => {
        widthRatio = symmetrize(widthRatio)
        const baseEnergy = 0.05
        // x is a value in [0, 1)
        if (x < widthRatio || x > 1.0 - widthRatio) {
            return .8
        }
        return baseEnergy
    }
    
    export const TwoSquareWells = (parameter:number, x:number) => {
        parameter = symmetrize(parameter)
        // Two adjacent square wells
        const baseEnergy = 0.05
        const leftWellWidthFactor = 1.0 / 6.0
        const barrierWidthFactor = 1.0 / 8.0
        //const rightWellWidthFactor = 1.0 - (leftWellWidthFactor + barrierWidthFactor) 
        
        if (x < parameter || x >= 1.0 - parameter) {
            return 1000
        }
        const intervalLength = 1.0 - 2 * parameter
        let vx = (x - parameter) / intervalLength
        if (vx < leftWellWidthFactor) {
            return baseEnergy
        }
        vx -= leftWellWidthFactor
        if (vx < barrierWidthFactor) {
            return .85
        }
        return baseEnergy // right well
    }

    function binarySearch<T extends Point2>(vals:T[], x: number): number {
        assert(vals.length > 0)
        let left = 0, right = vals.length
        while (left + 1 < right) {
            const mid = Math.floor(left + (right - left) / 2)
            const trial = vals[mid]
            if (trial.x <= x) {
                left =  mid
            } else {
                // trial.x > x
                right = mid
            }
        }
        return left
    }

    export function SampledPotential(samples:Point2[]) : PotentialBuilderFunc {
        assert(samples.length > 0)
        return (parameterUnused:number, x:number) => {
            const idx = binarySearch(samples, x)
            const sample = samples[idx]
            if (x < sample.x || idx + 1 >= samples.length) {
                // this corresponds to starting or ending the sample midway through our box
                // flush it to "infinity""
                return 1000
            } else {
                const next = samples[idx + 1]
                return smoothstep(sample, next, x)
            }
        }
    }

    export function RandomPotential() : PotentialBuilderFunc {
        // Hackish?
        interface Pivot {
            x: number
            y: number
            joinType: string
            control?: number
        }

        let bezier = (p0:number, p1:number, p2:number, t:number) => {
            const omt = 1 - t
            return omt * (omt*p0 + t*p1) + t*(omt*p1 + t*p2)
        }

        // Determine how many pivots
        const minPivotCount = 8, maxPivotCount = 24
        const pivotCount = Math.floor(Math.random() * (maxPivotCount - minPivotCount) + minPivotCount)

        // Build pivots
        // Have an initial one
        let joinTypes = ["line", "flat", "bezier", "bezier", "bezier"]
        let pivots : Pivot[] = []
        pivots.push({x: 0, y: 1, joinType: "line"})
        for (let i=0; i < pivotCount; i++) {
            pivots.push({
                x: Math.random() * .95,
                y: Math.pow(Math.random(), 1.5),
                joinType: joinTypes[Math.floor(Math.random()*joinTypes.length)],
                control: Math.random()
            })
        }
        pivots.sort((p1:Pivot, p2:Pivot) => p1.x - p2.x)

        // Throw out pivots that are too close to their neighbor
        for (let i=1; i < pivots.length; i++) {
            if (pivots[i].x - pivots[i-1].x < .1) {
                pivots.splice(i, 1)
                i--
            }
        }

        // Last pivot must not be flat
        let secondToLast = pivots[pivots.length - 2] 
        while (secondToLast.joinType == "flat") {
            secondToLast.joinType = joinTypes[Math.floor(Math.random()*joinTypes.length)]
        }
        pivots.push({x: 1, y: 1, joinType: "line"})

        return (parameterUnused:number, x:number) => {
            // determine which pivot to use
            const pivotIdx = binarySearch(pivots, x)
            const nextIdx = pivotIdx + 1
            const pivot = pivots[pivotIdx]
            if (nextIdx >= pivots.length) {
                return pivot.y
            } else {
                // interpolate between this one and next one
                const next = pivots[nextIdx]
                switch (pivot.joinType) {
                    case "square":
                        return pivot.y
                    case "line":
                        return smoothstep(pivot, next, x)
                    case "bezier": 
                        const cpy = pivot.control
                        const t = (x - pivot.x) / (next.x - pivot.x)  
                        return bezier(pivot.y, cpy, next.y, t)
                }
            }
            return pivot.y
        }
    }

}
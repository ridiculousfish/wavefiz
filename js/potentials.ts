module algorithms {
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
        const rightWellWidthFactor = 1.0 - (leftWellWidthFactor + barrierWidthFactor) 
        
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

}
module algorithms {

    export function assert(condition:boolean, message?:string) {
        if (!condition) throw message || "Assertion failed"
    }

    // Given a ComplexArray, modify it in-place such that the sum is 1 
    function normalizeComplexFunction(samples: ComplexArray, dx: number) {
        // norm is sum of dx * |vals|**2
        let norm = 0
        for (let i = 0; i < samples.length; i++) {
            norm += samples.at(i).magnitudeSquared()
        }
        norm *= dx
        norm = Math.sqrt(norm)
        if (norm === 0) norm = 1
        const normRecip = 1.0 / norm
        for (let i = 0; i < samples.length; i++) {
            samples.set(i, samples.at(i).multipliedByReal(normRecip))
        }
    }

    function normalizeReals(vals: number[], dx: number) {
        // norm is sum of dx * vals**2
        let norm = 0
        for (let i = 0; i < vals.length; i++) {
            norm += vals[i] * vals[i]
        }
        norm *= dx
        norm = Math.sqrt(norm)
        if (norm === 0) norm = 1 // gross
        const normRecip = 1.0 / norm
        for (let i = 0; i < vals.length; i++) {
            vals[i] *= normRecip
        }
    }

    function normalizeSign(vals: ComplexArray, leftTurningPoint: number) {
        // make it positive on the left
        let wantsSignFlip = false
        const eps = 1.0E-16
        for (let i = leftTurningPoint; i + 1 < vals.length; i++) {
            let re = vals.at(i).re
            if (Math.abs(re) > eps) {
                wantsSignFlip = re < 0
                break
            }
        }
        if (wantsSignFlip) {
            for (let i = 0; i < vals.length; i++) {
                vals.set(i, vals.at(i).multipliedByReal(-1))
            }
        }
    }

    interface IntegratorInput {
        potentialMesh: number[]
        energy: number
        maxX: number
    }
    
    function fourierTransform(spaceValues: ComplexArray, center: number, dx: number, c: number): ComplexArray {
        const length = spaceValues.length
        assert(length > 0 && center < length, "center out of bounds")
        let freqValues = ComplexArray.zeros(length)
        for (let arrayIdx = 0; arrayIdx < length; arrayIdx++) {
            const p = arrayIdx - center
            const k = p * dx
            let phi = new Complex(0, 0)
            for (let i = 0; i < length; i++) {
                const spaceValue = spaceValues.at(i)
                const x = (i - center) * dx
                phi.addToSelf(Complex.exponential(-c * k * x).multiplied(spaceValue))
            }
            freqValues.set(arrayIdx, phi)
        }
        let multiplier = 1
        multiplier *= dx // for integral
        multiplier *= Math.sqrt(2 * Math.PI)
        for (let arrayIdx = 0; arrayIdx < length; arrayIdx++) {
            freqValues.set(arrayIdx, freqValues.at(arrayIdx).multipliedByReal(multiplier))
        }

        return freqValues
    }
    
    function fourierTransformOptimized(spaceValues: ComplexArray, center: number, dx: number, c: number): ComplexArray {
        const length = spaceValues.length
        assert(length > 0 && center < length, "center out of bounds")
        let freqValues = zerosComplex(length)
        let freqValuesRe = freqValues.res
        let freqValuesIm = freqValues.ims
        const spaceValuesRe = spaceValues.res
        
        for (let arrayIdx = 0; arrayIdx < length; arrayIdx++) {
            // We are going to hold X constant and then run through the frequencies
            // then for each successive frequency xi, we want to multiply by e^ -x * dx * c
            // where dxi is the distance between successive values of xi
            const x = (arrayIdx - center) * dx
            // -x * dx * c is space between frequencies
            let stepperPower = -x * dx * c
            let stepperRe = Math.cos(stepperPower), stepperIm = Math.sin(stepperPower)
            const fx = spaceValuesRe[arrayIdx]
            
            // compute initial exponential
            let startFreq = (0 - center) * dx * c
            let power = -x * startFreq
            let exponentialRe = Math.cos(power)
            let exponentialIm = Math.sin(power)
            
            for (let freqIndex = 0; freqIndex < length; freqIndex++) {
                freqValuesRe[freqIndex] += fx * exponentialRe
                freqValuesIm[freqIndex] += fx * exponentialIm
                
                let real = exponentialRe * stepperRe - exponentialIm * stepperIm
                exponentialIm = exponentialRe * stepperIm + exponentialIm * stepperRe
                exponentialRe = real
            }
        }
        let multiplier = 1
        multiplier *= dx // for integral
        multiplier *= Math.sqrt(2 * Math.PI)
        for (let arrayIdx = 0; arrayIdx < length; arrayIdx++) {
            freqValuesRe[arrayIdx] *= multiplier
            freqValuesIm[arrayIdx] *= multiplier 
        }

        return freqValues
    }
    
    export class WavefunctionMetadata {
        constructor(public energy: number,
            public leftTurningPoint: number,
            public rightTurningPoint: number,
            public leftDerivativeDiscontinuity: number,
            public rightDerivativeDiscontinuity: number) { }
    }

    export class TimeIndependentWavefunction {
        phaser = 0
        constructor(public values: ComplexArray,
            public dx: number,
            public md: WavefunctionMetadata) {


            assert(isFinite(md.energy), "Non-finite energy: " + md.energy)
            assert(isFinite(dx), "Non-finite dx: " + dx)
            assert(isFinite(md.leftDerivativeDiscontinuity), "Non-finite leftDerivativeDiscontinuity: " + md.leftDerivativeDiscontinuity)
            assert(isFinite(md.rightDerivativeDiscontinuity), "Non-finite rightDerivativeDiscontinuity: " + md.rightDerivativeDiscontinuity)
        }

        valueAt(x: number, time: number): Complex {
            // e^(-iEt) -> cos(-eT) + i * sin(-Et)
            const nEt = - this.md.energy * time
            let ret = this.values.at(x).multiplied(Complex.exponential(nEt))
            return ret.multiplied(Complex.exponential(this.phaser * x))
        }

        fourierTransform(center: number, scale: number): TimeIndependentWavefunction {
            let freqValues = fourierTransform(this.values, center, this.dx, scale)
            normalizeComplexFunction(freqValues, this.dx)
            return new TimeIndependentWavefunction(freqValues, this.dx, this.md)
        }
                
        fourierTransformOptimized(center: number, scale: number): TimeIndependentWavefunction {
            let freqValues = fourierTransformOptimized(this.values, center, this.dx, scale)
            normalizeComplexFunction(freqValues, this.dx)
            return new TimeIndependentWavefunction(freqValues, this.dx, this.md)
        }

    }

    // Represents a generalized solution to the Schrodinger equation as a sum of time-independent solutions
    // Assumes equal weights
    export class Wavefunction {
        public length: number
        public dx: number
        constructor(public components: TimeIndependentWavefunction[]) {
            assert(components.length > 0, "Empty components in Wavefunction")
            this.length = components[0].values.length
            this.components.forEach((psi: TimeIndependentWavefunction) => {
                assert(psi.values.length === this.length, "Not all lengths the same")
            })
            this.dx = this.components[0].dx
        }

        valueAt(x: number, time: number): Complex {
            assert(x === +x && x === (x | 0), "Non-integer passed to valueAt")
            let result = new Complex(0, 0)
            this.components.forEach((psi: TimeIndependentWavefunction) => {
                result.addToSelf(psi.valueAt(x, time))
            })
            result.re /= this.components.length
            result.im /= this.components.length
            return result
        }

        valuesAtTime(time: number): ComplexArray {
            let result = ComplexArray.zeros(this.length)
            for (let i = 0; i < this.length; i++) {
                result.set(i, this.valueAt(i, time))
            }
            return result
        }

        fourierTransform(center: number, scale: number): Wavefunction {
            let fourierComps = this.components.map((comp) => comp.fourierTransform(center, scale))
            return new Wavefunction(fourierComps)
        }
        
        public fourierTransformOptimized(center: number, scale: number): Wavefunction {
            let fourierComps = this.components.map((comp) => comp.fourierTransformOptimized(center, scale))
            return new Wavefunction(fourierComps)
        }

    }

    // Given two ResolvedWavefunction, computes an average weighted by the discontinuities in their derivatives
    export function averageResolvedWavefunctions(first: TimeIndependentWavefunction, second: TimeIndependentWavefunction): TimeIndependentWavefunction {
        assert(first.values.length === second.values.length, "Wavefunctions have different lengths")
        const bad1 = first.md.leftDerivativeDiscontinuity
        const bad2 = second.md.leftDerivativeDiscontinuity
        const eps = .01
        let values: ComplexArray
        if (Math.abs(bad1) < eps) {
            values = first.values.slice()
        } else if (Math.abs(bad2) < eps) {
            values = second.values.slice()
        } else {
            // we want bad1 + k * bad2 = 0
            // so k = -bad1 / bad2
            const k = -bad1 / bad2
            const length = first.values.length
            values = zerosComplex(length)
            for (let i = 0; i < length; i++) {
                values.set(i, first.values.at(i).added(second.values.at(i).multipliedByReal(k)))
            }
            normalizeComplexFunction(values, first.dx)
        }
        normalizeSign(values, first.md.leftTurningPoint)
        return new TimeIndependentWavefunction(values, first.dx, first.md)
    }

    interface TurningPoints {
        left: number,
        right: number
    }

    export function classicalTurningPoints(potential: number[], energy: number): TurningPoints {
        const length = potential.length
        let left, right
        for (left = 0; left < length; left++) {
            if (energy > potential[left]) {
                break
            }
        }
        for (right = length - 1; right >= left; right--) {
            if (energy > potential[right]) {
                break
            }
        }
        // if we meet, it means the energy is above the potential: scattering state
        // assume we have an infinite square well box in that case 
        if (left > right) {
            left = 0
            right = length - 1
        }
        return { left: left, right: right }

    }

    class ResolvableWavefunction {
        valuesFromCenter: number[] = []
        valuesFromEdge: number[] = []
        // F function used in Numerov
        F: (x: number) => number = null

        constructor(public potential: number[], public energy: number, public maxX: number) {
            this.potential = this.potential.slice()
        }

        length(): number {
            assert(this.valuesFromCenter.length === this.valuesFromEdge.length, "Wavefunction does not have a consistent length")
            return this.valuesFromCenter.length
        }

        // computes the discontinuity in the two derivatives at the given location
        // we don't actually care if it's right or left
        private derivativeDiscontinuity(psi: number[], x: number, dx: number): number {
            if (x === 0 || x + 1 === psi.length) {
                // this indicates the turning points are at the very edges
                // don't try to be clever here
                return 0
            }
            return (psi[x + 1] + psi[x - 1] - (14. - 12 * this.F(x)) * psi[x]) / dx
        }

        // scale the valuesFromEdge to match the valuesFromCenter at the given turning points,
        // then normalize the whole thing
        resolveAtTurningPoints(tp: TurningPoints): TimeIndependentWavefunction {
            const left = Math.round(tp.left), right = Math.round(tp.right)
            const length = this.length()
            assert(left <= right, "left is not <= right")
            assert(left >= 0 && left < length && right >= 0 && right < length, "left or right out of bounds")
            const leftScale = this.valuesFromCenter[left] / this.valuesFromEdge[left]
            const rightScale = this.valuesFromCenter[right] / this.valuesFromEdge[right]

            // build our wavefunction piecewise: edge, center, edge
            let psi = zeros(length)
            let i = 0
            for (; i < left; i++) {
                psi[i] = leftScale * this.valuesFromEdge[i]
            }
            for (; i < right; i++) {
                psi[i] = this.valuesFromCenter[i]
            }
            for (; i < length; i++) {
                psi[i] = rightScale * this.valuesFromEdge[i]
            }

            // normalize
            const dx = this.maxX / length
            normalizeReals(psi, dx)

            // compute discontinuities
            const leftDiscont = this.derivativeDiscontinuity(psi, left, dx)
            const rightDiscont = this.derivativeDiscontinuity(psi, right, dx)

            let md = new WavefunctionMetadata(this.energy, left, right, leftDiscont, rightDiscont)
            let complexPsi = ComplexArray.zeros(psi.length)
            for (let i=0; i < psi.length; i++) {
                complexPsi.res[i] = psi[i]
            }
            return new TimeIndependentWavefunction(complexPsi, dx, md)
        }

        resolveAtClassicalTurningPoints(): TimeIndependentWavefunction {
            return this.resolveAtTurningPoints(classicalTurningPoints(this.potential, this.energy))
        }
    }
    
    export function resolvedAveragedNumerov(input: IntegratorInput, tps: TurningPoints): TimeIndependentWavefunction {
        let evenVal = numerov(input, true).resolveAtTurningPoints(tps)
        let oddVal = numerov(input, false).resolveAtTurningPoints(tps)
        return averageResolvedWavefunctions(evenVal, oddVal)        
    } 

    export function classicallyResolvedAveragedNumerov(input: IntegratorInput): TimeIndependentWavefunction {
        let tps = classicalTurningPoints(input.potentialMesh, input.energy)
        return resolvedAveragedNumerov(input, tps)
    }

    // calculates the wavefunction from a potential
    interface Integrator {
        computeWavefunction(input: IntegratorInput): ResolvableWavefunction
    }
    
    export function NumerovIntegrator(even: boolean): Integrator {
        return {
            computeWavefunction: (input) => numerov(input, even)
        }
    }

    function zeros(amt: number): number[] {
        let result = []
        for (let i = 0; i < amt; i++) result.push(0)
        return result
    }

    function zerosComplex(amt: number): ComplexArray {
        return ComplexArray.zeros(amt)
    }

    export function indexOfMinimum(potential: number[]): number {
        assert(potential.length > 0, "No minimum for empty potential")
        let minIdx = 0, minCount = 1
        for (let i = 1; i < potential.length; i++) {
            if (potential[i] < potential[minIdx]) {
                minIdx = i
                minCount = 1
            } else if (potential[i] === potential[minIdx]) {
                minCount += 1
            }
        }
        let result = (minIdx + minCount / 2) | 0
        // must not be on the edge
        result = Math.max(1, result)
        result = Math.min(potential.length - 2, result)
        return result
    }

    function numerov(input: IntegratorInput, even: boolean): ResolvableWavefunction {
        // We start at the point of minimum energy, and integrate left and right
        const potential = input.potentialMesh
        const length = potential.length
        assert(length >= 3, "PotentialMesh is too small")
        const startIndex = indexOfMinimum(potential)

        // Fill wavefunction with all 0s
        let wavefunction = new ResolvableWavefunction(potential.slice(), input.energy, input.maxX)
        wavefunction.valuesFromCenter = zeros(length)
        wavefunction.valuesFromEdge = zeros(length)

        const energy = input.energy
        const dx = input.maxX / length
        const ddx12 = dx * dx / 12.0

        // F function used by Numerov
        const F = (x: number) => 1.0 - ddx12 * 2. * (potential[x] - energy)
        wavefunction.F = F

        // Numerov integrator formula
        // given that we have set psi[index], compute and set psi[index+1] if rightwards,
        // or psi[index-1] if leftwards
        const GoingLeft = false, GoingRight = true
        const step = (psi: number[], index: number, rightwards: boolean) => {
            const targetX = rightwards ? index + 1 : index - 1 // point we're setting
            const prev1X = index // previous x
            const prev2X = rightwards ? index - 1 : index + 1 // previous previous x
            psi[targetX] = (((12. - F(prev1X) * 10.) * psi[prev1X] - F(prev2X) * psi[prev2X])) / F(targetX)
        }

        // integrate outwards
        // In the reference code, f is the potential, y is psi
        let psi = wavefunction.valuesFromCenter
        if (even) {
            psi[startIndex] = 1
            psi[startIndex + 1] = 0.5 * (12. - F(startIndex) * 10.) * psi[startIndex] / F(startIndex + 1)
        } else {
            psi[startIndex] = 0
            psi[startIndex + 1] = dx
        }

        // rightwards integration
        for (let i = startIndex + 1; i + 1 < length; i++) {
            // y[i + 1] = ((12. - f[i] * 10.) * y[i] - f[i - 1] * y[i - 1]) / f[i + 1];
            step(psi, i, GoingRight)
        }
        // leftwards integration
        // note we "start at" startIndex+1
        for (let i = startIndex; i > 0; i--) {
            step(psi, i, GoingLeft)
        }

        // integrate inwards
        // we assume psi is 0 outside the mesh
        psi = wavefunction.valuesFromEdge
        psi[0] = even ? dx : -dx;
        psi[1] = (12. - 10. * F(0)) * psi[0] / F(1);
        for (let i = 1; i < startIndex; i++) {
            step(psi, i, GoingRight)
        }

        psi[length - 1] = dx;
        psi[length - 2] = (12. - 10. * F(length - 1)) * psi[length - 1] / F(length - 2);
        for (let i = length - 2; i > startIndex; i--) {
            step(psi, i, GoingLeft)
        }

        return wavefunction
    }

    function formatFloat(x: number): string {
        return x.toFixed(2)
    }

    export function algorithmTest() {
        let lines: string[] = []        
        const width = 1025
        
        let potential = zeros(width)
        
        // Simple Harmonic Oscillator
        const baseEnergy = 0.04
        const steepness = 12.0
        
        for (let i = 0; i < width; i++) {
            let x = i / width 
            const offsetX = 0.5
            const scaledX = (x - offsetX)
            potential[i] = baseEnergy + steepness * (scaledX * scaledX / 2.0)
        }

        let input = {
            potentialMesh: potential,
            energy: 0.5,
            maxX: 25
        }
        let psi = numerov(input, true).resolveAtClassicalTurningPoints()

        lines.push("left discontinuity: " + psi.md.leftDerivativeDiscontinuity.toFixed(4))
        lines.push("right discontinuity: " + psi.md.rightDerivativeDiscontinuity.toFixed(4))

        lines.push("x\tpsi\tV")
        for (let i = 0; i < width; i++) {
            let x = i / width - (1.0 / 2.0)
            lines.push(formatFloat(x) + "\t" + formatFloat(psi.valueAt(i, 0).re) + "\t" + formatFloat(potential[i]))
        }

        return lines.join("\n")
    }
}

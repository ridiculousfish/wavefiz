function assert(condition, message) {
    if (!condition) {
        throw message || "Assertion failed"
    }
}

interface IntegratorInput {
    potentialMesh: number[]
    energy: number
    xMax:number
}

class ResolvedWavefunction {
    constructor(public values:number[]) {}
}

interface TurningPoints {
    left:number,
    right: number
}

class Wavefunction {
    valuesFromCenter: number[] = []
    valuesFromEdge: number[] = []
    
    constructor(public potential: number[], public energy:number) {}
    
    length() : number {
        assert(this.valuesFromCenter.length == this.valuesFromEdge.length, "Wavefunction does not have a consistent length")
        return this.valuesFromCenter.length
    }
    
    // suggest some turning points, based on the classical assumption that energy <= potential 
    classicalTurningPoints() : TurningPoints {
        const length = this.length()
        let left, right
        for (left = 0; left < length/2; left++) {
            if (this.energy > this.potential[left]) {
                break
            }
        }
        for (right = length-1; right > length/2; right--) {
            if (this.energy > this.potential[right]) {
                break
            }
        }
        return {left: left, right: right}
    }
    
    // scale the valuesFromEdge to match the valuesFromCenter at the given turning points,
    // then normalize the whole thing
    resolveAtTurningPoints(tp:TurningPoints) : ResolvedWavefunction {
        const left = Math.round(tp.left), right = Math.round(tp.right)
        const length = this.length()
        assert(left <= right, "left is not <= right") 
        assert(left >= 0 && left < length && right >= 0 && right < length, "left or right out of bounds")
        const leftScale = this.valuesFromCenter[left] / this.valuesFromEdge[left]
        const rightScale = this.valuesFromCenter[right] / this.valuesFromEdge[right]
        
        // build our wavefunction piecewise: edge, center, edge
        let phi = zeros(length)
        let i = 0
        for (; i < left; i++) {
            phi[i] = leftScale * this.valuesFromEdge[i]
        }
        for (; i < right; i++) {
            phi[i] = this.valuesFromCenter[i]
        }
        for (; i < length; i++) {
            phi[i] = rightScale * this.valuesFromEdge[i]
        }
        return new ResolvedWavefunction(phi)
    }
    
    resolveAtClassicalTurningPoints() : ResolvedWavefunction {
        return this.resolveAtTurningPoints(this.classicalTurningPoints())
    }
}


// calculates the wavefunction from a potential
interface Integrator {
    computeWavefunction(input:IntegratorInput) : Wavefunction
}

function NumerovIntegrator(even:boolean) : Integrator {
    return {
        computeWavefunction: numerovEven
    }
}

function zeros(amt:number) : number[] {
    var result = []
    for (let i=0; i < amt; i++) result.push(0)
    return result
}

function numerovEven(input:IntegratorInput) {
    // we start at the center of the potential mesh
    // and integrate left and right
    // we require that the potential mesh have an ODD number of values,
    // and assume that the wavefunction takes on the same value in the two adjacent to the center
    const potential = input.potentialMesh 
    const length = potential.length 
    assert(length % 2 == 1, "PotentialMesh does not have odd count")
    assert(length >= 3, "PotentialMesh is too small")
    const c = (length + 1)/2 // center
    
    // Fill wavefunction with all 0s
    let wavefunction = new Wavefunction(potential.slice(), input.energy)
    wavefunction.valuesFromCenter = zeros(length)
    wavefunction.valuesFromEdge = zeros(length)
     
    const energy = input.energy
    const dx = input.xMax / length
    const ddx12 = dx * dx / 12.0
    
    // F function used by Numerov
    const F = (x:number) => 1.0 - ddx12 * 2. * (potential[x] - energy)
    
    // Numerov integrator formula
    // given that we have set phi[index], compute and set phi[index+1] if rightwards,
    // or phi[index-1] if leftwards
    const GoingLeft = false, GoingRight = true
    const step = (phi:number[], index:number, rightwards:boolean) => {
        const targetX = rightwards ? index+1 : index-1 // point we're setting
        const prev1X = index // previous x
        const prev2X = rightwards ? index-1 : index+1 // previous previous x
        phi[targetX] = (((12. - F(prev1X) * 10.) * phi[prev1X] - F(prev2X) * phi[prev2X])) / F(targetX)
    }
    
    // integrate outwards
    // In the reference code, f is the potential, y is phi
    let phi = wavefunction.valuesFromCenter
    phi[c] = 1
    phi[c+1] = 0.5 * (12. - F(c) * 10.) * phi[c] / F(c+1)
    phi[c-1] = 0.5 * (12. - F(c) * 10.) * phi[c] / F(c-1)
    
    // rightwards integration
    for (let i = c+1; i+1 < length; i++) {
        //y[i + 1] = ((12. - f[i] * 10.) * y[i] - f[i - 1] * y[i - 1]) / f[i + 1];
        step(phi, i, GoingRight)
    }
    // leftwards integration
    for (let i = c-1; i > 0; i--) {
        step(phi, i, GoingLeft)
    }
    
    // integrate inwards
    // we assume phi is 0 outside the mesh
    phi = wavefunction.valuesFromEdge
    phi[0] = dx;
    phi[1] = (12. - 10.*F(0)) * phi[0] / F(1);
    for (let i=1; i < c; i++) {
        step(phi, i, GoingRight)
    }
    
    phi[length-1] = dx;
    phi[length-2] = (12. - 10.*F(length-1)) * phi[length-1] / F(length-2);
    for (let i=length-2; i > c; i--) {
        step(phi, i, GoingLeft)
    }
    
    return wavefunction
}

function formatFloat(x:number) : string {
    return "" + Math.round(x*1000)/1000
}

function algorithmTest() {
    let lines : string[] = []
    const xMax = 20
    const width = 1025 
    let potential = zeros(width)
    for (let i=0; i < width; i++) {
        let x = i / width * xMax - (xMax / 2)
        let V = x*x/2
        potential[i] = V
    }

    let input = {
        potentialMesh: potential,
        energy: 2.5,
        xMax:xMax
    }
    let phi = numerovEven(input).resolveAtClassicalTurningPoints()

    lines.push("x\tphi\tV")    
    for (let i=0; i < width; i++) {
        let x = i / width * xMax - (xMax / 2)
        lines.push(formatFloat(x) + "\t" + formatFloat(phi[i]) + "\t" + formatFloat(potential[i]))
    }
    
    
    return lines.join("\n")
}
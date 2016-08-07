// Support for complex arithmetic
module algorithms {

    // Represents a complex number, with fields re and im
    export class Complex {
        constructor(public re: number, public im: number) { }

        addToSelf(rhs: Complex) {
            this.re += rhs.re
            this.im += rhs.im
        }

        added(rhs: Complex) {
            return new Complex(this.re + rhs.re, this.im + rhs.im)
        }

        multiplied(rhs: Complex): Complex {
            return new Complex(this.re * rhs.re - this.im * rhs.im, this.re * rhs.im + this.im * rhs.re)
        }

        multipliedByReal(val: number): Complex {
            return new Complex(this.re * val, this.im * val)
        }

        magnitudeSquared(): number {
            return this.re * this.re + this.im * this.im
        }

        toString(): string {
            return this.re.toFixed(2) + " + i*" + this.im.toFixed(2)
        }

        // Computes e^(i*power)
        static exponential(power:number): Complex {
            return new Complex(Math.cos(power), Math.sin(power))
        }
    }

    // Helper machinery around using FloatArray, which provides some performance benefits
    // We can switch here between Float32 and Float64, or just number[]
    // In current tests, the naive number[] beats FloatArray
    
    // export let FloatArray = Float64Array
    // export type FloatArray = Float64Array

    export let FloatArray = null
    export type FloatArray = number[]

    // Construct a new FloatArray containing zeros
    function newFloatArray(length: number): FloatArray {
        if (FloatArray == Float32Array || FloatArray == Float64Array) {
            return new FloatArray(length)
        } else {
            let result: number[] = []
            for (let i = 0; i < length; i++) {
                result.push(0)
            }
            return result as any
        }
    }

    // Make an independent copy of a given FloatArray
    function copyFloatArray(arr: FloatArray): FloatArray {
        if (FloatArray == Float32Array || FloatArray == Float64Array) {
            return new FloatArray(arr)
        } else {
            return arr.slice() as any
        }
    }

    // ComplexArray efficiently stores an array of complex values,
    // in two parallel FloatArrays
    // ComplexArray cannot be resized
    export class ComplexArray {
        public length: number
        constructor(public res: FloatArray, public ims: FloatArray) {
            assert(res.length === ims.length, "Mismatching length")
            this.length = res.length
        }

        // Create a ComplexArray of the given length, filled with zeros
        public static zeros(length: number): ComplexArray {
            assert(length >= 0 && length === (length | 0), "Invalid length")
            let result = new ComplexArray(newFloatArray(length), newFloatArray(length))
            return result
        }

        // Return the value at a given index
        public at(idx: number) {
            return new Complex(this.res[idx], this.ims[idx])
        }

        // Set the complex value at a given index
        public set(idx: number, value: Complex) {
            this.res[idx] = value.re
            this.ims[idx] = value.im
        }

        // Returns an independent copy of the ComplexArray
        slice(): ComplexArray {
            return new ComplexArray(copyFloatArray(this.res), copyFloatArray(this.ims))
        }
    }
}

module algorithms {

    function assert(condition, message) {
        if (!condition) {
            throw message || "Assertion failed"
        }
    }

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
        static exponential(power): Complex {
            return new Complex(Math.cos(power), Math.sin(power))
        }
    }

    let FloatArray = Float64Array
    type FloatArray = Float64Array

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

    function copyFloatArray(arr: FloatArray): FloatArray {
        if (FloatArray == Float32Array || FloatArray == Float64Array) {
            return new FloatArray(arr)
        } else {
            return arr.slice() as any
        }
    }

    export class ComplexArray {
        public length: number
        constructor(public res: FloatArray, public ims: FloatArray) {
            assert(res.length === ims.length, "Mismatching length")
            this.length = res.length
        }

        public static zeros(length: number): ComplexArray {
            assert(length >= 0 && length === (length | 0), "Invalid length")
            let result = new ComplexArray(newFloatArray(length), newFloatArray(length))
            return result
        }

        set(idx: number, value: Complex) {
            this.res[idx] = value.re
            this.ims[idx] = value.im
        }

        at(idx: number) {
            return new Complex(this.res[idx], this.ims[idx])
        }

        slice(): ComplexArray {
            return new ComplexArray(copyFloatArray(this.res), copyFloatArray(this.ims))
        }
    }

}

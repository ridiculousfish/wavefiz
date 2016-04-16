/*
 harmonic1.c
 
 Solution of the quantum harmonic oscillator
 Eigenvalue search using shooting method.
 Forward and backward integration with Numerov method.
 Solution matching at a classical turning point.
 Adimensional units: x = (mK/hbar^2)^(1/4) X
 e = E/(hbar omega)
 */
#include <stdlib.h>
#include <stdio.h>
#include <math.h>

static double pi = 3.14159265358979323846;

void quit(void) {
    puts("Exiting");
    exit(0);
}

int main()
{
    double sqrt();
    
    int mesh, i, icl;
    int nodes, hnodes, ncross, parity, kkk, iterate;
    double xmax, dx, ddx12, xmcl, norm, arg, yicl, djump;
    double elw, eup, e;
    double *x, *y, *p, *vpot, *f;
    char fileout[80];
    FILE *out;
    
    /*  Read input data */
    
    fprintf(stderr, "Max value of x (typical value: 10) ? ");
    if (1 != scanf("%lf",&xmax)) quit();
    fprintf(stderr, "Number of grid points (typically a few hundreds) ? " );
    if (1 != scanf("%d",&mesh)) quit();
    
    /*  Allocate arrays (from 0 to mesh), Initialize grid */
    
    x = (double *) malloc( (mesh+1) * sizeof (double));
    y = (double *) malloc( (mesh+1) * sizeof (double));
    p = (double *) malloc( (mesh+1) * sizeof (double));
    f = (double *) malloc( (mesh+1) * sizeof (double));
    vpot = (double *) malloc( (mesh+1) * sizeof (double));
    dx = xmax / mesh;
    ddx12 = dx * dx / 12.;
    
    
    /*  set up the potential (must be even w.r.t. x=0) */
    
    for (i = 0; i <= mesh; ++i) {
        x[i] = (double) i * dx;
        vpot[i] = 0.5 * x[i] * x[i];
    }
    fprintf(stderr, "Output file name = ");
    if (1 != scanf("%80s", fileout)) quit();
    out = fopen(fileout, "w");
    
L999:	/* this is the entry point for a new eigenvalue search */
    fflush(NULL);
    
    /*  Read number of nodes (stop if < 0) */
    
    fprintf(stderr, "Number of nodes (-1=exit) ? ");
    if (1 != scanf("%d",&nodes)) quit();
    if (nodes < 0) {
        free(vpot); free(f); free(p); free(y); free(x);
        fclose(out);
        exit(0);
    }
    
    /*  set initial lower and upper bounds to the eigenvalue */
    
    eup = vpot[mesh];
    elw = eup;
    for (i = 0; i <= mesh; ++i) {
        if ( vpot[i] < elw )
            elw = vpot[i];
        if ( vpot[i] > eup )
            eup = vpot[i];
    }
    
    /*  set trial energy */
    
    fprintf(stderr, "Trial energy (0=search with bisection) ? ");
    scanf("%lf", &e);
    if (e == 0.) { /* search eigenvalues with bisection (max 1000 iterations) */
        e = 0.5 * (elw + eup);
        iterate = 1000;
    } else {	   /*  test a single energy value */
        iterate = 1;
    }
    
    for (kkk = 0; kkk <= iterate && eup-elw > 1.e-10; ++kkk) {
        
        /*
         set up the f-function used by the Numerov algorithm
         and determine the position of its last crossing, i.e. change of sign
         f < 0 means classically allowed   region
         f > 0 means classically forbidden region
         */
        f[0] = ddx12 * (2.*(vpot[0] - e));
        icl = -1;
        for (i = 1; i <= mesh; ++i) {
            f[i] = ddx12 * 2. * (vpot[i] - e);
            /*
             beware: if f(i) is exactly zero the change of sign is not observed
             the following line is a trick to prevent missing a change of sign
             in this unlikely but not impossible case:
             */
            if (f[i] == 0.) {
                f[i] = 1e-20;
            }
            /*   store the index 'icl' where the last change of sign has been found */
            if (f[i] != copysign(f[i],f[i-1])) {
                icl = i;
            }
        }
        
        if (icl >= mesh - 2) {
            fprintf(stderr, "last change of sign too far.");
            exit(1);
        }
        if (icl < 1) {
            fprintf(stderr, "no classical turning point?");
            exit(1);
        }
        
        /*   f(x) as required by the Numerov algorithm  */
        
        for (i = 0; i <= mesh; ++i) {
            f[i] = 1. - f[i];
        }
        
        for (i = 0; i <= mesh; ++i) {
            y[i] = 0.;
        }
        
        /*  Determination of the wave-function in the first two points  */
        
        hnodes = nodes / 2;
        
        /*  beware the integer division: 1/2 = 0 !
         if nodes is even, there are 2*hnodes nodes
         if nodes is odd,  there are 2*hnodes+1 nodes (one is in x=0)
         hnodes is thus the number of nodes in the x>0 semi-axis (x=0 excepted) */
        
        if (2*hnodes == nodes) {
            /*  even number of nodes: wavefunction is even  */
            y[0] = 1.;
            /*  assume f(-1) = f(1)  */
            y[1] = 0.5 * (12. - f[0] * 10.) * y[0] / f[1];
        } else {
            /*  odd  number of nodes: wavefunction is odd   */
            y[0] = 0.;
            y[1] = dx;
        }
        
        /*   Outward integration and count number of crossings  */
        
        ncross = 0;
        for (i = 1; i <= icl-1; ++i) {
            y[i + 1] = ((12. - f[i] * 10.) * y[i] - f[i - 1] * y[i - 1])
            / f[i + 1];
            if (y[i] != copysign(y[i],y[i+1]))
                ++ncross;
        }
        yicl = y[icl];
        
        if (2*hnodes == nodes) {
            /* even number of nodes: no node in x=a 0*/
            ncross = 2*ncross;
        } else {
            /*  odd number of nodes:    node in x=0 */
            ncross = 2*ncross+1;
        }
        
        /*  Check number of crossings  */
        
        if (iterate > 1) {
            if (ncross != nodes) {
                /* Incorrect number of crossings: adjust energy  */
                if ( kkk == 1) {
                    fprintf(stdout, "Bisection         Energy       Nodes  Discontinuity\n");
                }
                fprintf(stdout, "%5d%25.15e%5d\n", kkk, e, ncross);
                
                if (ncross > nodes) {
                    /* Too many crossings: current energy is too high
                     lower the upper bound */
                    eup = e;
                } else {
                    /* Too few or correct number of crossings: current energy is too low
                     raise the lower bound */
                    elw = e;
                }
                /* New trial value: */
                e = 0.5 * (eup + elw);
            }
        } else {
            fprintf(stdout, "%25.15e%5d%5d\n", e, ncross,nodes);
        }
        
        if ( iterate == 1 ||  ncross == nodes ) {
            /*
             Number of crossings is correct, or energy is fixed:
             proceed to inward integration
             
             Determination of the wave-function in the last two points
             assuming y(mesh+1) = 0
             */
            y[mesh] = dx;
            y[mesh - 1] = (12. - 10.*f[mesh]) * y[mesh] / f[mesh-1];
            printf("inwards setting dx = %g\n", dx);
            
            /*	Inward integration */
            for (i = mesh - 1; i >= icl+1; --i) {
                y[i-1] = ((12. - 10.*f[i]) * y[i] - f[i+1] * y[i+1]) / f[i-1];
            }
            
            /*	Rescale function to match at the classical turning point (icl) */
            
            yicl /= y[icl];
            for (i = icl; i <= mesh; ++i) {
                y[i] *= yicl;
            }
            printf("yicl: %g\n", yicl);
            
            /*      normalize on the [-xmax,xmax] segment  */
            
            norm = 0.;
            for (i = 1; i <= mesh; ++i) {
                norm += y[i]*y[i];
            }
            norm = dx * (2.* norm + y[0]*y[0]);
            norm = sqrt(norm);
            for (i = 0; i <= mesh; ++i) {
                y[i] /= norm;
            }
            printf("norm: %g\n", norm);
            printf("Final: %g\n", y[mesh]);
            
            /* 	calculate the discontinuity in the first derivative
             y'(i;RIGHT) - y'(i;LEFT)         */
            
            if (iterate > 1) {
                i = icl;
                djump = (y[i+1] + y[i-1] - (14. - 12.*f[i]) * y[i]) / dx;
                fprintf(stdout, "%5d%25.15e%5d%14.8f\n", kkk, e, nodes, djump);
                if (djump*y[i] > 0.) {
                    /*               Energy is too high --> choose lower energy range */
                    eup = e;
                } else {
                    /*               Energy is too low --> choose upper energy range */
                    elw = e;
                }
                e = 0.5 * (eup + elw);
            }
        } /* end if (ncross==nodes) */
    } /* end do */
       
       /* ---- convergence has been achieved (or it wasn't required) ---- */
L2:
    /*
     Calculation of the classical probability density for energy e:
     */
    xmcl = sqrt(2. * e);
    norm = 0.;
    for (i = icl; i <= mesh; ++i) {
        p[i] = 0.;
    }
    for (i = 0; i <= icl - 1; ++i) {
        arg = xmcl*xmcl - x[i]*x[i];
        if ( arg > 0.)
            p[i] = 1. / sqrt(arg) / pi;
        else
            p[i] = 0.;
        norm += dx * 2. * p[i];
    }
    /* The point at x=0 must be counted once: */
    norm -= dx * p[0];
    /* Normalize p(x) so that  Int p(x)dx = 1: */
    for (i = 0; i <= icl - 1; ++i) {
        p[i] /= norm;
    }
    /* lines starting with # ignored by gnuplot */
    fprintf (out,"#   x       y(x)            y(x)^2       classical p(x)      V\n");
    /* x<0 region: */
    if (hnodes << 1 == nodes)
        parity = +1;
    else
        parity = -1;
    for (i = mesh; i >= 1; --i) {
        fprintf(out, "%7.3f%16.8e%16.8e%16.8e%12.6f\n",
                -x[i], parity*y[i], y[i]*y[i], p[i], vpot[i]);
    }
    /* x>0 region: */
    for (i = 0; i <= mesh; ++i) {
        fprintf(out, "%7.3f%16.8e%16.8e%16.8e%12.6f\n",
                x[i], y[i], y[i]*y[i], p[i], vpot[i]);
    }
    /* two blank lines separating blocks of data, useful for gnuplot plotting */
    fprintf (out,"\n\n");
    
    goto L999;
}

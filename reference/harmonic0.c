/*
 harmonic0.c
 
 Solution of the quantum harmonic oscillator
 Forward integration only, Numerov algorithm
 Eigenvalue search using the shooting method.
 Adimensional units: x = (mK/hbar^2)^(1/4) X
 e = E/(hbar omega)
 */
#include <stdlib.h>
#include <stdio.h>
#include <math.h>

#define MSHX 2000        /* Max number of grid points */

static double pi = 3.14159265358979323846;

main()
{
    double sqrt();
    
    int mesh, i, icl;
    int nodes, hnodes, ncross, parity, kkk, iterate;
    double xmax, dx, ddx12, xmcl, norm, arg;
    double elw, eup, e;
    double *x, *y, *p, *vpot, *f;
    char fileout[80];
    FILE *out;
    
    /*  Read input data */
    
    fprintf(stderr, "Max value of x (typical value: 10) ? ");
    scanf("%lf",&xmax);
    fprintf(stderr, "Number of grid points ( typically a few hundreds) ? ");
    scanf("%d",&mesh);
    
    /*  Allocate arrays (from 0 to mesh) , initialize grid */
    
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
    scanf("%80s", fileout);
    out = fopen(fileout, "w");
    
L999:	/* this is the entry point for a new eigenvalue search */
    
    /*  Read number of nodes (stop if < 0) */
    fprintf(stderr, "Number of nodes (-1=exit) ? ");
    scanf("%d",&nodes);
    if (nodes < 0) {
        fclose(out);
        free(vpot); free(f); free(p); free(y); free(x);
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
    if (e == 0.) {	/* search eigenvalues with bisection */
        e = 0.5 * (elw + eup);
        iterate = 1;
    } else {		/*  test a single energy value */
        iterate = 0;
    }
    kkk = 0;
    
L1:  /* this is the entry point for the solution at fixed energy */
    ++kkk;
    
    /*
     set up the f-function used by the Numerov algorithm
     and determine the position of its last crossing, i.e. change of sign
     f < 0 means classically allowed   region
     f > 0 means classically forbidden region
     */
    f[0] = ddx12 * (2.*(vpot[0] - e));
    icl=-1;
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
        /*  odd number of nodes: wavefunction is odd  */
        y[0] = 0.;
        y[1] = dx;
    }
    
    /*   Outward integration and count number of crossings  */
    ncross = 0;
    for (i = 1; i <= mesh-1; ++i) {
        y[i + 1] = ((12. - f[i] * 10.) * y[i] - f[i - 1] * y[i - 1])
        / f[i + 1];
        if (y[i] != copysign(y[i],y[i+1]))
            ++ncross;
    }
    
    /*  Check number of crossings  */
    
    fprintf(stdout, "%4d%4d%14.8f\n", kkk, ncross, e);
    if (iterate != 0) {
        if (ncross > hnodes) {
            
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
        /* Convergence criterion: */
        if (eup - elw > 1e-10) {
            goto L1;
        }
    }
    
    /*
     ---- convergence has been achieved (or it wasn't required) -----
     Note that the wavefunction is not normalized:
     the problem is the divergence at large |x|
     */
    
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
            p[i] = 1. / sqrt(xmcl*xmcl - x[i]*x[i]) / pi;
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
    
    const char * fmt = "%7.3f%16.8e%16.8e%16.8e%12.6f\n";
    fmt = "%7.3f%16.8f%16.8f%16.8f%12.6f\n";
    
    for (i = mesh; i >= 1; --i) {
        fprintf(out, fmt,
                -x[i], parity*y[i], y[i]*y[i], p[i], vpot[i]);
    }
    /* x>0 region: */
    for (i = 0; i <= mesh; ++i) {
        fprintf(out, fmt,
                x[i], y[i], y[i]*y[i], p[i], vpot[i]);
    }
    /* two blank lines separating blocks of data, useful for gnuplot plotting */
    fprintf (out,"\n\n");
    goto L999;
}

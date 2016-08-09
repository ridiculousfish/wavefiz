declare function introJs() 

module tour {
    /* Helper to get the element which a given label references */
    function labelOf(elementId) {
        if (elementId.startsWith('#')) {
            elementId = elementId.slice(1)
        }
        var labels = document.getElementsByTagName("label")
        for (var i = 0; i < labels.length; i++) {
            if (labels[i].htmlFor === elementId) {
                return labels[i]
            }
        }
        return null
    }

    var sCurrentTour = null

    function tourDone() {
        sCurrentTour = null
    }

    export function stop() {
        if (sCurrentTour !== null) {
            sCurrentTour.exit()
        }
    }

    /* Start the tour */
    export function start() {
        if (sCurrentTour !== null) {
            // Tour already running
            return
        }
        sCurrentTour = introJs()
        sCurrentTour.setOptions({
            oncomplete: tourDone,
            onexit: tourDone, 
            showBullets: false,
            showStepNumbers: false,
            highlightClass: 'dimmer-highlight',
            tooltipClass: 'tour-tooltip',
            nextLabel: 'Next &rarr;',
            prevLabel: '&larr; Back',
            steps: [
                {
                    element: null,
                    intro: "🚌 All&nbsp;aboard&nbsp;the&nbsp;quantum&nbsp;tour&nbsp;bus! 🚌<br><br>The left and right arrow keys step forwards and backwards.<br><br>Click anywhere else on the site to exit the bus.",
                    position: 'right'
                },
                {
                    element: '#vis-container',
                    intro: "Here\'s where the action happens!<br><br>The visualizer shows the <i style=\"color: #FF7777\">wavefunction</i>, <i style=\"color: magenta\">potential</i>, and <i style=\"color: red\">energy</i>.",
                    position: 'right'
                },
                {
                    element: '#energy-dragging-container',
                    intro: "Adjust the energy by dragging this slider up and down. Try it now!<br><br>You can add more energies with the +/- buttons at the bottom.",
                    position: 'right'
                },
                {
                    element: '#potential-dragging-container',
                    intro: "Adjust the width of the potential by dragging this slider left and right. Try it now!",
                    position: 'top'
                },
                {
                    element: '#potential_chooser',
                    intro: 'Use the V to select from a list of potentials, or to create your own.',
                    position: 'right'
                },
                {
                    element: '#psi_container',
                    intro: 'Toggle the wavefunction and its squared modulus. This shows <i>position</i>.',
                    position: 'right'
                },
                {
                    element: '#phi-container',
                    intro: 'Toggle the momentum-space wavefunction and its squared modulus. This shows <i>momentum</i>.',
                    position: 'right'
                },
                {
                    element: labelOf('#check_paused'),
                    intro: 'Play or pause the animation.',
                    position: 'right'
                },
                {
                    element: '#rotator',
                    intro: 'Grab and spin to rotate around the Y axis. Try it now!',
                    position: 'right'
                },
                {
                    element: '#energy_buttons',
                    intro: 'Add and remove energies.',
                    position: 'right'
                },
                {
                    element: null,
                    intro: 'Play around, or <a class="light-link" href="javascript:tryExercises()">try the exercises</a> in the text</a>.<br><br>Happy Schrödingering!',
                    position: 'right'
                }
            ]
        })
        sCurrentTour.start();
    }
}
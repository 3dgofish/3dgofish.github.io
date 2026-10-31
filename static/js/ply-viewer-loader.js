/* Load the Three.js viewer when the results approach the viewport or a visitor
 * explicitly chooses an object. This keeps Three.js and WebGL setup out of the
 * initial page critical path without changing the viewer's automatic behavior. */
(function () {
    "use strict";

    document.addEventListener('DOMContentLoaded', function () {
        const layout = document.querySelector('.viewer-layout');
        const thumbnails = Array.from(document.querySelectorAll('.viewer-thumbnail'));
        if (!layout || thumbnails.length === 0) return;

        let viewerPromise = null;
        let requestedButton = null;
        const loadViewer = function (initialButton) {
            if (initialButton) requestedButton = initialButton;
            if (!viewerPromise) {
                viewerPromise = import('./ply-viewer-single.js?v=2026.10.30.1')
                    .then(function (module) {
                        return module.initPlyViewer(requestedButton);
                    })
                    .catch(function (error) {
                        viewerPromise = null;
                        const status = document.getElementById('ply-status-text');
                        if (status) status.textContent = 'Unable to initialize the interactive 3D viewer.';
                        console.error(error);
                    });
            }
            return viewerPromise;
        };

        thumbnails.forEach(function (button) {
            button.addEventListener('click', function () {
                loadViewer(button);
            });
        });

        const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
        const prefersReducedData = connection && (
            connection.saveData || ['slow-2g', '2g'].includes(connection.effectiveType)
        );

        if (prefersReducedData) return;

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(function (entries) {
                if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
                observer.disconnect();
                loadViewer(null);
            }, { rootMargin: '300px 0px', threshold: 0 });
            observer.observe(layout);
        } else {
            loadViewer(null);
        }

    });
})();

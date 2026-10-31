/** Accessible, lazy GoLobster image dialog for the acknowledgments. */
(function () {
    "use strict";

    var overlay = null;
    var lastFocused = null;
    var closeTimer = null;
    var pageRegions = [];

    function setPageInert(inert) {
        if (inert) {
            pageRegions = Array.from(document.body.children).filter(function (element) {
                return element !== overlay;
            }).map(function (element) {
                return { element: element, wasInert: element.inert };
            });
            pageRegions.forEach(function (entry) { entry.element.inert = true; });
        } else {
            pageRegions.forEach(function (entry) { entry.element.inert = entry.wasInert; });
            pageRegions = [];
        }
    }

    function createOverlay() {
        if (overlay) return overlay;
        overlay = document.createElement("div");
        overlay.className = "logo-modal-overlay";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", "logo-modal-title");
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = [
            '<div class="logo-modal-dialog">',
            '  <h2 class="logo-modal-title" id="logo-modal-title">GoLobster</h2>',
            '  <button type="button" class="logo-modal-close" aria-label="Close GoLobster">&times;</button>',
            '  <img class="logo-modal-image" src="./static/images/golobster-logo-v6.svg?v=2026.10.30.1"',
            '    alt="A three-card GoLobster icon with a cute red cartoon lobster, four large oval body segments, eight walking legs, an attached fan tail, small claws, and one oversized eye">',
            '</div>'
        ].join("\n");
        document.body.appendChild(overlay);

        overlay.querySelector(".logo-modal-close").addEventListener("click", closeLogoModal);
        overlay.addEventListener("click", function (event) {
            if (event.target === overlay) closeLogoModal();
        });
        return overlay;
    }

    function openLogoModal(trigger) {
        var modal = createOverlay();
        if (closeTimer !== null) {
            clearTimeout(closeTimer);
            closeTimer = null;
        }
        lastFocused = trigger;
        modal.classList.add("is-active");
        modal.setAttribute("aria-hidden", "false");
        document.body.style.overflow = "hidden";
        setPageInert(true);
        void modal.offsetWidth;
        modal.classList.add("is-visible");
        modal.querySelector(".logo-modal-close").focus();
    }

    function closeLogoModal() {
        if (!overlay || !overlay.classList.contains("is-active")) return;
        overlay.classList.remove("is-visible");
        overlay.setAttribute("aria-hidden", "true");
        document.body.style.overflow = "";
        setPageInert(false);
        if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
        lastFocused = null;
        closeTimer = setTimeout(function () {
            overlay.classList.remove("is-active");
            closeTimer = null;
        }, 200);
    }

    document.body.addEventListener("click", function (event) {
        var trigger = event.target.closest("[data-logo-modal]");
        if (!trigger) return;
        event.preventDefault();
        openLogoModal(trigger);
    });

    document.addEventListener("keydown", function (event) {
        if (!overlay || !overlay.classList.contains("is-active")) return;
        if (event.key === "Escape") {
            event.preventDefault();
            closeLogoModal();
        } else if (event.key === "Tab") {
            // The close button is the dialog's sole interactive element.
            event.preventDefault();
            overlay.querySelector(".logo-modal-close").focus();
        }
    });
})();

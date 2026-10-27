/* In-view autoplay for decorative clips (video[data-inview-autoplay]).
 *
 * The clip plays only while it is on screen and the tab is visible, and pauses
 * otherwise, so nothing decodes or loops out of frame. With
 * prefers-reduced-motion it never starts on its own and shows its poster.
 * A clip marked data-click-toggle also acts as a persistent play/pause button:
 * explicit user state survives scrolling away and back, and manual playback is
 * still available when reduced motion disables autoplay.
 * Markup keeps muted/loop/playsinline but not `autoplay`, so nothing plays
 * before this decides; without JavaScript the poster is shown.
 */
(function () {
    "use strict";

    var reduceMotion = window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : { matches: false };

    function setUp(video) {
        var onScreen = !("IntersectionObserver" in window);
        var supportsToggle = video.hasAttribute("data-click-toggle");
        // null follows motion/autoplay policy; true/false is the user's choice.
        var manualPlayback = null;

        function syncToggleState() {
            if (!supportsToggle) return;
            var playing = !video.paused;
            video.setAttribute("aria-pressed", playing ? "true" : "false");
            video.setAttribute("aria-label", (playing ? "Pause" : "Play") +
                " full field-of-view render and mesh video");
        }

        function play() {
            var promise = video.play();
            if (promise && promise.catch) {
                promise.catch(function () { syncToggleState(); });
            }
        }

        function update() {
            var motionAllowsPlayback = manualPlayback === true ||
                (manualPlayback === null && !reduceMotion.matches);
            var shouldPlay = onScreen && !document.hidden &&
                manualPlayback !== false && motionAllowsPlayback;
            if (shouldPlay && video.paused) {
                play();
            } else if (!shouldPlay && !video.paused) {
                video.pause();
            }
        }

        function togglePlayback() {
            if (video.paused) {
                manualPlayback = true;
                play();
            } else {
                manualPlayback = false;
                video.pause();
            }
        }

        if (supportsToggle) {
            video.addEventListener("click", togglePlayback);
            video.addEventListener("keydown", function (event) {
                if (event.key !== " " && event.key !== "Enter") return;
                event.preventDefault();
                if (!event.repeat) togglePlayback();
            });
            video.addEventListener("play", syncToggleState);
            video.addEventListener("pause", syncToggleState);
            syncToggleState();
        }

        if ("IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) {
                onScreen = entries[entries.length - 1].isIntersecting;
                update();
            }, { threshold: 0.01 }).observe(video);
        }
        document.addEventListener("visibilitychange", update);
        if (reduceMotion.addEventListener) reduceMotion.addEventListener("change", update);
        update();
    }

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll("video[data-inview-autoplay]").forEach(setUp);
    });
})();

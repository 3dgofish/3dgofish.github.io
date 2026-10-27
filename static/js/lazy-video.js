/* ---- Lazy video: fetch and play only what is on screen ----
 *
 * For standalone <video> elements outside a slideshow. `loading="lazy"` is a
 * no-op on <video>, so an autoplaying clip is fetched and decoded whether or not
 * it has ever been seen — on the results grid that meant pulling every result
 * before the reader had scrolled past the abstract.
 *
 * Markup contract: no `autoplay`, `preload="none"`, a `poster` for the still
 * frame, and the URL in `data-src` on the <video> or its <source>. This script
 * promotes it and starts playback when the element scrolls into view, and pauses
 * again when it leaves.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        // Slideshows drive their own playback; leave anything inside one alone.
        const videos = Array.from(document.querySelectorAll("video"))
            .filter(function (v) {
                return !v.closest(".slideshow") &&
                    (v.dataset.src || v.querySelector("source[data-src]"));
            });
        if (videos.length === 0) return;

        function load(v) {
            if (v.dataset.loaded) return;
            let changed = false;
            // The poster is promoted too. `preload="none"` governs the media stream
            // only — a `poster` attribute is fetched immediately regardless, and
            // `loading="lazy"` does not exist for <video>. Holding it in
            // `data-poster` is the only way to keep an off-screen still frame from
            // downloading on load; on these pages that was megabytes of JPEG.
            if (v.dataset.poster) {
                v.poster = v.dataset.poster;
                v.removeAttribute("data-poster");
            }
            v.querySelectorAll("source[data-src]").forEach(function (s) {
                s.src = s.dataset.src;
                s.removeAttribute("data-src");
                changed = true;
            });
            if (v.dataset.src) {
                v.src = v.dataset.src;
                v.removeAttribute("data-src");
                changed = true;
            }
            v.dataset.loaded = "true";
            if (changed) v.load();
        }

        // No IntersectionObserver: load everything rather than show a page of
        // posters that never move.
        if (!("IntersectionObserver" in window)) {
            videos.forEach(function (v) {
                load(v);
                const p = v.play();
                if (p && p.catch) p.catch(function () { });
            });
            return;
        }

        const observer = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                const v = entry.target;
                if (entry.isIntersecting) {
                    load(v);
                    const p = v.play();
                    if (p && p.catch) p.catch(function () { });
                } else if (!v.paused) {
                    // Pause rather than unload: the decoded frames are already
                    // paid for, and scrolling back should resume instantly.
                    v.pause();
                }
            });
        }, {
            // Start a little before the clip reaches the viewport so it is playing
            // by the time it is actually visible.
            rootMargin: "200px 0px",
            threshold: 0.01,
        });

        videos.forEach(function (v) {
            v.muted = true;          // autoplay is only permitted when muted
            v.playsInline = true;
            observer.observe(v);
        });
    });
})();

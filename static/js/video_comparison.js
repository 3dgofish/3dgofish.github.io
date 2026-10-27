/* Cap the backing store at 2x. Above that the extra pixels are past the point
   of being visible, but the per-frame cost of drawing them is real — a 3x phone
   would push 2.25x the pixels of a retina laptop for no perceptible gain. */
function canvasDpr() {
    return Math.min(window.devicePixelRatio || 1, 2);
}

/* Collapse a burst of resize events into one call per frame. `resize` fires at
   pointer rate while a window is being dragged, and each of these handlers either
   reads computed style or resizes a canvas — resizing reallocates the backing
   store and clears it. With several sliders on a page that was a few hundred
   reallocations per drag; one per frame is all that can be displayed anyway. */
function perFrame(fn) {
    var queued = false;
    return function () {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
            queued = false;
            fn();
        });
    };
}

function playVids(videoId) {
    var videoMerge = document.getElementById(videoId + "Merge");
    var vid = document.getElementById(videoId);

    var position = 0.5;
    var vidWidth = vid.videoWidth / 2;
    var vidHeight = vid.videoHeight;

    var mergeContext = videoMerge.getContext("2d");


    if (vid.readyState > 3) {
        vid.play();

        function trackLocation(e) {
            // Normalize to [0, 1]
            bcr = videoMerge.getBoundingClientRect();
            position = ((e.pageX - bcr.x) / bcr.width);
            redrawIfIdle();
        }
        function trackLocationTouch(e) {
            // Normalize to [0, 1]
            bcr = videoMerge.getBoundingClientRect();
            position = ((e.touches[0].pageX - bcr.x) / bcr.width);
            redrawIfIdle();
        }

        // The user can click to pause and keep dragging the split. The loop is
        // stopped then, so paint a single frame to follow the pointer.
        function redrawIfIdle() {
            if (!running) requestAnimationFrame(drawLoop);
        }

        videoMerge.addEventListener("mousemove", trackLocation, false);
        videoMerge.addEventListener("touchstart", trackLocationTouch, false);
        videoMerge.addEventListener("touchmove", trackLocationTouch, false);

        videoMerge.removeEventListener("click", videoMerge.togglePlayPause);

        videoMerge.togglePlayPause = function () {
            if (vid.paused) {
                vid.play();
            } else {
                vid.pause();
            }
        };

        videoMerge.addEventListener("click", videoMerge.togglePlayPause);

        // Label metrics depend only on viewport width and the canvas font, neither of
        // which changes between resizes. Reading them per frame (60fps, per canvas)
        // forced a style recalc each time, so cache and refresh them on resize instead.
        var isMobile = window.innerWidth <= 960;
        var computedFont = window.getComputedStyle(videoMerge).fontFamily;
        window.addEventListener("resize", perFrame(function () {
            isMobile = window.innerWidth <= 960;
            computedFont = window.getComputedStyle(videoMerge).fontFamily;
        }), { passive: true });

        // Only run the draw loop while the canvas is on screen. An off-screen canvas
        // cannot be seen, so redrawing it is pure waste — this keeps two comparison
        // sliders from burning CPU for the whole page. The video itself keeps playing,
        // so scrolling back shows the current frame immediately with no visible change.
        var onScreen = true;
        var running = false;

        function startLoop() {
            if (running || !onScreen) return;
            running = true;
            requestAnimationFrame(drawLoop);
        }

        if ("IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) {
                onScreen = entries[entries.length - 1].isIntersecting;
                startLoop();
            }).observe(videoMerge);
        }

        // A slider inside a slideshow is paused while its slide is hidden, which
        // ends the loop. The canvas never leaves the viewport in that case, so the
        // observer above won't fire again — restart from `play` instead.
        vid.addEventListener("play", startLoop);

        function drawLoop() {
            var dpr = canvasDpr();
            const cw = videoMerge.width / dpr;
            const ch = videoMerge.height / dpr;

            // Clear canvas
            mergeContext.clearRect(0, 0, cw, ch);

            // --- LEFT HALF (scaled) ---
            mergeContext.drawImage(
                vid,
                0, 0, vidWidth, vidHeight,
                0, 0, cw, ch
            );

            const splitX = cw * position;

            // --- RIGHT HALF (scaled) ---
            const srcStart = vidWidth * position;
            const srcWidth = vidWidth - srcStart;
            const dstWidth = cw - splitX;

            mergeContext.drawImage(
                vid,
                vidWidth + srcStart, 0, srcWidth, vidHeight,
                splitX, 0, dstWidth, ch
            );

            // --- SPLIT LINE AND HANDLE ---
            mergeContext.save();

            // Shared shadow settings
            mergeContext.shadowColor = "rgba(12, 12, 12, 0.8)"; // Matches box-shadow: 0 0 10px rgb(12, 12, 12)
            mergeContext.shadowBlur = 10;
            mergeContext.shadowOffsetX = 0;
            mergeContext.shadowOffsetY = 0;

            // 1. Vertical Line (Top segment)
            const handleRadius = 20;
            const centerY = ch / 2;

            mergeContext.beginPath();
            mergeContext.moveTo(splitX, 0);
            mergeContext.lineTo(splitX, centerY - handleRadius);
            mergeContext.strokeStyle = "#FFFFFF";
            mergeContext.lineWidth = 2;
            mergeContext.stroke();

            // 1. Vertical Line (Bottom segment)
            mergeContext.beginPath();
            mergeContext.moveTo(splitX, centerY + handleRadius);
            mergeContext.lineTo(splitX, ch);
            mergeContext.stroke();

            // 2. Handle circle. Left unfilled, so the frames stay visible through it.
            mergeContext.beginPath();
            mergeContext.arc(splitX, centerY, handleRadius, 0, 2 * Math.PI);
            mergeContext.strokeStyle = "#FFFFFF";
            mergeContext.lineWidth = 2;
            mergeContext.stroke();

            // 3. Arrows, drawn as filled triangles either side of the handle centre.
            mergeContext.fillStyle = "#FFFFFF";
            const arrowSize = 6;
            const arrowOffset = 5;

            mergeContext.beginPath();
            // Tip
            mergeContext.moveTo(splitX - arrowOffset - arrowSize, centerY);
            // Top Right
            mergeContext.lineTo(splitX - arrowOffset, centerY - arrowSize);
            // Bottom Right
            mergeContext.lineTo(splitX - arrowOffset, centerY + arrowSize);
            mergeContext.closePath();
            mergeContext.fill();

            // Right Arrow (points right)
            mergeContext.beginPath();
            // Tip
            mergeContext.moveTo(splitX + arrowOffset + arrowSize, centerY);
            // Top Left
            mergeContext.lineTo(splitX + arrowOffset, centerY - arrowSize);
            // Bottom Left
            mergeContext.lineTo(splitX + arrowOffset, centerY + arrowSize);
            mergeContext.closePath();
            mergeContext.fill();

            mergeContext.restore();

            // --- LABEL OVERLAYS (Bulma-style) ---
            const container = videoMerge.parentElement;

            const labelLeft = container.dataset.leftLabel || null;
            const labelRight = container.dataset.rightLabel || null;

            if (labelLeft || labelRight) {
                const fontSize = Math.round(ch * (isMobile ? 0.06 : 0.04));   // scales with video height
                const paddingX = fontSize * 0.6;
                const paddingY = fontSize * 0.35;
                const radius = fontSize * 0.6;

                mergeContext.font = `${fontSize}px ${computedFont}`;
                mergeContext.textBaseline = "middle";

                // Helper to draw Bulma-style rounded box
                function drawBubble(text, x, y, alignRight = false) {
                    const textWidth = mergeContext.measureText(text).width;
                    const boxWidth = textWidth + paddingX * 2;
                    const boxHeight = fontSize + paddingY * 2;

                    const rectX = alignRight ? (x - boxWidth) : x;
                    const rectY = y - boxHeight / 2;

                    // Background bubble
                    mergeContext.fillStyle = "rgba(0, 0, 0, 0.55)";
                    mergeContext.beginPath();
                    mergeContext.roundRect(rectX, rectY, boxWidth, boxHeight, radius);
                    mergeContext.fill();

                    // Text
                    mergeContext.fillStyle = "white";
                    mergeContext.fillText(text,
                        rectX + paddingX,
                        rectY + boxHeight / 2
                    );
                }

                // Left bubble
                if (labelLeft) {
                    drawBubble(labelLeft, 5, ch - fontSize * 1.2);
                }

                // Right bubble
                if (labelRight) {
                    drawBubble(labelRight, cw - 5, ch - fontSize * 1.2, true);
                }
            }
            // Keep drawing only while visible and playing. A paused slider holds
            // its last frame, so stopping costs nothing visually; `play` and the
            // IntersectionObserver both restart the loop.
            if (onScreen && !vid.paused) {
                requestAnimationFrame(drawLoop);
            } else {
                running = false;
            }
        }
        running = true;
        requestAnimationFrame(drawLoop);
    }
}

function resizeAndPlay(element) {
    var cv = document.getElementById(element.id + "Merge");

    // Use the section width (the same width the text uses)
    var container = element.parentElement;

    // Function to update canvas size
    const updateSize = () => {
        /* Clear the width written at the end of the previous pass before measuring.
           This function both reads the container's width and (below) writes it to
           match the canvas, so measuring without resetting first would feed each
           resize its own previous output: the teaser shrank a step on every resize
           and never grew back. Blanking it lets the stylesheet's own width apply for
           the duration of the measurement. */
        container.style.width = "";
        var containerWidth = parseFloat(window.getComputedStyle(container).width);

        // Calculate available height based on viewport (e.g., 80% of window height)
        var maxViewportHeight = window.innerHeight * 0.8;

        // Video frame: left half only (source dimensions)
        var halfWidth = element.videoWidth / 2;
        var aspectRatio = element.videoHeight / halfWidth;

        // Ideal height based on full container width
        var idealHeight = containerWidth * aspectRatio;

        var finalWidth, finalHeight;

        if (idealHeight > maxViewportHeight) {
            // Height constrained
            finalHeight = maxViewportHeight;
            finalWidth = finalHeight / aspectRatio;
        } else {
            // Width constrained
            finalWidth = containerWidth;
            finalHeight = idealHeight;
        }

        // Set canvas internal resolution handling high DPI
        var dpr = canvasDpr();
        cv.width = finalWidth * dpr;
        cv.height = finalHeight * dpr;

        cv.style.width = finalWidth + "px";
        cv.style.height = finalHeight + "px";
        cv.style.objectFit = "contain";
        cv.style.margin = "0 auto";
        cv.style.display = "block";

        /* When the clip is taller than 80% of the window the branch above shrinks the
           canvas to fit, which used to leave the canvas narrower than its container
           and centred inside it. The container carries the rounded corners and the
           drop shadow, so the leftover space showed as white bands down either side
           of the video — visible on pup3dgs and splatsure at any normal window
           height, since both teasers are wide side-by-side pairs.

           Pulling the container in to the width the canvas actually took makes the
           shadowed surface coincide with the picture again. It stays centred because
           the container keeps `margin: 0 auto`. */
        container.style.width = finalWidth + "px";
        container.style.maxWidth = "100%";
        container.style.marginLeft = "auto";
        container.style.marginRight = "auto";

        // Scale the context to match the internal resolution
        var ctx = cv.getContext("2d");
        ctx.scale(dpr, dpr);
    };

    // `onplay` fires on every play, including when a slideshow slide is shown
    // again after being paused. Only set up once: updateSize() calls
    // ctx.scale(dpr, dpr) on a context that persists across getContext() calls,
    // so running it twice compounds the transform and draws at 2x on retina.
    if (element.dataset.comparisonReady) return;

    // onplay can fire before the video is usable: with no dimensions yet the
    // canvas would be sized from videoHeight 0, and playVids() below bails
    // unless readyState > 3. Retry on canplaythrough, which guarantees both.
    if (!element.videoWidth || element.readyState <= 3) {
        if (!element.dataset.comparisonPending) {
            element.dataset.comparisonPending = "true";
            element.addEventListener("canplaythrough", function once() {
                element.removeEventListener("canplaythrough", once);
                delete element.dataset.comparisonPending;
                resizeAndPlay(element);
            });
        }
        return;
    }

    element.dataset.comparisonReady = "true";

    // Initial size update
    updateSize();

    element.play();
    element.style.height = "0px";  // Hide the video, only canvas draws it

    playVids(element.id);

    // Add resize listener if not already attached
    if (!element.dataset.resizeListenerAttached) {
        window.addEventListener('resize', perFrame(updateSize), { passive: true });
        element.dataset.resizeListenerAttached = "true";
    }
}


/* ---- Deferring a comparison slider until it is near the viewport ----
 *
 * A slider is driven by its own `onplay` handler, so it cannot simply carry
 * `data-src` and wait — something has to call play(). These clips are large (the
 * pup3dgs teaser is 8.6 MB) and sit well below the fold, so fetching them at parse
 * time is wasted bandwidth for a reader who never scrolls that far.
 *
 * Markup contract: no `autoplay`, `preload="none"`, source URL in `data-src`, and
 * `onplay="resizeAndPlay(this)"` as before. This promotes the source and starts
 * playback once the element is close to view, which fires `onplay` and initialises
 * the slider exactly as an eager autoplay would have.
 */
(function () {
    "use strict";

    document.addEventListener("DOMContentLoaded", function () {
        var pending = Array.prototype.filter.call(
            document.querySelectorAll("video.video"),
            function (v) {
                return !v.closest(".slideshow") &&
                    (v.dataset.src || v.querySelector("source[data-src]"));
            });
        if (!pending.length) return;

        function start(v) {
            if (v.dataset.deferredLoaded) return;
            v.dataset.deferredLoaded = "true";
            /* The poster is promoted too. `preload="none"` governs the media stream
               only — a `poster` attribute is fetched immediately regardless — so a
               below-fold slider has to hold its still frame in `data-poster` as well,
               and something has to put it back. Without this the attribute simply
               never became a poster. */
            if (v.dataset.poster) {
                v.poster = v.dataset.poster;
                v.removeAttribute("data-poster");
            }
            v.querySelectorAll("source[data-src]").forEach(function (s) {
                s.src = s.dataset.src;
                s.removeAttribute("data-src");
            });
            if (v.dataset.src) {
                v.src = v.dataset.src;
                v.removeAttribute("data-src");
            }
            v.load();
            var p = v.play();
            if (p && p.catch) p.catch(function () { });
        }

        if (!("IntersectionObserver" in window)) {
            pending.forEach(start);
            return;
        }

        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                start(entry.target);
                io.unobserve(entry.target);   // once loaded, the slider manages itself
            });
        }, { rootMargin: "300px 0px", threshold: 0.01 });

        pending.forEach(function (v) { io.observe(v); });
    });
})();

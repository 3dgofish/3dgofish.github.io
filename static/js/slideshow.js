/* ---- Slideshow: cyclic peeking carousel with arrows and dots ----
 *
 * Replaces bulma-carousel, which needed jQuery and 40 KB of library to do this.
 * The active slide is centred with its neighbours peeking in at either edge, so
 * a viewer can see there is more to the set without a caption saying so.
 *
 * The set is a true ring. Each slide is positioned by its *cyclic* distance from
 * the active one, so the slide before the first is the last and the slide after
 * the last is the first — and every move, including last-to-first, animates as
 * one smooth step. An earlier version cloned the end slides and snapped across
 * the seam, which read as a jump whenever the wrap was crossed.
 *
 * Draggable by mouse and touch alike. Auto-advance is opt-in per carousel and
 * pauses for hover, focus, off-screen content, hidden tabs, and reduced motion.
 */
(function () {
    "use strict";

    // One source for the slide timing. It was previously spelled out in the inline
    // transition string, again in slideshow.css, and a third time as the 470ms
    // settle timeout — three copies of one number.
    const SLIDE_MS = 450;
    const SLIDE_EASE = "cubic-bezier(0.4, 0, 0.2, 1)";
    /* Transform only. `opacity` and `filter` were in here when the neighbours were
       faded and desaturated; nothing sets either on a slide any more, on desktop or
       mobile, so listing them animated properties that never change — and on mobile
       the opacity entry was actively harmful, easing on a different curve from the
       transform and making one step look like two. */
    const SLIDE_TRANSITION = `transform ${SLIDE_MS}ms ${SLIDE_EASE}`;
    // A little past the transition so the settle never lands mid-animation.
    const SETTLE_MS = SLIDE_MS + 20;

    document.addEventListener("DOMContentLoaded", function () {
        document.querySelectorAll(".slideshow").forEach(initSlideshow);
    });

    function initSlideshow(container) {
        const track = container.querySelector(".slideshow-track");
        const slides = Array.from(container.querySelectorAll(".slideshow-slide"));
        if (!track || slides.length === 0) return;

        const controls = container.querySelector(".slideshow-controls");
        const prevBtn = container.querySelector(".slideshow-prev");
        const nextBtn = container.querySelector(".slideshow-next");
        const status = container.querySelector(".slideshow-status");
        const zoomTargets = Array.from(container.querySelectorAll("[data-carousel-zoom]"));
        const zoomSources = new WeakMap();
        const useNativeMobileZoom = window.matchMedia
            ? window.matchMedia("(max-width: 768px)").matches
            : window.innerWidth <= 768;

        if (useNativeMobileZoom) {
            container.classList.add("slideshow-native-image-zoom");
            zoomTargets.forEach(function (target) {
                target.removeAttribute("role");
                target.removeAttribute("tabindex");
                target.removeAttribute("aria-label");
                target.removeAttribute("aria-pressed");
            });
        }

        // A comparison slider reads a horizontal drag as scrubbing its own split,
        // so drag-to-advance would fight it. Such slideshows opt out by class and
        // navigate with the arrows, dots, and keyboard only.
        const draggable = !container.classList.contains("slideshow-no-swipe");
        const count = slides.length;

        // `position` is the current place in the ring and is allowed to run
        // outside 0..count-1: it keeps increasing as you go forward and
        // decreasing as you go back, so a move is always a delta and never a
        // wrap. The active slide is position mod count.
        // The stylesheet's `prefers-reduced-motion` guard cannot win here: the
        // transition below is set as an inline style, and inline styles beat
        // stylesheet rules whatever the media query says. So the preference has to
        // be read in JS and the animation skipped outright.
        const reduceMotion = window.matchMedia
            ? window.matchMedia("(prefers-reduced-motion: reduce)")
            : { matches: false };

        let position = 0;
        /* Starts `true` deliberately. An audit flagged that this makes init()'s
           synchronous syncPlayback() fetch the active slide's video even when the
           carousel is far below the fold, which is real — but flipping it to `false`
           and waiting for the IntersectionObserver was measured to leave the carousel
           permanently unloaded whenever that first callback does not arrive (0 of 5
           posters set, against 5 with this default). A carousel that never loads is a
           worse failure than one that loads early, so the eager default stays and the
           observer's job is to pause what is off screen rather than to permit loading.
           The pre-scroll cost is bounded by `preload="none"` plus `data-src`: only the
           active slide is promoted, not the whole set. */
        let onScreen = true;
        let autoplayOnScreen = !("IntersectionObserver" in window);

        const requestedAutoplayDelay = Number.parseInt(container.dataset.autoplay, 10);
        const autoplayDelay = Number.isFinite(requestedAutoplayDelay)
            ? Math.max(5000, requestedAutoplayDelay)
            : 0;
        let autoplayTimer = null;
        let autoplayPaused = reduceMotion.matches;
        let autoplayHover = false;
        let autoplayFocus = false;

        function autoplayCanRun() {
            return Boolean(autoplayDelay && count > 1 && !autoplayPaused &&
                !autoplayHover && !autoplayFocus && autoplayOnScreen && !document.hidden &&
                !container.querySelector("[data-carousel-zoom].is-zoomed"));
        }

        // No pause control: rotation already stops for hover, focus, drag, zoom,
        // off-screen, hidden tabs and reduced motion. The live region is muted
        // while rotating so screen readers are not interrupted every slide.
        function updateAutoplayControl() {
            if (status) status.setAttribute("aria-live", autoplayCanRun() ? "off" : "polite");
        }

        function stopAutoplayTimer() {
            if (autoplayTimer === null) return;
            clearTimeout(autoplayTimer);
            autoplayTimer = null;
        }

        function scheduleAutoplay() {
            stopAutoplayTimer();
            updateAutoplayControl();
            if (!autoplayCanRun()) return;
            autoplayTimer = setTimeout(function () {
                autoplayTimer = null;
                step(1);
            }, autoplayDelay);
        }

        const dots = count < 2 ? [] : slides.map(function (_, i) {
            const dot = document.createElement("button");
            dot.type = "button";
            dot.className = "slideshow-dot";
            dot.setAttribute("aria-label", "Go to slide " + (i + 1) + " of " + count);
            dot.addEventListener("click", function () { goToIndex(i); });
            if (controls && nextBtn) controls.insertBefore(dot, nextBtn);
            return dot;
        });

        function activeIndex() {
            return ((position % count) + count) % count;
        }

        function updateZoomOrigin(target, clientX, clientY) {
            if (!Number.isFinite(clientX) || !Number.isFinite(clientY)) return;
            const rect = target.getBoundingClientRect();
            const x = Math.max(0, Math.min(100, (clientX - rect.left) / rect.width * 100));
            const y = Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100));
            target.style.setProperty("--carousel-zoom-x", x + "%");
            target.style.setProperty("--carousel-zoom-y", y + "%");
        }

        function restoreRegularSource(target) {
            const state = zoomSources.get(target);
            if (!state || !state.usingZoom) return;
            state.image.setAttribute("src", state.imageSrc);
            state.sources.forEach(function (entry) {
                if (entry.srcset === null) entry.element.removeAttribute("srcset");
                else entry.element.setAttribute("srcset", entry.srcset);
                if (entry.sizes === null) entry.element.removeAttribute("sizes");
                else entry.element.setAttribute("sizes", entry.sizes);
            });
            state.usingZoom = false;
        }

        function useZoomSource(target) {
            const zoomSrc = target.dataset.zoomSrc;
            const image = target.querySelector("img");
            if (!zoomSrc || !image) return;

            let state = zoomSources.get(target);
            if (!state) {
                state = {
                    image: image,
                    imageSrc: image.getAttribute("src"),
                    sources: Array.from(target.querySelectorAll("source")).map(function (source) {
                        return {
                            element: source,
                            srcset: source.getAttribute("srcset"),
                            sizes: source.getAttribute("sizes")
                        };
                    }),
                    loaded: false,
                    loading: false,
                    usingZoom: false
                };
                zoomSources.set(target, state);
            }

            function applyZoomSource() {
                if (!target.classList.contains("is-zoomed")) return;
                state.sources.forEach(function (entry) {
                    entry.element.removeAttribute("srcset");
                    entry.element.removeAttribute("sizes");
                });
                state.image.src = zoomSrc;
                state.usingZoom = true;
            }

            if (state.loaded) {
                applyZoomSource();
                return;
            }
            if (state.loading) return;
            state.loading = true;
            const loader = new Image();
            loader.onload = function () {
                state.loaded = true;
                state.loading = false;
                applyZoomSource();
            };
            loader.onerror = function () { state.loading = false; };
            loader.src = zoomSrc;
        }

        function resetZoom(target) {
            target.classList.remove("is-zoomed");
            if (!useNativeMobileZoom) target.setAttribute("aria-pressed", "false");
            restoreRegularSource(target);
        }

        function toggleZoom(target, clientX, clientY) {
            const zoomingIn = !target.classList.contains("is-zoomed");
            if (zoomingIn) updateZoomOrigin(target, clientX, clientY);
            target.classList.toggle("is-zoomed", zoomingIn);
            target.setAttribute("aria-pressed", zoomingIn ? "true" : "false");
            if (zoomingIn) useZoomSource(target);
            else restoreRegularSource(target);
        }

        zoomTargets.forEach(function (target) {
            target.addEventListener("click", function (event) {
                if (useNativeMobileZoom) return;
                const slide = target.closest(".slideshow-slide");
                if (!slide || !slide.classList.contains("is-active")) return;
                toggleZoom(target, event.clientX, event.clientY);
            });
            target.addEventListener("mousemove", function (event) {
                if (useNativeMobileZoom) return;
                if (target.classList.contains("is-zoomed")) {
                    updateZoomOrigin(target, event.clientX, event.clientY);
                }
            });
            target.addEventListener("mouseleave", function () {
                if (!useNativeMobileZoom) resetZoom(target);
            });
            target.addEventListener("keydown", function (event) {
                if (useNativeMobileZoom) return;
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    const slide = target.closest(".slideshow-slide");
                    if (slide && slide.classList.contains("is-active")) {
                        toggleZoom(target);
                    }
                } else if (event.key === "Escape") {
                    event.preventDefault();
                    resetZoom(target);
                }
            });
        });

        /* One seat's pitch: the slide's own (unscaled) width plus the gap. Slides are
           laid out in a single grid cell, so offsetWidth is the untransformed width and
           is unaffected by the scale the transform applies.

           Cached, like `cachedScale` below. `paint()` calls this and then writes a
           transform to every slide, so reading it live interleaved a layout read with a
           style write — one forced reflow per call, and `paint()` runs on every
           `mousemove`/`touchmove` during a drag. The pitch only changes when the layout
           does, which is exactly when `relayout()` fires. */
        let cachedPitch = null;

        function slideWidth() {
            if (cachedPitch === null) {
                const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
                cachedPitch = slides[0].offsetWidth + gap;
            }
            return cachedPitch;
        }

        /* The neighbour scale comes from CSS so a media query can flatten it to 1 on
           mobile. It is read once and cached rather than per slide per paint: reading
           it inside the loop interleaved a style read with a transform write on every
           iteration, forcing a reflow per slide. It only changes when a media query
           does, so `relayout()` refreshes it. */
        let cachedScale = null;

        function slideScale() {
            if (cachedScale === null) {
                const raw = getComputedStyle(slides[0])
                    .getPropertyValue("--slideshow-scale").trim();
                const n = parseFloat(raw);
                cachedScale = isNaN(n) ? 0.92 : n;
            }
            return cachedScale;
        }

        /* Seat each slide relative to the active one. The seat is the cyclic offset
           with the smallest absolute value, so with 6 slides the one at index 5
           sits at -1 when index 0 is active and peeks on the left rather than
           being five slots away off-screen.

           `seats` records where each slide currently sits, so a move can be
           expressed as a continuous travel from there. Re-deriving the fold
           mid-animation is what made a multi-step jump snap: a slide whose nearest
           seat flipped sign would teleport across the track instead of sliding. */
        let seats = slides.map(function (_, i) { return i; });

        function foldedSeats(active) {
            const half = Math.floor(count / 2);
            return slides.map(function (_, i) {
                let d = i - active;
                if (d > half) d -= count;
                if (d < -half) d += count;
                return d;
            });
        }

        function paint(targetSeats, animate, dragPx) {
            const pitch = slideWidth();
            const offset = dragPx || 0;
            slides.forEach(function (slide, i) {
                const d = targetSeats[i];
                slide.style.transition = (animate && !reduceMotion.matches)
                    ? SLIDE_TRANSITION
                    : "none";
                slide.style.transform =
                    "translate3d(" + (d * pitch + offset) + "px, 0, 0) scale(" +
                    (d === 0 ? 1 : slideScale()) + ")";
                slide.style.zIndex = d === 0 ? 2 : 1;
            });
        }

        // Snap to the canonical seating for the current slide, without animating.
        function place(animate, dragPx) {
            seats = foldedSeats(activeIndex());
            paint(seats, animate, dragPx);
        }

        function markActive() {
            const active = activeIndex();
            slides.forEach(function (s, i) {
                const on = i === active;
                s.classList.toggle("is-active", on);
                s.setAttribute("aria-hidden", on ? "false" : "true");
                s.querySelectorAll("a, button, video[controls], [data-carousel-zoom]").forEach(function (el) {
                    if (on && el.matches("[data-carousel-zoom]") && !useNativeMobileZoom) {
                        el.setAttribute("tabindex", "0");
                    }
                    else if (on) el.removeAttribute("tabindex");
                    else el.setAttribute("tabindex", "-1");
                });
                if (!on) {
                    s.querySelectorAll("[data-carousel-zoom]").forEach(resetZoom);
                }
            });
            dots.forEach(function (d, i) {
                const on = i === active;
                d.classList.toggle("is-active", on);
                d.setAttribute("aria-current", on ? "true" : "false");
            });
            if (status) status.textContent = "Slide " + (active + 1) + " of " + count;
            syncHeight();
        }

        /* Every slide shares one grid cell, so the cell is as tall as the tallest
           slide and shorter ones left a band of empty page above the controls.
           The track instead takes the active slide's height; taller neighbours are
           clipped at that height by the viewport, which only shows their edges. */
        function syncHeight() {
            const slide = slides[activeIndex()];
            if (!slide || !slide.offsetHeight) return;
            // offsetTop is layout-only (ignores the seat transforms) and includes
            // any offset of the slide inside its grid cell.
            track.style.height = (slide.offsetTop + slide.offsetHeight) + "px";
        }

        let settle = null;

        /* Move by `delta` seats. Every slide travels the same distance in the same
           direction, so the whole ring slides as one piece however far the jump is.
           The seating is only re-folded once the motion has finished, which is what
           keeps a slide from teleporting mid-flight when its nearest seat changes
           sign. */
        function step(delta) {
            if (!delta) return;
            if (settle) { clearTimeout(settle); settle = null; }

            // Slides that will end up on the far side must start there, or they fly
            // across the middle of the track to reach it. Re-seat those by a whole
            // ring turn first, un-animated, so the move itself is a clean slide.
            const target = foldedSeats(((position + delta) % count + count) % count);
            const pre = seats.map(function (d, i) {
                const wanted = target[i] + delta;   // seat this slide travels from
                return Math.abs(wanted - d) < 0.5 ? d : wanted;
            });
            if (pre.some(function (d, i) { return d !== seats[i]; })) {
                paint(pre, false);
                // Force the un-animated placement to take effect before the move,
                // or the browser coalesces both into one transition.
                void slides[0].offsetWidth;
                seats = pre;
            }

            position += delta;
            const moved = seats.map(function (d) { return d - delta; });
            paint(moved, true);
            seats = moved;
            markActive();
            syncPlayback();

            settle = setTimeout(function () {
                settle = null;
                // Re-seat without animating; visually identical, since the folded
                // seats differ from these only by a whole number of ring turns.
                place(false);
            }, SETTLE_MS);
            scheduleAutoplay();
        }

        // A jump takes the shortest way round the ring, so tapping the last dot from
        // the first slide moves one step backwards rather than count-1 forwards.
        function goToIndex(index) {
            const active = activeIndex();
            if (index === active) return;
            let delta = index - active;
            const half = Math.floor(count / 2);
            if (delta > half) delta -= count;
            if (delta < -half) delta += count;
            step(delta);
        }

        // Only the visible slide decodes; everything else pauses. A carousel of
        // eight clips would otherwise run eight decoders for one visible video.
        function syncPlayback() {
            const active = activeIndex();
            if (onScreen) loadImages();
            slides.forEach(function (slide, i) {
                const wanted = onScreen && i === active;
                slide.querySelectorAll("video").forEach(function (v) {
                    // Every slide in the carousel gets its poster once the carousel
                    // is on screen: the neighbours are visible at reduced opacity and
                    // would otherwise be blank white boxes.
                    if (onScreen) loadPoster(v);
                    if (wanted) {
                        loadVideo(v);
                        const p = v.play();
                        if (p && p.catch) p.catch(function () { });
                    } else if (!v.paused) {
                        v.pause();
                    }
                });
            });
        }

        // Sources start as data-src so the browser fetches nothing until the clip
        // is wanted. Without this a results carousel pulls every video on load
        // even though only one is on screen.
        /* Off-screen slides are translated outside the viewport, which is exactly the
           condition under which the browser defers a `loading="lazy"` image — and it
           will keep deferring, because the slide never enters the viewport by scrolling.
           So the first trip round the ring showed slides whose images had not started
           loading, and the step looked like a flash; the second trip was smooth because
           they were cached by then.

           Once the carousel itself is on screen, every slide's images are wanted
           regardless of which one is active, for the same reason the video posters are:
           the next step must not have to wait for a fetch. Dropping `loading` is enough
           to start it — the attribute is only a hint, and removing it promotes the image
           to a normal eager load. Runs once; `imagesPromoted` guards re-entry, since
           syncPlayback() is called on every step. */
        let imagesPromoted = false;

        function loadImages() {
            if (imagesPromoted) return;
            // Mobile pictures select their 4K source directly. Keep the native
            // loading hint so translated, off-screen slides are fetched only as
            // the user reaches them rather than downloading the whole set here.
            if (useNativeMobileZoom) return;
            imagesPromoted = true;
            container.querySelectorAll('img[loading="lazy"]').forEach(function (img) {
                img.removeAttribute("loading");
            });
        }

        /* Show a slide's still frame. Kept separate from loadVideo() because the
           peeking neighbours are visible and must not be blank, while their video
           streams should stay deferred — the poster is tens of KB, the clip is
           megabytes. `preload="none"` does not cover the poster, hence data-poster. */
        function loadPoster(v) {
            if (!v.dataset.poster) return;
            v.poster = v.dataset.poster;
            v.removeAttribute("data-poster");
        }

        function loadVideo(v) {
            if (v.dataset.loaded) return;
            let changed = false;
            loadPoster(v);
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

        prevBtn && prevBtn.addEventListener("click", function () { step(-1); });
        nextBtn && nextBtn.addEventListener("click", function () { step(1); });

        container.addEventListener("mouseenter", function () {
            autoplayHover = true;
            scheduleAutoplay();
        });
        container.addEventListener("mouseleave", function () {
            autoplayHover = false;
            scheduleAutoplay();
        });
        container.addEventListener("focusin", function () {
            autoplayFocus = true;
            scheduleAutoplay();
        });
        container.addEventListener("focusout", function () {
            setTimeout(function () {
                autoplayFocus = container.contains(document.activeElement);
                scheduleAutoplay();
            }, 0);
        });
        document.addEventListener("visibilitychange", scheduleAutoplay);

        container.addEventListener("keydown", function (e) {
            if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
            else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
        });

        if (draggable && count > 1) attachDrag();

        function attachDrag() {
            let startX = 0, startY = 0, dragging = false, decided = false;

            function down(x, y) {
                dragging = true;
                decided = false;
                startX = x;
                startY = y;
                stopAutoplayTimer();
            }

            // Follow the pointer once the gesture is clearly horizontal, so a
            // vertical scroll that drifts sideways doesn't drag the track.
            function move(x, y, e) {
                if (!dragging) return;
                const dx = x - startX;
                const dy = y - startY;
                if (!decided) {
                    if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
                    if (Math.abs(dy) > Math.abs(dx)) { dragging = false; return; }
                    decided = true;
                }
                if (e && e.cancelable) e.preventDefault();
                place(false, dx);
            }

            function up(x) {
                if (!dragging) return;
                dragging = false;
                if (!decided) {
                    scheduleAutoplay();
                    return;
                }
                const dx = x - startX;
                const threshold = container.clientWidth * 0.12;
                if (dx <= -threshold) step(1);
                else if (dx >= threshold) step(-1);
                else {
                    place(true);          // snap back
                    scheduleAutoplay();
                }
            }

            track.addEventListener("touchstart", function (e) {
                if (e.touches.length !== 1) {
                    dragging = false;
                    scheduleAutoplay();
                    return;
                }
                down(e.touches[0].clientX, e.touches[0].clientY);
            }, { passive: true });
            track.addEventListener("touchmove", function (e) {
                if (e.touches.length !== 1) {
                    dragging = false;
                    scheduleAutoplay();
                    return;
                }
                move(e.touches[0].clientX, e.touches[0].clientY, e);
            }, { passive: false });
            track.addEventListener("touchend", function (e) {
                if (e.touches.length) {
                    dragging = false;
                    scheduleAutoplay();
                    return;
                }
                up(e.changedTouches[0].clientX);
            });
            track.addEventListener("touchcancel", function () {
                dragging = false;
                scheduleAutoplay();
            });

            track.addEventListener("mousedown", function (e) {
                down(e.clientX, e.clientY);
                e.preventDefault();
            });
            document.addEventListener("mousemove", function (e) {
                if (dragging) move(e.clientX, e.clientY, e);
            });
            document.addEventListener("mouseup", function (e) {
                if (dragging) up(e.clientX);
            });
            track.classList.add("is-draggable");

            // Clicking a peeking neighbour brings it to the centre — but not when
            // the click is the tail of a drag, or the slide would move twice.
            slides.forEach(function (slide, i) {
                slide.addEventListener("click", function () {
                    if (decided) return;
                    if (i !== activeIndex()) goToIndex(i);
                });
            });
        }

        // Pause the whole set while it is off screen; resume the active slide when
        // it returns. A decoder running below the fold is pure waste.
        if ("IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) {
                onScreen = entries[entries.length - 1].isIntersecting;
                autoplayOnScreen = onScreen;
                syncPlayback();
                scheduleAutoplay();
            }, { threshold: 0.1 }).observe(container);
        }

        /* Slide widths depend on images and fonts that may still be loading, so the
           layout has to be redone on resize — but coalesced into one animation frame.
           Unthrottled this fired at pointer rate during a window drag, and each pass
           measures and writes every slide. */
        let relayoutPending = false;

        function relayout() {
            cachedScale = null;      // a media query may have changed it
            cachedPitch = null;      // and the slide width with it
            if (relayoutPending) return;
            relayoutPending = true;
            requestAnimationFrame(function () {
                relayoutPending = false;
                place(false);
                syncHeight();
            });
        }

        window.addEventListener("resize", relayout, { passive: true });
        window.addEventListener("orientationchange", relayout, { passive: true });
        container.querySelectorAll("img").forEach(function (img) {
            if (!img.complete) img.addEventListener("load", relayout, { once: true });
        });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);

        container.setAttribute("role", "group");
        container.setAttribute("aria-roledescription", "carousel");
        track.classList.add("is-ring");
        place(false);
        markActive();
        syncPlayback();
        scheduleAutoplay();
    }
})();

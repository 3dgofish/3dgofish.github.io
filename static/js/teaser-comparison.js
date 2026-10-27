/* Synchronized teaser comparisons backed by packed videos.
 *
 * Building_In: GOFish render | GOFish mesh | 3DGUT + PPISP.
 * Simulation:  GOFish | 3DGUT + PPISP.
 */
(function () {
    "use strict";

    var teaserVideos = [];
    var teaserGroupStarted = false;
    // Reduced motion: the teasers do not start on their own (Space still toggles).
    var reduceMotion = window.matchMedia
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : { matches: false };

    function canvasDpr() {
        return Math.min(window.devicePixelRatio || 1, 2);
    }

    function registerTeaserVideo(video) {
        if (video.dataset.teaserGroupRegistered) return;
        video.dataset.teaserGroupRegistered = "true";
        teaserVideos.push(video);
    }

    function toggleTeaserGroup() {
        var shouldPlay = teaserVideos.every(function (video) { return video.paused; });
        teaserVideos.forEach(function (video) {
            if (shouldPlay) {
                var promise = video.play();
                if (promise && promise.catch) promise.catch(function () { });
            } else {
                video.pause();
            }
        });
    }

    function startTeaserGroupWhenReady() {
        if (teaserGroupStarted || teaserVideos.length < 2) return;
        var allReady = teaserVideos.every(function (video) {
            return video.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
        });
        if (!allReady || reduceMotion.matches) return;
        teaserGroupStarted = true;
        teaserVideos.forEach(function (video) {
            video.currentTime = 0;
            var promise = video.play();
            if (promise && promise.catch) promise.catch(function () { });
        });
    }

    function initialise(video, canvas) {
        registerTeaserVideo(video);
        if (video.dataset.teaserReady) return;
        if (!video.videoWidth || video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) {
            if (!video.dataset.teaserPending) {
                video.dataset.teaserPending = "true";
                video.addEventListener("canplay", function once() {
                    video.removeEventListener("canplay", once);
                    delete video.dataset.teaserPending;
                    initialise(video, canvas);
                });
            }
            return;
        }

        video.dataset.teaserReady = "true";
        startTeaserGroupWhenReady();
        var mode = video.dataset.teaserMode || "three-way";
        var isThreeWay = mode === "three-way";
        var container = canvas.parentElement;
        var context = canvas.getContext("2d", { alpha: false });
        var positionX = 0.5;
        var positionY = 0.5;
        var onScreen = true;
        var visibilityPaused = false;
        var touchDragging = false;
        var suppressClick = false;
        var drawRequest = null;
        var playbackRequest = null;
        var resizeRequest = null;
        var usesVideoFrames = typeof video.requestVideoFrameCallback === "function";
        var computedFont = window.getComputedStyle(canvas).fontFamily;

        function paintSoon() {
            if (drawRequest !== null) return;
            drawRequest = requestAnimationFrame(function () {
                drawRequest = null;
                paint();
            });
        }

        function scheduleVideoFrame() {
            if (playbackRequest !== null || video.paused || !onScreen) return;
            if (usesVideoFrames) {
                playbackRequest = video.requestVideoFrameCallback(function () {
                    playbackRequest = null;
                    paint();
                    scheduleVideoFrame();
                });
            } else {
                playbackRequest = requestAnimationFrame(function () {
                    playbackRequest = null;
                    paint();
                    scheduleVideoFrame();
                });
            }
        }

        function cancelVideoFrame() {
            if (playbackRequest === null) return;
            if (usesVideoFrames && typeof video.cancelVideoFrameCallback === "function") {
                video.cancelVideoFrameCallback(playbackRequest);
            } else {
                cancelAnimationFrame(playbackRequest);
            }
            playbackRequest = null;
        }

        function updateSize() {
            container.style.width = "";
            var availableWidth = parseFloat(window.getComputedStyle(container).width);
            var side = Math.min(availableWidth, window.innerHeight * 0.8);
            var dpr = canvasDpr();
            canvas.width = Math.round(side * dpr);
            canvas.height = Math.round(side * dpr);
            canvas.style.width = side + "px";
            canvas.style.height = side + "px";
            canvas.style.margin = "0 auto";
            container.style.width = side + "px";
            container.style.maxWidth = "100%";
            container.style.marginLeft = "auto";
            container.style.marginRight = "auto";
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            paintSoon();
        }

        function updateAriaValue() {
            var x = Math.round(positionX * 100);
            canvas.setAttribute("aria-valuenow", String(x));
            if (isThreeWay) {
                canvas.setAttribute("aria-valuetext",
                    "Vertical divider at " + x + " percent and horizontal divider at " +
                    Math.round(positionY * 100) + " percent");
            } else {
                canvas.setAttribute("aria-valuetext", "Divider at " + x + " percent");
            }
        }

        function setPosition(clientX, clientY) {
            var rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            positionX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            if (isThreeWay) {
                positionY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
            }
            updateAriaValue();
            paintSoon();
        }

        function drawPanel(column, panelCount, x, y, width, height, canvasWidth, canvasHeight) {
            if (width <= 0 || height <= 0) return;
            var panelWidth = video.videoWidth / panelCount;
            var panelHeight = video.videoHeight;
            var sourceX = column * panelWidth + panelWidth * (x / canvasWidth);
            var sourceY = panelHeight * (y / canvasHeight);
            var sourceWidth = panelWidth * (width / canvasWidth);
            var sourceHeight = panelHeight * (height / canvasHeight);
            context.drawImage(video,
                sourceX, sourceY, sourceWidth, sourceHeight,
                x, y, width, height);
        }

        function drawBubble(text, x, y, alignRight, alignBottom, fontSize, isBold) {
            var paddingX = fontSize * 0.6;
            var paddingY = fontSize * 0.35;
            var radius = fontSize * 0.6;
            context.font = (isBold ? "600 " : "") + fontSize + "px " + computedFont;
            var textWidth = context.measureText(text).width;
            var boxWidth = textWidth + paddingX * 2;
            var boxHeight = fontSize + paddingY * 2;
            var rectX = alignRight ? x - boxWidth : x;
            var rectY = alignBottom ? y - boxHeight : y;
            context.fillStyle = "rgba(0, 0, 0, 0.55)";
            context.beginPath();
            context.roundRect(rectX, rectY, boxWidth, boxHeight, radius);
            context.fill();
            context.fillStyle = "#ffffff";
            context.fillText(text, rectX + paddingX, rectY + boxHeight / 2);
        }

        function drawBubbleStack(labels, x, y, alignRight, alignBottom, fontSize, boldIndex) {
            var bubbleHeight = fontSize * 1.7;
            var gap = Math.max(3, fontSize * 0.16);
            var emphasized = boldIndex === undefined ? 0 : boldIndex;
            labels.forEach(function (text, index) {
                var bubbleY = alignBottom
                    ? y - index * (bubbleHeight + gap)
                    : y + index * (bubbleHeight + gap);
                drawBubble(text, x, bubbleY, alignRight, alignBottom, fontSize, index === emphasized);
            });
        }

        function drawCrossHandle(splitX, splitY, width, height) {
            var handleRadius = 21;
            var arrowSize = 5;
            var arrowOffset = 5;
            context.save();
            context.shadowColor = "rgba(12, 12, 12, 0.8)";
            context.shadowBlur = 10;
            context.strokeStyle = "#ffffff";
            context.fillStyle = "#ffffff";
            context.lineWidth = 2;

            context.beginPath();
            context.moveTo(splitX, 0);
            context.lineTo(splitX, Math.max(0, splitY - handleRadius));
            context.moveTo(splitX, Math.min(height, splitY + handleRadius));
            context.lineTo(splitX, height);
            context.moveTo(0, splitY);
            context.lineTo(Math.max(0, splitX - handleRadius), splitY);
            context.stroke();

            context.beginPath();
            context.arc(splitX, splitY, handleRadius, 0, Math.PI * 2);
            context.stroke();

            [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach(function (direction) {
                var dx = direction[0];
                var dy = direction[1];
                context.beginPath();
                if (dx) {
                    context.moveTo(splitX + dx * (arrowOffset + arrowSize), splitY);
                    context.lineTo(splitX + dx * arrowOffset, splitY - arrowSize);
                    context.lineTo(splitX + dx * arrowOffset, splitY + arrowSize);
                } else {
                    context.moveTo(splitX, splitY + dy * (arrowOffset + arrowSize));
                    context.lineTo(splitX - arrowSize, splitY + dy * arrowOffset);
                    context.lineTo(splitX + arrowSize, splitY + dy * arrowOffset);
                }
                context.closePath();
                context.fill();
            });
            context.restore();
        }

        function drawVerticalHandle(splitX, width, height) {
            var handleRadius = 20;
            var centerY = height / 2;
            var arrowSize = 6;
            var arrowOffset = 5;
            context.save();
            context.shadowColor = "rgba(12, 12, 12, 0.8)";
            context.shadowBlur = 10;
            context.strokeStyle = "#ffffff";
            context.fillStyle = "#ffffff";
            context.lineWidth = 2;

            context.beginPath();
            context.moveTo(splitX, 0);
            context.lineTo(splitX, centerY - handleRadius);
            context.moveTo(splitX, centerY + handleRadius);
            context.lineTo(splitX, height);
            context.stroke();
            context.beginPath();
            context.arc(splitX, centerY, handleRadius, 0, Math.PI * 2);
            context.stroke();

            [-1, 1].forEach(function (direction) {
                context.beginPath();
                context.moveTo(splitX + direction * (arrowOffset + arrowSize), centerY);
                context.lineTo(splitX + direction * arrowOffset, centerY - arrowSize);
                context.lineTo(splitX + direction * arrowOffset, centerY + arrowSize);
                context.closePath();
                context.fill();
            });
            context.restore();
        }

        var lastPublishedFont = null;

        function paint() {
            if (!video.videoWidth || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
            var dpr = canvasDpr();
            var width = canvas.width / dpr;
            var height = canvas.height / dpr;
            var splitX = width * positionX;
            var splitY = height * positionY;
            var fontScale = window.innerWidth <= 480 ? 0.037
                : (window.innerWidth <= 768 ? 0.045 : 0.04);
            var fontSize = Math.round(height * fontScale);
            var inset = 6;
            // Publish the pill size so HTML overlays elsewhere on the page (the Method
            // render | mesh clip) can draw an identical pill.
            if (fontSize !== lastPublishedFont) {
                lastPublishedFont = fontSize;
                document.documentElement.style.setProperty("--teaser-pill-font", fontSize + "px");
            }

            context.fillStyle = "#000000";
            context.fillRect(0, 0, width, height);
            context.font = fontSize + "px " + computedFont;
            context.textBaseline = "middle";

            if (isThreeWay) {
                drawPanel(0, 3, 0, 0, splitX, splitY, width, height);
                drawPanel(1, 3, 0, splitY, splitX, height - splitY, width, height);
                drawPanel(2, 3, splitX, 0, width - splitX, height, width, height);
                drawBubbleStack([
                    container.dataset.topLeftLabel,
                    container.dataset.topLeftPsnrLabel,
                    container.dataset.topLeftLpipsLabel
                ], inset, inset, false, false, fontSize);
                drawBubbleStack([
                    container.dataset.bottomLeftFovLabel,
                    container.dataset.bottomLeftLabel
                ], inset, height - inset, false, true, fontSize, 1);
                drawBubbleStack([
                    container.dataset.rightLabel,
                    container.dataset.rightPsnrLabel,
                    container.dataset.rightLpipsLabel
                ], width - inset, inset, true, false, fontSize);
                drawBubble(container.dataset.rightBottomLabel,
                    width - inset, height - inset, true, true, fontSize, false);
                drawCrossHandle(splitX, splitY, width, height);
            } else {
                drawPanel(0, 2, 0, 0, splitX, height, width, height);
                drawPanel(1, 2, splitX, 0, width - splitX, height, width, height);
                drawBubbleStack([
                    container.dataset.leftLabel,
                    container.dataset.leftCapabilityOneLabel,
                    container.dataset.leftCapabilityTwoLabel
                ], inset, inset, false, false, fontSize);
                drawBubbleStack([
                    container.dataset.rightLabel,
                    container.dataset.rightCapabilityLabel
                ], width - inset, inset, true, false, fontSize);
                drawBubble(container.dataset.leftBottomLabel,
                    inset, height - inset, false, true, fontSize, false);
                drawBubble(container.dataset.rightBottomLabel,
                    width - inset, height - inset, true, true, fontSize, false);
                drawVerticalHandle(splitX, width, height);
            }
        }

        canvas.addEventListener("mousemove", function (event) {
            setPosition(event.clientX, event.clientY);
        }, { passive: true });

        canvas.addEventListener("mouseleave", function () {
            positionX = 0.5;
            positionY = 0.5;
            updateAriaValue();
            paintSoon();
        }, { passive: true });

        canvas.addEventListener("touchstart", function (event) {
            var touch = event.touches[0];
            var rect = canvas.getBoundingClientRect();
            var handleX = rect.left + rect.width * positionX;
            var handleY = rect.top + rect.height * (isThreeWay ? positionY : 0.5);
            touchDragging = Math.hypot(touch.clientX - handleX, touch.clientY - handleY) < 52;
            suppressClick = false;
            if (touchDragging && event.cancelable) event.preventDefault();
        }, { passive: false });

        canvas.addEventListener("touchmove", function (event) {
            if (!touchDragging) return;
            if (event.cancelable) event.preventDefault();
            suppressClick = true;
            setPosition(event.touches[0].clientX, event.touches[0].clientY);
        }, { passive: false });

        canvas.addEventListener("touchend", function () {
            touchDragging = false;
        }, { passive: true });

        canvas.addEventListener("click", function () {
            if (suppressClick) {
                suppressClick = false;
                return;
            }
            toggleTeaserGroup();
        });

        canvas.addEventListener("keydown", function (event) {
            var step = event.shiftKey ? 0.1 : 0.02;
            if (event.key === "ArrowLeft") positionX -= step;
            else if (event.key === "ArrowRight") positionX += step;
            else if (isThreeWay && event.key === "ArrowUp") positionY -= step;
            else if (isThreeWay && event.key === "ArrowDown") positionY += step;
            else if (event.key === "Home") {
                positionX = 0.5;
                positionY = 0.5;
            } else if (event.key === " " || event.key === "Enter") {
                toggleTeaserGroup();
            } else return;
            event.preventDefault();
            positionX = Math.max(0, Math.min(1, positionX));
            positionY = Math.max(0, Math.min(1, positionY));
            updateAriaValue();
            paintSoon();
        });

        video.addEventListener("play", scheduleVideoFrame);
        video.addEventListener("pause", function () {
            cancelVideoFrame();
            paintSoon();
        });
        video.addEventListener("seeked", paintSoon);

        if ("IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) {
                onScreen = entries[entries.length - 1].isIntersecting;
                if (!onScreen) {
                    cancelVideoFrame();
                    if (!video.paused) {
                        visibilityPaused = true;
                        video.pause();
                    }
                } else if (visibilityPaused) {
                    visibilityPaused = false;
                    var promise = video.play();
                    if (promise && promise.catch) promise.catch(function () { });
                } else {
                    paintSoon();
                    scheduleVideoFrame();
                }
            }, { threshold: 0.01 }).observe(canvas);
        }

        // A hidden tab pauses the teaser the same way leaving the viewport does.
        document.addEventListener("visibilitychange", function () {
            if (document.hidden) {
                if (!video.paused) {
                    visibilityPaused = true;
                    video.pause();
                }
            } else if (visibilityPaused && onScreen) {
                visibilityPaused = false;
                var promise = video.play();
                if (promise && promise.catch) promise.catch(function () { });
            }
        });

        window.addEventListener("resize", function () {
            if (resizeRequest !== null) return;
            resizeRequest = requestAnimationFrame(function () {
                resizeRequest = null;
                computedFont = window.getComputedStyle(canvas).fontFamily;
                updateSize();
            });
        }, { passive: true });

        updateAriaValue();
        updateSize();
        paintSoon();
        scheduleVideoFrame();
    }

    window.initialiseGofishTeaser = function (video) {
        var canvas = document.getElementById(video.id + "Merge");
        if (canvas) initialise(video, canvas);
    };

    document.addEventListener("DOMContentLoaded", function () {
        var videos = Array.from(document.querySelectorAll("video[data-teaser-mode]"));
        if (reduceMotion.matches) {
            videos.forEach(function (video) {
                video.removeAttribute("autoplay");
                video.pause();
            });
        }
        videos.forEach(registerTeaserVideo);
        videos.forEach(function (video) {
            var canvas = document.getElementById(video.id + "Merge");
            if (canvas) initialise(video, canvas);
        });
    });
})();

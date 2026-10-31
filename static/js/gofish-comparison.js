(function () {
    "use strict";

    var METHODS = {
        fisheye_gs: {
            label: "Fisheye-GS",
            fov: "145° FoV",
            render: ["fisheye_gs", "fisheyegs"],
            mesh: null
        },
        "3dgut": {
            label: "3DGUT",
            fov: "160° FoV",
            render: ["3dgut"],
            mesh: null
        },
        "3dgut_ppisp": {
            label: "3DGUT + PPISP",
            fov: "160° FoV",
            render: ["3dgut_ppisp"],
            mesh: null
        },
        "3dgeer": {
            label: "3DGEER",
            fov: "178° FoV",
            render: ["3dgeer"],
            mesh: null
        },
        directfisheye_gs: {
            label: "DirectFisheye-GS",
            fov: "180° FoV",
            render: ["directfisheye_gs"],
            mesh: null
        },
        "3dgrt_ppisp": {
            label: "3DGRT + PPISP",
            fov: "200° FoV",
            render: ["3dgrt_ppisp"],
            mesh: null
        },
        gof: {
            label: "GOF",
            fov: "90° FoV",
            render: ["gof"],
            mesh: ["gof_mesh"]
        },
        pgsr: {
            label: "PGSR",
            fov: "90° FoV",
            render: ["pgsr"],
            mesh: ["pgsr_mesh"]
        },
        sof: {
            label: "SOF",
            fov: "90° FoV",
            render: ["sof"],
            mesh: ["sof_mesh"]
        },
        milo: {
            label: "MiLo",
            fov: "90° FoV",
            render: ["milo"],
            mesh: ["milo_mesh"]
        },
        come: {
            label: "CoMe",
            fov: "90° FoV",
            render: ["come"],
            mesh: ["come_mesh"]
        }
    };

    var ROLE_LABELS = {
        "gofish-render": "GOFish render",
        "gofish-mesh": "GOFish mesh",
        "baseline-render": "baseline render",
        "baseline-mesh": "baseline mesh"
    };

    var DATASETS = {
        fiord: {
            label: "FIORD",
            // Rail order: by Full-PSNR gap over 3DGUT + PPISP (Table 12), with the
            // teaser scene Hall_In second and Building_In first, since MeetingRoom_In's
            // black wall shows artifacts for every method (USER, 2026-10-19).
            firstScene: "Building_In",
            fullFov: "200° FoV",
            gofishRender: ["gofish_ours", "gofish"],
            metricScenes: [
                "Kitchen_In", "Corridor_Out", "Road_Out", "Building_In",
                "MeetingRoom_In", "Bridge_Out", "Hall_In"
            ]
        },
        fullcircle: {
            label: "FullCircle",
            firstScene: "FullCircle_lab",
            fullFov: "205° FoV",
            gofishRender: ["gofish"],
            // Metric lookup order; the visual rail places the holey persons mesh last.
            metricScenes: [
                "FullCircle_room2", "FullCircle_persons", "FullCircle_room3",
                "FullCircle_flat1", "FullCircle_lab", "FullCircle_dark",
                "FullCircle_room1", "FullCircle_flat2", "FullCircle_lounge"
            ]
        }
    };

    // Matches the empty corner pixels of the FIORD ground-truth images.
    var VIEWER_BLACK = "#000000";

    // Scene names follow the official FIORD release (festia_out_corridor =
    // Corridor_Out, outcorridor = Bridge_Out), as do the paper's relabeled tables,
    // whose FIORD columns read Kit. Cor. Road Bld. Meet. Bri. Hall.
    // Full-aperture FIORD values from tables/appendix_per_scene.tex: renders use the
    // GOFish (Ours) row, meshes the + Geometry Objective row.
    // Entries follow DATASETS.fiord.metricScenes. Strings preserve paper precision.
    var RENDER_METRICS = {
        gofish: {
            psnr: ["24.18", "23.07", "22.87", "25.00", "25.57", "24.73", "25.10"],
            lpips: ["0.191", "0.276", "0.258", "0.200", "0.184", "0.225", "0.137"]
        },
        fisheye_gs: {
            psnr: ["18.72", "16.22", "17.19", "18.18", "16.28", "17.47", "20.42"],
            lpips: ["0.361", "0.409", "0.402", "0.415", "0.469", "0.406", "0.300"]
        },
        "3dgut": {
            psnr: ["20.20", "17.62", "19.49", "19.03", "19.62", "24.25", "18.84"],
            lpips: ["0.279", "0.391", "0.360", "0.332", "0.299", "0.259", "0.290"]
        },
        "3dgut_ppisp": {
            psnr: ["20.34", "18.78", "19.70", "19.68", "19.48", "24.38", "18.93"],
            lpips: ["0.284", "0.377", "0.356", "0.330", "0.297", "0.256", "0.285"]
        },
        "3dgrt_ppisp": {
            psnr: ["19.19", "15.11", "17.89", "18.69", "19.16", "21.97", "16.92"],
            lpips: ["0.281", "0.389", "0.353", "0.315", "0.287", "0.272", "0.295"]
        },
        "3dgeer": {
            psnr: ["14.19", "10.39", "11.52", "12.29", "13.50", "10.06", "17.55"],
            lpips: ["0.270", "0.418", "0.415", "0.324", "0.296", "0.373", "0.203"]
        },
        directfisheye_gs: {
            psnr: ["23.13", "20.56", "20.56", "20.93", "22.94", "23.07", "23.35"],
            lpips: ["0.256", "0.368", "0.351", "0.336", "0.295", "0.298", "0.225"]
        },
        gof: {
            psnr: ["18.02", "17.42", "14.92", "17.64", "19.35", "12.86", "19.03"],
            lpips: ["0.306", "0.405", "0.448", "0.358", "0.286", "0.383", "0.286"]
        },
        pgsr: {
            psnr: ["17.82", "17.12", "14.56", "18.36", "18.81", "12.59", "18.43"],
            lpips: ["0.326", "0.397", "0.430", "0.357", "0.324", "0.402", "0.307"]
        },
        sof: {
            psnr: ["18.08", "16.92", "13.26", "17.00", "19.30", "12.73", "19.05"],
            lpips: ["0.293", "0.426", "0.501", "0.369", "0.273", "0.394", "0.284"]
        },
        milo: {
            psnr: ["17.57", "17.87", "14.94", "18.21", "18.86", "12.26", "19.67"],
            lpips: ["0.321", "0.406", "0.439", "0.373", "0.307", "0.424", "0.308"]
        },
        come: {
            psnr: ["18.18", "19.34", "14.91", "18.64", "19.59", "12.77", "20.06"],
            lpips: ["0.292", "0.383", "0.457", "0.319", "0.260", "0.363", "0.252"]
        }
    };

    // FullCircle rendering values follow DATASETS.fullcircle.metricScenes. The
    // dataset has no geometry ground truth, so mesh panels show method labels only.
    var FULLCIRCLE_RENDER_METRICS = {
        gofish: {
            psnr: ["27.54", "27.46", "26.39", "25.95", "25.90", "25.53", "25.22", "24.22", "21.00"],
            lpips: ["0.212", "0.236", "0.226", "0.241", "0.188", "0.201", "0.174", "0.187", "0.200"]
        },
        fisheye_gs: {
            psnr: ["14.59", "13.25", "14.28", "13.87", "14.38", "13.44", "14.97", "14.53", "12.80"],
            lpips: ["0.486", "0.484", "0.490", "0.520", "0.504", "0.472", "0.466", "0.479", "0.557"]
        },
        "3dgut": {
            psnr: ["23.21", "22.55", "22.06", "21.06", "20.32", "22.17", "22.30", "20.44", "20.14"],
            lpips: ["0.275", "0.298", "0.285", "0.311", "0.246", "0.252", "0.225", "0.249", "0.212"]
        },
        "3dgut_ppisp": {
            psnr: ["23.07", "22.06", "21.93", "20.99", "20.31", "22.03", "22.09", "20.58", "20.00"],
            lpips: ["0.274", "0.301", "0.285", "0.310", "0.251", "0.255", "0.227", "0.246", "0.212"]
        },
        "3dgrt_ppisp": {
            psnr: ["25.43", "25.61", "24.07", "23.77", "23.08", "23.67", "23.08", "21.38", "21.37"],
            lpips: ["0.232", "0.252", "0.241", "0.263", "0.202", "0.228", "0.188", "0.206", "0.189"]
        },
        // 3DGEER: A4 protocol, from the paper's FullCircle per-scene table.
        "3dgeer": {
            psnr: ["13.47", "14.75", "12.19", "12.96", "10.36", "13.45", "13.57", "10.02", "13.07"],
            lpips: ["0.346", "0.351", "0.349", "0.365", "0.330", "0.332", "0.292", "0.343", "0.314"]
        },
        directfisheye_gs: {
            psnr: ["22.24", "21.83", "20.87", "20.55", "19.91", "21.12", "21.06", "19.51", "18.92"],
            lpips: ["0.302", "0.316", "0.316", "0.333", "0.275", "0.284", "0.253", "0.293", "0.256"]
        },
        gof: {
            psnr: ["22.95", "22.97", "22.77", "22.62", "22.81", "21.48", "22.36", "19.94", "18.67"],
            lpips: ["0.291", "0.308", "0.297", "0.321", "0.259", "0.262", "0.227", "0.277", "0.246"]
        },
        pgsr: {
            psnr: ["23.10", "23.08", "23.59", "23.35", "23.30", "21.08", "22.46", "20.04", "18.31"],
            lpips: ["0.308", "0.314", "0.299", "0.324", "0.257", "0.277", "0.240", "0.283", "0.281"]
        },
        sof: {
            psnr: ["22.67", "22.03", "23.63", "22.41", "22.72", "21.13", "22.02", "19.55", "19.62"],
            lpips: ["0.292", "0.313", "0.282", "0.317", "0.248", "0.265", "0.220", "0.282", "0.237"]
        },
        milo: {
            psnr: ["23.35", "23.17", "22.70", "23.10", "22.89", "21.30", "22.26", "19.79", "20.82"],
            lpips: ["0.303", "0.312", "0.302", "0.322", "0.261", "0.267", "0.235", "0.280", "0.242"]
        },
        come: {
            psnr: ["23.34", "23.50", "23.50", "22.95", "22.90", "22.00", "22.31", "20.18", "19.94"],
            lpips: ["0.282", "0.295", "0.288", "0.311", "0.253", "0.254", "0.220", "0.275", "0.241"]
        }
    };

    // Geometry is not evaluated for Corridor_Out; its null entries render as em dashes.
    var MESH_METRICS = {
        gofish: {
            f: ["0.610", null, "0.027", "0.172", "0.492", "0.121", "0.072"]
        },
        gof: {
            f: ["0.554", null, "0.022", "0.139", "0.367", "0.044", "0.063"]
        },
        pgsr: {
            f: ["0.644", null, "0.040", "0.169", "0.403", "0.109", "0.068"]
        },
        sof: {
            f: ["0.547", null, "0.008", "0.114", "0.384", "0.046", "0.054"]
        },
        milo: {
            f: ["0.609", null, "0.017", "0.163", "0.387", "0.038", "0.049"]
        },
        come: {
            f: ["0.592", null, "0.018", "0.176", "0.444", "0.064", "0.068"]
        }
    };

    document.addEventListener("DOMContentLoaded", function () {
        var module = document.getElementById("fiord-comparison");
        if (module) initialiseComparison(module);
    });

    function initialiseComparison(module) {
        var container = module.querySelector(".gofish-compare-container");
        var canvas = module.querySelector(".gofish-comparison-canvas");
        var context = canvas && canvas.getContext("2d", { alpha: false });
        if (!container || !canvas || !context) return;

        var loading = module.querySelector(".gofish-comparison-loading");
        var status = module.querySelector(".fiord-comparison-status");
        var datasetButtons = Array.from(module.querySelectorAll("[data-dataset]:not(.fiord-scene-button)"));
        var scenePickers = Array.from(module.querySelectorAll("[data-scene-dataset]"));
        var sceneButtons = Array.from(module.querySelectorAll(".fiord-scene-button"));
        var methodButtons = Array.from(module.querySelectorAll("[data-method]"));
        var videos = {};
        var frameCaches = {};
        var panelTransitions = {};
        var PANEL_FADE_MS = 200;
        var gofishLogo = null;
        var gofishLogoReady = false;

        function loadGofishLogo() {
            if (gofishLogo) return;
            gofishLogo = new Image();
            gofishLogo.decoding = "async";
            gofishLogo.onload = function () {
                gofishLogoReady = true;
                paint();
            };
            gofishLogo.src = "./static/images/gofish-logo.svg?v=2026.10.30.1";
        }
        module.querySelectorAll("video[data-comparison-role]").forEach(function (video) {
            var role = video.dataset.comparisonRole;
            videos[role] = video;
            var cacheCanvas = document.createElement("canvas");
            frameCaches[role] = {
                canvas: cacheCanvas,
                context: cacheCanvas.getContext("2d", { alpha: false }),
                ready: false
            };
        });

        var reduceMotion = window.matchMedia
            ? window.matchMedia("(prefers-reduced-motion: reduce)")
            : { matches: false };
        var state = {
            dataset: "fiord",
            scene: DATASETS.fiord.firstScene,
            method: "3dgut_ppisp",
            splitX: 0.5,
            splitY: 0.5,
            // GOFish panels only change with the scene or dataset, so they keep
            // their own token: switching baselines mid-load must not orphan an
            // in-flight GOFish load (which would leave it on "Loading…" forever).
            gofishToken: 0,
            baselineToken: 0,
            wantsPlayback: !reduceMotion.matches,
            onScreen: !("IntersectionObserver" in window),
            selectionLoaded: false,
            frameRequest: null,
            fadeRequest: null,
            lastSync: 0,
            needsAlignment: true,
            touchDragging: false,
            suppressClick: false,
            autoplayBlocked: false
        };
        var videoRoot = module.dataset.videoRoot || "./static/videos/";
        var videoVersion = module.dataset.videoVersion || "";
        var h264Root = module.dataset.h264Root ||
            "https://huggingface.co/datasets/AllenTu/GOFish-web/resolve/main/videos/h264/";
        var supportsAv1 = document.createElement("video").canPlayType(
            'video/mp4; codecs="av01.0.04M.08"') !== "";

        function activeMethod() {
            return METHODS[state.method];
        }

        function activeDataset() {
            return DATASETS[state.dataset];
        }

        function activeMethodFov() {
            if (state.dataset === "fullcircle" && state.method === "3dgrt_ppisp") {
                return activeDataset().fullFov;
            }
            return activeMethod().fov;
        }

        function activeRoles() {
            var roles = ["gofish-render", "gofish-mesh", "baseline-render"];
            if (activeMethod().mesh) roles.push("baseline-mesh");
            return roles;
        }

        function canvasSize() {
            return {
                width: canvas.clientWidth || 816,
                height: canvas.clientHeight || 816
            };
        }

        function resizeCanvas() {
            var size = canvasSize();
            var dpr = Math.min(window.devicePixelRatio || 1, 2);
            var pixelWidth = Math.max(1, Math.round(size.width * dpr));
            var pixelHeight = Math.max(1, Math.round(size.height * dpr));
            if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
                canvas.width = pixelWidth;
                canvas.height = pixelHeight;
            }
            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            paint();
        }

        function videoReady(video) {
            return video && video.dataset.loadState === "ready" &&
                video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
        }

        function drawContainedSource(source, sourceWidth, sourceHeight, width, height) {
            var scale = Math.min(width / sourceWidth, height / sourceHeight);
            var drawWidth = sourceWidth * scale;
            var drawHeight = sourceHeight * scale;
            var drawX = (width - drawWidth) / 2;
            var drawY = (height - drawHeight) / 2;
            context.drawImage(source, drawX, drawY, drawWidth, drawHeight);
        }

        function captureVideoFrame(video) {
            if (!videoReady(video) || !video.videoWidth || !video.videoHeight) return false;
            var cache = frameCaches[video.dataset.comparisonRole];
            if (!cache || !cache.context) return false;
            if (cache.canvas.width !== video.videoWidth || cache.canvas.height !== video.videoHeight) {
                cache.canvas.width = video.videoWidth;
                cache.canvas.height = video.videoHeight;
            }
            try {
                cache.context.drawImage(video, 0, 0, cache.canvas.width, cache.canvas.height);
                cache.ready = true;
                return true;
            } catch (error) {
                return false;
            }
        }

        function snapshotPanel(role, fallbackRole) {
            var video = videos[role];
            if (video) captureVideoFrame(video);
            var cache = frameCaches[role];
            if ((!cache || !cache.ready) && fallbackRole) cache = frameCaches[fallbackRole];
            if (!cache || !cache.ready || !cache.canvas.width || !cache.canvas.height) {
                if (panelTransitions[role]) {
                    panelTransitions[role].startedAt = null;
                    return true;
                }
                delete panelTransitions[role];
                return false;
            }

            var snapshot = document.createElement("canvas");
            snapshot.width = cache.canvas.width;
            snapshot.height = cache.canvas.height;
            snapshot.getContext("2d", { alpha: false })
                .drawImage(cache.canvas, 0, 0);
            panelTransitions[role] = { canvas: snapshot, startedAt: null };
            return true;
        }

        function ensureFadePaint() {
            if (state.fadeRequest !== null) return;
            state.fadeRequest = requestAnimationFrame(function () {
                state.fadeRequest = null;
                paint();
            });
        }

        function drawBestFrame(video, width, height) {
            captureVideoFrame(video);
            var cache = video && frameCaches[video.dataset.comparisonRole];
            if (!cache || !cache.ready) return false;
            drawContainedSource(cache.canvas, cache.canvas.width, cache.canvas.height, width, height);
            return true;
        }

        function drawPanel(video, x, y, width, height, widthFull, heightFull) {
            if (width <= 0 || height <= 0) return;
            var role = video && video.dataset.comparisonRole;
            var transition = role && panelTransitions[role];
            context.save();
            context.beginPath();
            context.rect(x, y, width, height);
            context.clip();
            context.fillStyle = VIEWER_BLACK;
            context.fillRect(0, 0, widthFull, heightFull);

            var drewCurrent = drawBestFrame(video, widthFull, heightFull);
            if (!drewCurrent) {
                if (transition) {
                    drawContainedSource(transition.canvas, transition.canvas.width,
                        transition.canvas.height, widthFull, heightFull);
                } else {
                    drawUnavailable(video, x, y, width, height);
                }
            } else if (transition) {
                if (reduceMotion.matches) {
                    delete panelTransitions[role];
                } else {
                    if (transition.startedAt === null) transition.startedAt = performance.now();
                    var progress = Math.min(1,
                        (performance.now() - transition.startedAt) / PANEL_FADE_MS);
                    if (progress < 1) {
                        context.save();
                        context.globalAlpha = 1 - progress;
                        drawContainedSource(transition.canvas, transition.canvas.width,
                            transition.canvas.height, widthFull, heightFull);
                        context.restore();
                        ensureFadePaint();
                    } else {
                        delete panelTransitions[role];
                    }
                }
            }
            context.restore();
        }

        function drawUnavailable(video, x, y, width, height) {
            var isLoading = video && video.dataset.loadState !== "missing";
            var message = isLoading ? "Loading…" : "Video coming soon";
            context.fillStyle = VIEWER_BLACK;
            context.fillRect(x, y, width, height);
            context.fillStyle = "rgba(255, 255, 255, 0.72)";
            context.font = "600 " + Math.max(11, Math.min(15, width / 18)) +
                "px 'Google Sans', 'Noto Sans', sans-serif";
            context.textAlign = "center";
            context.textBaseline = "middle";
            context.fillText(message, x + width / 2, y + height / 2, Math.max(40, width - 20));
        }

        function roundedRect(x, y, width, height, radius) {
            var r = Math.min(radius, width / 2, height / 2);
            context.beginPath();
            context.moveTo(x + r, y);
            context.arcTo(x + width, y, x + width, y + height, r);
            context.arcTo(x + width, y + height, x, y + height, r);
            context.arcTo(x, y + height, x, y, r);
            context.arcTo(x, y, x + width, y, r);
            context.closePath();
        }

        function labelMetrics(canvasHeight) {
            // Phones get a slightly larger share of the (small) canvas, but very narrow
            // screens step back down so the stacked pills do not cover the panels.
            var fontScale = window.innerWidth <= 480 ? 0.037
                : (window.innerWidth <= 768 ? 0.045 : 0.04);
            var fontSize = Math.round(canvasHeight * fontScale);
            return {
                fontSize: fontSize,
                paddingX: fontSize * 0.6,
                height: fontSize * 1.7,
                inset: 6,
                gap: Math.max(3, fontSize * 0.16)
            };
        }

        function drawLabelStack(labels, horizontal, vertical, canvasWidth, canvasHeight, boldIndex) {
            var metrics = labelMetrics(canvasHeight);
            var fontSize = metrics.fontSize;
            labels.forEach(function (text, index) {
                context.font = (index === boldIndex ? "600 " : "") +
                    fontSize + "px 'Google Sans', 'Noto Sans', sans-serif";
                var width = context.measureText(text).width + metrics.paddingX * 2;
                var x = horizontal === "left" ? metrics.inset
                    : canvasWidth - width - metrics.inset;
                var y = vertical === "top"
                    ? metrics.inset + index * (metrics.height + metrics.gap)
                    : canvasHeight - metrics.inset - metrics.height -
                        index * (metrics.height + metrics.gap);
                context.fillStyle = "rgba(0, 0, 0, 0.55)";
                roundedRect(x, y, width, metrics.height, fontSize * 0.6);
                context.fill();
                context.fillStyle = "#ffffff";
                context.textAlign = "left";
                context.textBaseline = "middle";
                context.fillText(text, x + metrics.paddingX, y + metrics.height / 2);
            });
        }

        function drawGofishMeshLogo(labels, canvasWidth, canvasHeight) {
            if (window.innerWidth <= 768) return;
            var metrics = labelMetrics(canvasHeight);
            var stackHeight = labels.length * metrics.height +
                Math.max(0, labels.length - 1) * metrics.gap;
            var preferredSize = Math.round(Math.max(88,
                Math.min(132, metrics.fontSize * 4.5)));
            // Desktop contains the square fisheye video inside a wide canvas. The
            // unused side band is genuinely black, so size the card to that band.
            var blackMargin = Math.max(0, (canvasWidth - canvasHeight) / 2);
            var logoSize = Math.min(preferredSize,
                Math.floor(blackMargin - metrics.inset * 2));
            var logoGap = Math.max(7, metrics.gap * 1.5);
            var x = metrics.inset;
            var y = canvasHeight - metrics.inset - stackHeight - logoGap - logoSize;

            // Square/mobile layouts have no black side band. Hide the supplementary
            // mark instead of shrinking it or letting it cover the footage.
            if (logoSize < 80 || y < metrics.inset) return;
            if (!gofishLogoReady) {
                loadGofishLogo();
                return;
            }

            context.save();
            context.shadowColor = "rgba(0, 0, 0, 0.3)";
            context.shadowBlur = 6;
            context.drawImage(gofishLogo, x, y, logoSize, logoSize);
            context.restore();
        }

        function renderMetricLabels(methodKey, methodLabel) {
            var sceneIndex = activeDataset().metricScenes.indexOf(state.scene);
            var datasetMetrics = state.dataset === "fullcircle"
                ? FULLCIRCLE_RENDER_METRICS
                : RENDER_METRICS;
            var metrics = datasetMetrics[methodKey];
            var psnr = metrics && metrics.psnr[sceneIndex];
            var lpips = metrics && metrics.lpips[sceneIndex];
            return [
                methodLabel,
                (psnr || "—") + " PSNR",
                (lpips || "—") + " LPIPS"
            ];
        }

        function meshMetricLabels(methodKey, methodLabel) {
            if (state.dataset === "fullcircle") return [methodLabel];
            var sceneIndex = activeDataset().metricScenes.indexOf(state.scene);
            var metrics = MESH_METRICS[methodKey];
            var fScore = metrics && metrics.f[sceneIndex];
            if (!fScore) return [methodLabel];
            // Bottom-anchored stacks are drawn from the corner upward, so the
            // F-score comes first here to display the method above it.
            return [fScore + " F-score", methodLabel];
        }

        function drawDividers(splitX, splitY, width, height, hasBaselineMesh) {
            var handleRadius = Math.max(14, Math.min(21, width / 40));
            var arrowSize = Math.max(3.5, handleRadius * 0.24);
            var arrowOffset = Math.max(4, handleRadius * 0.24);
            context.save();
            context.strokeStyle = "rgba(255, 255, 255, 0.96)";
            context.fillStyle = "#ffffff";
            context.lineWidth = 2;
            context.shadowColor = "rgba(0, 0, 0, 0.85)";
            context.shadowBlur = 8;

            context.beginPath();
            context.moveTo(splitX, 0);
            context.lineTo(splitX, Math.max(0, splitY - handleRadius));
            context.moveTo(splitX, Math.min(height, splitY + handleRadius));
            context.lineTo(splitX, height);
            context.moveTo(0, splitY);
            context.lineTo(Math.max(0, splitX - handleRadius), splitY);
            if (hasBaselineMesh) {
                context.moveTo(Math.min(width, splitX + handleRadius), splitY);
                context.lineTo(width, splitY);
            }
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

        function paint() {
            var size = canvasSize();
            var width = size.width;
            var height = size.height;
            var splitX = Math.round(width * state.splitX);
            var splitY = Math.round(height * state.splitY);
            var method = activeMethod();
            var hasBaselineMesh = Boolean(method.mesh);
            var gofishRenderLabels = renderMetricLabels("gofish", "GOFish (Ours)");
            var gofishMeshLabels = meshMetricLabels("gofish", "GOFish Mesh");
            gofishMeshLabels.unshift("Full " + activeDataset().fullFov);
            var baselineRenderLabels = renderMetricLabels(state.method, method.label);
            var baselineMeshLabels = hasBaselineMesh
                ? meshMetricLabels(state.method, method.label + " Mesh")
                : null;
            if (baselineMeshLabels) baselineMeshLabels.unshift(activeMethodFov());

            context.clearRect(0, 0, width, height);
            context.fillStyle = VIEWER_BLACK;
            context.fillRect(0, 0, width, height);

            drawPanel(videos["gofish-render"], 0, 0, splitX, splitY, width, height);
            drawPanel(videos["gofish-mesh"], 0, splitY, splitX, height - splitY, width, height);

            if (hasBaselineMesh) {
                drawPanel(videos["baseline-render"], splitX, 0, width - splitX, splitY, width, height);
                drawPanel(videos["baseline-mesh"], splitX, splitY,
                    width - splitX, height - splitY, width, height);
            } else {
                drawPanel(videos["baseline-render"], splitX, 0,
                    width - splitX, height, width, height);
            }

            drawDividers(splitX, splitY, width, height, hasBaselineMesh);
            drawLabelStack(gofishRenderLabels,
                "left", "top", width, height, 0);
            drawLabelStack(gofishMeshLabels,
                "left", "bottom", width, height, gofishMeshLabels.length - 1);
            drawGofishMeshLogo(gofishMeshLabels, width, height);
            drawLabelStack(baselineRenderLabels,
                "right", "top", width, height, 0);
            if (hasBaselineMesh) {
                drawLabelStack(baselineMeshLabels,
                    "right", "bottom", width, height, baselineMeshLabels.length - 1);
            } else {
                drawLabelStack([activeMethodFov()],
                    "right", "bottom", width, height, -1);
            }
        }

        function updateAriaValue() {
            var x = Math.round(state.splitX * 100);
            var y = Math.round(state.splitY * 100);
            canvas.setAttribute("aria-valuenow", String(x));
            canvas.setAttribute("aria-valuetext",
                "Vertical divider at " + x + " percent and horizontal divider at " + y + " percent");
        }

        function setDividers(clientX, clientY) {
            var rect = canvas.getBoundingClientRect();
            state.splitX = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
            state.splitY = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
            updateAriaValue();
            paint();
        }

        function stopFrameLoop() {
            if (state.frameRequest !== null) cancelAnimationFrame(state.frameRequest);
            state.frameRequest = null;
        }

        function activeReadyVideos() {
            return activeRoles().map(function (role) { return videos[role]; }).filter(videoReady);
        }

        function activeSourcesSettled() {
            return activeRoles().every(function (role) {
                return videos[role].dataset.loadState !== "loading";
            });
        }

        function wrappedTimeDifference(videoTime, masterTime, duration) {
            var difference = videoTime - masterTime;
            if (!isFinite(duration) || duration <= 0) return difference;
            if (difference > duration / 2) difference -= duration;
            if (difference < -duration / 2) difference += duration;
            return difference;
        }

        function syncVideos(now) {
            if (now - state.lastSync < 400) return;
            state.lastSync = now;
            var master = videoReady(videos["gofish-render"])
                ? videos["gofish-render"]
                : videos["baseline-render"];
            if (!videoReady(master)) return;
            var masterTime = master.currentTime;
            master.playbackRate = 1;
            activeReadyVideos().forEach(function (video) {
                if (video === master || !video.duration || video.seeking) return;
                var duration = Math.min(video.duration, master.duration || video.duration);
                var difference = wrappedTimeDifference(video.currentTime, masterTime, duration);
                if (Math.abs(difference) > 0.75) {
                    try {
                        video.currentTime = Math.min(masterTime, Math.max(0, video.duration - 0.04));
                    } catch (error) { /* Metadata may still be settling. */ }
                    video.playbackRate = 1;
                } else if (difference > 0.08) {
                    video.playbackRate = 0.97;
                } else if (difference < -0.08) {
                    video.playbackRate = 1.03;
                } else {
                    video.playbackRate = 1;
                }
            });
        }

        function frameLoop(now) {
            state.frameRequest = null;
            if (!state.wantsPlayback || !state.onScreen || document.hidden) return;
            syncVideos(now);
            paint();
            state.frameRequest = requestAnimationFrame(frameLoop);
        }

        function ensureFrameLoop() {
            if (state.frameRequest === null && state.wantsPlayback && state.onScreen && !document.hidden) {
                state.frameRequest = requestAnimationFrame(frameLoop);
            }
        }

        function pauseAll() {
            Object.keys(videos).forEach(function (role) {
                videos[role].pause();
                videos[role].playbackRate = 1;
                captureVideoFrame(videos[role]);
            });
            stopFrameLoop();
        }

        function playAll() {
            if (!state.wantsPlayback || !state.onScreen || document.hidden) return;
            if (!activeSourcesSettled()) return;
            var ready = activeReadyVideos();
            var master = videoReady(videos["gofish-render"])
                ? videos["gofish-render"]
                : videos["baseline-render"];
            if (!videoReady(master)) return;

            if (state.needsAlignment) {
                ready.forEach(function (video) {
                    if (video === master) return;
                    try { video.currentTime = master.currentTime; } catch (error) { /* Ignore. */ }
                });
                state.needsAlignment = false;
            }

            var masterPlay = master.play();
            if (masterPlay && typeof masterPlay.catch === "function") {
                masterPlay.catch(function () {
                    state.wantsPlayback = false;
                    state.autoplayBlocked = true;
                    pauseAll();
                    updateStatus();
                    paint();
                });
            }
            ready.forEach(function (video) {
                if (video === master) return;
                var promise = video.play();
                if (promise && typeof promise.catch === "function") promise.catch(function () { });
            });
            ensureFrameLoop();
        }

        function togglePlayback() {
            state.wantsPlayback = !state.wantsPlayback;
            state.autoplayBlocked = false;
            if (state.wantsPlayback) playAll();
            else pauseAll();
            updateStatus();
            paint();
        }

        function clearVideo(video) {
            video.pause();
            video.onerror = null;
            video.onloadeddata = null;
            video.oncanplay = null;
            video.onseeked = null;
            video.removeAttribute("src");
            video.load();
            video.playbackRate = 1;
            video.dataset.loadState = "unused";
            delete video.dataset.loadedUrl;
            delete video.dataset.mediaError;
            var cache = frameCaches[video.dataset.comparisonRole];
            if (cache) {
                cache.ready = false;
                if (cache.context && cache.canvas.width && cache.canvas.height) {
                    cache.context.clearRect(0, 0, cache.canvas.width, cache.canvas.height);
                }
            }
        }

        function sourceUrl(suffix, extension) {
            var url = videoRoot + state.scene + "_" + suffix + extension;
            return videoVersion ? url + "?v=" + encodeURIComponent(videoVersion) : url;
        }

        function h264SourceUrl(suffix) {
            return h264Root + state.scene + "_" + suffix + ".mp4";
        }

        function sourceCandidates(suffixes) {
            var urls = [];
            suffixes.forEach(function (suffix) {
                if (supportsAv1) {
                    urls.push(sourceUrl(suffix, ".av1.mp4"));
                }
                urls.push(h264SourceUrl(suffix));
            });
            return urls;
        }

        function loadCandidates(video, suffixes, tokenKey) {
            var token = state[tokenKey];
            function current() { return token === state[tokenKey]; }
            clearVideo(video);
            video.dataset.loadState = "loading";
            var candidates = sourceCandidates(suffixes);
            var index = 0;

            function finishReady() {
                if (!current()) return;
                video.onseeked = null;
                video.dataset.loadState = "ready";
                captureVideoFrame(video);
                settleSelection();
                paint();
            }

            function alignThenFinish() {
                var role = video.dataset.comparisonRole;
                var master = videos["gofish-render"];
                if (role === "gofish-render" || !videoReady(master) ||
                    !isFinite(video.duration) || video.duration <= 0) {
                    finishReady();
                    return;
                }

                var targetTime = master.currentTime % video.duration;
                targetTime = Math.min(targetTime, Math.max(0, video.duration - 0.04));
                if (Math.abs(video.currentTime - targetTime) <= 0.04) {
                    finishReady();
                    return;
                }

                video.onseeked = finishReady;
                try {
                    video.currentTime = targetTime;
                } catch (error) {
                    finishReady();
                }
            }

            function tryNext() {
                if (!current()) return;
                if (index >= candidates.length) {
                    delete panelTransitions[video.dataset.comparisonRole];
                    video.dataset.loadState = "missing";
                    video.removeAttribute("src");
                    video.load();
                    settleSelection();
                    paint();
                    return;
                }
                var url = candidates[index++];
                video.dataset.loadedUrl = url;
                delete video.dataset.mediaError;
                video.onerror = function () {
                    if (video.error) {
                        video.dataset.mediaError = video.error.code + ":" +
                            (video.error.message || "media load failed");
                    }
                    if (current()) tryNext();
                };
                video.onloadeddata = function () {
                    if (!current()) return;
                    alignThenFinish();
                };
                video.oncanplay = function () {
                    if (!current()) return;
                    captureVideoFrame(video);
                    paint();
                };
                video.src = url;
                video.load();
            }

            tryNext();
        }

        function updateStatus() {
            if (!status) return;
            var missing = activeRoles().filter(function (role) {
                return videos[role].dataset.loadState === "missing";
            }).map(function (role) { return ROLE_LABELS[role]; });
            var text = activeDataset().label + " · " + state.scene.replace("FullCircle_", "") +
                " · " + activeMethod().label;
            if (missing.length) text += " · " + missing.join(" and ") + " coming soon";
            if (state.autoplayBlocked) text += " · Click the viewer to play";
            status.textContent = text;
        }

        function settleSelection() {
            var roles = activeRoles();
            var stillLoading = roles.some(function (role) {
                return videos[role].dataset.loadState === "loading";
            });
            if (!stillLoading && loading) loading.hidden = true;
            updateStatus();
            if (!stillLoading && state.wantsPlayback) playAll();
        }

        function markSelection() {
            datasetButtons.forEach(function (button) {
                var active = button.dataset.dataset === state.dataset;
                button.classList.toggle("is-active", active);
                button.setAttribute("aria-checked", active ? "true" : "false");
            });
            scenePickers.forEach(function (picker) {
                var active = picker.dataset.sceneDataset === state.dataset;
                picker.classList.toggle("is-active", active);
                picker.setAttribute("aria-hidden", active ? "false" : "true");
                picker.inert = !active;
            });
            sceneButtons.forEach(function (button) {
                var active = button.dataset.dataset === state.dataset &&
                    button.dataset.scene === state.scene;
                button.classList.toggle("is-active", active);
                button.setAttribute("aria-pressed", active ? "true" : "false");
            });
            methodButtons.forEach(function (button) {
                var active = button.dataset.method === state.method;
                button.classList.toggle("is-active", active);
                button.setAttribute("aria-checked", active ? "true" : "false");
            });
        }

        function loadSelection(changeType) {
            state.selectionLoaded = true;
            state.baselineToken += 1;
            if (changeType !== "method") state.gofishToken += 1;
            state.needsAlignment = true;
            var method = activeMethod();
            var hasSnapshot = false;

            if (changeType === "method") {
                hasSnapshot = snapshotPanel("baseline-render");
                if (method.mesh) {
                    hasSnapshot = snapshotPanel("baseline-mesh", "baseline-render") || hasSnapshot;
                }
            } else {
                pauseAll();
                if (changeType === "scene" || changeType === "dataset") {
                    activeRoles().forEach(function (role) {
                        hasSnapshot = snapshotPanel(role) || hasSnapshot;
                    });
                }
            }

            if (loading) {
                loading.hidden = hasSnapshot || changeType === "method";
                loading.textContent = "Loading " + activeDataset().label + " " +
                    state.scene.replace("FullCircle_", "") + "…";
            }
            markSelection();

            if (changeType !== "method") {
                loadCandidates(videos["gofish-render"], activeDataset().gofishRender, "gofishToken");
                loadCandidates(videos["gofish-mesh"], ["gofish_mesh"], "gofishToken");
            }
            loadCandidates(videos["baseline-render"], method.render, "baselineToken");
            if (method.mesh) loadCandidates(videos["baseline-mesh"], method.mesh, "baselineToken");
            else {
                delete panelTransitions["baseline-mesh"];
                clearVideo(videos["baseline-mesh"]);
            }
            updateStatus();
            paint();
        }

        sceneButtons.forEach(function (button) {
            button.addEventListener("click", function () {
                if (button.dataset.scene === state.scene) return;
                state.dataset = button.dataset.dataset;
                state.scene = button.dataset.scene;
                loadSelection("scene");
            });
        });

        datasetButtons.forEach(function (button, index) {
            button.addEventListener("click", function () {
                var datasetKey = button.dataset.dataset;
                if (!DATASETS[datasetKey] || datasetKey === state.dataset) return;
                state.dataset = datasetKey;
                state.scene = DATASETS[datasetKey].firstScene;
                scenePickers.forEach(function (picker) {
                    if (picker.dataset.sceneDataset === datasetKey) picker.scrollTop = 0;
                });
                loadSelection("dataset");
            });
            button.addEventListener("keydown", function (event) {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown" &&
                    event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                var forward = event.key === "ArrowDown" || event.key === "ArrowRight";
                var next = (index + (forward ? 1 : -1) + datasetButtons.length) %
                    datasetButtons.length;
                datasetButtons[next].focus();
                datasetButtons[next].click();
            });
        });

        methodButtons.forEach(function (button, index) {
            button.addEventListener("click", function () {
                if (!METHODS[button.dataset.method] || button.dataset.method === state.method) return;
                state.method = button.dataset.method;
                loadSelection("method");
            });
            button.addEventListener("keydown", function (event) {
                if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
                event.preventDefault();
                var direction = event.key === "ArrowRight" ? 1 : -1;
                var next = (index + direction + methodButtons.length) % methodButtons.length;
                methodButtons[next].focus();
                methodButtons[next].click();
            });
        });

        canvas.addEventListener("mousemove", function (event) {
            setDividers(event.clientX, event.clientY);
        }, { passive: true });

        canvas.addEventListener("mouseleave", function () {
            state.splitX = 0.5;
            state.splitY = 0.5;
            updateAriaValue();
            paint();
        }, { passive: true });

        canvas.addEventListener("touchstart", function (event) {
            var touch = event.touches[0];
            var rect = canvas.getBoundingClientRect();
            var handleX = rect.left + rect.width * state.splitX;
            var handleY = rect.top + rect.height * state.splitY;
            state.touchDragging = Math.hypot(touch.clientX - handleX, touch.clientY - handleY) < 52;
            state.suppressClick = false;
            if (state.touchDragging && event.cancelable) event.preventDefault();
        }, { passive: false });

        canvas.addEventListener("touchmove", function (event) {
            if (!state.touchDragging) return;
            if (event.cancelable) event.preventDefault();
            state.suppressClick = true;
            setDividers(event.touches[0].clientX, event.touches[0].clientY);
        }, { passive: false });

        canvas.addEventListener("touchend", function () {
            state.touchDragging = false;
        }, { passive: true });

        canvas.addEventListener("click", function () {
            if (state.suppressClick) {
                state.suppressClick = false;
                return;
            }
            togglePlayback();
        });

        canvas.addEventListener("keydown", function (event) {
            var step = event.shiftKey ? 0.08 : 0.025;
            if (event.key === "ArrowLeft") state.splitX = Math.max(0, state.splitX - step);
            else if (event.key === "ArrowRight") state.splitX = Math.min(1, state.splitX + step);
            else if (event.key === "ArrowUp") state.splitY = Math.max(0, state.splitY - step);
            else if (event.key === "ArrowDown") state.splitY = Math.min(1, state.splitY + step);
            else if (event.key === "Home") {
                state.splitX = 0.5;
                state.splitY = 0.5;
            } else if (event.key === " " || event.key === "Enter") {
                event.preventDefault();
                togglePlayback();
                return;
            } else return;
            event.preventDefault();
            updateAriaValue();
            paint();
        });

        if ("ResizeObserver" in window) {
            new ResizeObserver(resizeCanvas).observe(container);
        } else {
            window.addEventListener("resize", resizeCanvas);
        }

        if ("IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    state.onScreen = entry.isIntersecting;
                    if (state.onScreen) {
                        if (!state.selectionLoaded) loadSelection("initial");
                        else if (state.wantsPlayback) playAll();
                    } else {
                        pauseAll();
                    }
                });
            }, { rootMargin: "120px 0px", threshold: 0.01 }).observe(module);
        }

        document.addEventListener("visibilitychange", function () {
            if (document.hidden) pauseAll();
            else if (state.onScreen && state.wantsPlayback) playAll();
        });

        resizeCanvas();
        updateAriaValue();
        markSelection();
        paint();
        if (!("IntersectionObserver" in window)) loadSelection("initial");
    }
})();

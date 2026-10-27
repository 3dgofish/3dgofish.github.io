import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';

const loader = new PLYLoader();

async function decompressPly(compressed) {
    if ('DecompressionStream' in window) {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).arrayBuffer();
    }
    const { gunzipSync } = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
    const decompressed = gunzipSync(new Uint8Array(compressed));
    return decompressed.buffer.slice(
        decompressed.byteOffset,
        decompressed.byteOffset + decompressed.byteLength
    );
}

async function fetchWithProgress(url, onProgress) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load ${url} (${response.status})`);
    const total = Number(response.headers.get('content-length')) || 0;
    if (!response.body || !total) {
        onProgress(null);
        return response.arrayBuffer();
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onProgress(Math.min(received / total, 1));
    }

    const compressed = new Uint8Array(received);
    let offset = 0;
    chunks.forEach(chunk => {
        compressed.set(chunk, offset);
        offset += chunk.byteLength;
    });
    return compressed.buffer;
}

function geometryFor(url, onProgress) {
    return fetchWithProgress(url, onProgress).then(decompressPly).then(buffer => {
        const geometry = loader.parse(buffer);
        if (!geometry.hasAttribute('normal')) geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        return geometry;
    });
}

function frameGeometry(camera, controls, geometry) {
    const sphere = geometry.boundingSphere;
    const radius = Math.max(sphere.radius, 0.1);
    const direction = new THREE.Vector3(1.45, 1.05, 1.45).normalize();
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction, radius * 4.0);
    camera.near = Math.max(radius / 100, 0.001);
    camera.far = radius * 40;
    camera.updateProjectionMatrix();
    controls.minDistance = radius * 0.45;
    controls.maxDistance = radius * 12;
    controls.update();
}

export function initPlyViewer(initialButton = null) {
    const host = document.getElementById('ply-viewer');
    const layout = document.querySelector('.viewer-layout');
    const thumbnails = Array.from(document.querySelectorAll('.viewer-thumbnail'));
    if (!host || !layout || thumbnails.length === 0 || host.dataset.viewerInitialized) return;
    host.dataset.viewerInitialized = 'true';

    const status = host.querySelector('.viewer-status');
    const statusText = document.getElementById('ply-status-text');
    const progress = document.getElementById('ply-progress');
    const progressBar = document.getElementById('ply-progress-bar');
    const downloadLink = document.getElementById('ply-download');

    const setStatus = (message, amount, showProgress = true) => {
        status.hidden = false;
        statusText.textContent = message;
        progress.hidden = !showProgress;
        if (amount === null) {
            progressBar.style.width = '35%';
        } else {
            progressBar.style.width = `${Math.round((amount || 0) * 100)}%`;
        }
    };

    if (!window.WebGLRenderingContext) {
        setStatus('Interactive 3D viewing is not supported by this browser.', 0, false);
        return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    camera.position.set(1.45, 1.05, 1.45);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = false;
    controls.update();

    scene.add(new THREE.HemisphereLight(0xffffff, 0x64748b, 2.1));
    const key = new THREE.DirectionalLight(0xffffff, 2.7);
    key.position.set(2.5, 3.5, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 1.1);
    fill.position.set(-3, 0.5, -2);
    scene.add(fill);

    let drawable = null;
    let requestId = 0;
    const render = () => renderer.render(scene, camera);
    controls.addEventListener('change', render);

    const sizeLayout = () => {
        const width = layout.clientWidth;
        const rootSize = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
        const columnGap = 0.75 * rootSize;
        const thumbnailGap = 0.5 * rootSize;
        const count = thumbnails.length;
        const thumbnailSize = Math.max(
            1,
            (width - columnGap - (count - 1) * thumbnailGap) / (count + 1)
        );
        const viewerSize = width - columnGap - thumbnailSize;
        layout.style.setProperty('--viewer-thumb-size', `${thumbnailSize}px`);
        layout.style.setProperty('--viewer-size', `${viewerSize}px`);
    };

    const resize = () => {
        sizeLayout();
        const width = Math.max(host.clientWidth, 1);
        const height = Math.max(host.clientHeight, 1);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        render();
    };
    new ResizeObserver(resize).observe(layout);
    resize();

    async function loadObject(objectId, button) {
        const currentRequest = ++requestId;
        setStatus(`Loading object ${objectId}… 0%`, 0);
        thumbnails.forEach(thumbnail => {
            const active = thumbnail === button;
            thumbnail.classList.toggle('is-active', active);
            thumbnail.setAttribute('aria-pressed', active ? 'true' : 'false');
        });

        try {
            const geometry = await geometryFor(
                `./static/models/${objectId}/feature_refinement.ply.gz`,
                amount => {
                    if (currentRequest !== requestId) return;
                    if (amount === null) {
                        setStatus(`Loading object ${objectId}…`, null);
                    } else {
                        setStatus(`Loading object ${objectId}… ${Math.round(amount * 100)}%`, amount);
                    }
                }
            );
            if (currentRequest !== requestId) return;
            setStatus('Preparing 3D view…', 1);
            if (drawable) {
                scene.remove(drawable);
                drawable.geometry.dispose();
                drawable.material.dispose();
            }
            const hasColor = geometry.hasAttribute('color');
            const material = new THREE.MeshStandardMaterial({
                vertexColors: hasColor,
                color: hasColor ? 0xffffff : 0xdbeafe,
                roughness: 0.72,
                metalness: 0.02,
                side: THREE.DoubleSide
            });
            drawable = new THREE.Mesh(geometry, material);
            scene.add(drawable);
            frameGeometry(camera, controls, geometry);
            status.hidden = true;
            if (downloadLink) {
                downloadLink.href = `./static/models/${objectId}/feature_refinement.ply.gz`;
                downloadLink.download = `unibrep-${objectId}-feature_refinement.ply.gz`;
                downloadLink.setAttribute(
                    'aria-label',
                    `Download full-resolution PLY object ${objectId}`
                );
                downloadLink.title = `Download object ${objectId} (full-resolution PLY)`;
                downloadLink.removeAttribute('aria-disabled');
            }
            render();
        } catch (error) {
            if (currentRequest !== requestId) return;
            setStatus(
                window.location.protocol === 'file:'
                    ? 'Run the included local server before using the 3D viewer.'
                    : 'Unable to load this object.',
                0,
                false
            );
            console.error(error);
        }
    }

    thumbnails.forEach(button => {
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => loadObject(button.dataset.object, button));
    });

    const firstButton = initialButton && thumbnails.includes(initialButton)
        ? initialButton
        : thumbnails[0];
    loadObject(firstButton.dataset.object, firstButton);
}

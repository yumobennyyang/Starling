// Trevally Tornado Simulation - Helical Conveyor Model
// Bigeye trevally courtship: helical ascent -> peel at apex -> peripheral descent -> re-entry at base

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

// ===== PARAMETERS (OBSERVATION-ALIGNED) =====

// Population
const numFish = 1200;

// Cylinder geometry
const cylinderRadius = 12;       // nominal radius of the column
const wallThickness = 1;         // thickness of fish layer
const cylinderHeight = 45;       // full height (centered on y=0)
const halfH = cylinderHeight * 0.5;

// Rings (inner for ascent, outer for descent)
const innerRing = cylinderRadius - wallThickness * 0.1;
const outerRing = cylinderRadius + wallThickness * 0.1;

// Helix & rotation
const baseTangentialSpeed = 0.9; // linear tangential speed along ring (m/s-ish)
const risePerTurn = 60;         // ascent per 360° revolution (meters per turn)
const peelHeight = halfH * 0.78; // start peeling outward near the top
const reentryHeight = -halfH * 0.78; // pull inward near the bottom

// Descent
const descentSpeed = 1.2;       // downward vertical speed during peripheral descent
const peelOutwardGain = 0.9;     // radial push at top
const reenterInwardGain = 0.9;   // radial pull at bottom

// Local interactions (kept minimal; separation only to prevent overlap)
const separationRadius = 2.0;
const separationWeight = 1.2;

// Dynamics caps
const minSpeed = 1.8;
const maxSpeed = 4.2;
const maxAccel = 0.2;

// Visual
const fishColor = 0xffffff;

// Cursor-based speed control
let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let speedMultiplier = 1.0;
const maxSpeedMultiplier = 5.0;  // Maximum speed when cursor is at center
const minSpeedMultiplier = 0.1;  // Minimum speed when cursor is far from center

// ===== SCENE =====
let scene, camera, renderer;
let fish = [];
let time = 0;
let specialFish = null;
let specialFishIndex = 0;

let specialFishForces = {
    separation: new THREE.Vector3(),
    vortex: new THREE.Vector3()
};

function init() {
    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 10, 200);
    camera.position.set(0, 0, 100);
    camera.lookAt(0, 0, 0);

    const container = document.getElementById('fish');
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    initFish();

    window.addEventListener('resize', onWindowResize);
    window.addEventListener('mousemove', onMouseMove);
    animate();
}

function onMouseMove(event) {
    mouseX = event.clientX;
    mouseY = event.clientY;

    // Calculate distance from center of screen
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const dx = mouseX - centerX;
    const dy = mouseY - centerY;
    const distanceFromCenter = Math.sqrt(dx * dx + dy * dy);

    // Calculate maximum possible distance (corner to center)
    const maxDistance = Math.sqrt(centerX * centerX + centerY * centerY);

    // Normalize distance (0 = center, 1 = corner)
    const normalizedDistance = Math.min(distanceFromCenter / maxDistance, 1.0);

    // Speed multiplier: faster at center (distance = 0), slower at edges (distance = 1)
    speedMultiplier = maxSpeedMultiplier - (normalizedDistance * (maxSpeedMultiplier - minSpeedMultiplier));
}

function initFish() {
    const geometry = new THREE.BufferGeometry();
    const positions = [];

    for (let i = 0; i < numFish; i++) {
        // start everyone near inner ring at random height/angle
        const theta = Math.random() * Math.PI * 2;
        const r = innerRing + (Math.random() - 0.5) * 0.4; // tight around inner ring
        const y = -halfH + Math.random() * 5;

        const x = r * Math.cos(theta);
        const z = r * Math.sin(theta);

        positions.push(x, y, z);

        // initial velocity tangent + slight upward (helical start)
        const angSpeed = baseTangentialSpeed / Math.max(innerRing, 0.1); // rad/s
        const targetVzUp = (angSpeed / (2 * Math.PI)) * risePerTurn;    // m/s upward

        const vx = -Math.sin(theta) * baseTangentialSpeed;
        const vz = Math.cos(theta) * baseTangentialSpeed;
        const vy = targetVzUp;

        fish.push({
            pos: new THREE.Vector3(x, y, z),
            vel: new THREE.Vector3(vx, vy, vz),
            acc: new THREE.Vector3(),
            theta,
            radius: r,
            mode: 'ascend', // 'ascend' or 'descend'
            neighbors: []
        });
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        color: fishColor,
        size: 1.5,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    window.fishGeometry = geometry;
    window.fishPoints = points;

    // Special red fish
    const specialGeometry = new THREE.BufferGeometry();
    const specialPosition = new Float32Array(3);
    specialPosition[0] = fish[specialFishIndex].pos.x;
    specialPosition[1] = fish[specialFishIndex].pos.y;
    specialPosition[2] = fish[specialFishIndex].pos.z;
    specialGeometry.setAttribute('position', new THREE.BufferAttribute(specialPosition, 3));

    const specialMaterial = new THREE.PointsMaterial({
        color: 0xffff00,  // Yellow
        size: 1.8,
        sizeAttenuation: true,
        transparent: true,
        opacity: 1,
        depthTest: false  // Render on top
    });

    specialFish = new THREE.Points(specialGeometry, specialMaterial);
    scene.add(specialFish);
}

// ===== CORE DYNAMICS =====

function updateFish(dt) {
    // Apply speed multiplier based on cursor position
    const scaledDt = dt * speedMultiplier;

    time += dt;

    // reset special forces
    specialFishForces.separation.set(0, 0, 0);
    specialFishForces.vortex.set(0, 0, 0);

    // reset acc & neighbor lists
    for (let f of fish) {
        f.acc.set(0, 0, 0);
        f.neighbors.length = 0;
    }

    // naive neighbor pass (enough for separation)
    for (let i = 0; i < fish.length; i++) {
        const a = fish[i];
        for (let j = i + 1; j < fish.length; j++) {
            const b = fish[j];
            const d2 = a.pos.distanceToSquared(b.pos);
            if (d2 < cohesionRadiusSq) { // loose prefilter
                a.neighbors.push(b);
                b.neighbors.push(a);
            }
        }
    }

    // apply forces
    for (let i = 0; i < fish.length; i++) {
        const f = fish[i];
        const isSpecial = (i === specialFishIndex);

        // Vortex (dominant): helical ascent or peripheral descent
        const vForce = vortexConveyorForce(f);
        f.acc.add(vForce);
        if (isSpecial) specialFishForces.vortex.copy(vForce);

        // Minimal separation
        const sep = separationForce(f);
        f.acc.add(sep.multiplyScalar(separationWeight));
        if (isSpecial) specialFishForces.separation.copy(sep);

        // limit accel
        const aLen = f.acc.length();
        if (aLen > maxAccel) f.acc.multiplyScalar(maxAccel / aLen);

        // integrate vel/pos
        f.vel.add(f.acc);
        // clamp speed
        let sp = f.vel.length();
        if (sp < minSpeed) {
            f.vel.multiplyScalar(minSpeed / (sp || 1e-6));
            sp = minSpeed;
        } else if (sp > maxSpeed) {
            f.vel.multiplyScalar(maxSpeed / sp);
            sp = maxSpeed;
        }

        f.pos.addScaledVector(f.vel, scaledDt);

        // track theta & radius
        f.theta = Math.atan2(f.pos.z, f.pos.x);
        f.radius = Math.hypot(f.pos.x, f.pos.z);

        // state transitions: peel at top, re-enter at bottom
        if (f.mode === 'ascend' && f.pos.y >= peelHeight) {
            f.mode = 'descend';
        } else if (f.mode === 'descend' && f.pos.y <= reentryHeight) {
            f.mode = 'ascend';
            // Immediately set vertical velocity to ascent speed to prevent lingering
            const angSpeed = baseTangentialSpeed / Math.max(innerRing, 0.1);
            const targetVy = (angSpeed / (2 * Math.PI)) * risePerTurn;
            f.vel.y = targetVy;
        }

        // vertical wrap is no longer used; the conveyor handles cycling
        // keep within vertical bounds softly
        if (f.pos.y > halfH) f.pos.y = halfH;
        if (f.pos.y < -halfH) f.pos.y = -halfH;
    }

    updateGeometry();
}

// prefilter radius for neighbors (keep modest)
const cohesionRadiusSq = 10 * 10;

function separationForce(f) {
    const steer = new THREE.Vector3();
    let count = 0;
    for (const other of f.neighbors) {
        const d = f.pos.distanceTo(other.pos);
        if (d > 0 && d < separationRadius) {
            const away = f.pos.clone().sub(other.pos).multiplyScalar(1 / d);
            steer.add(away);
            count++;
        }
    }
    if (count > 0) {
        steer.divideScalar(count);
    }
    return steer;
}

function vortexConveyorForce(f) {
    // Tangential direction at current angle
    const tangent = new THREE.Vector3(-Math.sin(f.theta), 0, Math.cos(f.theta));

    // Desired ring & vertical behavior based on mode
    let targetRadius, targetVy;

    if (f.mode === 'ascend') {
        // helical ascent along inner ring
        targetRadius = innerRing;
        const angSpeed = baseTangentialSpeed / Math.max(targetRadius, 0.1); // rad/s
        targetVy = (angSpeed / (2 * Math.PI)) * risePerTurn;               // m/s up

    } else { // 'descend'
        // peripheral descent along outer ring
        targetRadius = outerRing;
        targetVy = -descentSpeed;
    }

    // --- Tangential speed control (keeps the swirl turning)
    const desiredTangential = tangent.clone().multiplyScalar(baseTangentialSpeed);
    const tangentialDelta = desiredTangential.sub(new THREE.Vector3(f.vel.x, 0, f.vel.z));
    const tangentialForce = tangentialDelta.multiplyScalar(0.4); // smoothing gain

    // --- Radial control: hold to target ring (and peel/re-enter shaping)
    // current radial direction
    const radialDir = new THREE.Vector3(Math.cos(f.theta), 0, Math.sin(f.theta));
    const radialError = (targetRadius - f.radius);

    // stronger push when transitioning at top/bottom
    let radialGain = 0.6;
    if (f.mode === 'ascend' && f.pos.y >= peelHeight) radialGain = peelOutwardGain;      // peel out
    if (f.mode === 'descend' && f.pos.y <= reentryHeight) radialGain = reenterInwardGain; // pull in

    const radialForce = radialDir.multiplyScalar(radialError * radialGain);

    // --- Vertical control (sets the helix's pitch or descent)
    const vyError = targetVy - f.vel.y;
    const verticalForce = new THREE.Vector3(0, vyError * 0.6, 0);

    // --- Gentle axial centering (keeps column straight)
    const axialCenterForce = new THREE.Vector3(0, -f.pos.y * 0.02, 0);

    // Sum
    const force = new THREE.Vector3();
    force.add(tangentialForce);
    force.add(radialForce);
    force.add(verticalForce);
    force.add(axialCenterForce);

    return force;
}

function updateGeometry() {
    const positions = window.fishGeometry.attributes.position.array;

    for (let i = 0; i < fish.length; i++) {
        positions[i * 3] = fish[i].pos.x;
        positions[i * 3 + 1] = fish[i].pos.y;
        positions[i * 3 + 2] = fish[i].pos.z;
    }

    window.fishGeometry.attributes.position.needsUpdate = true;

    if (specialFish) {
        const a = specialFish.geometry.attributes.position.array;
        a[0] = fish[specialFishIndex].pos.x;
        a[1] = fish[specialFishIndex].pos.y;
        a[2] = fish[specialFishIndex].pos.z;
        specialFish.geometry.attributes.position.needsUpdate = true;
    }
}

function displayStats() {
    const fishDiv = document.getElementById('fish');
    const isActive = fishDiv && fishDiv.classList.contains('active');
    let statsDiv = document.getElementById('fish-stats');

    if (!isActive) {
        if (statsDiv) statsDiv.style.display = 'none';
        return;
    }

    if (!fish[specialFishIndex]) return;

    const f = fish[specialFishIndex];
    const speed = f.vel.length();

    if (!statsDiv) {
        statsDiv = document.createElement('div');
        statsDiv.id = 'fish-stats';
        statsDiv.style.position = 'fixed';
        statsDiv.style.bottom = '7px';
        statsDiv.style.left = '10px';
        statsDiv.style.color = 'white';
        statsDiv.style.opacity = 0.5;
        statsDiv.style.fontFamily = 'sans-serif';
        statsDiv.style.fontSize = '12px';
        statsDiv.style.zIndex = '1000';
        statsDiv.style.pointerEvents = 'none';
        document.body.appendChild(statsDiv);
    }

    statsDiv.style.display = 'block';
    statsDiv.innerHTML = `
    <div style="line-height:1.3;">
      <p style="line-height:1;">YELLOW TREVALLY STATS</p>
      <p style="line-height: 0.3;">SPEED: ${(speed * speedMultiplier).toFixed(2)}</p>
      <p style="line-height: 0.2;">VELOCITY: <${(f.vel.x * speedMultiplier).toFixed(2)} ${(f.vel.y * speedMultiplier).toFixed(2)} ${(f.vel.z * speedMultiplier).toFixed(2)}></p>
      VORTEX MAGNITUDE: ${specialFishForces.vortex.length().toFixed(3)}<br>
      DIST TO APEX: ${Math.abs(halfH - f.pos.y).toFixed(1)}m<br>
      ORBITAL PERIOD: ${(2 * Math.PI * f.radius / (Math.hypot(f.vel.x, f.vel.z) * speedMultiplier * 2)).toFixed(1)}s
    </div>
  `;
}

// ===== ANIMATION =====
let lastTime = 0;

function animate() {
    requestAnimationFrame(animate);

    const currentTime = Date.now() * 0.001;
    const deltaTime = Math.min(currentTime - lastTime, 0.06);
    lastTime = currentTime;

    updateFish(deltaTime);

    // camera orbit
    const t = currentTime * 0.12;
    camera.position.x = Math.sin(t) * 100;
    camera.position.z = Math.cos(t) * 100;
    camera.position.y = Math.sin(t * 0.4) * 20;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
    displayStats();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ===== BOOTSTRAP (tab-aware) =====
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.target.classList.contains('active') && mutation.target.id === 'fish') {
            if (!scene) {
                init();
                lastTime = Date.now() * 0.001;
            }
        }
    });
});

const fishContainer = document.getElementById('fish');
observer.observe(fishContainer, { attributes: true, attributeFilter: ['class'] });

if (fishContainer.classList.contains('active')) {
    init();
    lastTime = Date.now() * 0.001;
}

window.fish = fish;

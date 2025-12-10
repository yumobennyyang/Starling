// Boids Murmuration Simulation in Three.js with Cursor Interaction

import * as THREE from 'https://unpkg.com/three@0.157.0/build/three.module.js';

let scene, camera, renderer, boids, positions, velocities, specialBoid;
let specialBoidIndex = 0; // First boid is special

// Track forces for the special boid
let specialBoidForces = {
    separation: new THREE.Vector3(),
    alignment: new THREE.Vector3(),
    cohesion: new THREE.Vector3()
};

// Editable Parameters - Zone-based flocking


const birdCount = 1200;

const separation = 15.0;      // Separation zone radius
const alignment = 20.0;       // Alignment zone radius  
const cohesion = 25.0;        // Cohesion zone radius
const speedLimit = 9.0;       // Maximum speed

const freedom = 0.75;         // Not used in current implementation but available

let mouse = new THREE.Vector2();
let raycaster = new THREE.Raycaster();
const rayRadius = 150.0;      // Mouse influence radius

let lastTime = performance.now();

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = null;

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 350;

    renderer = new THREE.WebGLRenderer({ alpha: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('starling').appendChild(renderer.domElement);

    // Set canvas style
    renderer.domElement.style.position = 'fixed';
    renderer.domElement.style.top = '0';
    renderer.domElement.style.left = '0';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.pointerEvents = 'none';
    renderer.domElement.style.zIndex = '0'; // Layered correctly

    positions = new Float32Array(birdCount * 3);
    velocities = new Float32Array(birdCount * 3);

    for (let i = 0; i < birdCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 80;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 80;

        velocities[i * 3] = (Math.random() - 0.5) * 10;
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 10;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({ color: 0x000000, size: 2.5, sizeAttenuation: false });

    boids = new THREE.Points(geometry, material);
    scene.add(boids);

    // Create special red boid
    const specialGeometry = new THREE.BufferGeometry();
    const specialPosition = new Float32Array(3);
    specialPosition[0] = positions[specialBoidIndex * 3];
    specialPosition[1] = positions[specialBoidIndex * 3 + 1];
    specialPosition[2] = positions[specialBoidIndex * 3 + 2];
    specialGeometry.setAttribute('position', new THREE.BufferAttribute(specialPosition, 3));

    const specialMaterial = new THREE.PointsMaterial({ color: 0x0000ff, size: 6, sizeAttenuation: false });
    specialBoid = new THREE.Points(specialGeometry, specialMaterial);
    scene.add(specialBoid);

    window.addEventListener('resize', onWindowResize, false);
    window.addEventListener('mousemove', onMouseMove, false);
}

function onMouseMove(event) {
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = - (event.clientY / window.innerHeight) * 2 + 1;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    const now = performance.now();
    let deltaTime = (now - lastTime) / 1000;
    if (deltaTime > 1) deltaTime = 1; // safety cap on large deltas
    lastTime = now;

    flock(deltaTime);

    boids.geometry.attributes.position.needsUpdate = true;

    // Update special boid position
    const specialPos = specialBoid.geometry.attributes.position.array;
    specialPos[0] = positions[specialBoidIndex * 3];
    specialPos[1] = positions[specialBoidIndex * 3 + 1];
    specialPos[2] = positions[specialBoidIndex * 3 + 2];
    specialBoid.geometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);

    // Display stats for the red starling
    displayStats();
}

function flock(deltaTime) {
    raycaster.setFromCamera(mouse, camera);
    const rayOrigin = raycaster.ray.origin;
    const rayDirection = raycaster.ray.direction;

    // Calculate zone thresholds
    const zoneRadius = separation + alignment + cohesion;
    const separationThresh = separation / zoneRadius;
    const alignmentThresh = (separation + alignment) / zoneRadius;
    const zoneRadiusSq = zoneRadius * zoneRadius;
    const rayRadiusSq = rayRadius * rayRadius;

    const PI = Math.PI;
    const PI_2 = PI * 2.0;

    // Reset special boid forces
    specialBoidForces.separation.set(0, 0, 0);
    specialBoidForces.alignment.set(0, 0, 0);
    specialBoidForces.cohesion.set(0, 0, 0);

    for (let i = 0; i < birdCount; i++) {
        let pos = getVector(i);
        let vel = getVector(i, velocities);

        let limit = speedLimit;

        // Ray-based mouse interaction (like the example)
        const directionToRay = new THREE.Vector3().subVectors(rayOrigin, pos);
        const projectionLength = directionToRay.dot(rayDirection);
        const closestPoint = rayOrigin.clone().sub(rayDirection.clone().multiplyScalar(projectionLength));
        const directionToClosestPoint = closestPoint.clone().sub(pos);
        const distanceToClosestPointSq = directionToClosestPoint.lengthSq();

        if (distanceToClosestPointSq < rayRadiusSq) {
            const velocityAdjust = (distanceToClosestPointSq / rayRadiusSq - 1.0) * deltaTime * 100.0;
            vel.add(directionToClosestPoint.normalize().multiplyScalar(velocityAdjust));
            limit += 5.0;
        }

        // Attract flocks to center (stronger vertical pull like example)
        const dirToCenter = pos.clone();
        dirToCenter.y *= 2.5;
        vel.sub(dirToCenter.normalize().multiplyScalar(deltaTime * 5.0));

        // Zone-based flocking algorithm
        for (let j = 0; j < birdCount; j++) {
            if (i === j) continue;

            let otherPos = getVector(j);
            let dirToBird = new THREE.Vector3().subVectors(otherPos, pos);
            let distToBird = dirToBird.length();

            if (distToBird < 0.0001) continue;

            let distToBirdSq = distToBird * distToBird;

            // Skip if outside zone radius
            if (distToBirdSq > zoneRadiusSq) continue;

            const percent = distToBirdSq / zoneRadiusSq;

            if (percent < separationThresh) {
                // Separation zone - move apart
                const velocityAdjust = (separationThresh / percent - 1.0) * deltaTime;
                const separationForce = dirToBird.clone().normalize().multiplyScalar(-velocityAdjust);
                vel.add(separationForce);

                // Track for special boid
                if (i === specialBoidIndex) {
                    specialBoidForces.separation.add(separationForce);
                }

            } else if (percent < alignmentThresh) {
                // Alignment zone - match velocity
                const threshDelta = alignmentThresh - separationThresh;
                const adjustedPercent = (percent - separationThresh) / threshDelta;
                const otherVel = getVector(j, velocities);

                const cosRange = Math.cos(adjustedPercent * PI_2);
                const cosRangeAdjust = 0.5 - cosRange * 0.5 + 0.5;
                const velocityAdjust = cosRangeAdjust * deltaTime;
                const alignmentForce = otherVel.clone().normalize().multiplyScalar(velocityAdjust);
                vel.add(alignmentForce);

                // Track for special boid
                if (i === specialBoidIndex) {
                    specialBoidForces.alignment.add(alignmentForce);
                }

            } else {
                // Cohesion zone - move closer
                const threshDelta = 1.0 - alignmentThresh;
                const adjustedPercent = threshDelta === 0.0 ? 1.0 : (percent - alignmentThresh) / threshDelta;

                const cosRange = Math.cos(adjustedPercent * PI_2);
                const adj1 = cosRange * -0.5;
                const adj2 = adj1 + 0.5;
                const adj3 = 0.5 - adj2;

                const velocityAdjust = adj3 * deltaTime;
                const cohesionForce = dirToBird.clone().normalize().multiplyScalar(velocityAdjust);
                vel.add(cohesionForce);

                // Track for special boid
                if (i === specialBoidIndex) {
                    specialBoidForces.cohesion.add(cohesionForce);
                }
            }
        }

        // Limit velocity
        if (vel.length() > limit) {
            vel.normalize().multiplyScalar(limit);
        }

        // Update position
        pos.add(vel.clone().multiplyScalar(deltaTime * 15.0));

        // Soft boundaries (keep your original boundary system)
        const boundaryLimit = 40;
        const boundaryMargin = 10;
        const boundaryForce = 0.05;

        ['x', 'y', 'z'].forEach((axis) => {
            if (pos[axis] > boundaryLimit - boundaryMargin) {
                let distanceToEdge = boundaryLimit - pos[axis];
                vel[axis] -= boundaryForce * (1 - distanceToEdge / boundaryMargin);
            } else if (pos[axis] < -boundaryLimit + boundaryMargin) {
                let distanceToEdge = pos[axis] + boundaryLimit;
                vel[axis] += boundaryForce * (1 - distanceToEdge / boundaryMargin);
            }
        });

        // Write back to arrays
        ['x', 'y', 'z'].forEach((axis, idx) => {
            positions[i * 3 + idx] = pos[axis];
            velocities[i * 3 + idx] = vel[axis];
        });
    }
}

function getVector(index, array = positions) {
    return new THREE.Vector3(
        array[index * 3],
        array[index * 3 + 1],
        array[index * 3 + 2]
    );
}

function displayStats() {
    // Only show stats when the starling tab is active
    const starlingDiv = document.getElementById('starling');
    const isActive = starlingDiv && starlingDiv.classList.contains('active');

    let statsDiv = document.getElementById('starling-stats');

    if (!isActive) {
        // Hide stats if tab is not active
        if (statsDiv) {
            statsDiv.style.display = 'none';
        }
        return;
    }

    const specialVel = getVector(specialBoidIndex, velocities);
    const speed = specialVel.length();

    // Create or get stats div
    if (!statsDiv) {
        statsDiv = document.createElement('div');
        statsDiv.id = 'starling-stats';
        statsDiv.style.position = 'fixed';
        statsDiv.style.bottom = '7px';
        statsDiv.style.left = '10px';
        statsDiv.style.color = 'black';
        statsDiv.style.opacity = '0.6';
        statsDiv.style.fontFamily = 'sans-serif';
        statsDiv.style.fontSize = '12px';
        statsDiv.style.zIndex = '1000';
        statsDiv.style.pointerEvents = 'none';
        document.body.appendChild(statsDiv);
    }

    // Show stats if hidden
    statsDiv.style.display = 'block';

    // Update stats content
    statsDiv.innerHTML = `
        <div style="line-height: 1.3;">
            <p style="line-height: 1;">BLUE STARLING STATS</p>
            <p style="line-height: 0.3;">SPEED: ${speed.toFixed(2)}</p>
            <p style="line-height: 0.2;">VELOCITY: <${specialVel.x.toFixed(2)} ${specialVel.y.toFixed(2)} ${specialVel.z.toFixed(2)}></p>
            SEPARATION FORCE: ${specialBoidForces.separation.length().toFixed(4)}<br>
            ALIGNMENT FORCE: ${specialBoidForces.alignment.length().toFixed(4)}<br>
            COHESION FORCE: ${specialBoidForces.cohesion.length().toFixed(4)}
        </div>
    `;
}
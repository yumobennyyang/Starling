// Boids Murmuration Simulation in Three.js

import * as THREE from 'https://unpkg.com/three@0.157.0/build/three.module.js';

let scene, camera, renderer, boids, positions, velocities;
const birdCount = 2000;
const perceptionRadius = 20;
const maxSpeed = 1;
const maxForce = 0.08;
const alignmentWeight = 1.0;
const cohesionWeight = 0.9;     
const separationWeight = 1.1;

init();
animate();

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdddddd);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 100;

    renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    positions = new Float32Array(birdCount * 3);
    velocities = new Float32Array(birdCount * 3);

    for (let i = 0; i < birdCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 80; // tighter initial spread
        positions[i * 3 + 1] = (Math.random() - 0.5) * 80;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 80;

        velocities[i * 3] = (Math.random() - 0.5) * 1;
        velocities[i * 3 + 1] = (Math.random() - 0.5) * 1;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 1;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({ color: 0x000000, size: 0.2 });

    boids = new THREE.Points(geometry, material);
    scene.add(boids);

    window.addEventListener('resize', onWindowResize, false);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);

    flock();

    boids.geometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
}

function flock() {
    for (let i = 0; i < birdCount; i++) {
        let pos = getVector(i);
        let vel = getVector(i, velocities);



        let alignment = new THREE.Vector3();
        let cohesion = new THREE.Vector3();
        let separation = new THREE.Vector3();
        let total = 0;

        for (let j = 0; j < birdCount; j++) {
            if (i === j) continue;
            let otherPos = getVector(j);
            let distance = pos.distanceTo(otherPos);

            if (distance < perceptionRadius) {
                let otherVel = getVector(j, velocities);
                alignment.add(otherVel);
                cohesion.add(otherPos);

                let diff = new THREE.Vector3().subVectors(pos, otherPos);
                diff.divideScalar(distance);
                separation.add(diff);

                total++;
            }
        }

        if (total > 0) {
            alignment.divideScalar(total);
            alignment.setLength(maxSpeed);
            alignment.sub(vel);
            alignment.clampLength(0, maxForce);

            cohesion.divideScalar(total);
            cohesion.sub(pos);
            cohesion.setLength(maxSpeed);
            cohesion.sub(vel);
            cohesion.clampLength(0, maxForce);

            separation.divideScalar(total);
            separation.setLength(maxSpeed);
            separation.sub(vel);
            separation.clampLength(0, maxForce);
        }

        vel.add(alignment.multiplyScalar(alignmentWeight));
        vel.add(cohesion.multiplyScalar(cohesionWeight));
        vel.add(separation.multiplyScalar(separationWeight));

        vel.clampLength(0, maxSpeed);

        pos.add(vel);

        ['x', 'y', 'z'].forEach((axis, idx) => {
            if (pos[axis] > 40) vel[axis] -= 0.1;
            if (pos[axis] < -40) vel[axis] += 0.1;
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


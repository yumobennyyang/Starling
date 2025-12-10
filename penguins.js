// Penguin Huddle Heat Radiation Simulation - PHYSICS-BASED HEAT MODEL
// Penguins stay in tight huddle formation
// Each penguin individually spirals: inward to center → then outward to edge
// Heat accumulates based on how tightly enclosed by neighbors over time
// 
// HEAT PHYSICS:
// Temperature follows Fourier's law of heat conduction
// Two models available:
//   1. Exponential diffusion: T(r) = T_ambient + (T_core - T_ambient) * e^(-r/λ)
//   2. Quadratic decay: T(r) = T_core - k*r^2
// Where r is normalized distance from core (0=center, 1=edge)

let penguins = [];

// Cursor tracking
let mouseXPos = 0;
let mouseYPos = 0;

// Editable Parameters
const penguinCount = 1200;
const d0 = 7;                     // Ideal distance between penguins (tight huddle)
const huddleRadius = 230;          // Radius of the huddle (smaller = tighter)
const spiralSpeed = 0.002;         // How fast each penguin moves along spiral path
const cohesionStrength = 1.5;      // Strength of staying together (MUCH stronger)
const separationStrength = 0.8;    // Strength of avoiding overlap
const maxDistFromCenter = 300;     // Maximum distance from center (boundary)
const moveSpeed = 0.8;             // Movement speed

// Cursor interaction parameters
const cursorInfluenceRadius = 150;  // Radius around cursor where penguins are affected
const cursorCenterForce = 2.5;      // Strength of force pulling penguins toward center when near cursor

// Visual parameters
const showHeatColor = false;

// Heat physics parameters
const heatRadius = d0 * 10;           // How far to check for heat contribution
const heatGainRate = 0.03;           // How fast penguins heat up when enclosed
const heatLossRate = 0.02;           // How fast penguins cool down when exposed
const maxHeat = 10.0;                 // Maximum heat intensity
const minHeat = 0.0;                 // Minimum heat intensity (ambient)

// Temperature mapping constants
const T_AMBIENT = -40;    // Ambient temperature (°C) - outer edge
const T_CORE = 40;        // Core temperature (°C) - center of huddle
const LAMBDA = 0.35;      // Heat penetration depth (normalized, 0-1)
const HEAT_MODEL = "exponential"; // "exponential" or "quadratic"

class Penguin {
    constructor(angle, radius, isSpecial = false) {
        let centerX = width / 2;
        let centerY = height / 2;
        
        // Initial position in huddle
        this.angle = angle;            // Angular position in huddle (0 to 2π)
        this.radius = radius;          // Distance from center
        this.spiralPhase = random(TWO_PI); // Where penguin is in its spiral journey (0 to 2π)
        this.isSpecial = isSpecial;    // Special red penguin marker
        
        this.x = centerX + cos(this.angle) * this.radius;
        this.y = centerY + sin(this.angle) * this.radius;
        this.vx = 0;
        this.vy = 0;
        
        // Start with heat based on initial position
        // Inner penguins start warmer, outer penguins start cooler
        let positionRatio = this.radius / huddleRadius;
        this.heatIntensity = map(positionRatio, 0, 1, 0.6, 0.1);

        this.neighbors = [];
        this.cursorInfluenceStrength = 0;  // Track cursor influence
    }
    
    findNeighbors(allPenguins) {
        this.neighbors = [];
        let distances = [];
        
        for (let other of allPenguins) {
            if (other === this) continue;
            let d = dist(this.x, this.y, other.x, other.y);
            if (d < d0 * 8) {  // Increased search radius
                distances.push({penguin: other, dist: d});
            }
        }
        
        distances.sort((a, b) => a.dist - b.dist);
        this.neighbors = distances.slice(0, 20).map(item => item.penguin);  // More neighbors
    }
    
    spiralMovement() {
        // Each penguin follows its own spiral path
        // spiralPhase: 0 → π (moving inward to center)
        // spiralPhase: π → 2π (moving outward to edge)

        let centerX = width / 2;
        let centerY = height / 2;

        // Calculate target radius based on spiral phase
        // Phase 0 to π: radius goes from huddleRadius to 0 (inward)
        // Phase π to 2π: radius goes from 0 to huddleRadius (outward)
        let targetRadius;
        if (this.spiralPhase < PI) {
            // Moving inward
            targetRadius = huddleRadius * (1 - this.spiralPhase / PI);
        } else {
            // Moving outward
            targetRadius = huddleRadius * ((this.spiralPhase - PI) / PI);
        }

        // Reduce spiral radius when near cursor (makes huddle tighter)
        let radiusMultiplier = 1 - (this.cursorInfluenceStrength || 0) * 0.4;
        targetRadius *= radiusMultiplier;

        // Add slight spiral curve (like in the diagram)
        let spiralAngle = this.angle + this.spiralPhase * 0.5;

        // Calculate target position
        let targetX = centerX + cos(spiralAngle) * targetRadius;
        let targetY = centerY + sin(spiralAngle) * targetRadius;

        // Move toward target
        let dx = targetX - this.x;
        let dy = targetY - this.y;
        let distance = sqrt(dx * dx + dy * dy);

        if (distance > 0.1) {
            this.vx += (dx / distance) * moveSpeed * 0.1;
            this.vy += (dy / distance) * moveSpeed * 0.1;
        }

        // Update spiral phase (continuous spiral inward then outward)
        // Slow down spiral movement when near cursor (makes penguins linger in tight formation)
        let spiralSpeedMultiplier = 1 - (this.cursorInfluenceStrength || 0) * 0.5;
        this.spiralPhase += spiralSpeed * spiralSpeedMultiplier;
        if (this.spiralPhase > TWO_PI) {
            this.spiralPhase = 0; // Reset to start spiral again
        }
    }
    
    applyCohesion() {
        // Stay together as huddle
        if (this.neighbors.length === 0) return;

        let centerX = 0;
        let centerY = 0;

        for (let other of this.neighbors) {
            centerX += other.x;
            centerY += other.y;
        }

        centerX /= this.neighbors.length;
        centerY /= this.neighbors.length;

        let dx = centerX - this.x;
        let dy = centerY - this.y;

        // Increase cohesion when near cursor (pack tighter)
        let cohesionMultiplier = 1 + (this.cursorInfluenceStrength || 0) * 3;

        this.vx += dx * cohesionStrength * 0.01 * cohesionMultiplier;
        this.vy += dy * cohesionStrength * 0.01 * cohesionMultiplier;
    }
    
    applySeparation() {
        // Avoid overlapping too much
        let separationX = 0;
        let separationY = 0;
        
        for (let other of this.neighbors) {
            let dx = this.x - other.x;
            let dy = this.y - other.y;
            let dist = sqrt(dx * dx + dy * dy);
            
            if (dist < d0 && dist > 0.1) {
                let force = (d0 - dist) / d0;
                separationX += (dx / dist) * force;
                separationY += (dy / dist) * force;
            }
        }
        
        this.vx += separationX * separationStrength;
        this.vy += separationY * separationStrength;
    }
    
    applyBoundaryForce() {
        // Pull penguins back if they drift too far from center
        let centerX = width / 2;
        let centerY = height / 2;
        let distFromCenter = dist(this.x, this.y, centerX, centerY);

        if (distFromCenter > maxDistFromCenter) {
            let dx = centerX - this.x;
            let dy = centerY - this.y;
            let force = (distFromCenter - maxDistFromCenter) / maxDistFromCenter;

            this.vx += dx * force * 0.1;
            this.vy += dy * force * 0.1;
        }
    }

    applyCursorInfluence() {
        // Store whether this penguin is influenced by cursor (for use in cohesion)
        let distToCursor = dist(this.x, this.y, mouseXPos, mouseYPos);

        if (distToCursor < cursorInfluenceRadius) {
            // Force strength increases the closer penguin is to cursor
            this.cursorInfluenceStrength = 1 - (distToCursor / cursorInfluenceRadius);
            this.cursorInfluenceStrength = this.cursorInfluenceStrength * this.cursorInfluenceStrength;
        } else {
            this.cursorInfluenceStrength = 0;
        }
    }
    
    updateHeat(allPenguins) {
        // Calculate heat contribution from nearby penguins
        // Heat is generated by density AND transferred from neighbors
        
        let heatContribution = 0;
        let neighborsInRadius = 0;
        let avgNeighborHeat = 0;
        
        // Check nearby penguins for density and heat transfer
        for (let other of allPenguins) {
            if (other === this) continue;
            
            let d = dist(this.x, this.y, other.x, other.y);
            
            if (d < heatRadius) {
                neighborsInRadius++;
                
                // Heat contribution from proximity (generates heat)
                let proximityFactor = 1 - (d / heatRadius);
                proximityFactor = proximityFactor * proximityFactor;
                heatContribution += proximityFactor;
                
                // Heat transfer from neighbor's temperature (diffusion)
                // Closer neighbors transfer more heat
                let transferWeight = proximityFactor;
                avgNeighborHeat += other.heatIntensity * transferWeight;
            }
        }
        
        // Calculate density-based heat generation
        let maxPossibleNeighbors = PI * (heatRadius / d0) * (heatRadius / d0) / 2;
        let densityRatio = neighborsInRadius / maxPossibleNeighbors;
        
        // Heat generated by being packed in
        let generatedHeat = 0;
        if (neighborsInRadius > 0) {
            generatedHeat = (heatContribution / neighborsInRadius) * densityRatio * 2;
            generatedHeat = constrain(generatedHeat, 0, 1);
            
            // Average neighbor heat (weighted by proximity)
            avgNeighborHeat /= heatContribution;
        }
        
        // Target heat combines:
        // 1. Heat generation from density (40%)
        // 2. Heat transfer from neighbors (60%)
        let targetHeat = generatedHeat * 0.4 + avgNeighborHeat * 0.6;
        
        // Smooth transition to target heat
        let heatChangeRate = (targetHeat > this.heatIntensity) ? heatGainRate : heatLossRate;
        this.heatIntensity = lerp(this.heatIntensity, targetHeat, heatChangeRate);
        
        // Clamp heat to valid range
        this.heatIntensity = constrain(this.heatIntensity, minHeat, maxHeat);
    }
    
    getTemperature() {
        // Map heat intensity (0-1) to temperature using physically accurate models
        // based on Fourier's law of heat conduction
        
        if (HEAT_MODEL === "exponential") {
            // Exponential diffusion model: T(r) = T_ambient + (T_core - T_ambient) * e^(-r/λ)
            // Where r is normalized distance (0 = core, 1 = edge)
            // Heat intensity 0 = edge, 1 = core
            let normalizedDistance = 1 - this.heatIntensity; // Invert: 0=core, 1=edge
            let tempDiff = T_CORE - T_AMBIENT;
            let temperature = T_AMBIENT + tempDiff * exp(-normalizedDistance / LAMBDA);
            return temperature;
            
        } else if (HEAT_MODEL === "quadratic") {
            // Quadratic decay model: T(r) = T_core - k*r^2
            // Produces parabolic temperature profile
            let normalizedDistance = 1 - this.heatIntensity; // Invert: 0=core, 1=edge
            let k = T_CORE - T_AMBIENT; // Coefficient for quadratic decay
            let temperature = T_CORE - k * normalizedDistance * normalizedDistance;
            return temperature;
            
        } else {
            // Fallback to linear if invalid model specified
            return map(this.heatIntensity, 0, 1, T_AMBIENT, T_CORE);
        }
    }
    
    update(allPenguins) {
        // Calculate cursor influence first (affects cohesion strength)
        this.applyCursorInfluence();

        // Follow spiral path
        this.spiralMovement();

        // Stay together as huddle (stronger when near cursor)
        this.applyCohesion();

        // Avoid overlap
        this.applySeparation();

        // Keep within huddle boundary
        this.applyBoundaryForce();

        // Update position
        this.x += this.vx;
        this.y += this.vy;

        // Update heat based on neighbor density
        this.updateHeat(allPenguins);

        // Damping
        this.vx *= 0.85;
        this.vy *= 0.85;
    }
    
    display() {
        noStroke();
        
        // Special red penguin is always bright red
        if (this.isSpecial) {
            fill(255, 0, 0); // Bright red
            ellipse(this.x, this.y, d0 * 0.9, d0 * 0.9);  // Slightly larger
        } else if (showHeatColor) {
            // Color by heat: cold=blue, warm=red/orange/yellow
            let heatRatio = this.heatIntensity;
            
            // Better color gradient: blue → cyan → green → yellow → orange → red
            let r, g, b;
            
            if (heatRatio < 0.5) {
                // Cold: blue to cyan to green
                let t = heatRatio * 2; // 0 to 1
                r = 0;
                g = 100 + t * 155;
                b = 255 - t * 100;
            } else {
                // Hot: green to yellow to orange to red
                let t = (heatRatio - 0.5) * 2; // 0 to 1
                r = 100 + t * 155;
                g = 255 - t * 155;
                b = 0;
            }
            
            fill(r, g, b);
            ellipse(this.x, this.y, d0 * 0.8, d0 * 0.8);
        } else {
            fill(0);
            ellipse(this.x, this.y, d0 * 0.8, d0 * 0.8);
        }
    }
}

function setup() {
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent('penguin');

    // Initialize penguins in TIGHT huddle formation
    // More layers, more densely packed
    let layers = 14;  // More layers for better coverage
    let penguinsPerLayer = floor(penguinCount / layers);
    let isFirstPenguin = true;  // Track first penguin
    
    for (let layer = 0; layer < layers; layer++) {
        let radius = (layer / (layers - 1)) * (huddleRadius * 0.9);  // 90% of max radius
        let count = max(6, penguinsPerLayer);  // At least 6 per layer
        
        for (let i = 0; i < count; i++) {
            let angle = (i / count) * TWO_PI + random(-0.01, 0.01);  // Small random variation
            let r = radius + random(-1, 1);  // Small radius variation
            let penguin = new Penguin(angle, r, isFirstPenguin);  // First one is special
            isFirstPenguin = false;  // All others are normal
            penguins.push(penguin);
            
            if (penguins.length >= penguinCount) break;
        }
        if (penguins.length >= penguinCount) break;
    }
    
    // Trim excess
    penguins = penguins.slice(0, penguinCount);
    
    // Initial neighbor finding
    for (let penguin of penguins) {
        penguin.findNeighbors(penguins);
    }
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}

function draw() {
    clear();
    
    // Update all penguins
    for (let penguin of penguins) {
        penguin.update(penguins);
    }
    
    // Update neighbors occasionally
    if (frameCount % 15 === 0) {
        for (let penguin of penguins) {
            penguin.findNeighbors(penguins);
        }
    }
    
    // Display all penguins (regular ones first)
    for (let penguin of penguins) {
        if (!penguin.isSpecial) {
            penguin.display();
        }
    }
    
    // Display special red penguin last (on top)
    for (let penguin of penguins) {
        if (penguin.isSpecial) {
            penguin.display();
        }
    }
    
    // Display red penguin stats with temperature
    let redPenguin = penguins.find(p => p.isSpecial);
    if (redPenguin) {
        fill(0, 0, 0, 153);
        noStroke();
        textSize(12);
        textAlign(LEFT);

        let centerX = width / 2;
        let centerY = height / 2;
        let distFromCenter = dist(redPenguin.x, redPenguin.y, centerX, centerY);

        // Calculate speed
        let speed = sqrt(redPenguin.vx * redPenguin.vx + redPenguin.vy * redPenguin.vy);

        // Count neighbors in heat radius
        let neighborCount = 0;
        for (let other of penguins) {
            if (other === redPenguin) continue;
            let d = dist(redPenguin.x, redPenguin.y, other.x, other.y);
            if (d < heatRadius) {
                neighborCount++;
            }
        }

        // Determine spiral phase direction
        let spiralDirection = redPenguin.spiralPhase < PI ? "inward" : "outward";

        // Get temperature
        let temperature = redPenguin.getTemperature();

        text('RED PENGUIN STATS', 10, height - 98);
        text('SPEED: ' + speed.toFixed(2), 10, height - 78.5);
        text('VELOCITY: <' + redPenguin.vx.toFixed(2) + ' ' + redPenguin.vy.toFixed(2) + '>', 10, height - 63);
        text('TEMPERATURE: ' + temperature.toFixed(1) + '°C', 10, height - 42.5);
        // text('Heat Intensity: ' + redPenguin.heatIntensity.toFixed(2), 10, 50);
        text('NEIGHBOR COUNT: ' + neighborCount, 10, height - 27);
        text('DIST FROM CENTER: ' + distFromCenter.toFixed(1), 10, height - 11.5);
        // text('Spiral Phase: ' + spiralDirection, 10, 95);
    }
}

// Track mouse movement for cursor interaction
function mouseMoved() {
    mouseXPos = mouseX;
    mouseYPos = mouseY;
}

function mouseDragged() {
    mouseXPos = mouseX;
    mouseYPos = mouseY;
}
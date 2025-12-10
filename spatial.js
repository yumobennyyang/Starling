let video;

const limbLengthsDefault = {
  upperArm: 60,
  lowerArm: 60,
  upperLeg: 70,
  lowerLeg: 80
};

p.setup = function () {
  p.createCanvas(globals.width, globals.height);
  video = globals.createCapture(p);
  video.hide();
  globals.posedetection.start(video);
};

p.draw = function () {
  p.applyMatrix(globals.matrix);
  p.push();
  p.translate(globals.width, 0);
  p.scale(-1, 1);

  p.background(0);
  p.stroke(255);
  p.strokeCap(p.SQUARE);

  // ---------- helpers ----------
  const toRad = d => p.radians(d);
  const poses = (globals.posedetection.results && globals.posedetection.results.landmarks) || [];
  const pose1 = poses[0], pose2 = poses[1];

  function segAngleDeg(pose, a, b) {
    const p1 = pose?.[a], p2 = pose?.[b];
    if (!p1 || !p2) return null;
    const x1 = p1.x * globals.width,  y1 = p1.y * globals.height;
    const x2 = p2.x * globals.width,  y2 = p2.y * globals.height;
    let ang = p.degrees(p.atan2(y2 - y1, x2 - x1));
    return ang < 0 ? ang + 360 : ang;
  }
  function segLengthPx(pose, a, b) {
    const p1 = pose?.[a], p2 = pose?.[b];
    if (!p1 || !p2) return null;
    const x1 = p1.x * globals.width,  y1 = p1.y * globals.height;
    const x2 = p2.x * globals.width,  y2 = p2.y * globals.height;
    return Math.hypot(x2 - x1, y2 - y1);
  }
  function avgAngleDeg(a, b) {
    if (a == null) return b;
    if (b == null) return a;
    const ar = p.radians(a), br = p.radians(b);
    const x = p.cos(ar) + p.cos(br);
    const y = p.sin(ar) + p.sin(br);
    let ang = p.degrees(p.atan2(y, x));
    return ang < 0 ? ang + 360 : ang;
  }
  function angleDiffDeg(a, b) {
    if (a == null || b == null) return null;
    let d = Math.abs(a - b);
    return d > 180 ? 360 - d : d;
  }
  function getStrokeWidth(diff) {
    if (diff == null) return 30;
    return p.map(diff, 0, 180, 50, 1);
  }
  function getXY(pt){ return [pt.x*globals.width, pt.y*globals.height]; }

  // ---------- indices ----------
  const idx = {
    SL: 11, SR: 12, EL: 14, ER: 13, WL: 16, WR: 15,
    HL: 24, HR: 23, KL: 26, KR: 25, AL: 28, AR: 27,
    EAR_L: 7, EAR_R: 8
  };

  // ---------- average pose (coords) ----------
  let avgPose = null;
  if (pose1 && pose2) {
    avgPose = pose1.map((p1,i) => {
      const p2 = pose2[i];
      return { x:(p1.x + p2.x)/2, y:(p1.y + p2.y)/2 };
    });
  } else if (pose1) {
    avgPose = pose1;
  }

  // ---------- segment angle stats ----------
  const segStats = {};
  function setStat(key, aIdx, bIdx) {
    const a1 = pose1 ? segAngleDeg(pose1, aIdx, bIdx) : null;
    const a2 = pose2 ? segAngleDeg(pose2, aIdx, bIdx) : null;
    segStats[key] = { avg: avgAngleDeg(a1, a2), diff: angleDiffDeg(a1, a2) };
  }
  setStat('torsoChest', idx.SR, idx.SL);   // shoulder line
  setStat('torsoPelvis', idx.HR, idx.HL);  // hip line
  setStat('upperArmRight', idx.SR, idx.ER);
  setStat('lowerArmRight', idx.ER, idx.WR);
  setStat('upperArmLeft',  idx.SL, idx.EL);
  setStat('lowerArmLeft',  idx.EL, idx.WL);
  setStat('upperLegRight', idx.HR, idx.KR);
  setStat('lowerLegRight', idx.KR, idx.AR);
  setStat('upperLegLeft',  idx.HL, idx.KL);
  setStat('lowerLegLeft',  idx.KL, idx.AL);
  const fallbackDeg = (k, def)=> segStats[k].avg==null? def: segStats[k].avg;

  // ---------- limb lengths: use average lengths when detected ----------
  function avgLen(aIdx, bIdx) {
    if (!avgPose) return null;
    return segLengthPx(avgPose, aIdx, bIdx);
  }
  // arms
  const lenUpperArmR = avgLen(idx.SR, idx.ER) ?? limbLengthsDefault.upperArm;
  const lenLowerArmR = avgLen(idx.ER, idx.WR) ?? limbLengthsDefault.lowerArm;
  const lenUpperArmL = avgLen(idx.SL, idx.EL) ?? limbLengthsDefault.upperArm;
  const lenLowerArmL = avgLen(idx.EL, idx.WL) ?? limbLengthsDefault.lowerArm;
  // legs
  const lenUpperLegR = avgLen(idx.HR, idx.KR) ?? limbLengthsDefault.upperLeg;
  const lenLowerLegR = avgLen(idx.KR, idx.AR) ?? limbLengthsDefault.lowerLeg;
  const lenUpperLegL = avgLen(idx.HL, idx.KL) ?? limbLengthsDefault.upperLeg;
  const lenLowerLegL = avgLen(idx.KL, idx.AL) ?? limbLengthsDefault.lowerLeg;

  // ---------- head (square) with ear-tilt ----------
  let headCx = globals.width/2, headCy = globals.height/3;
  if (avgPose) {
    const sL = avgPose[idx.SL], sR = avgPose[idx.SR];
    if (sL && sR) {
      const mx = (sL.x + sR.x)/2 * globals.width;
      const my = (sL.y + sR.y)/2 * globals.height;
      headCx = mx;
      headCy = my - 55;
    }
  }
  let headAngleRad = 0;
  if (avgPose && avgPose[idx.EAR_L] && avgPose[idx.EAR_R]) {
    const [ex1, ey1] = getXY(avgPose[idx.EAR_L]);
    const [ex2, ey2] = getXY(avgPose[idx.EAR_R]);
    headAngleRad = Math.atan2(ey2 - ey1, ex2 - ex1);
  }
  p.noStroke(); p.fill(255);
  p.push();
  p.translate(headCx, headCy);
  p.rotate(headAngleRad);
  p.rectMode(p.CENTER);
  p.rect(0, 0, 50, 50);
  p.pop();

  // ---------- average shoulder/hip lines for torso blocks ----------
  // defaults when no detection
  let sLx = headCx-40, sLy = headCy+45, sRx = headCx+40, sRy = headCy+45;
  let hLx = headCx-30, hLy = headCy+200, hRx = headCx+30, hRy = headCy+200;
  if (avgPose) {
    const sL = avgPose[idx.SL], sR = avgPose[idx.SR], hL = avgPose[idx.HL], hR = avgPose[idx.HR];
    if (sL && sR) { [sLx,sLy]=getXY(sL); [sRx,sRy]=getXY(sR); }
    if (hL && hR) { [hLx,hLy]=getXY(hL); [hRx,hRy]=getXY(hR); }
  }

  function buildBaseLine(x1,y1,x2,y2, avgDeg, wantDown, lenScale=1.0, offsetScale=0.25){
    const mx=(x1+x2)/2, my=(y1+y2)/2;
    const vx=x2-x1, vy=y2-y1;
    const d=Math.max(1, Math.hypot(vx,vy));
    const tx=vx/d, ty=vy/d;
    let nx=-ty, ny=tx;
    const downDot=ny;
    if (wantDown && downDot<0){ nx*=-1; ny*=-1; }
    if (!wantDown && downDot>0){ nx*=-1; ny*=-1; }
    const c = offsetScale*d;
    const cx0=mx+nx*c, cy0=my+ny*c;
    const ang=toRad(avgDeg);
    const dx=Math.cos(ang), dy=Math.sin(ang);
    const half=(d*lenScale)/2;
    return { ax:cx0-dx*half, ay:cy0-dy*half, bx:cx0+dx*half, by:cy0+dy*half, nx, ny, d };
  }

  const chest  = buildBaseLine(sLx,sLy,sRx,sRy, fallbackDeg('torsoChest', 0), true, 1.0, 0.25);
  const pelvis = buildBaseLine(hLx,hLy,hRx,hRy, fallbackDeg('torsoPelvis',0), false,0.9, 0.20);
  const chestThickness  = chest.d  * 0.35;
  const pelvisThickness = pelvis.d * 0.28;

  function drawBlock(base, thickness, diff){
    const {ax,ay,bx,by,nx,ny}=base;
    const ox=nx*thickness, oy=ny*thickness;
    p.noStroke(); p.fill(255);
    p.quad(ax,ay, bx,by, bx+ox,by+oy, ax+ox,ay+oy);
    p.noFill(); p.stroke(255);
    p.strokeWeight(getStrokeWidth(diff));
    p.line(ax,ay, bx,by);
    p.line(ax+ox,ay+oy, bx+ox,by+oy);
  }
  drawBlock(chest,  chestThickness,  segStats.torsoChest.diff);
  drawBlock(pelvis, pelvisThickness, segStats.torsoPelvis.diff);

  // ---------- WHITE LIMBS ----------
  // FIX: swap shoulders for white arms (mirror makes visual sides swap)
  const rShoulder = { x: sLx, y: sLy }; // was sRx,sRy
  const lShoulder = { x: sRx, y: sRy }; // was sLx,sLy
  const rHip      = { x: pelvis.ax, y: pelvis.ay };
  const lHip      = { x: pelvis.bx, y: pelvis.by };

  p.stroke(255);

  function wrapDeg(d) {
  // keep in [0,360)
  d = d % 360;
  return d < 0 ? d + 360 : d;
}

// Given a measured angle in degrees, correct it.
function calibrateAngleDegR(measDeg) {
  // anchor at 180°, scale = 2 from your examples
  return wrapDeg(2 * measDeg - 180);
}

  function calibrateAngleDegL(measDeg) {
  const corrected = 0.6667 * measDeg + 60; // derived mapping
  return wrapDeg(2 * measDeg);
}

  
  // right arm
  
  let ang = toRad(calibrateAngleDegL(fallbackDeg('upperArmRight', 110)));
  p.strokeWeight(getStrokeWidth(segStats.upperArmRight.diff));
  let ex = rShoulder.x + lenUpperArmR / 2 * Math.cos(ang);
  let ey = rShoulder.y + lenUpperArmR / 2 * Math.sin(ang);
  p.line(rShoulder.x, rShoulder.y, ex, ey);

  ang = toRad(fallbackDeg('lowerArmRight', 140));
  p.strokeWeight(getStrokeWidth(segStats.lowerArmRight.diff));
  let hx = ex + lenLowerArmR * Math.cos(ang);
  let hy = ey + lenLowerArmR * Math.sin(ang);
  p.line(ex, ey, hx, hy);

  // left arm
  ang = toRad(calibrateAngleDegR(fallbackDeg('upperArmLeft', 70)));
  p.strokeWeight(getStrokeWidth(segStats.upperArmLeft.diff));
  ex = lShoulder.x + lenUpperArmL / 2 * Math.cos(ang);
  ey = lShoulder.y + lenUpperArmL / 2 * Math.sin(ang);
  p.line(lShoulder.x, lShoulder.y, ex, ey);

  ang = toRad(fallbackDeg('lowerArmLeft', 40));
  p.strokeWeight(getStrokeWidth(segStats.lowerArmLeft.diff));
  hx = ex + lenLowerArmL * Math.cos(ang);
  hy = ey + lenLowerArmL * Math.sin(ang);
  p.line(ex, ey, hx, hy);

  // right leg
  ang = toRad(fallbackDeg('upperLegRight', 100));
  p.strokeWeight(getStrokeWidth(segStats.upperLegRight.diff));
  let kx = rHip.x + lenUpperLegR * Math.cos(ang);
  let ky = rHip.y + lenUpperLegR * Math.sin(ang);
  p.line(rHip.x, rHip.y, kx, ky);

  ang = toRad(fallbackDeg('lowerLegRight', 95));
  p.strokeWeight(getStrokeWidth(segStats.lowerLegRight.diff));
  let fx = kx + lenLowerLegR * Math.cos(ang);
  let fy = ky + lenLowerLegR * Math.sin(ang);
  p.line(kx, ky, fx, fy);

  // left leg
  ang = toRad(fallbackDeg('upperLegLeft', 80));
  p.strokeWeight(getStrokeWidth(segStats.upperLegLeft.diff));
  kx = lHip.x + lenUpperLegL * Math.cos(ang);
  ky = lHip.y + lenUpperLegL * Math.sin(ang);
  p.line(lHip.x, lHip.y, kx, ky);

  ang = toRad(fallbackDeg('lowerLegLeft', 85));
  p.strokeWeight(getStrokeWidth(segStats.lowerLegLeft.diff));
  fx = kx + lenLowerLegL * Math.cos(ang);
  fy = ky + lenLowerLegL * Math.sin(ang);
  p.line(kx, ky, fx, fy);

  // ---------- red skeleton + angle labels (unchanged) ----------
  if (globals.posedetection.results.landmarks) {
    const pairs = [
      [11,13],[13,15],[12,14],[14,16],
      [23,25],[25,27],[24,26],[26,28]
    ];
    const maxPeople = 2;
    const numPeople = Math.min(globals.posedetection.results.landmarks.length, maxPeople);
    for (let i = 0; i < numPeople; i++) {
      const pose = globals.posedetection.results.landmarks[i];
      p.stroke(255,0,0); p.strokeWeight(4);
      for (const [s,e] of pairs) {
        const ps = pose[s], pe = pose[e];
        if (!ps || !pe) continue;
        const x1 = ps.x * globals.width, y1 = ps.y * globals.height;
        const x2 = pe.x * globals.width, y2 = pe.y * globals.height;
        p.line(x1,y1,x2,y2);
        let angDeg = p.degrees(p.atan2(y2 - y1, x2 - x1));
        angDeg = angDeg < 0 ? angDeg + 360 : angDeg;
        const midX = (x1+x2)/2, midY=(y1+y2)/2;
        p.push();
        p.translate(midX + 10, midY);
        p.scale(-1, 1);
        p.noStroke(); p.fill(255);
        p.textSize(12);
        p.text(angDeg.toFixed(2), 0, 0);
        p.pop();
      }
    }
  }

  p.pop();
};
// =====================================================================
// #SEGMENT_01: THREE.JS IMPORT & MODULE STATE
// =====================================================================
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

let animationFrameId = null;
let isScanningBoost = false;
let scrollProgress = 0;
let sceneCleanup = null;


// =====================================================================
// #SEGMENT_02: GLOWING NODE & VOLUMETRIC HALO TEXTURES
// =====================================================================
function createGlowingNodeTexture() {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.26, 'rgba(110, 231, 183, 0.96)');
  grad.addColorStop(0.58, 'rgba(56, 189, 248, 0.45)');
  grad.addColorStop(1, 'rgba(16, 185, 129, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createVolumetricGlowTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
  grad.addColorStop(0, 'rgba(16, 185, 129, 0.44)');
  grad.addColorStop(0.36, 'rgba(6, 182, 212, 0.25)');
  grad.addColorStop(0.68, 'rgba(139, 92, 246, 0.14)');
  grad.addColorStop(1, 'rgba(19, 25, 38, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}


// =====================================================================
// #SEGMENT_03: VERTEX COLOR GRADIENTS (EMERALD -> CYAN -> VIOLET)
// =====================================================================
function extractColoredVertices(geometry) {
  const posAttr = geometry.getAttribute('position');
  const seen = new Set();
  const unique = [];
  const colors = [];

  const cEmerald = new THREE.Color(0x34d399);
  const cCyan = new THREE.Color(0x38bdf8);
  const cViolet = new THREE.Color(0xa78bfa);
  const tempColor = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const key = `${x.toFixed(3)}_${y.toFixed(3)}_${z.toFixed(3)}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(x, y, z);

      const t = THREE.MathUtils.clamp((y + 2.2) / 4.4, 0, 1);
      if (t < 0.5) {
        tempColor.lerpColors(cViolet, cCyan, t * 2);
      } else {
        tempColor.lerpColors(cCyan, cEmerald, (t - 0.5) * 2);
      }
      colors.push(tempColor.r, tempColor.g, tempColor.b);
    }
  }

  const outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute('position', new THREE.Float32BufferAttribute(unique, 3));
  outGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return outGeo;
}

function applyEdgeGradientColors(edgesGeo) {
  const posAttr = edgesGeo.getAttribute('position');
  const colors = new Float32Array(posAttr.count * 3);

  const cEmerald = new THREE.Color(0x34d399);
  const cCyan = new THREE.Color(0x38bdf8);
  const cViolet = new THREE.Color(0x818cf8);
  const temp = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const blend = THREE.MathUtils.clamp((x + y + 3.2) / 6.4, 0, 1);

    if (blend < 0.5) {
      temp.lerpColors(cViolet, cCyan, blend * 2);
    } else {
      temp.lerpColors(cCyan, cEmerald, (blend - 0.5) * 2);
    }
    colors[i * 3] = temp.r;
    colors[i * 3 + 1] = temp.g;
    colors[i * 3 + 2] = temp.b;
  }

  edgesGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}


// =====================================================================
// #SEGMENT_04: 3D GEODESIC CRYSTAL, LIGHTING & LUMINOUS ORBITAL RINGS
// =====================================================================
export function initUpfrontScene(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (sceneCleanup) {
    sceneCleanup();
    sceneCleanup = null;
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();

  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || 650;

  const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
  camera.position.set(0, 0, 7.1);
  camera.lookAt(0, 0, 0);

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance'
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // 3D Depth Lighting Rig (Emerald Key, Cyan Fill, Violet Rim)
  const ambientLight = new THREE.AmbientLight(0x1e293b, 1.5);
  scene.add(ambientLight);

  const emeraldLight = new THREE.PointLight(0x34d399, 20, 18);
  emeraldLight.position.set(3.2, 2.8, 3.8);
  scene.add(emeraldLight);

  const cyanLight = new THREE.PointLight(0x38bdf8, 18, 18);
  cyanLight.position.set(-3.4, -2.0, 3.2);
  scene.add(cyanLight);

  const violetRimLight = new THREE.PointLight(0xa855f7, 16, 18);
  violetRimLight.position.set(0, 3.2, -3.5);
  scene.add(violetRimLight);

  const nodeTexture = createGlowingNodeTexture();
  const haloTexture = createVolumetricGlowTexture();

  // Volumetric Backdrop Aura Sprite for Deep Spatial Separation
  const backdropHaloMat = new THREE.SpriteMaterial({
    map: haloTexture,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const backdropHalo = new THREE.Sprite(backdropHaloMat);
  backdropHalo.scale.set(8.4, 8.4, 1);
  backdropHalo.position.set(0, 0, -1.2);
  scene.add(backdropHalo);

  const masterGroup = new THREE.Group();
  masterGroup.position.set(0, -0.02, 0);
  scene.add(masterGroup);

  // 1. Outer Multi-Color Geodesic Polyhedron Lattice
  const outerGeo = new THREE.IcosahedronGeometry(2.24, 1);
  const outerEdges = new THREE.EdgesGeometry(outerGeo);
  applyEdgeGradientColors(outerEdges);

  const outerEdgeMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.86
  });
  const outerWireframe = new THREE.LineSegments(outerEdges, outerEdgeMat);

  const outerGlassMat = new THREE.MeshPhysicalMaterial({
    color: 0x0f766e,
    emissive: 0x064e3b,
    emissiveIntensity: 0.28,
    roughness: 0.18,
    metalness: 0.22,
    transparent: true,
    opacity: 0.13,
    flatShading: true,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const outerGlassShell = new THREE.Mesh(outerGeo, outerGlassMat);

  const outerNodesGeo = extractColoredVertices(outerGeo);
  const outerNodesMat = new THREE.PointsMaterial({
    map: nodeTexture,
    vertexColors: true,
    size: 0.34,
    transparent: true,
    opacity: 1.0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const outerNodes = new THREE.Points(outerNodesGeo, outerNodesMat);

  const outerPolyGroup = new THREE.Group();
  outerPolyGroup.add(outerGlassShell);
  outerPolyGroup.add(outerWireframe);
  outerPolyGroup.add(outerNodes);
  masterGroup.add(outerPolyGroup);

  // 2. Sculpted 3D Faceted Crystal Core + Neural Struts
  const innerGeo = new THREE.IcosahedronGeometry(1.16, 1);
  const innerCrystalMat = new THREE.MeshStandardMaterial({
    color: 0x0ea5e9,
    emissive: 0x10b981,
    emissiveIntensity: 0.45,
    roughness: 0.2,
    metalness: 0.8,
    flatShading: true,
    transparent: true,
    opacity: 0.72
  });
  const innerCrystalMesh = new THREE.Mesh(innerGeo, innerCrystalMat);

  const innerEdges = new THREE.EdgesGeometry(innerGeo);
  const innerEdgeMat = new THREE.LineBasicMaterial({
    color: 0x7dd3fc,
    transparent: true,
    opacity: 0.82
  });
  const innerWireframe = new THREE.LineSegments(innerEdges, innerEdgeMat);

  const innerNodesGeo = extractColoredVertices(innerGeo);
  const innerNodesMat = new THREE.PointsMaterial({
    map: nodeTexture,
    color: 0xa7f3d0,
    size: 0.22,
    transparent: true,
    opacity: 0.96,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const innerNodes = new THREE.Points(innerNodesGeo, innerNodesMat);

  // Radial Neural Connectors linking Inner Crystal to Outer Lattice
  const outerPos = outerNodesGeo.getAttribute('position');
  const innerPos = innerNodesGeo.getAttribute('position');
  const strutVertices = [];
  const pairCount = Math.min(outerPos.count, innerPos.count);
  for (let i = 0; i < pairCount; i++) {
    strutVertices.push(
      innerPos.getX(i), innerPos.getY(i), innerPos.getZ(i),
      outerPos.getX(i), outerPos.getY(i), outerPos.getZ(i)
    );
  }
  const strutGeo = new THREE.BufferGeometry();
  strutGeo.setAttribute('position', new THREE.Float32BufferAttribute(strutVertices, 3));
  const strutMat = new THREE.LineBasicMaterial({
    color: 0x2dd4bf,
    transparent: true,
    opacity: 0.28
  });
  const radialStruts = new THREE.LineSegments(strutGeo, strutMat);
  outerPolyGroup.add(radialStruts);

  const innerCoreGroup = new THREE.Group();
  innerCoreGroup.add(innerCrystalMesh);
  innerCoreGroup.add(innerWireframe);
  innerCoreGroup.add(innerNodes);
  masterGroup.add(innerCoreGroup);

  // 3. Thick 3D Glowing Torus Orbital Rings + Comet Trails
  const create3DOrbitalRing = (radius, tubeRadius, rotX, rotY, rotZ, colorHex, emissiveHex, opacity) => {
    const torusGeo = new THREE.TorusGeometry(radius, tubeRadius, 14, 140);
    const torusMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      emissive: emissiveHex,
      emissiveIntensity: 0.88,
      roughness: 0.25,
      metalness: 0.5,
      transparent: true,
      opacity
    });
    const torusMesh = new THREE.Mesh(torusGeo, torusMat);

    const ringHolder = new THREE.Group();
    ringHolder.rotation.set(rotX, rotY, rotZ);
    ringHolder.add(torusMesh);

    const trailDots = [];
    for (let k = 0; k < 3; k++) {
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.Float32BufferAttribute([radius, 0, 0], 3));
      const pMat = new THREE.PointsMaterial({
        map: nodeTexture,
        color: colorHex,
        size: 0.42 - k * 0.1,
        transparent: true,
        opacity: 1 - k * 0.28,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const pDot = new THREE.Points(pGeo, pMat);
      ringHolder.add(pDot);
      trailDots.push({ pDot, pGeo, pMat });
    }

    masterGroup.add(ringHolder);
    return { ringHolder, torusGeo, torusMat, trailDots, radius };
  };

  const orbit1 = create3DOrbitalRing(3.05, 0.022, 1.16, 0.38, -0.32, 0x34d399, 0x10b981, 0.8);
  const orbit2 = create3DOrbitalRing(2.88, 0.02, -1.08, -0.44, 0.42, 0x38bdf8, 0x0284c7, 0.74);
  const orbit3 = create3DOrbitalRing(2.65, 0.016, 0.48, 0.88, 0.18, 0xa78bfa, 0x7c3aed, 0.56);

  // 4. Multi-Color Floating Depth Particles
  const dustCount = 180;
  const dustPositions = new Float32Array(dustCount * 3);
  const dustColors = new Float32Array(dustCount * 3);
  const palette = [
    new THREE.Color(0x34d399),
    new THREE.Color(0x38bdf8),
    new THREE.Color(0xa78bfa)
  ];

  for (let i = 0; i < dustCount; i++) {
    const r = 2.4 + Math.random() * 3.2;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    dustPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    dustPositions[i * 3 + 2] = r * Math.cos(phi);

    const col = palette[i % palette.length];
    dustColors[i * 3] = col.r;
    dustColors[i * 3 + 1] = col.g;
    dustColors[i * 3 + 2] = col.b;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  dustGeo.setAttribute('color', new THREE.BufferAttribute(dustColors, 3));
  const dustMat = new THREE.PointsMaterial({
    map: nodeTexture,
    vertexColors: true,
    size: 0.14,
    transparent: true,
    opacity: 0.8,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const dustField = new THREE.Points(dustGeo, dustMat);
  scene.add(dustField);

  let pointerX = 0;
  let pointerY = 0;
  const onPointerMove = (e) => {
    pointerX = (e.clientX / window.innerWidth) * 2 - 1;
    pointerY = (e.clientY / window.innerHeight) * 2 - 1;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  const onResize = () => {
    if (!container) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || 650;
    camera.aspect = w / h;
    camera.position.z = w < 640 ? 8.8 : 7.1;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  onResize();
  window.addEventListener('resize', onResize, { passive: true });

  const clock = new THREE.Clock();
  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const elapsed = clock.getElapsedTime();

    const speed = prefersReducedMotion ? 0.12 : isScanningBoost ? 3.0 : 1.0 + scrollProgress * 0.85;

    outerPolyGroup.rotation.y += delta * 0.24 * speed;
    outerPolyGroup.rotation.x += delta * 0.09 * speed;

    innerCoreGroup.rotation.y -= delta * 0.38 * speed;
    innerCoreGroup.rotation.z += delta * 0.18 * speed;

    const coreScale = 1 + Math.sin(elapsed * 2.4) * (isScanningBoost ? 0.09 : 0.038);
    innerCoreGroup.scale.setScalar(coreScale);

    const haloScale = 8.4 + Math.sin(elapsed * 1.5) * 0.45;
    backdropHalo.scale.set(haloScale, haloScale, 1);

    // Scroll-driven depth expansion & tilt
    if (!prefersReducedMotion) {
      const targetScale = 1 + scrollProgress * 0.24;
      masterGroup.scale.setScalar(THREE.MathUtils.lerp(masterGroup.scale.x, targetScale, 0.08));
      masterGroup.position.y = THREE.MathUtils.lerp(masterGroup.position.y, -0.02 - scrollProgress * 0.55, 0.08);
    }

    const t1 = elapsed * 0.9 * speed;
    orbit1.trailDots.forEach((d, idx) => {
      const a = t1 - idx * 0.11;
      d.pDot.position.set(Math.cos(a) * orbit1.radius, Math.sin(a) * orbit1.radius, 0);
    });

    const t2 = -elapsed * 0.76 * speed + 1.8;
    orbit2.trailDots.forEach((d, idx) => {
      const a = t2 + idx * 0.11;
      d.pDot.position.set(Math.cos(a) * orbit2.radius, Math.sin(a) * orbit2.radius, 0);
    });

    const t3 = elapsed * 0.62 * speed + 3.4;
    orbit3.trailDots.forEach((d, idx) => {
      const a = t3 - idx * 0.11;
      d.pDot.position.set(Math.cos(a) * orbit3.radius, Math.sin(a) * orbit3.radius, 0);
    });

    dustField.rotation.y -= delta * 0.045 * speed;

    const targetRotY = pointerX * 0.52 + scrollProgress * 1.15;
    const targetRotX = pointerY * 0.34 + scrollProgress * 0.35;
    masterGroup.rotation.y += (targetRotY - masterGroup.rotation.y) * 0.06;
    masterGroup.rotation.x += (targetRotX - masterGroup.rotation.x) * 0.06;

    innerCrystalMat.emissiveIntensity = THREE.MathUtils.lerp(
      innerCrystalMat.emissiveIntensity,
      isScanningBoost ? 0.95 : 0.45,
      0.08
    );

    renderer.render(scene, camera);
  };
  animate();

  sceneCleanup = () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', onResize);
    outerGeo.dispose();
    outerEdges.dispose();
    outerEdgeMat.dispose();
    outerGlassMat.dispose();
    outerNodesGeo.dispose();
    outerNodesMat.dispose();
    innerGeo.dispose();
    innerCrystalMat.dispose();
    innerEdges.dispose();
    innerEdgeMat.dispose();
    innerNodesGeo.dispose();
    innerNodesMat.dispose();
    strutGeo.dispose();
    strutMat.dispose();
    [orbit1, orbit2, orbit3].forEach((o) => {
      o.torusGeo.dispose();
      o.torusMat.dispose();
      o.trailDots.forEach((d) => {
        d.pGeo.dispose();
        d.pMat.dispose();
      });
    });
    dustGeo.dispose();
    dustMat.dispose();
    backdropHaloMat.dispose();
    nodeTexture.dispose();
    haloTexture.dispose();
    renderer.dispose();
  };
}

export function setUpfrontScanState(active) {
  isScanningBoost = Boolean(active);
}

export function setUpfrontScrollProgress(progress) {
  scrollProgress = Math.max(0, Math.min(1, Number(progress) || 0));
} 

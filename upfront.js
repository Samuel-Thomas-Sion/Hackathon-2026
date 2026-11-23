// =====================================================================
// #SEGMENT_01: THREE.JS IMPORT & MODULE STATE
// =====================================================================
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

let animationFrameId = null;
let isScanningBoost = false;
let sceneCleanup = null;










// =====================================================================
// #SEGMENT_02: PROCEDURAL EARTH CONTINENTS & CITY LIGHTS TEXTURE
// =====================================================================
function createProceduralEarthTexture() {
  const width = 1024;
  const height = 512;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Deep midnight-slate ocean base matching #131926 UI palette
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, '#0d1726');
  oceanGrad.addColorStop(0.5, '#0f1d30');
  oceanGrad.addColorStop(1, '#0b1422');
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle equirectangular ocean grid lines
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.lineWidth = 1;
  for (let lon = -180; lon <= 180; lon += 15) {
    const x = ((lon + 180) / 360) * width;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    const y = ((90 - lat) / 180) * height;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  // Helper: Convert [longitude, latitude] to canvas [x, y]
  const toXY = ([lon, lat]) => [
    ((lon + 180) / 360) * width,
    ((90 - lat) / 180) * height
  ];

  // Recognizable Earth Continent Polygons [lon, lat]
  const continents = [
    // North America
    [
      [-168, 66], [-152, 70], [-130, 70], [-105, 73], [-82, 70], [-64, 60],
      [-55, 50], [-67, 44], [-76, 35], [-81, 25], [-84, 30], [-96, 28],
      [-97, 19], [-86, 13], [-79, 9], [-85, 11], [-94, 16], [-106, 22],
      [-114, 31], [-122, 37], [-125, 49], [-138, 58], [-152, 60], [-164, 60]
    ],
    // Greenland
    [
      [-56, 60], [-44, 60], [-22, 70], [-18, 81], [-45, 83], [-62, 77], [-58, 68]
    ],
    // South America
    [
      [-79, 9], [-72, 12], [-60, 8], [-50, 1], [-35, -6], [-39, -18],
      [-48, -28], [-58, -38], [-66, -48], [-68, -55], [-74, -52], [-73, -38],
      [-71, -18], [-81, -5], [-79, 4]
    ],
    // Europe
    [
      [-9, 37], [-9, 43], [-2, 48], [4, 52], [9, 55], [6, 61], [16, 69],
      [28, 71], [42, 67], [58, 68], [58, 52], [44, 44], [34, 45], [26, 41],
      [22, 37], [16, 38], [13, 44], [6, 43], [0, 38]
    ],
    // UK & Ireland
    [
      [-8, 51], [-5, 58], [1, 57], [1, 51], [-5, 50]
    ],
    // Africa
    [
      [-17, 15], [-13, 28], [-5, 35], [10, 37], [25, 32], [33, 31], [43, 12],
      [51, 11], [41, -2], [40, -15], [35, -25], [27, -33], [18, -34], [14, -22],
      [12, -6], [9, 4], [2, 6], [-8, 5], [-16, 11]
    ],
    // Madagascar
    [
      [44, -25], [47, -25], [50, -14], [47, -13], [44, -19]
    ],
    // Asia & Indian Subcontinent
    [
      [27, 41], [36, 42], [44, 44], [58, 52], [58, 68], [85, 73], [115, 73],
      [145, 70], [175, 66], [162, 56], [142, 53], [135, 43], [129, 35],
      [121, 39], [122, 31], [115, 22], [108, 16], [104, 2], [99, 8], [96, 17],
      [88, 22], [85, 19], [80, 13], [77, 8], [73, 15], [69, 23], [61, 25],
      [56, 26], [50, 29], [58, 22], [53, 16], [44, 13], [35, 29], [35, 36]
    ],
    // Japan
    [
      [130, 32], [136, 35], [141, 41], [144, 44], [140, 44], [138, 37], [131, 33]
    ],
    // Indonesia / Maritime Southeast Asia
    [
      [96, 5], [105, -6], [115, -8], [122, -7], [118, 1], [108, 2], [100, 1]
    ],
    // Australia
    [
      [114, -22], [123, -15], [131, -12], [136, -15], [142, -11], [149, -20],
      [153, -28], [149, -37], [138, -35], [130, -32], [116, -34], [113, -26]
    ],
    // New Zealand
    [
      [167, -46], [174, -41], [177, -37], [173, -35], [171, -42], [166, -45]
    ]
  ];

  // Draw glowing landmasses + crisp emerald coastlines
  ctx.save();
  ctx.shadowColor = 'rgba(52, 211, 153, 0.55)';
  ctx.shadowBlur = 10;

  continents.forEach((poly) => {
    ctx.beginPath();
    poly.forEach((coord, idx) => {
      const [x, y] = toXY(coord);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();

    const landGrad = ctx.createLinearGradient(0, 0, width, height);
    landGrad.addColorStop(0, 'rgba(16, 185, 129, 0.36)');
    landGrad.addColorStop(0.5, 'rgba(20, 184, 166, 0.34)');
    landGrad.addColorStop(1, 'rgba(56, 189, 248, 0.32)');
    ctx.fillStyle = landGrad;
    ctx.fill();

    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 2;
    ctx.stroke();
  });
  ctx.restore();

  // Digital dot-matrix stipple texture clipped inside continents
  ctx.save();
  continents.forEach((poly) => {
    ctx.beginPath();
    poly.forEach((coord, idx) => {
      const [x, y] = toXY(coord);
      if (idx === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.clip();

    ctx.fillStyle = 'rgba(167, 243, 208, 0.25)';
    for (let gx = 0; gx < width; gx += 6) {
      for (let gy = 0; gy < height; gy += 6) {
        ctx.fillRect(gx, gy, 1.5, 1.5);
      }
    }
    ctx.restore();
    ctx.save();
  });
  ctx.restore();

  // Global Shield Hub Beacons (with bright primary node over India)
  const hubs = [
    { lon: 78.5, lat: 17.4, primary: true },  // Hyderabad / India
    { lon: 77.2, lat: 28.6, primary: true },  // New Delhi
    { lon: 72.8, lat: 19.0, primary: true },  // Mumbai
    { lon: -0.1, lat: 51.5, primary: false }, // London
    { lon: -74.0, lat: 40.7, primary: false }, // New York
    { lon: 103.8, lat: 1.3, primary: false }, // Singapore
    { lon: 139.7, lat: 35.7, primary: false }, // Tokyo
    { lon: 151.2, lat: -33.8, primary: false }, // Sydney
    { lon: -46.6, lat: -23.5, primary: false }, // Sao Paulo
    { lon: 36.8, lat: -1.3, primary: false }  // Nairobi
  ];

  hubs.forEach((hub) => {
    const [hx, hy] = toXY([hub.lon, hub.lat]);
    ctx.beginPath();
    ctx.arc(hx, hy, hub.primary ? 6 : 3.5, 0, Math.PI * 2);
    ctx.fillStyle = hub.primary ? 'rgba(52, 211, 153, 0.35)' : 'rgba(56, 189, 248, 0.3)';
    ctx.fill();

    ctx.beginPath();
    ctx.arc(hx, hy, hub.primary ? 2.6 : 1.8, 0, Math.PI * 2);
    ctx.fillStyle = hub.primary ? '#a7f3d0' : '#7dd3fc';
    ctx.fill();
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}










// =====================================================================
// #SEGMENT_03: CENTERED 3D EARTH GLOBE, ATMOSPHERE & ORBITAL RINGS
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
  const height = container.clientHeight || 620;

  // Camera centered directly on the Earth Globe at (0, 0, 0)
  const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
  camera.position.set(0, 0, 7.2);
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

  // Three-point studio lighting for crisp 3D depth
  const ambientLight = new THREE.AmbientLight(0xd1fae5, 0.9);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0x34d399, 1.8);
  keyLight.position.set(5, 3, 6);
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.4);
  rimLight.position.set(-5, -2, -4);
  scene.add(rimLight);

  // Master centered Earth Group with authentic 23.5° axial tilt
  const earthTiltGroup = new THREE.Group();
  earthTiltGroup.position.set(0, -0.08, 0);
  earthTiltGroup.rotation.z = THREE.MathUtils.degToRad(23.5);
  scene.add(earthTiltGroup);

  const earthSpinGroup = new THREE.Group();
  // Start rotated so India & Eurasia face forward on load
  earthSpinGroup.rotation.y = -2.35;
  earthTiltGroup.add(earthSpinGroup);

  // 1. Core 3D Earth Sphere with Procedural Continents
  const earthTexture = createProceduralEarthTexture();
  const earthGeo = new THREE.SphereGeometry(2.05, 64, 64);
  const earthMat = new THREE.MeshStandardMaterial({
    map: earthTexture,
    emissiveMap: earthTexture,
    emissive: new THREE.Color(0x10b981),
    emissiveIntensity: 0.75,
    roughness: 0.5,
    metalness: 0.15
  });
  const earthMesh = new THREE.Mesh(earthGeo, earthMat);
  earthSpinGroup.add(earthMesh);

  // 2. Latitude & Longitude Geodesic Wireframe Overlay
  const graticuleGeo = new THREE.SphereGeometry(2.075, 28, 18);
  const graticuleWire = new THREE.WireframeGeometry(graticuleGeo);
  const graticuleMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.12
  });
  const graticuleLines = new THREE.LineSegments(graticuleWire, graticuleMat);
  earthSpinGroup.add(graticuleLines);

  // 3. Atmospheric Fresnel Halo Rim
  const atmosphereGeo = new THREE.SphereGeometry(2.24, 48, 48);
  const atmosphereMat = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    uniforms: {
      glowColor: { value: new THREE.Color(0x34d399) },
      secondaryColor: { value: new THREE.Color(0x38bdf8) }
    },
    vertexShader: `
      varying vec3 vNormal;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform vec3 secondaryColor;
      varying vec3 vNormal;
      void main() {
        float intensity = pow(0.66 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
        vec3 col = mix(secondaryColor, glowColor, 0.6);
        gl_FragColor = vec4(col, intensity * 0.85);
      }
    `
  });
  const atmosphereMesh = new THREE.Mesh(atmosphereGeo, atmosphereMat);
  earthTiltGroup.add(atmosphereMesh);

  // 4. Dual Orbital Legal Shield Rings & Satellites
  const orbitRing1Geo = new THREE.TorusGeometry(2.68, 0.011, 12, 120);
  const orbitRing1Mat = new THREE.MeshBasicMaterial({
    color: 0x34d399,
    transparent: true,
    opacity: 0.35
  });
  const orbitRing1 = new THREE.Mesh(orbitRing1Geo, orbitRing1Mat);
  orbitRing1.rotation.x = Math.PI / 2.3;
  orbitRing1.rotation.y = 0.25;
  earthTiltGroup.add(orbitRing1);

  const orbitRing2Geo = new THREE.TorusGeometry(2.92, 0.008, 12, 120);
  const orbitRing2Mat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.24
  });
  const orbitRing2 = new THREE.Mesh(orbitRing2Geo, orbitRing2Mat);
  orbitRing2.rotation.x = -Math.PI / 2.6;
  orbitRing2.rotation.y = -0.35;
  earthTiltGroup.add(orbitRing2);

  // Orbiting Shield Nodes on Ring 1 & Ring 2
  const satGeo = new THREE.SphereGeometry(0.055, 16, 16);
  const sat1 = new THREE.Mesh(satGeo, new THREE.MeshBasicMaterial({ color: 0xa7f3d0 }));
  sat1.position.set(2.68, 0, 0);
  orbitRing1.add(sat1);

  const sat2 = new THREE.Mesh(satGeo, new THREE.MeshBasicMaterial({ color: 0x7dd3fc }));
  sat2.position.set(-2.92, 0, 0);
  orbitRing2.add(sat2);

  // Subtle ambient star/data dust field around the globe
  const dustCount = 160;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    const r = 3.4 + Math.random() * 2.8;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    dustPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    dustPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    dustPositions[i * 3 + 2] = r * Math.cos(phi);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dustMat = new THREE.PointsMaterial({
    color: 0x6ee7b7,
    size: 0.032,
    transparent: true,
    opacity: 0.45
  });
  const dustPoints = new THREE.Points(dustGeo, dustMat);
  scene.add(dustPoints);

  // Smooth Mouse Parallax Interaction
  let targetMouseX = 0;
  let targetMouseY = 0;
  const onPointerMove = (e) => {
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = (e.clientY / window.innerHeight) * 2 - 1;
    targetMouseX = nx * 0.25;
    targetMouseY = ny * 0.16;
  };
  window.addEventListener('pointermove', onPointerMove, { passive: true });

  // Responsive Resize Handler
  const onResize = () => {
    if (!container) return;
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || 620;
    camera.aspect = w / h;
    // Slightly pull camera back on narrow mobile viewports so full globe fits
    camera.position.z = w < 640 ? 8.6 : 7.2;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  };
  onResize();
  window.addEventListener('resize', onResize, { passive: true });

  // Render & Animation Loop
  const clock = new THREE.Clock();
  const animate = () => {
    animationFrameId = requestAnimationFrame(animate);
    const delta = clock.getDelta();

    const speedMultiplier = prefersReducedMotion ? 0.12 : isScanningBoost ? 3.2 : 1.0;

    earthSpinGroup.rotation.y += delta * 0.24 * speedMultiplier;
    orbitRing1.rotation.z += delta * 0.45 * speedMultiplier;
    orbitRing2.rotation.z -= delta * 0.35 * speedMultiplier;
    dustPoints.rotation.y -= delta * 0.04 * speedMultiplier;

    earthMat.emissiveIntensity = THREE.MathUtils.lerp(
      earthMat.emissiveIntensity,
      isScanningBoost ? 1.25 : 0.75,
      0.08
    );

    // Smooth camera parallax around center
    camera.position.x += (targetMouseX - camera.position.x) * 0.05;
    camera.position.y += (-targetMouseY - camera.position.y) * 0.05;
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };
  animate();

  sceneCleanup = () => {
    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', onResize);
    earthGeo.dispose();
    earthMat.dispose();
    earthTexture.dispose();
    graticuleGeo.dispose();
    graticuleWire.dispose();
    graticuleMat.dispose();
    atmosphereGeo.dispose();
    atmosphereMat.dispose();
    orbitRing1Geo.dispose();
    orbitRing1Mat.dispose();
    orbitRing2Geo.dispose();
    orbitRing2Mat.dispose();
    dustGeo.dispose();
    dustMat.dispose();
    renderer.dispose();
  };
}

export function setUpfrontScanState(active) {
  isScanningBoost = Boolean(active);
}
/* 光景：一层很轻的 three.js 场景 —— 悬浮的纸片 / 跟手的光源 / 真实投影 / 空气里的尘。
   只在支持 WebGL、且用户没关掉「减少动态效果」时启动；失败就静默退出，交给 CSS 光斑。 */

const THREE_URL = new URL('../vendor/three.module.min.js', import.meta.url).href;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const smallScreen = window.matchMedia('(max-width: 720px)').matches;
const coarse = window.matchMedia('(hover: none)').matches;

let started = false;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

function roundedRect(THREE, w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2;
  const y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export async function initScene() {
  if (started) return null;
  if (reduceMotion) return null;
  if (!hasWebGL()) return null;

  let THREE;
  try {
    THREE = await import(THREE_URL);
  } catch {
    return null;
  }
  started = true;

  const canvas = document.createElement('canvas');
  canvas.id = 'scene';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(canvas, document.body.firstChild);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !smallScreen,
      powerPreference: 'high-performance'
    });
  } catch {
    canvas.remove();
    return null;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, smallScreen ? 1.5 : 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.shadowMap.enabled = !smallScreen;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf4ebd6, 16, 44);
  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 120);
  camera.position.set(0, 1.6, 16);

  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

  /* ---- 灯 ---- */

  const hemi = new THREE.HemisphereLight(0xfff6e2, 0xa98c5c, 0.85);
  scene.add(hemi);

  const key = new THREE.DirectionalLight(0xffeccb, 1.35);
  key.position.set(7, 11, 8);
  if (!smallScreen) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1;
    key.shadow.camera.far = 46;
    key.shadow.camera.left = -18;
    key.shadow.camera.right = 18;
    key.shadow.camera.top = 16;
    key.shadow.camera.bottom = -16;
    key.shadow.bias = -0.0009;
    key.shadow.radius = 3;
  }
  scene.add(key);

  /* 跟手的那盏台灯 */
  const lamp = new THREE.PointLight(0xffcf92, 18, 46, 2);
  lamp.position.set(0, 2, 7);
  scene.add(lamp);

  /* ---- 纸片 ---- */

  const group = new THREE.Group();
  scene.add(group);

  const shardMat = new THREE.MeshStandardMaterial({
    color: 0xfdf0d4,
    roughness: 0.95,
    metalness: 0,
    transparent: true,
    opacity: 0.72,
    side: THREE.DoubleSide,
    depthWrite: false
  });
  const shardMatDark = new THREE.MeshStandardMaterial({
    color: 0xd8c19a,
    roughness: 0.95,
    metalness: 0,
    transparent: true,
    opacity: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false
  });

  const shards = [];
  const count = smallScreen ? 7 : 14;
  const spreadX = Math.min(26, window.innerWidth / 52);
  const spreadY = Math.min(20, window.innerHeight / 46);

  for (let i = 0; i < count; i++) {
    const w = 0.5 + Math.random() * 1.15;
    const h = 0.5 + Math.random() * 1.15;
    const geo = new THREE.ExtrudeGeometry(roundedRect(THREE, w, h, Math.min(w, h) * 0.16), {
      depth: 0.05,
      bevelEnabled: true,
      bevelSize: 0.015,
      bevelThickness: 0.015,
      bevelSegments: 2,
      curveSegments: 6
    });
    geo.center();

    const mesh = new THREE.Mesh(geo, i % 3 === 2 ? shardMatDark : shardMat);
    const side = Math.random() > 0.5 ? 1 : -1;
    const ring = 0.52 + Math.random() * 0.62;
    mesh.position.set(
      side * spreadX * ring,
      (Math.random() - 0.5) * spreadY * 1.06,
      -9 - Math.random() * 13
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.castShadow = !smallScreen;
    mesh.receiveShadow = !smallScreen;
    mesh.userData = {
      spin: (Math.random() - 0.5) * 0.06,
      bob: 0.25 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      baseY: mesh.position.y,
      baseX: mesh.position.x,
      depth: mesh.position.z
    };
    group.add(mesh);
    shards.push(mesh);
  }

  /* ---- 落影 ---- */

  if (!smallScreen) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.ShadowMaterial({ color: 0x7a5f30, opacity: 0.09 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -11;
    floor.receiveShadow = true;
    scene.add(floor);
  }

  /* ---- 尘 ---- */

  const dustGeo = new THREE.BufferGeometry();
  const dustCount = smallScreen ? 180 : 460;
  const pos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    pos[i * 3] = (Math.random() - 0.5) * 40;
    pos[i * 3 + 1] = (Math.random() - 0.5) * 26;
    pos[i * 3 + 2] = -14 + Math.random() * 16;
  }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

  const dustMat = new THREE.PointsMaterial({
    color: 0xffd9a4,
    size: smallScreen ? 0.075 : 0.055,
    transparent: true,
    opacity: 0.6,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  scene.add(dust);

  /* ---- 指针 ---- */

  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollY = window.scrollY;

  const onMove = (e) => {
    pointer.tx = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.ty = (e.clientY / window.innerHeight) * 2 - 1;
    document.body.classList.add('is-pointer');
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerleave', () => document.body.classList.remove('is-pointer'));

  const onScroll = () => { scrollY = window.scrollY; };
  window.addEventListener('scroll', onScroll, { passive: true });

  let resizeTimer = 0;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, w <= 720 ? 1.5 : 2));
      renderer.setSize(w, h, false);
    }, 160);
  };
  window.addEventListener('resize', onResize);

  /* ---- 主题 ---- */

  const applyTone = () => {
    const dark = isDark();
    shardMat.color.set(dark ? 0x6b5734 : 0xfdf0d4);
    shardMat.opacity = dark ? 0.3 : 0.72;
    shardMatDark.color.set(dark ? 0x3a2f1d : 0xd8c19a);
    shardMatDark.opacity = 0.42;
    scene.fog.color.set(dark ? 0x17130d : 0xf4ebd6);
    scene.fog.near = dark ? 14 : 16;
    scene.fog.far = dark ? 46 : 44;
    dustMat.color.set(dark ? 0xffbe72 : 0xffd9a4);
    dustMat.opacity = dark ? 0.42 : 0.6;
    key.intensity = dark ? 1.0 : 1.35;
    lamp.intensity = dark ? 12 : 18;
    hemi.intensity = dark ? 0.4 : 0.85;
    renderer.toneMappingExposure = dark ? 1.1 : 1.02;
  };
  applyTone();

  const themeObs = new MutationObserver(applyTone);
  themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  /* ---- 循环 ---- */

  const clock = new THREE.Clock();
  let raf = 0;
  let ready = false;

  const frame = () => {
    raf = requestAnimationFrame(frame);
    if (document.hidden) return;

    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    pointer.x += (pointer.tx - pointer.x) * 0.055;
    pointer.y += (pointer.ty - pointer.y) * 0.055;

    const scrollN = scrollY / Math.max(1, document.body.scrollHeight - window.innerHeight);
    const camY = 1.6 - scrollN * 3.2 - pointer.y * 0.5;
    camera.position.y += (camY - camera.position.y) * 0.06;
    camera.position.x += (pointer.x * 1.1 - camera.position.x) * 0.05;
    camera.lookAt(0, -0.4 - scrollN * 1.2, -4);

    lamp.position.x += (pointer.x * 13 - lamp.position.x) * 0.07;
    lamp.position.y += (-pointer.y * 8 + 1.5 - lamp.position.y) * 0.07;
    lamp.position.z = 7;

    for (const m of shards) {
      const d = m.userData;
      m.rotation.x += d.spin * dt * 0.9;
      m.rotation.z += d.spin * dt * 0.55;
      m.position.y = d.baseY + Math.sin(t * d.bob * 0.6 + d.phase) * 0.6;
      m.position.x = d.baseX + Math.cos(t * d.bob * 0.42 + d.phase) * 0.5 - pointer.x * (1.6 + d.depth * 0.05);
    }

    dust.rotation.y = t * 0.014 + pointer.x * 0.05;
    dust.position.y = Math.sin(t * 0.16) * 0.6 - scrollN * 1.4;

    renderer.render(scene, camera);

    if (!ready) {
      ready = true;
      canvas.classList.add('is-ready');
      document.body.classList.add('has-scene');
    }
  };

  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    canvas.classList.remove('is-ready');
  });

  frame();

  return { scene, camera, renderer };
}

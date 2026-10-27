import * as THREE from "three";
export function mountHero(container: HTMLElement) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  if (reduce.matches) return;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: innerWidth > 700,
      powerPreference: "low-power",
    });
  } catch {
    return;
  }
  renderer.setPixelRatio(
    Math.min(devicePixelRatio, innerWidth < 700 ? 1.25 : 1.75)
  );
  renderer.setClearColor(0x071820, 0);
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);
  container.classList.add("webgl-ready");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);
  camera.position.set(10, 9, 12);
  camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight(0xc1e9eb, 2));
  const sun = new THREE.DirectionalLight(0xffdf9b, 4);
  sun.position.set(3, 8, 1);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x55ffbd, 2);
  fill.position.set(-5, 3, 4);
  scene.add(fill);
  const world = new THREE.Group();
  scene.add(world);
  function box(
    w: number,
    h: number,
    d: number,
    color: number,
    x: number,
    y: number,
    z: number,
    metal = 0.4
  ) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color,
        metalness: metal,
        roughness: 0.45,
      })
    );
    m.position.set(x, y, z);
    world.add(m);
    return m;
  }
  box(10, 0.15, 7, 0x132e37, 0, -0.5, 0);
  const grid = new THREE.GridHelper(10, 24, 0x30695e, 0x20403f);
  grid.position.y = -0.41;
  world.add(grid);
  // Solar cells and their fine conductor grid use geometry rather than bitmap assets.
  for (let row = 0; row < 3; row++)
    for (let col = 0; col < 3; col++) {
      const group = new THREE.Group();
      group.position.set(-3.5 + col * 1.2, 0.15, -2 + row * 1.4);
      group.rotation.x = -0.32;
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(1.05, 0.075, 1.12),
        new THREE.MeshStandardMaterial({
          color: 0x124768,
          metalness: 0.8,
          roughness: 0.23,
        })
      );
      group.add(panel);
      const edge = new THREE.LineSegments(
        new THREE.EdgesGeometry(panel.geometry),
        new THREE.LineBasicMaterial({ color: 0x69adb7 })
      );
      group.add(edge);
      for (let j = 0; j < 4; j++) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(0.006, 0.007, 1.05),
          new THREE.MeshBasicMaterial({ color: 0x397f94 })
        );
        line.position.set(-0.38 + j * 0.25, 0.041, 0);
        group.add(line);
      }
      for (let j = 0; j < 4; j++) {
        const line = new THREE.Mesh(
          new THREE.BoxGeometry(1, 0.007, 0.006),
          new THREE.MeshBasicMaterial({ color: 0x397f94 })
        );
        line.position.set(0, 0.041, -0.4 + j * 0.27);
        group.add(line);
      }
      world.add(group);
      box(0.09, 0.5, 0.09, 0x628887, group.position.x, -0.15, group.position.z);
    }
  for (let k = 0; k < 3; k++) {
    box(0.7, 1.5, 0.9, 0x799e9b, 1 + k * 0.82, 0.35, -1.9);
    box(0.5, 0.12, 0.025, 0xc2facc, 1 + k * 0.82, 0.85, -1.43, 0);
    for (let j = 0; j < 4; j++)
      box(0.45, 0.035, 0.03, 0x254b50, 1 + k * 0.82, 0.12 + j * 0.11, -1.435);
  }
  const vault = box(1.6, 1.4, 1.6, 0x204b52, 2.3, 0.35, 1.5);
  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(vault.geometry),
    new THREE.LineBasicMaterial({ color: 0xadf4c5 })
  );
  edges.position.copy(vault.position);
  world.add(edges);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.48, 0.025, 8, 70),
    new THREE.MeshBasicMaterial({ color: 0xb7f4c6 })
  );
  ring.position.set(2.3, 1.075, 1.5);
  ring.rotation.x = Math.PI / 2;
  world.add(ring);
  const paths = [
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1, 0.1, 0.6),
      new THREE.Vector3(0.2, 0.1, 0.6),
      new THREE.Vector3(0.3, 0.1, -1.2),
      new THREE.Vector3(1.9, 0.1, -1.2),
    ]),
    new THREE.CatmullRomCurve3([
      new THREE.Vector3(2.3, 0.1, -1),
      new THREE.Vector3(3.8, 0.1, -0.6),
      new THREE.Vector3(3.8, 0.1, 1.5),
      new THREE.Vector3(3, 0.1, 1.5),
    ]),
  ];
  paths.forEach((p) =>
    world.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(p, 60, 0.018, 6, false),
        new THREE.MeshBasicMaterial({ color: 0x598b75 })
      )
    )
  );
  const particles: Array<{
    mesh: THREE.Mesh;
    path: THREE.CatmullRomCurve3;
    offset: number;
  }> = [];
  paths.forEach((path) => {
    for (let i = 0; i < 7; i++) {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.047, 8, 6),
        new THREE.MeshBasicMaterial({ color: 0xe3f4b0 })
      );
      world.add(mesh);
      particles.push({ mesh, path, offset: i / 7 });
    }
  });
  const orbit = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints(
      Array.from(
        { length: 128 },
        (_, i) =>
          new THREE.Vector3(
            Math.cos((i / 128) * Math.PI * 2) * 6.1,
            -0.45,
            Math.sin((i / 128) * Math.PI * 2) * 4.3
          )
      )
    ),
    new THREE.LineBasicMaterial({
      color: 0x476d62,
      transparent: true,
      opacity: 0.5,
    })
  );
  world.add(orbit);
  let visible = true,
    frame = 0,
    elapsed = 0,
    last = 0,
    destroyed = false;
  function draw(now: number) {
    frame = 0;
    if (destroyed || !visible || document.hidden || reduce.matches) return;
    elapsed += last ? Math.min(now - last, 50) : 0;
    last = now;
    world.rotation.y = Math.sin(elapsed * 0.00008) * 0.045 - 0.1;
    particles.forEach((p) =>
      p.mesh.position.copy(p.path.getPoint((elapsed * 0.00012 + p.offset) % 1))
    );
    renderer.render(scene, camera);
    frame = requestAnimationFrame(draw);
  }
  function schedule() {
    last = 0;
    if (!frame && !destroyed) frame = requestAnimationFrame(draw);
  }
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    renderer.setSize(width, height);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
    schedule();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible) schedule();
  });
  intersection.observe(container);
  const changed = () => {
    if (reduce.matches) {
      container.classList.remove("webgl-ready");
      renderer.domElement.hidden = true;
    } else {
      container.classList.add("webgl-ready");
      renderer.domElement.hidden = false;
    }
    schedule();
  };
  document.addEventListener("visibilitychange", schedule);
  reduce.addEventListener("change", changed);
  resize();
  return () => {
    destroyed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    intersection.disconnect();
    document.removeEventListener("visibilitychange", schedule);
    reduce.removeEventListener("change", changed);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => m.dispose());
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
  };
}

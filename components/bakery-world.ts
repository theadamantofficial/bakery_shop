import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { cakes, initialOrder, orderPrice, type CakeKind, type CakeOrder } from "./bakery-order";

type State = { stage: number; progress: number; order: CakeOrder; reducedMotion: boolean; paused: boolean };
type Callbacks = { onReady: () => void; onFailure: () => void; onSelect: (cake: CakeKind) => void };
export type BakeryWorld = { update: (state: State) => void; rotate: (amount: number) => void; dispose: () => void };
type XYZ = [number, number, number];
const clamp = THREE.MathUtils.clamp;
const phase = (p: number, a: number, b: number) => THREE.MathUtils.smoothstep(p, a, b);
const mix = THREE.MathUtils.lerp;

/** One owned resource pool for the entire visit; repeated models share geometry. */
class Atelier {
  geometries = new Set<THREE.BufferGeometry>();
  materials = new Set<THREE.Material>();
  textures = new Set<THREE.Texture>();
  private cache = new Map<string, THREE.BufferGeometry>();
  private surfaces = new Map<string, THREE.MeshStandardMaterial>();
  geometry(key: string, make: () => THREE.BufferGeometry) {
    if (!this.cache.has(key)) { const g = make(); this.cache.set(key, g); this.geometries.add(g); }
    return this.cache.get(key)!;
  }
  surface(color: string, roughness = .65, metalness = 0) {
    const key = `${color}:${roughness}:${metalness}`;
    if (!this.surfaces.has(key)) {
      const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      if (color === "#664330" || color === "#e9d8b9") {
        const canvas = document.createElement("canvas"); canvas.width = 128; canvas.height = 256; const context = canvas.getContext("2d")!;
        const pixels = context.createImageData(128, 256);
        for (let y = 0; y < 256; y++) for (let x = 0; x < 128; x++) {
          const value = color === "#664330" ? 155 + 45 * Math.sin(x * .8 + Math.sin(y * .019) * 3) + 18 * Math.sin(x * 3.2) : 170 + 28 * Math.sin(x * 9.3 + y * 13.7) * Math.sin(x * 3.1 - y * 5.9);
          const offset = (y * 128 + x) * 4; pixels.data[offset] = value; pixels.data[offset + 1] = value; pixels.data[offset + 2] = value; pixels.data[offset + 3] = 255;
        }
        context.putImageData(pixels, 0, 0); const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; this.textures.add(texture); m.bumpMap = texture; m.bumpScale = color === "#664330" ? .023 : .015;
      }
      this.surfaces.set(key, m); this.materials.add(m);
    }
    return this.surfaces.get(key)!;
  }
  mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, position: XYZ = [0, 0, 0], scale: XYZ = [1, 1, 1]) {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(...position); mesh.scale.set(...scale);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  box(parent: THREE.Object3D, size: XYZ, position: XYZ, color: string | THREE.Material, bevel = true) {
    return this.mesh(parent, this.geometry(bevel ? "rounded-box" : "box", () => bevel ? new RoundedBoxGeometry(1, 1, 1, 2, .045) : new THREE.BoxGeometry(1, 1, 1)), typeof color === "string" ? this.surface(color) : color, position, size);
  }
  sphere(parent: THREE.Object3D, scale: XYZ, position: XYZ, color: string | THREE.Material) {
    return this.mesh(parent, this.geometry("sphere", () => new THREE.SphereGeometry(1, 20, 12)), typeof color === "string" ? this.surface(color) : color, position, scale);
  }
  cylinder(parent: THREE.Object3D, radius: number, height: number, position: XYZ, color: string | THREE.Material, top = radius) {
    const key = `cylinder:${top / radius}`;
    return this.mesh(parent, this.geometry(key, () => new THREE.CylinderGeometry(top / radius, 1, 1, 40)), typeof color === "string" ? this.surface(color) : color, position, [radius, height, radius]);
  }
  torus(parent: THREE.Object3D, radius: number, tube: number, position: XYZ, color: string | THREE.Material, arc = Math.PI * 2) {
    return this.mesh(parent, this.geometry(`torus:${tube / radius}:${arc}`, () => new THREE.TorusGeometry(1, tube / radius, 8, 40, arc)), typeof color === "string" ? this.surface(color) : color, position, [radius, radius, radius]);
  }
  tube(parent: THREE.Object3D, points: XYZ[], radius: number, color: string | THREE.Material) {
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), 24, radius, 6, false);
    this.geometries.add(geo); return this.mesh(parent, geo, typeof color === "string" ? this.surface(color) : color);
  }
  text(parent: THREE.Object3D, words: string[], width: number, height: number, position: XYZ, background = "#f4e7cf", ink = "#592f31", size = 64) {
    const canvas = document.createElement("canvas"); canvas.width = 1024; canvas.height = Math.round(1024 * height / width);
    const ctx = canvas.getContext("2d")!; ctx.fillStyle = background; ctx.fillRect(0, 0, canvas.width, canvas.height);
    const margin = Math.min(18, canvas.height * .06);
    ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.strokeRect(margin, margin, canvas.width - margin * 2, canvas.height - margin * 2);
    ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    words.forEach((word, i) => { const fittedSize = Math.min(size * 2, canvas.height / words.length * .75) * (i === 0 ? 1 : .72); ctx.font = `${i === 0 ? "" : "italic "}${fittedSize}px Georgia, serif`; ctx.fillText(word, 512, canvas.height * (i + .5) / words.length, 950); });
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; this.textures.add(texture);
    const surface = new THREE.MeshStandardMaterial({ map: texture, roughness: .85 }); this.materials.add(surface);
    const plaque = new THREE.Group(); parent.add(plaque); plaque.position.set(...position);
    this.box(plaque, [width + .06, height + .06, .045], [0, 0, -.03], "#ad8650");
    this.mesh(plaque, this.geometry("plane", () => new THREE.PlaneGeometry(1, 1)), surface, [0, 0, 0], [width, height, 1]); return plaque;
  }
  instances(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, transforms: { position: XYZ; scale?: XYZ; rotation?: XYZ }[]) {
    const mesh = new THREE.InstancedMesh(geometry, material, transforms.length); const dummy = new THREE.Object3D();
    transforms.forEach((item, i) => { dummy.position.set(...item.position); dummy.scale.set(...(item.scale ?? [1, 1, 1])); dummy.rotation.set(...(item.rotation ?? [0, 0, 0])); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix); });
    mesh.castShadow = true; mesh.receiveShadow = true; mesh.computeBoundingSphere(); parent.add(mesh); return mesh;
  }
  dispose() { this.geometries.forEach(g => g.dispose()); this.materials.forEach(m => m.dispose()); this.textures.forEach(t => t.dispose()); }
}

const palette = { plaster: "#e9d8b9", cream: "#fff0d7", walnut: "#664330", dark: "#392c24", burgundy: "#723948", brass: "#bd945b", copper: "#b77748", green: "#68754f" };

type CakeModel = { group: THREE.Group; icing: THREE.MeshStandardMaterial; sponge: THREE.MeshStandardMaterial; frosting: THREE.Group; piping: THREE.Group; toppings: Record<string, THREE.Group>; update: (order: CakeOrder, decoration?: number, bake?: number, unlayered?: boolean) => void };

function makeCake(a: Atelier, parent: THREE.Object3D, order: CakeOrder): CakeModel {
  const group = new THREE.Group(); parent.add(group);
  const cream = a.surface("#fff0d9", .42); const gold = a.surface(palette.brass, .3, .7);
  const sponge = a.surface("#c59056").clone(); const icing = a.surface("#ecc4b0", .35).clone(); a.materials.add(sponge); a.materials.add(icing);
  a.cylinder(group, 1.04, .055, [0, .035, 0], cream, 1.08);
  a.torus(group, 1.05, .015, [0, .065, 0], gold).rotation.x = Math.PI / 2;
  const layers = new THREE.Group(); group.add(layers);
  const bakedBody = a.cylinder(group, .86, .70, [0, .425, 0], sponge);
  const crumbs: { position: XYZ; scale: XYZ }[] = [];
  for (let layer = 0; layer < 3; layer++) {
    a.cylinder(layers, .86, .185, [0, .19 + layer * .235, 0], sponge, .855);
    if (layer < 2) a.cylinder(layers, .863, .05, [0, .307 + layer * .235, 0], cream);
    for (let i = 0; i < 20; i++) { const t = i / 20 * Math.PI * 2; crumbs.push({ position: [Math.cos(t) * .857, .19 + layer * .235 + Math.sin(i * 7) * .06, Math.sin(t) * .857], scale: [.011, .007, .011] }); }
  }
  a.instances(group, a.geometry("crumb", () => new THREE.SphereGeometry(1, 6, 4)), a.surface("#b17543"), crumbs);
  const frosting = new THREE.Group(); group.add(frosting);
  a.cylinder(frosting, .88, .08, [0, .77, 0], icing);
  const drips: { position: XYZ; scale: XYZ }[] = [];
  for (let i = 0; i < 36; i++) { const angle = i / 36 * Math.PI * 2; drips.push({ position: [Math.cos(angle) * .854, .727 - .013 * Math.sin(i * 2.7), Math.sin(angle) * .854], scale: [.045, .065 + .025 * Math.sin(i), .045] }); }
  a.instances(frosting, a.geometry("small-sphere", () => new THREE.SphereGeometry(1, 10, 8)), icing, drips);
  const piping = new THREE.Group(); group.add(piping);
  for (let i = 0; i < 10; i++) { const angle = i / 10 * Math.PI * 2; const dollop = new THREE.Group(); piping.add(dollop); dollop.position.set(Math.cos(angle) * .64, .81, Math.sin(angle) * .64); dollop.rotation.y = angle;
    a.sphere(dollop, [.095, .075, .095], [0, .035, 0], cream); a.sphere(dollop, [.065, .065, .065], [.012, .09, 0], cream); a.sphere(dollop, [.034, .052, .034], [.018, .145, 0], cream);
  }
  const berries = new THREE.Group(); const chocolate = new THREE.Group(); const pistachio = new THREE.Group(); group.add(berries, chocolate, pistachio);
  const berryBits: { position: XYZ; scale: XYZ }[] = [];
  for (let i = 0; i < 8; i++) { const angle = i / 8 * Math.PI * 2; const x = Math.cos(angle) * .48; const z = Math.sin(angle) * .48;
    for (let row = 0; row < 3; row++) for (let j = 0; j < 7; j++) { const theta = j / 7 * Math.PI * 2; const radius = .071 - row * .018; berryBits.push({ position: [x + Math.cos(theta) * radius, .84 + row * .046, z + Math.sin(theta) * radius], scale: [.037, .034, .037] }); }
    const curl = a.torus(chocolate, .105, .019, [x, .91, z], "#472719", Math.PI * 1.65); curl.rotation.set(.8, angle, .3);
    for (let j = 0; j < 3; j++) { const nut = a.sphere(pistachio, [.037, .022, .063], [x + j * .038 - .04, .836, z + j * .025], j % 2 ? "#9ba169" : "#657043"); nut.rotation.y = angle + j; }
  }
  for (let i = 0; i < 8; i++) a.instances(berries, a.geometry("berry-bit", () => new THREE.SphereGeometry(1, 8, 6)), a.surface("#a1344d", .4), berryBits.slice(i * 21, (i + 1) * 21));
  const toppings: Record<string, THREE.Group> = { berries, chocolate, pistachio };
  Object.values(toppings).forEach(object => object.children.forEach(piece => { piece.userData.restY = piece.position.y; }));
  function update(next: CakeOrder, decoration = 1, bake = 1, unlayered = false) {
    const cakeColors: Record<CakeKind, string> = { raspberry: "#c79560", cacao: "#593022", pistachio: "#adac73" };
    sponge.color.set(cakeColors[next.cake]); sponge.color.lerp(new THREE.Color("#ecbf7e"), 1 - bake);
    layers.visible = !unlayered; bakedBody.visible = unlayered;
    if (unlayered) sponge.color.set("#ecbf7e").lerp(new THREE.Color(next.cake === "cacao" ? "#755140" : "#b0834e"), bake);
    icing.color.set(next.frosting === "chocolate" ? "#4d2b21" : next.frosting === "rose" ? "#edc6b7" : "#fff0d9");
    const scale = next.servings === 4 ? 1 : next.servings === 6 ? 1.14 : 1.28; group.scale.set(scale, 1, scale);
    frosting.visible = decoration > 0; frosting.scale.set(phase(decoration, 0, .32), 1, phase(decoration, 0, .32));
    piping.children.forEach((object, i) => { object.visible = decoration >= .32 + (i / 10) * .3; });
    Object.entries(toppings).forEach(([key, object]) => {
      object.visible = key === next.topping && decoration > .62;
      object.children.forEach((piece, i) => { const start = .62 + i / object.children.length * .23; const amount = phase(decoration, start, start + .05); piece.visible = amount > 0; piece.position.y = piece.userData.restY + (1 - amount) * .32; });
    });
  }
  update(order); return { group, icing, sponge, frosting, piping, toppings, update };
}

function croissant(a: Atelier, parent: THREE.Object3D, position: XYZ, size = .45) {
  const g = new THREE.Group(); g.position.set(...position); g.scale.setScalar(size); parent.add(g);
  for (let i = 0; i < 15; i++) { const angle = -1.27 + i / 14 * 2.54; const thickness = .11 + Math.sin(i / 14 * Math.PI) * .3; const fold = a.sphere(g, [thickness * .7, thickness * .75, thickness * 1.35], [Math.sin(angle) * .95, .2, Math.cos(angle) * .6 - .4], i % 2 ? "#d79b4c" : "#b16d32"); fold.rotation.y = -angle; }
  a.cylinder(g, 1.2, .04, [0, -.02, 0], palette.cream); return g;
}

function plant(a: Atelier, parent: THREE.Object3D, position: XYZ, size = 1) {
  const g = new THREE.Group(); parent.add(g); g.position.set(...position); g.scale.setScalar(size);
  a.cylinder(g, .3, .55, [0, .28, 0], "#b87456", .4); a.cylinder(g, .39, .065, [0, .53, 0], "#ca8b69"); a.cylinder(g, .34, .025, [0, .54, 0], "#4c382c");
  for (let i = 0; i < 9; i++) { const angle = i * 2.4; const x = Math.cos(angle) * .22; const z = Math.sin(angle) * .22;
    a.tube(g, [[0, .55, 0], [x * .4, .85, z * .4], [x, 1.1 + Math.sin(i) * .15, z]], .012, palette.green);
    const leaf = a.sphere(g, [.095, .24, .035], [x, .94 + Math.sin(i) * .15, z], i % 2 ? "#718056" : "#8b9464"); leaf.rotation.set(.4, angle, .5);
    if (i % 3 === 0) for (let j = 0; j < 5; j++) { const t = j / 5 * Math.PI * 2; a.sphere(g, [.053, .035, .055], [x + Math.cos(t) * .055, 1.16 + Math.sin(i) * .15, z + Math.sin(t) * .055], "#d7a19b"); }
  } return g;
}

function baker(a: Atelier, parent: THREE.Object3D) {
  const g = new THREE.Group(); parent.add(g);
  for (const x of [-.16, .16]) { a.box(g, [.21, .65, .23], [x, .43, 0], palette.dark); a.sphere(g, [.16, .105, .23], [x, .105, .07], "#3e3028"); }
  a.sphere(g, [.35, .48, .24], [0, 1.15, 0], palette.burgundy);
  a.box(g, [.51, .7, .06], [0, 1.08, .24], palette.cream); a.box(g, [.3, .18, .03], [0, .94, .282], "#ddcfb1");
  a.box(g, [.045, .48, .035], [-.2, 1.48, .2], palette.cream); a.box(g, [.045, .48, .035], [.2, 1.48, .2], palette.cream);
  a.cylinder(g, .095, .14, [0, 1.65, 0], "#d49d78"); a.sphere(g, [.235, .29, .22], [0, 1.92, 0], "#e1b18a");
  for (const x of [-.235, .235]) a.sphere(g, [.056, .085, .04], [x, 1.93, .005], "#dca57f");
  for (const x of [-.078, .078]) { a.sphere(g, [.022, .029, .016], [x, 1.96, .209], "#352f29"); const brow = a.box(g, [.08, .018, .022], [x, 2.02, .2], palette.dark); brow.rotation.z = x < 0 ? -.12 : .12; }
  a.sphere(g, [.047, .05, .06], [0, 1.905, .225], "#dba37c");
  a.tube(g, [[-.08, 1.825, .2], [0, 1.8, .223], [.08, 1.825, .2]], .009, "#854c3d");
  for (const x of [-.041, .041]) a.sphere(g, [.064, .022, .024], [x, 1.855, .23], "#6b4736");
  a.cylinder(g, .23, .095, [0, 2.185, 0], palette.cream);
  for (let i = 0; i < 5; i++) { const t = i / 5 * Math.PI * 2; a.sphere(g, [.15, .19, .15], [Math.cos(t) * .12, 2.34, Math.sin(t) * .1], palette.cream); }
  const arms: THREE.Group[] = []; const elbows: THREE.Group[] = [];
  for (const x of [-.34, .34]) { const arm = new THREE.Group(); arm.position.set(x, 1.49, 0); g.add(arm); a.sphere(arm, [.135, .18, .14], [0, -.09, 0], palette.cream); a.cylinder(arm, .083, .28, [0, -.3, 0], "#dca57f"); const elbow = new THREE.Group(); arm.add(elbow); elbow.position.y = -.4; a.cylinder(elbow, .07, .25, [0, -.12, 0], "#dca57f"); a.sphere(elbow, [.084, .102, .07], [0, -.28, 0], "#e1b18a"); arms.push(arm); elbows.push(elbow); }
  return { group: g, arms, elbows };
}

function furniture(a: Atelier, scene: THREE.Object3D) {
  const brass = a.surface(palette.brass, .33, .7);
  // Walnut display counter, brass plinth, and a glass cabinet with real thickness.
  a.box(scene, [4.7, 1.04, 1.25], [-1.8, .56, -1.15], palette.walnut);
  a.box(scene, [4.8, .075, 1.35], [-1.8, 1.12, -1.15], "#e8ddc9"); a.box(scene, [4.8, .08, 1.28], [-1.8, .11, -1.15], brass);
  for (let i = 0; i < 14; i++) a.box(scene, [.018, .8, .025], [-4 + i * .34, .57, -.508], "#987454", false);
  const glass = new THREE.MeshPhysicalMaterial({ color: "#faf2de", transparent: true, opacity: .12, roughness: .12, metalness: .12, side: THREE.DoubleSide, depthWrite: false }); a.materials.add(glass);
  const front = a.box(scene, [4.7, .84, .035], [-1.8, 1.62, -.46], glass, false); front.castShadow = false;
  const top = a.box(scene, [4.7, .025, 1.36], [-1.8, 2.05, -1.14], glass, false); top.castShadow = false;
  for (const x of [-4.18, .58]) { a.box(scene, [.035, .95, .035], [x, 1.6, -.44], brass, false); a.box(scene, [.025, .9, 1.38], [x, 1.62, -1.14], glass, false).castShadow = false; }
  for (const y of [1.18, 2.075]) a.box(scene, [4.82, .025, .025], [-1.8, y, -.45], brass, false);
  a.text(scene, ["MAISON MIETTE", "Les petits bonheurs"], 1.35, .43, [-1.8, .6, -.5], "#664330", "#e8c88f", 77);
  // A round tasting / collection table beside the counter.
  a.cylinder(scene, .78, .095, [1.35, 1.23, .45], "#e9ddc8"); a.cylinder(scene, .1, 1.1, [1.35, .62, .45], brass); a.cylinder(scene, .43, .08, [1.35, .1, .45], brass);
  for (const z of [.2, 2.0]) {
    a.cylinder(scene, .62, .075, [-3.7, 1.0, z], palette.walnut); a.cylinder(scene, .07, .9, [-3.7, .5, z], brass); a.cylinder(scene, .35, .06, [-3.7, .055, z], palette.dark);
    const cup = a.cylinder(scene, .075, .11, [-3.65, 1.1, z], palette.cream, .1); a.torus(scene, .047, .011, [-3.54, 1.115, z], palette.cream).rotation.y = Math.PI / 2; cup.castShadow = true;
    for (const x of [-4.45, -2.9]) { a.cylinder(scene, .3, .07, [x, .59, z], palette.burgundy); for (const dx of [-.2, .2]) for (const dz of [-.2, .2]) a.box(scene, [.038, .58, .038], [x + dx, .29, z + dz], palette.walnut); a.tube(scene, [[x - .27, .6, z - .2], [x - .27, 1.05, z - .2], [x, 1.2, z - .25], [x + .27, 1.05, z - .2], [x + .27, .6, z - .2]], .03, palette.walnut); }
  }
  // Open kitchen table and shelves.
  a.box(scene, [5.2, .12, 1.35], [-.5, 1.22, -3.85], palette.walnut);
  for (const x of [-2.85, 1.8]) for (const z of [-4.35, -3.35]) a.box(scene, [.09, 1.18, .09], [x, .61, z], palette.dark);
  a.box(scene, [4.7, .065, 1.1], [-.5, .4, -3.85], palette.walnut);
  for (const y of [2.65, 3.4]) {
    a.box(scene, [4.0, .07, .48], [-1.8, y, -5.4], palette.walnut);
    for (const x of [-3.3, -.3]) { a.box(scene, [.025, .38, .035], [x, y - .2, -5.43], brass); a.box(scene, [.025, .025, .4], [x, y - .07, -5.27], brass); }
    for (let i = 0; i < 6; i++) { const x = -3.3 + i * .55; a.cylinder(scene, .15, .32, [x, y + .2, -5.3], i % 2 ? "#ebe1cb" : "#bcb998"); a.cylinder(scene, .155, .055, [x, y + .38, -5.3], brass); }
  }
  a.text(scene, ["LE MENU", "Gâteaux · Croissants", "Café · Petits plaisirs", "Fait avec amour"], 1.6, 1.35, [3.4, 2.65, -5.43], "#384333", "#f0e2bf", 73);
  for (const x of [-2.8, 1.8]) {
    a.cylinder(scene, .022, 1.0, [x, 3.75, -1.15], brass);
    const shade = a.cylinder(scene, .4, .3, [x, 3.16, -1.15], brass, .09); shade.receiveShadow = false;
    const bulb = new THREE.MeshStandardMaterial({ color: "#fff0c4", emissive: "#ffd993", emissiveIntensity: 1.5 }); a.materials.add(bulb); a.sphere(scene, [.12, .09, .12], [x, 3.01, -1.15], bulb);
    const light = new THREE.PointLight("#ffdeb0", 8, 8, 2); light.position.set(x, 2.95, -1.15); scene.add(light);
  }
}

function buildShop(a: Atelier, scene: THREE.Object3D) {
  const brass = a.surface(palette.brass, .3, .65);
  a.box(scene, [15, .2, 19], [0, -.19, 1], "#d5c4a7");
  const tiles: { position: XYZ; scale: XYZ }[] = []; const darkTiles: { position: XYZ; scale: XYZ }[] = [];
  for (let ix = 0; ix < 14; ix++) for (let iz = 0; iz < 14; iz++) { const item = { position: [-4.55 + ix * .7, -.045, -5.3 + iz * .7] as XYZ, scale: [.686, .055, .686] as XYZ }; ((ix + iz) % 2 ? tiles : darkTiles).push(item); }
  const tileGeo = a.geometry("tile-box", () => new THREE.BoxGeometry(1, 1, 1)); a.instances(scene, tileGeo, a.surface("#eee3cd"), tiles); a.instances(scene, tileGeo, a.surface("#c6b899"), darkTiles);
  const pavers: { position: XYZ; scale: XYZ }[] = [];
  for (let i = 0; i < 16; i++) for (let j = 0; j < 7; j++) pavers.push({ position: [-7.5 + i * .95 + (j % 2) * .35, -.05, 4.55 + j * .62], scale: [.93, .07, .6] });
  a.instances(scene, tileGeo, a.surface("#c5b7a3"), pavers);
  a.box(scene, [10.2, 4.5, .18], [0, 2.15, -5.7], palette.plaster);
  a.box(scene, [.18, 4.5, 10], [-5.05, 2.15, -.65], palette.plaster);
  // The right wall is a low cutaway so the camera can show the kitchen clearly.
  a.box(scene, [.18, 1.25, 10], [5.05, .58, -.65], palette.plaster);
  a.box(scene, [10.3, .12, .14], [0, .08, -5.58], palette.walnut);
  a.box(scene, [.12, .12, 9.8], [-4.94, .08, -.65], palette.walnut);
  // Wall wainscoting and an inset kitchen arch, all modeled in volume.
  a.box(scene, [10, 1.25, .08], [0, .64, -5.56], "#d8c8a9");
  for (let i = 0; i < 9; i++) a.box(scene, [.035, 1.1, .025], [-4.4 + i * 1.1, .66, -5.5], "#b8a584", false);
  a.tube(scene, [[-3.95, 1.3, -5.43], [-3.95, 3.25, -5.43], [-3.3, 4.0, -5.43], [-1.8, 4.2, -5.43], [-.3, 4.0, -5.43], [.35, 3.25, -5.43], [.35, 1.3, -5.43]], .055, "#b7a27e");
  // Street facade, with an actual opening in the center.
  for (const x of [-4.85, -1.05, 1.05, 4.85]) { a.box(scene, [.26, 4.15, .34], [x, 2.06, 4.12], palette.burgundy); a.box(scene, [.37, .17, .43], [x, .1, 4.12], palette.burgundy); a.box(scene, [.4, .15, .45], [x, 4.04, 4.12], brass); }
  for (const x of [-2.95, 2.95]) {
    a.box(scene, [3.65, .9, .25], [x, .48, 4.12], palette.burgundy); a.box(scene, [3.38, .61, .055], [x, .48, 4.27], "#854957");
    a.box(scene, [3.5, .09, .44], [x, .98, 4.16], brass);
    const glass = new THREE.MeshPhysicalMaterial({ color: "#dce7df", transparent: true, opacity: .09, roughness: .06, metalness: .1, depthWrite: false }); a.materials.add(glass);
    a.box(scene, [3.48, 2.82, .045], [x, 2.43, 4.1], glass, false).castShadow = false;
    a.box(scene, [.045, 2.8, .07], [x, 2.43, 4.19], brass, false); a.box(scene, [3.5, .05, .06], [x, 2.6, 4.19], brass, false);
    a.box(scene, [3.3, .1, .68], [x, 1.05, 3.7], "#e6d8b7");
    for (let j = 0; j < 3; j++) croissant(a, scene, [x - 1 + j * .9, 1.14, 3.72], .28);
  }
  a.box(scene, [10.4, .67, .44], [0, 4.3, 4.16], palette.burgundy);
  a.text(scene, ["MAISON MIETTE"], 7.5, .5, [0, 4.33, 4.4], "#723948", "#f3dbac", 61);
  for (let i = 0; i < 24; i++) {
    const strip = a.box(scene, [.432, .045, 1.75], [-4.97 + i * .432, 3.81, 5.0], i % 2 ? palette.cream : palette.burgundy, false); strip.rotation.x = .16;
    a.sphere(scene, [.213, .19, .038], [-4.97 + i * .432, 3.5, 5.85], i % 2 ? palette.cream : palette.burgundy);
  }
  a.box(scene, [10.65, .09, .08], [0, 3.51, 5.83], palette.burgundy);
  // Hinged entrance and a bell suspended just above it.
  const door = new THREE.Group(); door.position.set(-.9, 0, 4.13); scene.add(door);
  a.box(door, [1.76, 3.54, .13], [.88, 1.79, 0], palette.burgundy);
  const doorGlass = new THREE.MeshPhysicalMaterial({ color: "#e4e2cd", transparent: true, opacity: .15, roughness: .12, depthWrite: false }); a.materials.add(doorGlass);
  a.box(door, [1.46, 2.3, .145], [.88, 2.25, .035], doorGlass, false).castShadow = false;
  // Remove the opaque center by using a frame rather than a glass-painted solid door.
  door.remove(door.children[0]);
  for (const x of [.075, 1.685]) a.box(door, [.15, 3.6, .15], [x, 1.8, 0], palette.burgundy);
  for (const y of [.52, 1.02, 3.52]) a.box(door, [1.75, .16, .15], [.88, y, 0], palette.burgundy);
  a.box(door, [1.6, .85, .14], [.88, .5, 0], palette.burgundy);
  a.box(door, [1.38, .55, .035], [.88, .5, .09], "#854957");
  a.cylinder(door, .025, .36, [1.48, 1.52, .13], brass); a.sphere(door, [.045, .045, .045], [1.48, 1.4, .13], brass);
  a.text(door, ["BONJOUR", "Come on in"], .75, .32, [.9, 2.05, .135], "#f4e7cf", "#723948", 100);
  const bell = new THREE.Group(); scene.add(bell); bell.position.set(0, 3.58, 4.35);
  a.cylinder(bell, .035, .16, [0, -.07, 0], brass); a.cylinder(bell, .13, .15, [0, -.2, 0], brass, .04); a.sphere(bell, [.035, .035, .035], [0, -.3, 0], brass);
  // Hanging sign, street bench, menu easel, and flowerpots.
  a.box(scene, [.06, .06, 1.2], [5.02, 3.4, 4.6], palette.dark);
  const sign = a.text(scene, ["M", "Depuis 1987"], .8, .9, [5.02, 2.76, 5.05], "#f4e7cf", "#723948", 125); sign.rotation.y = .35;
  for (const x of [-4.65, 4.65]) plant(a, scene, [x, .04, 5.0], 1.25);
  a.box(scene, [2.5, .11, .6], [-6.1, .63, 5.2], palette.walnut); for (const x of [-7.05, -5.15]) a.box(scene, [.07, .63, .5], [x, .3, 5.2], palette.dark);
  for (let i = 0; i < 3; i++) a.box(scene, [2.5, .12, .08], [-6.1, .9 + i * .17, 4.91], palette.walnut);
  const menu = a.text(scene, ["BONJOUR !", "Fresh from the oven", "Croissants · Café", "A little joy, daily"], .95, 1.15, [2.55, .92, 6.0], "#394533", "#f3e3be", 84); menu.rotation.x = -.13;
  for (const x of [2.13, 2.97]) { const leg = a.box(scene, [.045, 1.5, .06], [x, .7, 5.96], palette.walnut); leg.rotation.x = -.13; const back = a.box(scene, [.045, 1.5, .06], [x, .7, 5.54], palette.walnut); back.rotation.x = .3; }
  plant(a, scene, [-4.5, 0, -4.65], .8); plant(a, scene, [4.4, 0, 1.4], 1);
  furniture(a, scene); return { door, bell };
}

function makeKitchen(a: Atelier, scene: THREE.Object3D) {
  const copper = a.surface(palette.copper, .3, .65); const brass = a.surface(palette.brass, .3, .7); const steel = a.surface("#aaa69b", .28, .7);
  const bowl = new THREE.Group(); bowl.position.set(-1.35, 1.3, -3.7); scene.add(bowl);
  const bowlGeo = new THREE.LatheGeometry([[0, 0], [.24, .025], [.35, .1], [.42, .3], [.43, .36], [.4, .37], [.38, .3], [.32, .12], [.22, .06], [0, .06]].map(p => new THREE.Vector2(...p as [number, number])), 48); a.geometries.add(bowlGeo); a.mesh(bowl, bowlGeo, copper);
  const batterSurface = a.surface("#ebca8e", .5).clone(); a.materials.add(batterSurface);
  const batter = a.cylinder(bowl, .34, .045, [0, .16, 0], batterSurface); a.torus(bowl, .41, .016, [0, .355, 0], brass).rotation.x = Math.PI / 2;
  for (let i = 0; i < 3; i++) { const swirl = a.torus(bowl, .09 + i * .07, .004, [0, .192 + i * .001, 0], "#d9b377", Math.PI * 1.65); swirl.rotation.x = Math.PI / 2; swirl.rotation.z = i; }
  // Vintage stand mixer, wire whisk, and a mixing arm that lifts.
  a.box(scene, [1.35, .1, .9], [-1.15, 1.32, -3.7], "#7d8a6b"); a.box(scene, [.27, .78, .45], [-.63, 1.74, -3.76], "#7d8a6b");
  const mixerHead = new THREE.Group(); mixerHead.position.set(-.63, 2.12, -3.72); scene.add(mixerHead);
  a.box(mixerHead, [1.06, .29, .4], [-.39, 0, 0], "#84916f"); a.box(mixerHead, [.17, .07, .02], [-.39, .03, .22], brass);
  a.sphere(scene, [.045, .045, .02], [-.68, 1.8, -3.49], brass);
  const whisk = new THREE.Group(); whisk.position.set(-.72, -.14, .02); mixerHead.add(whisk); a.cylinder(whisk, .016, .18, [0, -.08, 0], steel);
  for (let i = 0; i < 5; i++) { const t = i / 5 * Math.PI * 2; const x = Math.cos(t) * .15; const z = Math.sin(t) * .15; a.tube(whisk, [[0, -.16, 0], [x, -.27, z], [x * .55, -.42, z * .55], [0, -.47, 0], [-x * .55, -.42, -z * .55], [-x, -.27, -z], [0, -.16, 0]], .007, steel); }
  // Scale, flour sack, butter, eggs, sugar, and a ceramic milk pitcher.
  a.box(scene, [.62, .13, .52], [-2.52, 1.36, -3.78], palette.cream); a.cylinder(scene, .22, .04, [-2.52, 1.47, -3.78], steel);
  const scaleFace = a.cylinder(scene, .15, .025, [-2.52, 1.37, -3.51], palette.cream); scaleFace.rotation.x = Math.PI / 2;
  const needle = a.box(scene, [.009, .12, .01], [-2.52, 1.37, -3.492], palette.burgundy);
  const flour = new THREE.Group(); flour.position.set(-2.65, 1.5, -3.88); scene.add(flour);
  a.box(flour, [.4, .6, .25], [0, .3, 0], "#dac7a2"); a.box(flour, [.39, .08, .12], [0, .62, 0], "#c1a984"); a.text(flour, ["FARINE", "Stone milled"], .3, .3, [0, .32, .137], "#eadabc", "#705542", 130);
  a.cylinder(scene, .19, .025, [-2.9, 1.305, -3.28], palette.cream); a.box(scene, [.22, .11, .14], [-2.9, 1.36, -3.28], "#e5bf68");
  const eggs = new THREE.Group(); scene.add(eggs); eggs.position.set(-2.08, 1.32, -3.7);
  a.box(eggs, [.42, .075, .28], [0, 0, 0], "#b7a48a"); for (const x of [-.11, .11]) a.sphere(eggs, [.073, .095, .073], [x, .08, 0], "#f5e6ce");
  const cracked = new THREE.Group(); scene.add(cracked); cracked.position.set(-1.35, 2.16, -3.7);
  const shellGeo = new THREE.SphereGeometry(.1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2); a.geometries.add(shellGeo);
  const shells = [a.mesh(cracked, shellGeo, a.surface("#f3dfc3"), [-.1, 0, 0]), a.mesh(cracked, shellGeo, a.surface("#f3dfc3"), [.1, 0, 0])]; shells[0].rotation.z = 1.6; shells[1].rotation.z = -1.6;
  const yolk = a.sphere(cracked, [.055, .065, .055], [0, -.12, 0], "#e5a83a");
  const milk = new THREE.Group(); milk.position.set(-2.32, 1.31, -3.32); scene.add(milk);
  a.cylinder(milk, .12, .33, [0, .17, 0], palette.cream, .1); a.cylinder(milk, .1, .045, [0, .35, 0], palette.cream, .13); a.torus(milk, .12, .025, [.12, .19, 0], palette.cream).rotation.y = Math.PI / 2;
  const sugar = new THREE.Group(); scene.add(sugar); sugar.position.set(-1.86, 1.31, -3.3);
  a.cylinder(sugar, .12, .29, [0, .15, 0], "#eee2c6"); a.cylinder(sugar, .14, .05, [0, .32, 0], brass); a.text(sugar, ["SUCRE"], .17, .11, [0, .18, .125], "#f8edda", "#755238", 200);
  const spoon = new THREE.Group(); scene.add(spoon); spoon.position.set(-.3, 1.34, -3.4); a.box(spoon, [.025, .02, .35], [0, 0, 0], palette.walnut); a.sphere(spoon, [.065, .017, .095], [0, 0, -.23], palette.walnut);
  const dust = a.instances(scene, a.geometry("ingredient-particle", () => new THREE.SphereGeometry(1, 6, 4)), a.surface("#fff0d8"), Array.from({ length: 52 }, () => ({ position: [0, 0, 0] as XYZ, scale: [.01, .01, .01] as XYZ })));
  dust.frustumCulled = false;
  const milkStream = a.cylinder(scene, .016, .5, [-1.35, 1.98, -3.7], "#fff5df"); milkStream.visible = false;
  const pouringBatter = a.cylinder(scene, .05, .44, [-.45, 1.84, -3.23], batterSurface); pouringBatter.visible = false;
  // Copper oven: separate casing pieces leave an actual visible cavity.
  const oven = new THREE.Group(); oven.position.set(3.3, 0, -3.92); scene.add(oven);
  for (const x of [-.88, .88]) a.box(oven, [.16, 1.95, 1.6], [x, 1.13, 0], copper);
  a.box(oven, [1.9, .25, 1.6], [0, .29, 0], copper); a.box(oven, [1.9, .28, 1.6], [0, 2.08, 0], copper); a.box(oven, [1.74, 1.7, .12], [0, 1.17, -.74], "#493329");
  a.box(oven, [1.6, .075, 1.43], [0, .64, 0], "#776352");
  for (let i = 0; i < 7; i++) a.box(oven, [1.55, .018, .018], [0, .68, -.5 + i * .17], steel, false);
  for (const x of [-.7, .7]) for (const z of [-.55, .55]) a.box(oven, [.12, .22, .12], [x, .12, z], palette.dark);
  const ovenDoor = new THREE.Group(); ovenDoor.position.set(0, .53, .85); oven.add(ovenDoor);
  for (const x of [-.82, .82]) a.box(ovenDoor, [.12, 1.23, .1], [x, .62, 0], copper);
  for (const y of [.03, 1.2]) a.box(ovenDoor, [1.65, .13, .1], [0, y, 0], copper);
  const ovenGlass = new THREE.MeshPhysicalMaterial({ color: "#705139", transparent: true, opacity: .18, roughness: .08, metalness: .2, depthWrite: false }); a.materials.add(ovenGlass);
  a.box(ovenDoor, [1.49, 1.08, .04], [0, .62, 0], ovenGlass, false).castShadow = false;
  a.box(ovenDoor, [1.24, .055, .08], [0, 1.07, .14], brass); for (const x of [-.55, .55]) a.box(ovenDoor, [.045, .12, .12], [x, 1.07, .08], brass);
  a.text(oven, ["LA CHALEUR", "MAISON MIETTE"], .8, .19, [0, 2.09, .817], "#b77748", "#f5e5c6", 92);
  const dial = a.cylinder(oven, .135, .032, [0, 1.88, .82], palette.cream); dial.rotation.x = Math.PI / 2; const dialNeedle = a.box(oven, [.01, .095, .025], [0, 1.88, .85], palette.burgundy);
  const ovenLight = new THREE.PointLight("#ffb151", 0, 4, 2); ovenLight.position.set(0, 1.35, .4); oven.add(ovenLight);
  const glowMaterial = new THREE.MeshStandardMaterial({ color: "#e89f47", emissive: "#f79a37", emissiveIntensity: 0 }); a.materials.add(glowMaterial); a.sphere(oven, [.075, .075, .05], [.68, 1.6, -.4], glowMaterial);
  const heat = new THREE.Group(); oven.add(heat); const heatMaterial = new THREE.MeshBasicMaterial({ color: "#f3c47b", transparent: true, opacity: .1, depthWrite: false }); a.materials.add(heatMaterial);
  for (let i = 0; i < 3; i++) a.tube(heat, [[-.45 + i * .45, .82, .75], [-.4 + i * .45, 1.07, .73], [-.5 + i * .45, 1.3, .75], [-.4 + i * .45, 1.5, .73]], .012, heatMaterial);
  const tin = new THREE.Group(); scene.add(tin);
  const tinGeo = new THREE.LatheGeometry([[0, 0], [.61, 0], [.63, .025], [.63, .27], [.61, .28], [.595, .05], [0, .05]].map(p => new THREE.Vector2(...p as [number, number])), 48); a.geometries.add(tinGeo); a.mesh(tin, tinGeo, steel);
  for (const x of [-.7, .7]) a.torus(tin, .075, .018, [x, .16, 0], steel).rotation.y = Math.PI / 2;
  const rack = new THREE.Group(); rack.position.set(1.2, 1.3, -3.75); scene.add(rack);
  for (let i = 0; i < 10; i++) a.box(rack, [1.6, .014, .014], [0, .04, -.55 + i * .12], steel, false);
  for (const x of [-.75, .75]) a.box(rack, [.014, .014, 1.15], [x, .045, 0], steel, false);
  const spatula = new THREE.Group(); scene.add(spatula); a.box(spatula, [.07, .06, .37], [0, 0, 0], palette.walnut); a.box(spatula, [.13, .025, .28], [0, 0, -.28], steel);
  const pipingBag = new THREE.Group(); scene.add(pipingBag); a.cylinder(pipingBag, .035, .43, [0, .2, 0], palette.cream, .15); a.cylinder(pipingBag, .012, .08, [0, -.05, 0], steel, .035); a.box(pipingBag, [.2, .035, .075], [0, .43, 0], "#e0cdb0");
  return { bowl, batter, batterSurface, mixerHead, whisk, needle, flour, cracked, shells, yolk, milk, sugar, spoon, dust, milkStream, pouringBatter, ovenDoor, ovenLight, glowMaterial, dialNeedle, heat, tin, rack, spatula, pipingBag };
}

function makeBox(a: Atelier, scene: THREE.Object3D) {
  const g = new THREE.Group(); scene.add(g); g.position.set(1.35, 1.29, .45);
  a.box(g, [1.78, .045, 1.78], [0, .025, 0], "#f3e4c7");
  for (const x of [-.89, .89]) a.box(g, [.035, .83, 1.78], [x, .44, 0], "#f3e4c7");
  for (const z of [-.89, .89]) a.box(g, [1.8, .83, .035], [0, .44, z], "#f3e4c7");
  for (const x of [-.84, .84]) for (const z of [-.84, .84]) a.box(g, [.025, .73, .025], [x, .43, z], "#d5c3a1", false);
  const lid = new THREE.Group(); g.add(lid); lid.position.set(0, .88, -.92);
  a.box(lid, [1.9, .055, 1.88], [0, 0, .94], palette.cream); for (const x of [-.94, .94]) a.box(lid, [.04, .12, 1.88], [x, -.04, .94], "#e9d9bb"); a.box(lid, [1.9, .12, .04], [0, -.04, 1.87], "#e9d9bb");
  const logo = a.text(lid, ["M", "MAISON MIETTE"], .68, .68, [0, .031, .9], "#fff0d7", "#723948", 150); logo.rotation.x = -Math.PI / 2;
  const ribbon = new THREE.Group(); g.add(ribbon);
  for (const x of [-.925, .925]) a.box(ribbon, [.012, .93, .13], [x, .46, 0], palette.burgundy, false);
  for (const z of [-.925, .925]) a.box(ribbon, [.13, .93, .012], [0, .46, z], palette.burgundy, false);
  a.box(ribbon, [1.85, .015, .13], [0, .927, 0], palette.burgundy, false); a.box(ribbon, [.13, .016, 1.85], [0, .927, 0], palette.burgundy, false);
  for (const x of [-.14, .14]) { const loop = a.torus(ribbon, .16, .026, [x, 1.035, 0], palette.burgundy); loop.scale.multiply(new THREE.Vector3(1.25, .62, 1)); loop.rotation.x = -.45; loop.rotation.z = x < 0 ? -.35 : .35; }
  a.sphere(ribbon, [.065, .04, .06], [0, 1.04, 0], palette.burgundy); for (const x of [-.13, .13]) { const tail = a.box(ribbon, [.07, .012, .31], [x, .95, .23], palette.burgundy); tail.rotation.y = x < 0 ? -.35 : .35; }
  const label = a.text(g, ["POUR VOUS", "With love, Émile"], .54, .23, [.43, .48, .917], "#fdf2dc", "#723948", 110);
  return { group: g, lid, ribbon, label };
}

const viewpoints: { position: XYZ; target: XYZ }[] = [
  { position: [8.2, 5.8, 15.8], target: [0, 1.9, 3.0] },
  { position: [0, 2.9, 3.45], target: [-.3, 1.6, -1.75] },
  { position: [.8, 3.15, 1.4], target: [-1.7, 1.6, -1.05] },
  { position: [3.7, 3.2, 3.5], target: [1.35, 1.65, .45] },
  { position: [.7, 3.3, -.7], target: [-1.35, 1.7, -3.72] },
  { position: [3.75, 2.85, -.25], target: [3.3, 1.2, -3.72] },
  { position: [2.6, 3.2, -.85], target: [1.2, 1.65, -3.75] },
  { position: [3.7, 3.2, 3.5], target: [1.35, 1.8, .45] },
];

export function createBakeryWorld(host: HTMLElement, callbacks: Callbacks): BakeryWorld {
  let renderer: THREE.WebGLRenderer;
  try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" }); }
  catch { callbacks.onFailure(); return { update() {}, rotate() {}, dispose() {} }; }
  const a = new Atelier();
  const scene = new THREE.Scene(); scene.background = new THREE.Color("#e9dfcf"); scene.fog = new THREE.Fog("#e9dfcf", 26, 65);
  const camera = new THREE.PerspectiveCamera(39, 1, .05, 90); camera.position.set(...viewpoints[0].position);
  let state: State = { stage: 0, progress: 0, order: initialOrder, reducedMotion: false, paused: false };
  const cameraPosition = new THREE.Vector3(...viewpoints[0].position);
  const look = new THREE.Vector3(...viewpoints[0].target);
  let disposed = false; let frame = 0; let last = 0; let time = 0; let rotation = 0;
  let transition: { path: THREE.CatmullRomCurve3; from: THREE.Vector3; target: THREE.Vector3; elapsed: number; duration: number } | null = null;
  let mobile = false; let ready = false;
  const sun = new THREE.DirectionalLight("#ffe1aa", 2.5); sun.position.set(-3, 9, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.camera.left = -10; sun.shadow.camera.right = 10; sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10; sun.shadow.camera.near = .5; sun.shadow.camera.far = 30; sun.shadow.normalBias = .025; sun.shadow.bias = -.0002; scene.add(sun);
  scene.add(new THREE.HemisphereLight("#fff1d7", "#b09a78", .9));
  const fill = new THREE.DirectionalLight("#e4e8f0", .6); fill.position.set(5, 5, -5); scene.add(fill);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95;
  renderer.domElement.className = "journey-canvas"; renderer.domElement.setAttribute("aria-hidden", "true"); host.appendChild(renderer.domElement);
  let environment: THREE.WebGLRenderTarget | undefined;
  try { const room = new RoomEnvironment(); const pmrem = new THREE.PMREMGenerator(renderer); environment = pmrem.fromScene(room, .04); scene.environment = environment.texture; scene.environmentIntensity = .55; pmrem.dispose(); room.dispose(); }
  catch { /* Direct lighting still illuminates the whole shop on limited GPUs. */ }
  let shop: ReturnType<typeof buildShop>; let kitchen: ReturnType<typeof makeKitchen>; let character: ReturnType<typeof baker>; let box: ReturnType<typeof makeBox>; let hero: CakeModel;
  const carrier = new THREE.Group(); scene.add(carrier);
  const display: { model: CakeModel; kind: CakeKind }[] = [];
  let ticket: THREE.Group;
  try {
    shop = buildShop(a, scene); kitchen = makeKitchen(a, scene); character = baker(a, scene); box = makeBox(a, scene);
    character.group.position.set(.15, 0, -2.4);
    const kinds: CakeKind[] = ["raspberry", "pistachio", "cacao"];
    kinds.forEach((kind, i) => { const model = makeCake(a, scene, { ...initialOrder, cake: kind, frosting: kind === "cacao" ? "chocolate" : kind === "pistachio" ? "vanilla" : "rose", topping: kind === "cacao" ? "chocolate" : kind === "pistachio" ? "pistachio" : "berries" }); model.group.position.set(-3.25 + i * 1.42, 1.18, -1.1); model.group.scale.multiplyScalar(.52); model.group.userData.cake = kind; display.push({ model, kind }); a.text(scene, [cakes[kind].short, `4 servings · Rs ${cakes[kind].price}`], .72, .19, [-3.25 + i * 1.42, 1.23, -.43], "#fff0d7", "#664330", 88); });
    croissant(a, scene, [-3.1, 1.19, -1.58], .22); croissant(a, scene, [-1.7, 1.19, -1.58], .22);
    for (let i = 0; i < 4; i++) { const g = new THREE.Group(); scene.add(g); g.position.set(-.15 + i * .17, 1.2, -1.63); a.cylinder(g, .063, .085, [0, .055, 0], "#b98546"); a.sphere(g, [.08, .07, .08], [0, .13, 0], i % 2 ? "#8d6544" : "#e7c79c"); }
    hero = makeCake(a, carrier, initialOrder); carrier.scale.setScalar(.65); carrier.visible = false;
    ticket = a.text(scene, ["ORDER 001", "Raspberry Rose", "4 servings · Rs 1240"], .48, .52, [-.35, 1.2, -.8], "#fff4de", "#723948", 115); ticket.rotation.x = -Math.PI / 2;
  } catch { a.dispose(); environment?.dispose(); sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove(); callbacks.onFailure(); return { update() {}, rotate() {}, dispose() {} }; }
  const temp = new THREE.Object3D(); const ray = new THREE.Raycaster(); const mouse = new THREE.Vector2();
  let pointerStart: { x: number; y: number; lastX: number; moved: boolean; id: number } | null = null;
  const cakePositions: Record<CakeKind, XYZ> = { raspberry: [-3.25, 1.18, -1.1], pistachio: [-1.83, 1.18, -1.1], cacao: [-.41, 1.18, -1.1] };
  function updateTicket(order: CakeOrder) {
    const plane = ticket.children[1] as THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
    const texture = plane.material.map!; const canvas = texture.image as HTMLCanvasElement; const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff4de"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.strokeStyle = "#723948"; ctx.lineWidth = 4; ctx.strokeRect(18, 18, canvas.width - 36, canvas.height - 36); ctx.fillStyle = "#723948"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ["ORDER 001", cakes[order.cake].short, `${order.servings} servings`, `Rs ${orderPrice(order)}`].forEach((word, i) => { ctx.font = `${i === 1 ? 103 : 90}px Georgia`; ctx.fillText(word, 512, canvas.height * (i + .5) / 4, 950); }); texture.needsUpdate = true;
  }
  function viewpoint(next: number, order: CakeOrder, progress: number) {
    const selected = cakePositions[order.cake];
    if (next === 2) return { position: [selected[0] + 2.2, 3.3, 2.0] as XYZ, target: [selected[0], 1.65, -1.0] as XYZ };
    if (next === 5) {
      const load = phase(progress, .32, .43), cool = phase(progress, .84, .96);
      const position = new THREE.Vector3(1.3, 3.3, -.7).lerp(new THREE.Vector3(...viewpoints[5].position), load).lerp(new THREE.Vector3(...viewpoints[6].position), cool);
      const target = new THREE.Vector3(-.75, 1.65, -3.7).lerp(new THREE.Vector3(...viewpoints[5].target), load).lerp(new THREE.Vector3(...viewpoints[6].target), cool);
      return { position: position.toArray() as XYZ, target: target.toArray() as XYZ };
    }
    return viewpoints[next];
  }
  function beginTransition(next: number, order = state.order, progress = 0) {
    const preset = viewpoint(next, order, progress);
    const destination = new THREE.Vector3(...preset.position); const from = cameraPosition.clone();
    const points = [from];
    if (state.stage === 0 && next > 0) points.push(new THREE.Vector3(0, 3.0, 8), new THREE.Vector3(0, 2.8, 4.65));
    else if (next === 0 && state.stage > 0) points.push(new THREE.Vector3(0, 2.8, 4.65), new THREE.Vector3(0, 3.0, 8));
    else { const middle = from.clone().lerp(destination, .5); middle.y += .25; points.push(middle); }
    points.push(destination);
    transition = { path: new THREE.CatmullRomCurve3(points, false, "centripetal"), from: look.clone(), target: new THREE.Vector3(...preset.target), elapsed: 0, duration: state.reducedMotion ? .01 : state.stage === 0 || next === 0 ? 3.8 : 1.8 };
  }
  function resize() {
    if (disposed) return;
    const width = host.clientWidth, height = host.clientHeight; if (!width || !height) return;
    mobile = width < 760; renderer.setSize(width, height, false); camera.aspect = width / height;
    camera.fov = mobile ? 49 : 39;
    // Shift the world into the clear part of the viewport beside / above the controls.
    if (mobile) camera.setViewOffset(width, height, 0, height * .23, width, height);
    else camera.setViewOffset(width, height, -width * .16, 0, width, height);
    camera.updateProjectionMatrix();
    resume();
  }
  const sizing = new ResizeObserver(resize); sizing.observe(host); resize();

  function animateObjects(dt: number) {
    const { stage, progress: p, order, reducedMotion } = state;
    const t = reducedMotion ? 0 : time; const lerpSpeed = reducedMotion ? 1 : 1 - Math.exp(-dt * 5);
    shop.door.rotation.y = mix(shop.door.rotation.y, stage > 0 ? -1.45 : 0, lerpSpeed);
    shop.bell.rotation.z = stage === 1 && transition ? Math.sin(transition.elapsed * 14) * .2 * Math.exp(-transition.elapsed * 1.5) : 0;
    const bakerTarget = stage < 4 ? new THREE.Vector3(.15, 0, -2.45) : stage === 7 ? new THREE.Vector3(2.55, 0, .05) : stage === 5 ? new THREE.Vector3(-.65, 0, -4.85).lerp(new THREE.Vector3(2.1, 0, -4.8), phase(p, .32, .43) * (1 - phase(p, .84, .96))) : new THREE.Vector3(-.65, 0, -4.85);
    character.group.position.lerp(bakerTarget, lerpSpeed * .45); character.group.rotation.y = mix(character.group.rotation.y, stage === 5 ? -.3 : stage === 6 ? .7 : 0, lerpSpeed);
    character.arms.forEach((arm, i) => { const working = stage >= 4; arm.rotation.x = working ? (stage === 7 ? -1.35 : -.95) + Math.sin(t * 2.3 + i) * .13 : stage === 1 && i === 1 ? -.4 : -.08; arm.rotation.z = working ? (i ? -.15 : .15) : stage === 1 && i === 1 ? -.9 + Math.sin(t * 4) * .2 : i ? -.12 : .12; character.elbows[i].rotation.x = working ? -.55 + Math.sin(t * 2.7 + i) * .1 : -.12; });
    const breathing = reducedMotion ? 0 : Math.sin(t * 1.6) * .007; character.group.position.y = breathing;
    display.forEach(({ model, kind }) => { model.group.visible = stage !== 2 || kind !== order.cake; });
    carrier.visible = stage >= 2;
    const target = new THREE.Vector3(); let size = .65;
    if (stage === 2) { target.set(...cakePositions[order.cake]); target.z += .16; target.y += .1; size = .52; }
    else if (stage === 3 || stage === 7) { target.set(1.35, 1.29, .45); if (stage === 7) size = .62; }
    else if (stage === 4) { target.set(-1.35, 1.4, -3.7); carrier.visible = false; }
    else if (stage === 5) {
      const load = phase(p, .32, .43), unload = phase(p, .84, .95);
      target.set(mix(-.2, 3.3, load), mix(1.35, .73, load), mix(-3.7, -3.92, load));
      if (p >= .84) target.lerp(new THREE.Vector3(1.2, 1.4, -3.75), unload);
      carrier.visible = p >= .2;
    } else target.set(1.2, 1.39, -3.75);
    if (stage === 7) { target.y += .75 * (1 - phase(p, 0, .28)); box.group.visible = true; }
    else box.group.visible = false;
    carrier.position.lerp(target, transition ? lerpSpeed : 1); carrier.scale.setScalar(size);
    hero.update(order, stage === 5 ? 0 : stage === 6 ? p : 1, stage === 5 ? phase(p, .43, .84) : 1, stage === 5);
    if (stage === 5) hero.group.scale.y = .28 + .72 * phase(p, .43, .84);
    hero.group.rotation.y = rotation + (stage === 6 && p > .9 && !reducedMotion ? Math.sin(t * .4) * .12 : 0);
    hero.group.children[0].visible = stage !== 5; hero.group.children[1].visible = stage !== 5;
    kitchen.tin.visible = stage === 5; kitchen.tin.position.copy(carrier.position); kitchen.tin.position.y -= .06;
    kitchen.tin.scale.setScalar(order.servings === 4 ? 1 : order.servings === 6 ? 1.14 : 1.28);
    if (stage === 7) {
      box.lid.rotation.x = -Math.PI * .58 * (1 - phase(p, .3, .58));
      box.ribbon.visible = p > .58; box.ribbon.scale.setScalar(Math.max(.001, phase(p, .58, .83)));
      box.label.visible = p > .83; box.label.scale.setScalar(Math.max(.001, phase(p, .83, .97)));
    }
    ticket.visible = stage >= 4;
    if (stage === 4) ticket.position.set(mix(-.35, -.25, phase(p, 0, .15)), 1.3, mix(-.8, -3.65, phase(p, 0, .15)));
    else if (stage === 7) ticket.position.set(2.1, 1.3, .75);
    else ticket.position.set(.85, 1.3, -3.35);
    kitchen.flour.position.set(-2.65, 1.5, -3.88); kitchen.flour.rotation.z = 0;
    if (stage === 4 && p > .36 && p < .58) { const pour = Math.sin(phase(p, .36, .58) * Math.PI); kitchen.flour.position.set(-1.04, 2.0, -3.72); kitchen.flour.rotation.z = .75 * pour; }
    kitchen.needle.rotation.z = stage === 4 ? -phase(p, 0, .18) * .85 : -.85;
    kitchen.cracked.visible = stage === 4 && p > .18 && p < .36;
    const crack = phase(p, .18, .36); kitchen.shells[0].position.x = -.06 - crack * .12; kitchen.shells[1].position.x = .06 + crack * .12; kitchen.yolk.position.y = -.15 - crack * .53;
    kitchen.milk.position.set(-2.32, 1.31, -3.32); kitchen.milk.rotation.z = 0;
    kitchen.milkStream.visible = stage === 4 && p > .6 && p < .78;
    if (kitchen.milkStream.visible) { kitchen.milk.position.set(-1.05, 2.08, -3.7); kitchen.milk.rotation.z = 1.12; }
    kitchen.sugar.rotation.z = stage === 4 && p > .78 && p < .9 ? .9 : 0;
    kitchen.sugar.position.set(stage === 4 && p > .78 && p < .9 ? -1.1 : -1.86, stage === 4 && p > .78 && p < .9 ? 2.12 : 1.31, stage === 4 && p > .78 && p < .9 ? -3.72 : -3.3);
    kitchen.dust.visible = stage === 4 && (p > .36 && p < .58 || p > .78 && p < .9);
    if (kitchen.dust.visible) {
      for (let i = 0; i < 52; i++) { const travel = ((reducedMotion ? i / 52 : t * 1.1 + i / 52) % 1); temp.position.set(-1.35 + Math.sin(i * 7.1) * .18 * travel, 2.34 - travel * .76, -3.7 + Math.cos(i * 3.7) * .16 * travel); temp.scale.setScalar(.007 + i % 4 * .003); temp.rotation.set(0, 0, 0); temp.updateMatrix(); kitchen.dust.setMatrixAt(i, temp.matrix); } kitchen.dust.instanceMatrix.needsUpdate = true;
    }
    kitchen.batter.scale.y = .045 * (stage === 4 ? .25 + .75 * phase(p, .18, .95) : 1);
    kitchen.batterSurface.color.set(order.cake === "cacao" ? "#8b5940" : order.cake === "pistachio" ? "#bdb781" : "#ebca8e");
    const mixing = stage === 4 && p > .88 || stage === 5 && p < .18;
    const headOpen = stage === 4 ? 1 - phase(p, .84, .92) : stage === 5 ? phase(p, .13, .18) : stage > 5 ? 1 : 0;
    kitchen.mixerHead.rotation.z = mix(kitchen.mixerHead.rotation.z, -Math.PI * .47 * headOpen, lerpSpeed);
    kitchen.whisk.rotation.y = mixing ? t * 13 : 0; kitchen.bowl.rotation.y = mixing ? t * .65 : 0;
    kitchen.spoon.visible = stage === 4 && p > .8; kitchen.spoon.position.set(-1.35 + Math.cos(t * 2) * .17, 1.64, -3.7 + Math.sin(t * 2) * .17); kitchen.spoon.rotation.z = .4;
    kitchen.bowl.position.set(-1.35, 1.3, -3.7); kitchen.bowl.rotation.z = 0;
    kitchen.pouringBatter.visible = stage === 5 && p > .18 && p < .32;
    if (kitchen.pouringBatter.visible) { kitchen.bowl.position.set(-.82, 2.0, -3.1); kitchen.bowl.rotation.z = -1.0; }
    const hot = stage === 5 && p >= .36 && p < .9;
    const open = stage === 5 && (p < .43 || p > .84);
    kitchen.ovenDoor.rotation.x = mix(kitchen.ovenDoor.rotation.x, open ? 1.35 * (p < .43 ? 1 - phase(p, .38, .43) : phase(p, .84, .89)) : 0, lerpSpeed);
    kitchen.ovenLight.intensity = hot ? 9 : .4; kitchen.glowMaterial.emissiveIntensity = hot ? 3 : .15;
    kitchen.dialNeedle.rotation.z = hot ? -.75 + phase(p, .43, .84) * 1.5 : -.75;
    kitchen.heat.visible = hot && !reducedMotion; kitchen.heat.position.y = Math.sin(t * 2) * .03; kitchen.heat.rotation.y = Math.sin(t * 1.5) * .03;
    kitchen.spatula.visible = stage === 6 && p < .32; kitchen.spatula.position.set(1.2 + Math.sin(t * 2) * .3, 2.02, -3.8 + Math.cos(t * 2) * .2); kitchen.spatula.rotation.y = t * .7;
    kitchen.pipingBag.visible = stage === 6 && p >= .32 && p < .9;
    const angle = phase(p, .32, .9) * Math.PI * 4; kitchen.pipingBag.position.set(1.2 + Math.cos(angle) * .4, 2.08 + (p > .62 ? .12 : 0), -3.75 + Math.sin(angle) * .4); kitchen.pipingBag.rotation.z = -.15;
  }

  function tick(now: number) {
    frame = 0; if (disposed || document.hidden) return;
    if (last && now - last < 1000 / 30) { frame = requestAnimationFrame(tick); return; }
    const dt = last ? Math.min((now - last) / 1000, .05) : .016; last = now; time += dt;
    if (state.paused) time -= dt;
    animateObjects(dt);
    if (transition || state.stage >= 4 && state.progress < 1) renderer.shadowMap.needsUpdate = true;
    if (transition) { transition.elapsed += dt; const amount = clamp(transition.elapsed / transition.duration, 0, 1); const eased = amount * amount * (3 - 2 * amount); cameraPosition.copy(transition.path.getPoint(eased)); look.copy(transition.from).lerp(transition.target, eased); if (amount >= 1) transition = null; }
    else if (state.stage === 5) { const current = viewpoint(5, state.order, state.progress); const speed = state.reducedMotion ? 1 : 1 - Math.exp(-dt * 7); cameraPosition.lerp(new THREE.Vector3(...current.position), speed); look.lerp(new THREE.Vector3(...current.target), speed); }
    // Portrait framing pulls back enough to keep the complete cake / box in view.
    camera.position.copy(cameraPosition);
    if (mobile && state.stage === 0) camera.position.sub(look).multiplyScalar(1.65).add(look);
    else if (mobile && state.stage > 1) camera.position.sub(look).multiplyScalar(1.2).add(look);
    camera.lookAt(look);
    try { renderer.render(scene, camera); if (!ready) { ready = true; host.dataset.ready = "true"; callbacks.onReady(); } }
    catch { callbacks.onFailure(); dispose(); return; }
    const active = state.stage === 1 || state.stage >= 4 && state.progress < 1;
    if (!state.reducedMotion && !state.paused && active || transition) frame = requestAnimationFrame(tick);
  }
  function resume() { if (!disposed && !document.hidden && !frame) { last = 0; frame = requestAnimationFrame(tick); } }
  function visibility() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; last = 0; } else resume(); }
  function onLost(event: Event) { event.preventDefault(); callbacks.onFailure(); dispose(); }
  function onDown(event: PointerEvent) {
    if (state.stage !== 2 && state.stage !== 3 && state.stage !== 6) return;
    pointerStart = { x: event.clientX, y: event.clientY, lastX: event.clientX, moved: false, id: event.pointerId }; renderer.domElement.setPointerCapture(event.pointerId);
  }
  function onMove(event: PointerEvent) {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) pointerStart.moved = true;
    rotation += (event.clientX - pointerStart.lastX) * .012; pointerStart.lastX = event.clientX; resume();
  }
  function onUp(event: PointerEvent) {
    if (!pointerStart || pointerStart.id !== event.pointerId) return;
    if (!pointerStart.moved && state.stage === 2) { const bounds = renderer.domElement.getBoundingClientRect(); mouse.set((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1); ray.setFromCamera(mouse, camera); const hits = ray.intersectObjects(display.map(item => item.model.group), true); if (hits[0]) { let node: THREE.Object3D | null = hits[0].object; while (node && !node.userData.cake) node = node.parent; if (node?.userData.cake) callbacks.onSelect(node.userData.cake as CakeKind); } }
    if (renderer.domElement.hasPointerCapture(event.pointerId)) renderer.domElement.releasePointerCapture(event.pointerId); pointerStart = null;
  }
  function onCancel() { pointerStart = null; }
  renderer.domElement.addEventListener("pointerdown", onDown); renderer.domElement.addEventListener("pointermove", onMove); renderer.domElement.addEventListener("pointerup", onUp); renderer.domElement.addEventListener("pointercancel", onCancel); renderer.domElement.addEventListener("webglcontextlost", onLost); document.addEventListener("visibilitychange", visibility);
  function dispose() { if (disposed) return; disposed = true; cancelAnimationFrame(frame); sizing.disconnect(); document.removeEventListener("visibilitychange", visibility); renderer.domElement.removeEventListener("pointerdown", onDown); renderer.domElement.removeEventListener("pointermove", onMove); renderer.domElement.removeEventListener("pointerup", onUp); renderer.domElement.removeEventListener("pointercancel", onCancel); renderer.domElement.removeEventListener("webglcontextlost", onLost); a.dispose(); environment?.dispose(); sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove(); }
  resume();
  return {
    update(next) { if (disposed) return; if (next.stage !== state.stage || next.stage === 2 && next.order.cake !== state.order.cake) beginTransition(next.stage, next.order, next.progress); if (JSON.stringify(next.order) !== JSON.stringify(state.order)) { updateTicket(next.order); renderer.shadowMap.needsUpdate = true; } state = next; resume(); },
    rotate(amount) { rotation += amount; renderer.shadowMap.needsUpdate = true; resume(); },
    dispose,
  };
}

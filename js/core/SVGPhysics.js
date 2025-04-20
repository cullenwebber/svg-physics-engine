import Matter from "matter-js";
import decomp from "poly-decomp";
import "pathseg";
import p5 from "p5";
import { deepMerge, debounce } from "./utils.js";

/**
 * Default configuration for SVGPhysics.
 * @type {object}
 */
const defaultConfig = {
  scale: 1.3,
  debug: {
    devMode: false,
    showBoundingBoxes: false,
  },
  physics: {
    restitution: 0.7,
    friction: 0,
    vertexLimit: 14,
    simplifyTolerance: 0.02,
    minimumArea: 5,
    positionIterations: 3,
    velocityIterations: 2,
  },
  mouseConstraint: { stiffness: 0.1 },
  outline: {
    stroke: "transparent",
    strokeWidth: 0,
  },
};

/**
 * Class to create a physics simulation for SVG shapes using Matter.js and p5.js.
 * @class SVGPhysics
 * @example new SVGPhysics('#footer-matter.inner', '#footer-svg')
 */
class SVGPhysics {
  /**
   * @param {string} containerSel - CSS selector for the canvas container (eg. #footer).
   * @param {string} svgSel - CSS selector for the SVG element (eg. #svg-element).
   * @param {object} [customConfig={}] - Optional override of defaultConfig.
   */
  constructor(containerSel, svgSel, customConfig = {}) {
    this.config = deepMerge(defaultConfig, customConfig);
    this.container = document.querySelector(containerSel);
    this.svgSel = svgSel;
    if (!this.container) throw new Error("Invalid container selector");

    this.shapeCache = [];
    this.bodies = [];
    this.walls = [];
    this.#initShapeCache(
      svgSel,
      this.config.physics.vertexLimit,
      this.config.scale
    );
    this.#initMatter();
    this.#initP5();
    this.#setupDebugControls();
  }

  /**
   * Scales a path string by a given factor.
   * @param {string} dString - The path string.
   * @param {number} scaleFactor - The scaling factor.
   * @returns {string} - The scaled path string.
   * @private
   */
  #scaleDString(d, scale) {
    return d.replace(/(-?\d*\.?\d+)/g, (num) =>
      String(parseFloat(num) * scale)
    );
  }

  /**
   * Builds a one‑time cache of simplified shapes.
   * @param {string} svgSelector
   * @param {number} vertexLimit
   * @param {number} scale
   * @returns {void}
   * @private
   */

  #initShapeCache(svgSelector, vertexLimit, scale = 1) {
    if (this.shapeCache.length) return;
    const svg = document.querySelector(svgSelector);
    if (!svg) return;

    const paths = svg.querySelectorAll("path");
    paths.forEach((pathEl) => {
      const rawD = pathEl.getAttribute("d");
      const newD = this.#scaleDString(rawD, scale);
      const tmp = pathEl.cloneNode();
      tmp.setAttribute("d", newD);
      const rawVerts = Matter.Svg.pathToVertices(tmp, vertexLimit);
      const flat = Array.isArray(rawVerts[0]) ? rawVerts.flat() : rawVerts;
      const hull = Matter.Vertices.hull(flat);
      const centroid = Matter.Vertices.centre(hull);
      const p2d = new Path2D(newD);

      const fill = pathEl.getAttribute("fill") || "#3498db";
      this.shapeCache.push({ hull, centroid, path2d: p2d, fill });
    });
  }

  /**
   * Initializes the Matter.js engine and runner.
   * @private
   */
  #initMatter() {
    const { Engine, Runner, Common } = Matter;
    window.decomp = decomp;
    Common.setDecomp(decomp);
    this.engine = Engine.create();
    this.engine.positionIterations = this.config.physics.positionIterations;
    this.engine.velocityIterations = this.config.physics.velocityIterations;
    this.runner = Runner.create();
    Runner.run(this.runner, this.engine);
  }

  /**
   * Sets up keyboard debug toggle (press "b").
   * @private
   */
  #setupDebugControls() {
    if (!this.config.debug.devMode) return;

    window.addEventListener("keydown", (e) => {
      if (e.key === "b") {
        this.config.debug.showBoundingBoxes =
          !this.config.debug.showBoundingBoxes;
      }
    });
  }

  /**
   * Bootstraps the p5 instance with lifecycle hooks.
   * @private
   */
  #initP5() {
    const sketch = (p) => {
      p.setup = () => this.#setup(p);
      p.draw = () => this.#draw(p);
      p.windowResized = debounce(() => this.#handleResize(p), 100);
    };
    this.p5 = new p5(sketch);
  }

  /**
   * p5 setup: create canvas, mouse, bodies and walls.
   * @param {import('p5')} p - p5 instance.
   * @private
   */
  #setup(p) {
    const { clientWidth: w, clientHeight: h } = this.container;
    p.createCanvas(w, h).parent(this.container);
    this.#setupMouseConstraint(p);
    this.#createBodies(p);
    this.#createWalls(p);
  }

  /**
   * Configures Matter mouse interaction.
   * @param {import('p5')} p - p5 instance.
   * @private
   */
  #setupMouseConstraint(p) {
    const { Mouse, MouseConstraint, World } = Matter;
    const canvasEl = this.container.querySelector("canvas");
    const mouse = Mouse.create(canvasEl);
    const mc = MouseConstraint.create(this.engine, {
      mouse,
      constraint: {
        stiffness: this.config.mouseConstraint.stiffness,
        render: { visible: false },
      },
    });
    mouse.pixelRatio = p.pixelDensity();
    World.add(this.engine.world, mc);
  }

  /**
   * Creates and caches physics bodies from precomputed shapeCache.
   * @param {import('p5')} p - p5 instance.
   * @private
   */
  #createBodies(p) {
    const { World, Bodies } = Matter;

    const { offsetX, offsetY } = this.#calcCenterOffsets(p);

    this.shapeCache.forEach((shape) => {
      const startX = shape.centroid.x + offsetX;
      const startY = shape.centroid.y + offsetY;
      const body = Bodies.fromVertices(
        startX,
        startY,
        [shape.hull],
        {
          restitution: this.config.physics.restitution,
          friction: this.config.physics.friction,
        },
        true,
        this.config.physics.simplifyTolerance,
        this.config.physics.minimumArea
      );
      if (!body) return;
      World.add(this.engine.world, body);
      this.bodies.push({ body, ...shape });
    });
  }

  /**
   * Calculates offsets to center the group of shapes.
   * @param {import('p5')} p - p5 instance.
   * @returns {Object} - Offset values.
   * @private
   */
  #calcCenterOffsets(p) {
    const allVerts = this.shapeCache.flatMap((s) => s.hull);
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;
    allVerts.forEach((v) => {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    });
    const groupWidth = maxX - minX;
    const groupHeight = maxY - minY;

    const offsetX = (p.width - groupWidth) / 2 - minX;
    const offsetY = (p.height - groupHeight) / 2 - minY;
    return { offsetX, offsetY };
  }

  /**
   * Creates static boundary walls around the canvas.
   * @param {import('p5')} p - p5 instance.
   * @private
   */
  #createWalls(p) {
    const { Bodies, World } = Matter;
    const w = p.width,
      h = p.height;
    this.walls = [
      Bodies.rectangle(w / 2, h + 50, w, 100, { isStatic: true }),
      Bodies.rectangle(-50, h / 2, 100, h * 2, { isStatic: true }),
      Bodies.rectangle(w + 50, h / 2, 100, h * 2, { isStatic: true }),
    ];
    World.add(this.engine.world, this.walls);
  }

  /**
   * p5 draw loop: clears canvas and renders all bodies.
   * @param {import('p5')} p - p5 instance.
   * @private
   */
  #draw(p) {
    p.clear();
    this.bodies.forEach(({ body, fill, path2d, centroid }) => {
      const ctx = p.drawingContext;
      ctx.save();
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);
      ctx.translate(-centroid.x, -centroid.y);

      ctx.fillStyle = fill;
      ctx.fill(path2d);

      ctx.strokeStyle = this.config.outline.stroke;
      ctx.lineWidth = this.config.outline.strokeWidth;
      ctx.stroke(path2d);

      ctx.restore();
      if (this.config.debug.showBoundingBoxes) {
        this.#drawDebugBounds(body, ctx);
      }
    });
  }

  /**
   * Draws debug outlines around a physics body.
   * @param {Matter.Body} body - The physics body.
   * @param {CanvasRenderingContext2D} ctx - The canvas context.
   * @private
   */
  #drawDebugBounds(body, ctx) {
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,255,0.5)";
    ctx.beginPath();
    body.vertices.forEach((v, i) =>
      i ? ctx.lineTo(v.x, v.y) : ctx.moveTo(v.x, v.y)
    );
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Handles window resize: adjusts canvas and repositions walls.
   * @param {import('p5')} p - p5 instance.
   * @private
   */
  #handleResize(p) {
    const { clientWidth: w, clientHeight: h } = this.container;
    p.resizeCanvas(w, h);
    const { Body } = Matter;
    Body.setPosition(this.walls[0], { x: w / 2, y: h + 50 });
    Body.setPosition(this.walls[2], { x: w + 50, y: h / 2 });
  }

  /**
   * Pauses the physics simulation
   * @returns {SVGPhysics} - Returns this for chaining
   */
  pause() {
    Matter.Runner.stop(this.runner);
    return this;
  }

  /**
   * Resumes the physics simulation
   * @returns {SVGPhysics} - Returns this for chaining
   */
  resume() {
    Matter.Runner.start(this.runner, this.engine);
    return this;
  }

  /**
   * Cleans up Matter and p5 resources.
   * @public
   */
  destroy() {
    const { World, Engine } = Matter;
    World.clear(this.engine.world);
    Engine.clear(this.engine);
    this.p5.remove();
  }
}

export default SVGPhysics;

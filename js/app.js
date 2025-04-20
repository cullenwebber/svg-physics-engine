import SVGPhysics from "./core/SVGPhysics.js";

document.addEventListener("DOMContentLoaded", () => {
  // Initialize the physics simulation
  const physics = new SVGPhysics("#container", "svg", {
    scale: 0.000725 * innerWidth,
    debug: {
      devMode: true,
      showBoundingBoxes: false,
    },
    physics: {
      restitution: 0.65,
      friction: 0,
    },
  });

  // Track simulation state
  let isPaused = false;

  // Add keyboard controls to toggle pause/resume
  window.addEventListener("keydown", (e) => {
    if (e.key === "p") {
      if (!isPaused) {
        physics.pause();
        console.log("Physics paused");
        isPaused = true;
      } else {
        physics.resume();
        console.log("Physics resumed");
        isPaused = false;
      }
    }
  });

  // Cleanup on page unload
  window.addEventListener("beforeunload", () => {
    physics.destroy();
  });
});

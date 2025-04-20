/**
 * Debounce helper to batch rapid calls.
 * @param {Function} fn - Function to debounce.
 * @param {number} ms - Delay in milliseconds.
 * @returns {Function}
 */
export function debounce(fn, ms = 100) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}


/**
 * Deep merge two objects.
 * @param {Object} target - The target object.
 * @param {Object} source - The source object.
 * @returns {Object} - The merged object.
 */
export function deepMerge(target, source) {
    if (!source || typeof source !== "object") return target;
    const output = { ...target };
  
    Object.keys(source).forEach((key) => {
      if (source[key] instanceof Object && !Array.isArray(source[key])) {
        output[key] = deepMerge(target[key] || {}, source[key]);
      } else {
        output[key] = source[key];
      }
    });
  
    return output;
  }
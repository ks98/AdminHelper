const LIST_FACTOR = 1.55;
const PANEL_FACTOR = 1.35;

function accelerateWheelScroll(element, factor) {
  if (!element || element.dataset.scrollAccelerationBound === "1") {
    return;
  }
  element.dataset.scrollAccelerationBound = "1";
  element.addEventListener(
    "wheel",
    (event) => {
      if (event.ctrlKey) {
        return;
      }
      if (element.scrollHeight <= element.clientHeight) {
        return;
      }
      if (event.deltaMode === 0) {
        return;
      }

      let modeScale = 1;
      if (event.deltaMode === 1) {
        modeScale = 16;
      } else if (event.deltaMode === 2) {
        modeScale = element.clientHeight;
      }

      const deltaY = event.deltaY * modeScale;
      const deltaX = event.deltaX * modeScale;
      if (Math.abs(deltaY) < 0.5 && Math.abs(deltaX) < 0.5) {
        return;
      }

      const beforeTop = element.scrollTop;
      const beforeLeft = element.scrollLeft;
      element.scrollTop += deltaY * factor;
      element.scrollLeft += deltaX * factor;
      const changed =
        Math.abs(element.scrollTop - beforeTop) > 0.1 ||
        Math.abs(element.scrollLeft - beforeLeft) > 0.1;
      if (changed) {
        event.preventDefault();
      }
    },
    { passive: false }
  );
}

export function initScrollAcceleration() {
  const listEl = document.getElementById("list");
  const treeEl = document.getElementById("tree");
  accelerateWheelScroll(listEl, LIST_FACTOR);
  accelerateWheelScroll(treeEl, LIST_FACTOR);
  document.querySelectorAll(".editor-panel").forEach((panel) => {
    accelerateWheelScroll(panel, PANEL_FACTOR);
  });
}

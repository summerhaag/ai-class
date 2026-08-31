// Pan/zoom camera. World space is where circles live (outer boundary has
// radius 1 centered at the origin); screen space is CSS pixels.
export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.centerX = 0;
    this.centerY = 0;
    this.rotation = 0; // radians
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.dirty = true;

    this._resize();
    this.zoomScale = (0.8 * Math.min(this.width, this.height)) / 2;
    this._minZoom = this.zoomScale * 1e-2;
    this._maxZoom = this.zoomScale * 1e12;

    // The canvas is a contained element (sized by its parent's CSS), not the
    // full viewport, so track its own box rather than the window.
    new ResizeObserver(() => this._resize()).observe(this.canvas);
    this._bindPointerEvents();
    this._bindWheel();
  }

  _resize() {
    this.dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.dirty = true;
  }

  worldToScreen(x, y) {
    const dx = x - this.centerX;
    const dy = y - this.centerY;
    const cosT = Math.cos(this.rotation);
    const sinT = Math.sin(this.rotation);
    const rx = dx * cosT - dy * sinT;
    const ry = dx * sinT + dy * cosT;
    return [rx * this.zoomScale + this.width / 2, ry * this.zoomScale + this.height / 2];
  }

  // Exact inverse of worldToScreen: undo the screen scale/offset, then apply
  // the inverse (transpose) of the rotation matrix used there.
  screenToWorld(sx, sy) {
    const ux = (sx - this.width / 2) / this.zoomScale;
    const uy = (sy - this.height / 2) / this.zoomScale;
    const cosT = Math.cos(this.rotation);
    const sinT = Math.sin(this.rotation);
    const dx = ux * cosT + uy * sinT;
    const dy = -ux * sinT + uy * cosT;
    return [dx + this.centerX, dy + this.centerY];
  }

  // Axis-aligned world-space rect currently visible, expanded by a margin
  // (fraction of half-extent on each side) so panning doesn't pop-in at the
  // edge. Under rotation the true visible region is a rotated rectangle, so
  // this maps the (expanded) screen rect's 4 corners into world space and
  // takes their bbox — a conservative axis-aligned superset, same role the
  // simple half-width/half-height formula played before rotation existed.
  viewportWorldBounds(marginFrac = 0.25) {
    const hw = (this.width / 2) * (1 + marginFrac);
    const hh = (this.height / 2) * (1 + marginFrac);
    const cx = this.width / 2;
    const cy = this.height / 2;
    const corners = [
      [cx - hw, cy - hh],
      [cx + hw, cy - hh],
      [cx - hw, cy + hh],
      [cx + hw, cy + hh],
    ];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [sx, sy] of corners) {
      const [wx, wy] = this.screenToWorld(sx, sy);
      minX = Math.min(minX, wx);
      maxX = Math.max(maxX, wx);
      minY = Math.min(minY, wy);
      maxY = Math.max(maxY, wy);
    }
    return { minX, minY, maxX, maxY };
  }

  // Recenters/rezooms so the given world-space bbox fills most of the view,
  // and resets rotation — this is the canonical "initial framing" used both
  // right after generating a quadruple and by the reset-view control.
  // Re-anchors the min/max zoom bounds to this packing's natural scale (not
  // the app's original default), since a custom quadruple's absolute circle
  // sizes can differ wildly from the default unit-circle framing.
  fitToBBox(bbox, marginFrac = 0.1) {
    const bboxW = bbox.maxX - bbox.minX;
    const bboxH = bbox.maxY - bbox.minY;
    this.centerX = (bbox.minX + bbox.maxX) / 2;
    this.centerY = (bbox.minY + bbox.maxY) / 2;
    this.rotation = 0;
    const fit = Math.min(this.width / Math.max(bboxW, 1e-9), this.height / Math.max(bboxH, 1e-9)) * (1 - marginFrac);
    this.zoomScale = fit;
    this._minZoom = fit * 1e-2;
    this._maxZoom = fit * 1e12;
    this.dirty = true;
  }

  zoomAt(screenX, screenY, factor) {
    const [wx, wy] = this.screenToWorld(screenX, screenY);
    this.zoomScale = Math.min(this._maxZoom, Math.max(this._minZoom, this.zoomScale * factor));
    const cosT = Math.cos(this.rotation);
    const sinT = Math.sin(this.rotation);
    const rx = (screenX - this.width / 2) / this.zoomScale;
    const ry = (screenY - this.height / 2) / this.zoomScale;
    this.centerX = wx - (rx * cosT + ry * sinT);
    this.centerY = wy - (-rx * sinT + ry * cosT);
    this.dirty = true;
  }

  panBy(dxScreen, dyScreen) {
    const cosT = Math.cos(this.rotation);
    const sinT = Math.sin(this.rotation);
    const ux = dxScreen / this.zoomScale;
    const uy = dyScreen / this.zoomScale;
    this.centerX -= ux * cosT + uy * sinT;
    this.centerY -= -ux * sinT + uy * cosT;
    this.dirty = true;
  }

  setRotation(radians) {
    this.rotation = radians;
    this.dirty = true;
  }

  consumeDirty() {
    const d = this.dirty;
    this.dirty = false;
    return d;
  }

  _bindWheel() {
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = this.canvas.getBoundingClientRect();
        const factor = Math.exp(-e.deltaY * 0.0018);
        this.zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor);
      },
      { passive: false }
    );
  }

  _bindPointerEvents() {
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      this.panBy(dx, dy);
    });

    const stop = () => {
      dragging = false;
    };
    this.canvas.addEventListener('pointerup', stop);
    this.canvas.addEventListener('pointercancel', stop);
  }
}

import Decimal from 'decimal.js';

const PRECISION_SAFETY_MARGIN = 15;

// Decimal counterpart to camera.js. World position (centerX/centerY) and
// zoomScale are Decimal, since at deep zoom they can be arbitrarily large or
// small — a plain double centerX would itself lose the precision this whole
// page exists to keep.
//
// The key trick, in worldToScreen/screenToWorld: every step that combines a
// world-space Decimal with another world-space Decimal (subtracting a
// circle's position from the camera center, multiplying by zoomScale) stays
// in Decimal, so it happens at full configured precision. Only the FINAL
// result — a pixel coordinate, which is always a modest number regardless of
// how deep you've zoomed, since "tiny world distance" times "huge zoomScale"
// nets out to "a few hundred pixels" — gets downcast to a JS number, right
// before it's handed to the canvas. Downcasting any earlier (e.g. converting
// centerX or zoomScale to Number first) is exactly the float64 cancellation
// problem this page exists to avoid.
export class Camera {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.centerX = new Decimal(0);
    this.centerY = new Decimal(0);
    this.rotation = 0; // radians, plain double — orientation never needs deep precision
    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.dirty = true;

    this._resize();
    this.zoomScale = new Decimal((0.8 * Math.min(this.width, this.height)) / 2);
    this._minZoom = this.zoomScale.times(1e-2);
    this._setMaxZoomFromPrecision();

    new ResizeObserver(() => this._resize()).observe(this.canvas);
    this._bindPointerEvents();
    this._bindWheel();
  }

  // Caps how far in you can go at a multiple of the *configured* Decimal
  // precision, not an arbitrary constant — zooming past what the precision
  // can actually resolve would just show numerical garbage, so the cap
  // tracks whatever headroom Decimal.precision currently gives us.
  _setMaxZoomFromPrecision() {
    const digits = Math.max(Decimal.precision - PRECISION_SAFETY_MARGIN, 1);
    this._maxZoom = this.zoomScale.times(new Decimal(10).pow(digits));
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
    const dx = x.minus(this.centerX);
    const dy = y.minus(this.centerY);
    const cosT = Math.cos(this.rotation);
    const sinT = Math.sin(this.rotation);
    const rx = dx.times(cosT).minus(dy.times(sinT));
    const ry = dx.times(sinT).plus(dy.times(cosT));
    const sx = rx.times(this.zoomScale).plus(this.width / 2);
    const sy = ry.times(this.zoomScale).plus(this.height / 2);
    return [sx.toNumber(), sy.toNumber()];
  }

  screenToWorld(sx, sy) {
    const ux = new Decimal(sx - this.width / 2).div(this.zoomScale);
    const uy = new Decimal(sy - this.height / 2).div(this.zoomScale);
    const cosT = Math.cos(this.rotation);
    const sinT = Math.sin(this.rotation);
    const dx = ux.times(cosT).plus(uy.times(sinT));
    const dy = ux.times(-sinT).plus(uy.times(cosT));
    return [dx.plus(this.centerX), dy.plus(this.centerY)];
  }

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
    let minX = new Decimal(Infinity);
    let minY = new Decimal(Infinity);
    let maxX = new Decimal(-Infinity);
    let maxY = new Decimal(-Infinity);
    for (const [sx, sy] of corners) {
      const [wx, wy] = this.screenToWorld(sx, sy);
      minX = Decimal.min(minX, wx);
      maxX = Decimal.max(maxX, wx);
      minY = Decimal.min(minY, wy);
      maxY = Decimal.max(maxY, wy);
    }
    return { minX, minY, maxX, maxY };
  }

  fitToBBox(bbox, marginFrac = 0.1) {
    const bboxW = Decimal.max(bbox.maxX.minus(bbox.minX), '1e-300');
    const bboxH = Decimal.max(bbox.maxY.minus(bbox.minY), '1e-300');
    this.centerX = bbox.minX.plus(bbox.maxX).div(2);
    this.centerY = bbox.minY.plus(bbox.maxY).div(2);
    this.rotation = 0;
    const fitX = new Decimal(this.width).div(bboxW);
    const fitY = new Decimal(this.height).div(bboxH);
    this.zoomScale = Decimal.min(fitX, fitY).times(1 - marginFrac);
    this._minZoom = this.zoomScale.times(1e-2);
    this._setMaxZoomFromPrecision();
    this.dirty = true;
  }

  zoomAt(screenX, screenY, factor) {
    const [wx, wy] = this.screenToWorld(screenX, screenY);
    this.zoomScale = Decimal.min(this._maxZoom, Decimal.max(this._minZoom, this.zoomScale.times(factor)));
    const cosT = Math.cos(this.rotation);
    const sinT = Math.sin(this.rotation);
    const rx = new Decimal(screenX - this.width / 2).div(this.zoomScale);
    const ry = new Decimal(screenY - this.height / 2).div(this.zoomScale);
    this.centerX = wx.minus(rx.times(cosT).plus(ry.times(sinT)));
    this.centerY = wy.minus(rx.times(-sinT).plus(ry.times(cosT)));
    this.dirty = true;
  }

  panBy(dxScreen, dyScreen) {
    const cosT = Math.cos(this.rotation);
    const sinT = Math.sin(this.rotation);
    const ux = new Decimal(dxScreen).div(this.zoomScale);
    const uy = new Decimal(dyScreen).div(this.zoomScale);
    this.centerX = this.centerX.minus(ux.times(cosT).plus(uy.times(sinT)));
    this.centerY = this.centerY.minus(ux.times(-sinT).plus(uy.times(cosT)));
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

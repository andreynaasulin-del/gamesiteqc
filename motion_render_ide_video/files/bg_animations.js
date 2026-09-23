/**
 * bg_animations.js — Background animation module
 * Attach to any element via BgAnimations.init(containerEl)
 * or BgAnimations.apply(name, containerEl)
 *
 * Usage:
 *   <script src="bg_animations.js"></script>
 *   BgAnimations.init(document.body);
 *   BgAnimations.apply('particles', document.body);
 *   BgAnimations.stop();
 */

const BgAnimations = (() => {
  let _canvas = null;
  let _ctx = null;
  let _raf = null;
  let _current = null;
  let _container = null;
  let _t = 0;
  let _particles = [];
  let _onStop = null;

  // ── Helpers ──────────────────────────────────────────────
  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return {r,g,b};
  }

  function getCssVar(name, fallback) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function getAccent() { return getCssVar('--qc-color-primary', '#3b82f6'); }
  function getBg()     { return getCssVar('--qc-color-bg-primary', '#0d0d15'); }

  function resize() {
    if (!_canvas || !_container) return;
    _canvas.width  = _container.offsetWidth;
    _canvas.height = _container.offsetHeight;
  }

  function ensureCanvas(container) {
    if (_canvas && _canvas.parentNode === container) return;
    removeCanvas();
    _container = container;
    _canvas = document.createElement('canvas');
    _canvas.style.cssText = `
      position:absolute;top:0;left:0;width:100%;height:100%;
      pointer-events:none;z-index:0;border-radius:inherit;
    `;
    const pos = getComputedStyle(container).position;
    if (pos !== 'fixed' && pos !== 'absolute' && pos !== 'sticky') {
      container.style.position = 'relative';
    }
    container.insertBefore(_canvas, container.firstChild);
    _ctx = _canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
  }

  function removeCanvas() {
    window.removeEventListener('resize', resize);
    if (_canvas) { _canvas.remove(); _canvas = null; _ctx = null; }
  }

  function stopRaf() {
    if (_raf) { cancelAnimationFrame(_raf); _raf = null; }
  }

  // ── Animation registry ───────────────────────────────────
  const ANIMS = {};

  function register(name, { setup, frame }) {
    ANIMS[name] = { setup, frame };
  }

  // ── 1. Neural Net (Particle Network) ─────────────────────
  // From https://codepen.io/franky/pen/LGMWPK by franky
  // Particles drift and connect with lines when close — no image bg, scoped to container
  (() => {
    let _nnCanvas = null, _nnCtx = null, _nnRaf = null;
    let _nnParticles = [], _nnInteraction = null;
    let _nnResObs = null, _nnEvListeners = [];
    let _nnCreateInterval = null;

    const NN_OPTS = {
      velocity: 0.7,
      density: 12000,
      netLineDistance: 200,
      netLineColor: '#aaa',
      particleColors: ['#aaa'],
    };

    function _nnAddEv(el, type, fn, opts) {
      el.addEventListener(type, fn, opts);
      _nnEvListeners.push({ el, type, fn });
    }

    function removeNeural() {
      if (_nnRaf) { cancelAnimationFrame(_nnRaf); _nnRaf = null; }
      if (_nnCreateInterval) { clearInterval(_nnCreateInterval); _nnCreateInterval = null; }
      if (_nnResObs) { _nnResObs.disconnect(); _nnResObs = null; }
      for (const { el, type, fn } of _nnEvListeners) el.removeEventListener(type, fn);
      _nnEvListeners = [];
      if (_nnCanvas) { _nnCanvas.remove(); _nnCanvas = null; }
      _nnCtx = null; _nnParticles = []; _nnInteraction = null;
    }

    function NNParticle(x, y) {
      this.x = x !== undefined ? x : Math.random() * _nnCanvas.width;
      this.y = y !== undefined ? y : Math.random() * _nnCanvas.height;
      this.vx = (Math.random() - 0.5) * NN_OPTS.velocity;
      this.vy = (Math.random() - 0.5) * NN_OPTS.velocity;
      this.radius = 1.5 + Math.random();
      this.opacity = 0;
      this.color = NN_OPTS.particleColors[Math.floor(Math.random() * NN_OPTS.particleColors.length)];
    }

    NNParticle.prototype.update = function() {
      if (this.opacity < 1) this.opacity += 0.01;
      if (this.x > _nnCanvas.width + 100 || this.x < -100) this.vx = -this.vx;
      if (this.y > _nnCanvas.height + 100 || this.y < -100) this.vy = -this.vy;
      this.x += this.vx;
      this.y += this.vy;
    };

    NNParticle.prototype.draw = function() {
      _nnCtx.beginPath();
      _nnCtx.fillStyle = this.color;
      _nnCtx.globalAlpha = this.opacity;
      _nnCtx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
      _nnCtx.fill();
    };

    function nnCreateParticles(isInitial) {
      _nnParticles = [];
      const qty = (_nnCanvas.width * _nnCanvas.height) / NN_OPTS.density;
      if (isInitial) {
        let counter = 0;
        if (_nnCreateInterval) clearInterval(_nnCreateInterval);
        _nnCreateInterval = setInterval(() => {
          if (counter < qty - 1) _nnParticles.push(new NNParticle());
          else { clearInterval(_nnCreateInterval); _nnCreateInterval = null; }
          counter++;
        }, 250);
      } else {
        for (let i = 0; i < qty; i++) _nnParticles.push(new NNParticle());
      }
    }

    function nnCreateInteraction() {
      _nnInteraction = new NNParticle();
      _nnInteraction.vx = _nnInteraction.vy = 0;
      _nnInteraction.opacity = 1;
      _nnParticles.push(_nnInteraction);
    }

    function nnRemoveInteraction() {
      if (!_nnInteraction) return;
      const idx = _nnParticles.indexOf(_nnInteraction);
      if (idx > -1) _nnParticles.splice(idx, 1);
      _nnInteraction = null;
    }

    function nnLoop() {
      if (!_nnCanvas) return;
      _nnCtx.clearRect(0, 0, _nnCanvas.width, _nnCanvas.height);
      _nnCtx.globalAlpha = 1;

      // Draw connections
      for (let i = 0; i < _nnParticles.length; i++) {
        for (let j = _nnParticles.length - 1; j > i; j--) {
          const p1 = _nnParticles[i], p2 = _nnParticles[j];
          let dist = Math.min(Math.abs(p1.x - p2.x), Math.abs(p1.y - p2.y));
          if (dist > NN_OPTS.netLineDistance) continue;
          dist = Math.sqrt((p1.x-p2.x)**2 + (p1.y-p2.y)**2);
          if (dist > NN_OPTS.netLineDistance) continue;
          _nnCtx.beginPath();
          _nnCtx.strokeStyle = NN_OPTS.netLineColor;
          _nnCtx.globalAlpha = (NN_OPTS.netLineDistance - dist) / NN_OPTS.netLineDistance * p1.opacity * p2.opacity;
          _nnCtx.lineWidth = 0.7;
          _nnCtx.moveTo(p1.x, p1.y);
          _nnCtx.lineTo(p2.x, p2.y);
          _nnCtx.stroke();
        }
      }

      // Draw particles
      for (const p of _nnParticles) { p.update(); p.draw(); }

      _nnRaf = requestAnimationFrame(nnLoop);
    }

    function nnBindEvents() {
      let mouseIsDown = false, touchMoving = false;

      const onMouseMove = (e) => {
        const rect = _nnCanvas.getBoundingClientRect();
        if (!_nnInteraction) nnCreateInteraction();
        _nnInteraction.x = e.clientX - rect.left;
        _nnInteraction.y = e.clientY - rect.top;
      };
      const onMouseDown = (e) => {
        mouseIsDown = true;
        let counter = 0, qty = 3;
        const rect = _nnCanvas.getBoundingClientRect();
        const iv = setInterval(() => {
          if (!mouseIsDown) { clearInterval(iv); return; }
          if (counter === 1) qty = 1;
          for (let i = 0; i < qty; i++) {
            if (_nnInteraction) _nnParticles.push(new NNParticle(_nnInteraction.x, _nnInteraction.y));
          }
          counter++;
        }, 50);
      };
      const onMouseUp   = () => { mouseIsDown = false; };
      const onMouseOut  = () => nnRemoveInteraction();
      const onTouchMove = (e) => {
        e.preventDefault();
        touchMoving = true;
        const rect = _nnCanvas.getBoundingClientRect();
        if (!_nnInteraction) nnCreateInteraction();
        _nnInteraction.x = e.changedTouches[0].clientX - rect.left;
        _nnInteraction.y = e.changedTouches[0].clientY - rect.top;
      };
      const onTouchStart = (e) => {
        e.preventDefault();
        setTimeout(() => {
          if (!touchMoving) {
            const rect = _nnCanvas.getBoundingClientRect();
            for (let i = 0; i < 3; i++)
              _nnParticles.push(new NNParticle(
                e.changedTouches[0].clientX - rect.left,
                e.changedTouches[0].clientY - rect.top
              ));
          }
        }, 200);
      };
      const onTouchEnd = (e) => { e.preventDefault(); touchMoving = false; nnRemoveInteraction(); };

      _nnAddEv(_nnCanvas, 'mousemove',  onMouseMove);
      _nnAddEv(_nnCanvas, 'mousedown',  onMouseDown);
      _nnAddEv(_nnCanvas, 'mouseup',    onMouseUp);
      _nnAddEv(_nnCanvas, 'mouseout',   onMouseOut);
      _nnAddEv(_nnCanvas, 'touchmove',  onTouchMove,  { passive: false });
      _nnAddEv(_nnCanvas, 'touchstart', onTouchStart, { passive: false });
      _nnAddEv(_nnCanvas, 'touchend',   onTouchEnd,   { passive: false });
    }

    register('neural', {
      setup() {
        removeNeural();
        _nnCanvas = document.createElement('canvas');
        _nnCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:auto;z-index:0;border-radius:inherit;';
        _container.insertBefore(_nnCanvas, _container.firstChild);
        _nnCanvas.width  = _container.offsetWidth;
        _nnCanvas.height = _container.offsetHeight;
        _nnCtx = _nnCanvas.getContext('2d');

        nnCreateParticles(true);
        nnBindEvents();
        _nnRaf = requestAnimationFrame(nnLoop);

        // Resize support
        _nnResObs = new ResizeObserver(() => {
          _nnCanvas.width  = _container.offsetWidth;
          _nnCanvas.height = _container.offsetHeight;
          nnCreateParticles(false);
        });
        _nnResObs.observe(_container);
      },
      frame() {
        // Neural net runs its own RAF loop; clear the shared 2D overlay
        if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      }
    });

    window._bgNeuralCleanup = removeNeural;
  })();

  // ── 2. Northern Lights (Aurora Borealis) ─────────────────
  // From https://codepen.io/rawcreative/pen/kabgzJ by rawcreative
  // Uses SimplexNoise 3D to warp a gradient — authentic aurora look
  (() => {
    let _aCanvas = null, _aCtx = null, _aResObs = null, _aSimplex = null;

    // ── SimplexNoise (Sean McCullough / Stefan Gustavson) ──
    function SimplexNoise(r) {
      if (!r) r = Math;
      this.grad3 = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
      this.p = [];
      for (let i = 0; i < 256; i++) this.p[i] = Math.floor(r.random() * 256);
      this.perm = [];
      for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
    }
    SimplexNoise.prototype.dot = function(g, x, y) { return g[0]*x + g[1]*y; };
    SimplexNoise.prototype.noise3d = function(xin, yin, zin) {
      const grad3 = this.grad3, perm = this.perm;
      const F3 = 1/3, G3 = 1/6;
      const s = (xin+yin+zin)*F3;
      const i = Math.floor(xin+s), j = Math.floor(yin+s), k = Math.floor(zin+s);
      const t = (i+j+k)*G3;
      const x0=xin-(i-t), y0=yin-(j-t), z0=zin-(k-t);
      let i1,j1,k1,i2,j2,k2;
      if(x0>=y0){if(y0>=z0){i1=1;j1=0;k1=0;i2=1;j2=1;k2=0;}else if(x0>=z0){i1=1;j1=0;k1=0;i2=1;j2=0;k2=1;}else{i1=0;j1=0;k1=1;i2=1;j2=0;k2=1;}}
      else{if(y0<z0){i1=0;j1=0;k1=1;i2=0;j2=1;k2=1;}else if(x0<z0){i1=0;j1=1;k1=0;i2=0;j2=1;k2=1;}else{i1=0;j1=1;k1=0;i2=1;j2=1;k2=0;}}
      const x1=x0-i1+G3,y1=y0-j1+G3,z1=z0-k1+G3;
      const x2=x0-i2+2*G3,y2=y0-j2+2*G3,z2=z0-k2+2*G3;
      const x3=x0-1+3*G3,y3=y0-1+3*G3,z3=z0-1+3*G3;
      const ii=i&255,jj=j&255,kk=k&255;
      const gi0=perm[ii+perm[jj+perm[kk]]]%12;
      const gi1=perm[ii+i1+perm[jj+j1+perm[kk+k1]]]%12;
      const gi2=perm[ii+i2+perm[jj+j2+perm[kk+k2]]]%12;
      const gi3=perm[ii+1+perm[jj+1+perm[kk+1]]]%12;
      let n0,n1,n2,n3;
      let t0=0.6-x0*x0-y0*y0-z0*z0; n0=t0<0?0:(t0*=t0,t0*t0*(grad3[gi0][0]*x0+grad3[gi0][1]*y0+grad3[gi0][2]*z0));
      let t1=0.6-x1*x1-y1*y1-z1*z1; n1=t1<0?0:(t1*=t1,t1*t1*(grad3[gi1][0]*x1+grad3[gi1][1]*y1+grad3[gi1][2]*z1));
      let t2=0.6-x2*x2-y2*y2-z2*z2; n2=t2<0?0:(t2*=t2,t2*t2*(grad3[gi2][0]*x2+grad3[gi2][1]*y2+grad3[gi2][2]*z2));
      let t3=0.6-x3*x3-y3*y3-z3*z3; n3=t3<0?0:(t3*=t3,t3*t3*(grad3[gi3][0]*x3+grad3[gi3][1]*y3+grad3[gi3][2]*z3));
      return 32*(n0+n1+n2+n3);
    };

    function resizeAurora() {
      if (!_aCanvas || !_container) return;
      _aCanvas.width  = _container.offsetWidth;
      _aCanvas.height = _container.offsetHeight;
    }

    function removeAurora() {
      if (_aResObs) { _aResObs.disconnect(); _aResObs = null; }
      if (_aCanvas) { _aCanvas.remove(); _aCanvas = null; }
      _aCtx = null;
    }

    register('aurora', {
      setup() {
        removeAurora();
        _aSimplex = new SimplexNoise();
        _aCanvas = document.createElement('canvas');
        _aCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;border-radius:inherit;';
        _container.insertBefore(_aCanvas, _container.firstChild);
        _aCtx = _aCanvas.getContext('2d');
        resizeAurora();
        _aResObs = new ResizeObserver(resizeAurora);
        _aResObs.observe(_container);
      },
      frame() {
        if (!_aCtx || !_aSimplex) return;
        // Clear the shared 2D canvas (we draw on our own _aCanvas)
        if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

        const W = _aCanvas.width, H = _aCanvas.height;
        const time = Date.now() / 4000;

        _aCtx.clearRect(0, 0, W, H);

        // Base gradient — aurora color bands
        const grad = _aCtx.createLinearGradient(0, 0, H / 0.4, H * 0.9);
        grad.addColorStop(0,   'rgba(86,59,148,1)');
        grad.addColorStop((Math.sin(time) + 1) * 0.5 * 0.2, 'rgba(178,64,95,.3)');
        grad.addColorStop((Math.cos(time) + 1) * 0.5 * 0.2 + 0.444, 'rgba(0,200,0,.6)');
        grad.addColorStop(0.7, 'rgba(55,60,140,.3)');
        grad.addColorStop(1,   'rgba(0,200,0,.5)');
        _aCtx.fillStyle = grad;
        _aCtx.fillRect(0, 0, W, H);

        // Dark fade from top — gives depth
        _aCtx.save();
        _aCtx.globalCompositeOperation = 'source-over';
        const fade = _aCtx.createLinearGradient(0, 0, 0, H * 0.5);
        fade.addColorStop(0, 'rgba(0,0,0,0.01)');
        fade.addColorStop(1, 'rgba(0,0,0,1)');
        _aCtx.fillStyle = fade;
        _aCtx.fillRect(0, 0, W, H);
        _aCtx.restore();

        // Simplex noise warp pass — pixel-level distortion
        const image  = _aCtx.createImageData(W, H);
        const image2 = _aCtx.getImageData(0, 0, W, H);
        const d  = image.data;
        const d2 = image2.data;

        const octaves = 0.3;
        const scaleX = 4 / octaves, scaleY = 0.25 / octaves;

        for (let i = 0, j = 0, l = d.length; i < l; i += 4, j++) {
          const h = Math.floor(j / W);
          const w = j % W;
          let n = 0;
          let frequency = 0.3, amplitude;
          for (let oi = 0; oi < octaves; oi++) {
            frequency *= 2;
            amplitude = Math.pow(1.5, oi);
            n += _aSimplex.noise3d(w / W * frequency * scaleX, h / H * frequency * scaleY, time) * amplitude;
          }
          const factor = n * 0.5 + 0.5;
          d[i]   = Math.floor(factor * d2[i]);
          d[i+1] = Math.floor(factor * d2[i+1]);
          d[i+2] = Math.floor(factor * d2[i+2]);
          d[i+3] = 255;
        }
        _aCtx.putImageData(image, 0, 0);
      }
    });

    window._bgAuroraCleanup = removeAurora;
  })();

  // ── 3. Grid pulse ─────────────────────────────────────────
  register('grid', {
    setup() {},
    frame(t) {
      const W = _canvas.width, H = _canvas.height;
      _ctx.clearRect(0, 0, W, H);
      const accent = hexToRgb(getAccent());
      const step = 40;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.0008);
      _ctx.strokeStyle = `rgba(${accent.r},${accent.g},${accent.b},${0.04 + pulse * 0.04})`;
      _ctx.lineWidth = 0.5;
      for (let x = 0; x < W; x += step) {
        _ctx.beginPath(); _ctx.moveTo(x, 0); _ctx.lineTo(x, H); _ctx.stroke();
      }
      for (let y = 0; y < H; y += step) {
        _ctx.beginPath(); _ctx.moveTo(0, y); _ctx.lineTo(W, y); _ctx.stroke();
      }
      // glowing dots at intersections near center
      const cx = W/2, cy = H/2;
      for (let x = 0; x < W; x += step) {
        for (let y = 0; y < H; y += step) {
          const dx = x - cx, dy = y - cy;
          const dist = Math.sqrt(dx*dx + dy*dy);
          const maxD = Math.sqrt(cx*cx + cy*cy);
          const a = (1 - dist/maxD) * 0.3 * pulse;
          if (a < 0.01) continue;
          _ctx.beginPath();
          _ctx.arc(x, y, 1.5, 0, Math.PI*2);
          _ctx.fillStyle = `rgba(${accent.r},${accent.g},${accent.b},${a})`;
          _ctx.fill();
        }
      }
    }
  });

  // ── 4. Nebula blobs ───────────────────────────────────────
  register('nebula', {
    setup() {
      _particles = [];
      for (let i = 0; i < 5; i++) {
        _particles.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.2 + Math.random() * 0.25,
          ox: Math.random() * Math.PI * 2,
          oy: Math.random() * Math.PI * 2,
          sx: 0.0002 + Math.random() * 0.0002,
          sy: 0.0002 + Math.random() * 0.0002,
          hue: Math.random() * 60 + 200, // blue-purple range
        });
      }
    },
    frame(t) {
      const W = _canvas.width, H = _canvas.height;
      _ctx.clearRect(0, 0, W, H);
      for (const b of _particles) {
        const x = (b.x + Math.sin(t * b.sx + b.ox) * 0.15) * W;
        const y = (b.y + Math.cos(t * b.sy + b.oy) * 0.1) * H;
        const r = b.r * Math.min(W, H);
        const grad = _ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0,   `hsla(${b.hue},80%,60%,0.08)`);
        grad.addColorStop(0.5, `hsla(${b.hue},70%,50%,0.04)`);
        grad.addColorStop(1,   `hsla(${b.hue},60%,40%,0)`);
        _ctx.beginPath();
        _ctx.arc(x, y, r, 0, Math.PI*2);
        _ctx.fillStyle = grad;
        _ctx.fill();
      }
    }
  });

  // ── 5. God Rays ───────────────────────────────────────────
  register('rain', {
    setup() {
      _particles = [];
      const rayCount = 12;
      for (let i = 0; i < rayCount; i++) {
        _particles.push({
          angle:  (i / rayCount) * Math.PI * 2 * 0.35 - 0.3, // fan spread
          width:  0.04 + Math.random() * 0.06,   // angular width
          alpha:  0.04 + Math.random() * 0.06,
          speed:  (Math.random() - 0.5) * 0.00008,
          phase:  Math.random() * Math.PI * 2,
          pspeed: 0.0004 + Math.random() * 0.0004,
          length: 0.7 + Math.random() * 0.4,     // fraction of screen diagonal
        });
      }
    },
    frame(t) {
      const W = _canvas.width, H = _canvas.height;
      _ctx.clearRect(0, 0, W, H);

      // Source point — slightly above top-center, like sun behind clouds
      const srcX = W * 0.5 + Math.sin(t * 0.00008) * W * 0.05;
      const srcY = H * -0.05;

      const diag = Math.sqrt(W * W + H * H);

      for (const r of _particles) {
        // Slowly drift angle
        r.angle += r.speed;

        // Pulse brightness
        const pulse = 0.5 + 0.5 * Math.sin(t * r.pspeed + r.phase);
        const alpha = r.alpha * (0.5 + pulse * 0.5);

        const halfW = r.width / 2;
        const len   = r.length * diag;

        // Two edge angles of the ray
        const a1 = r.angle - halfW;
        const a2 = r.angle + halfW;

        // Far endpoints
        const x1 = srcX + Math.cos(a1) * len;
        const y1 = srcY + Math.sin(a1) * len;
        const x2 = srcX + Math.cos(a2) * len;
        const y2 = srcY + Math.sin(a2) * len;

        // Gradient along ray length
        const midX = srcX + Math.cos(r.angle) * len;
        const midY = srcY + Math.sin(r.angle) * len;
        const grad = _ctx.createLinearGradient(srcX, srcY, midX, midY);
        grad.addColorStop(0,   `rgba(255,240,180,${alpha * 1.2})`);
        grad.addColorStop(0.3, `rgba(255,220,120,${alpha})`);
        grad.addColorStop(0.7, `rgba(200,180,255,${alpha * 0.4})`);
        grad.addColorStop(1,   `rgba(150,160,255,0)`);

        _ctx.beginPath();
        _ctx.moveTo(srcX, srcY);
        _ctx.lineTo(x1, y1);
        _ctx.lineTo(x2, y2);
        _ctx.closePath();
        _ctx.fillStyle = grad;
        _ctx.fill();
      }

      // Bright source bloom
      const bloom = _ctx.createRadialGradient(srcX, srcY, 0, srcX, srcY, W * 0.18);
      const bp = 0.5 + 0.5 * Math.sin(t * 0.0005);
      bloom.addColorStop(0,   `rgba(255,250,200,${0.12 + bp * 0.06})`);
      bloom.addColorStop(0.3, `rgba(255,220,100,${0.04 + bp * 0.03})`);
      bloom.addColorStop(1,   'rgba(255,200,80,0)');
      _ctx.beginPath();
      _ctx.arc(srcX, srcY, W * 0.18, 0, Math.PI * 2);
      _ctx.fillStyle = bloom;
      _ctx.fill();
    }
  });

  // ── 6. Stars ──────────────────────────────────────────────
  register('stars', {
    setup() {
      _particles = [];
      for (let i = 0; i < 120; i++) {
        _particles.push({
          x: Math.random(),
          y: Math.random(),
          r: 0.3 + Math.random() * 1.2,
          twinkle: Math.random() * Math.PI * 2,
          speed: 0.0008 + Math.random() * 0.002,
          base: 0.1 + Math.random() * 0.5,
        });
      }
    },
    frame(t) {
      const W = _canvas.width, H = _canvas.height;
      _ctx.clearRect(0, 0, W, H);
      for (const s of _particles) {
        const alpha = s.base * (0.5 + 0.5 * Math.sin(t * s.speed + s.twinkle));
        _ctx.beginPath();
        _ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        _ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        _ctx.fill();
      }
    }
  });

  // ── 7. Waves ──────────────────────────────────────────────
  register('waves', {
    setup() {},
    frame(t) {
      const W = _canvas.width, H = _canvas.height;
      _ctx.clearRect(0, 0, W, H);
      const accent = hexToRgb(getAccent());
      const waveCount = 4;
      for (let w = 0; w < waveCount; w++) {
        const phase  = (w / waveCount) * Math.PI * 2;
        const yBase  = H * (0.35 + w * 0.12);
        const amp    = 18 + w * 8;
        const freq   = 0.006 - w * 0.001;
        const speed  = 0.0004 + w * 0.0001;
        const alpha  = 0.06 - w * 0.01;
        _ctx.beginPath();
        _ctx.moveTo(0, yBase);
        for (let x = 0; x <= W; x += 3) {
          const y = yBase + Math.sin(x * freq + t * speed + phase) * amp;
          _ctx.lineTo(x, y);
        }
        _ctx.lineTo(W, H); _ctx.lineTo(0, H); _ctx.closePath();
        const grad = _ctx.createLinearGradient(0, yBase - amp, 0, yBase + amp);
        grad.addColorStop(0, `rgba(${accent.r},${accent.g},${accent.b},0)`);
        grad.addColorStop(0.5, `rgba(${accent.r},${accent.g},${accent.b},${alpha})`);
        grad.addColorStop(1, `rgba(${accent.r},${accent.g},${accent.b},0)`);
        _ctx.fillStyle = grad;
        _ctx.fill();
      }
    }
  });

  // ── 8. Gradient (Podgro interactive gradient blobs) ──────
  // From https://codepen.io/Podgro/pen/oNOKYqr
  // Pure CSS animated radial gradient blobs + SVG noise + mouse-interactive blob
  (() => {
    let _gradEl = null;       // wrapper div
    let _interEl = null;      // interactive blob element
    let _styleEl = null;      // injected <style>
    let _gradRaf = null;
    let _curX = 0, _curY = 0, _tgX = 0, _tgY = 0;
    let _mouseFn = null;

    function removeGradient() {
      if (_gradRaf) { cancelAnimationFrame(_gradRaf); _gradRaf = null; }
      if (_mouseFn && _container) _container.removeEventListener('mousemove', _mouseFn);
      _mouseFn = null;
      if (_gradEl) { _gradEl.remove(); _gradEl = null; }
      if (_styleEl) { _styleEl.remove(); _styleEl = null; }
      _interEl = null;
    }

    register('gradient', {
      setup() {
        removeGradient();

        // Inject scoped keyframe styles once
        const uid = 'bggrad_' + Math.random().toString(36).slice(2, 7);
        _styleEl = document.createElement('style');
        _styleEl.textContent = `
          @keyframes ${uid}_moveInCircle {
            0%   { transform: rotate(0deg); }
            50%  { transform: rotate(180deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes ${uid}_moveVertical {
            0%   { transform: translateY(-50%); }
            50%  { transform: translateY(50%); }
            100% { transform: translateY(-50%); }
          }
          @keyframes ${uid}_moveHorizontal {
            0%   { transform: translateX(-50%) translateY(-10%); }
            50%  { transform: translateX(50%) translateY(10%); }
            100% { transform: translateX(-50%) translateY(-10%); }
          }
          .${uid}_wrap {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            overflow: hidden; border-radius: inherit; z-index: 0;
            background: linear-gradient(40deg, rgb(8,10,15), rgb(0,17,32));
            --color1: 18,113,255; --color2: 107,74,255; --color3: 100,100,255;
            --color4: 50,160,220; --color5: 80,47,122;
            --color-interactive: 140,100,255;
            --circle-size: 80%; --blending: hard-light;
          }
          .${uid}_noise {
            position: absolute; top: 0; left: 0; width: 100%; height: 100%;
            z-index: 1; opacity: 0; mix-blend-mode: soft-light; pointer-events: none;
          }
          .${uid}_blursvg { display: none; }
          .${uid}_gc {
            filter: url(#${uid}_goo) blur(60px);
            width: 100%; height: 100%; position: relative;
          }
          .${uid}_g1 {
            position: absolute;
            background: radial-gradient(circle at center, rgba(var(--color1),0.53) 0, rgba(var(--color1),0) 50%) no-repeat;
            mix-blend-mode: var(--blending);
            width: var(--circle-size); height: var(--circle-size);
            top: calc(50% - var(--circle-size)/2); left: calc(50% - var(--circle-size)/2);
            transform-origin: center center;
            animation: ${uid}_moveVertical 30s ease infinite;
          }
          .${uid}_g2 {
            position: absolute;
            background: radial-gradient(circle at center, rgba(var(--color2),0.53) 0, rgba(var(--color2),0) 50%) no-repeat;
            mix-blend-mode: var(--blending);
            width: var(--circle-size); height: var(--circle-size);
            top: calc(50% - var(--circle-size)/2); left: calc(50% - var(--circle-size)/2);
            transform-origin: calc(50% - 400px);
            animation: ${uid}_moveInCircle 20s reverse infinite;
          }
          .${uid}_g3 {
            position: absolute;
            background: radial-gradient(circle at center, rgba(var(--color3),0.53) 0, rgba(var(--color3),0) 50%) no-repeat;
            mix-blend-mode: var(--blending);
            width: var(--circle-size); height: var(--circle-size);
            top: calc(50% - var(--circle-size)/2 + 200px); left: calc(50% - var(--circle-size)/2 - 500px);
            transform-origin: calc(50% + 400px);
            animation: ${uid}_moveInCircle 40s linear infinite;
          }
          .${uid}_g4 {
            position: absolute;
            background: radial-gradient(circle at center, rgba(var(--color4),0.53) 0, rgba(var(--color4),0) 50%) no-repeat;
            mix-blend-mode: var(--blending);
            width: var(--circle-size); height: var(--circle-size);
            top: calc(50% - var(--circle-size)/2); left: calc(50% - var(--circle-size)/2);
            transform-origin: calc(50% - 200px);
            animation: ${uid}_moveHorizontal 40s ease infinite; opacity: 0.47;
          }
          .${uid}_g5 {
            position: absolute;
            background: radial-gradient(circle at center, rgba(var(--color5),0.53) 0, rgba(var(--color5),0) 50%) no-repeat;
            mix-blend-mode: var(--blending);
            width: calc(var(--circle-size)*2); height: calc(var(--circle-size)*2);
            top: calc(50% - var(--circle-size)); left: calc(50% - var(--circle-size));
            transform-origin: calc(50% - 800px) calc(50% + 200px);
            animation: ${uid}_moveInCircle 20s ease infinite;
          }
          .${uid}_gi {
            position: absolute;
            background: radial-gradient(circle at center, rgba(var(--color-interactive),0.53) 0, rgba(var(--color-interactive),0) 50%) no-repeat;
            mix-blend-mode: var(--blending);
            width: 100%; height: 100%; top: -50%; left: -50%; opacity: 0.47;
          }
        `;
        document.head.appendChild(_styleEl);

        _gradEl = document.createElement('div');
        _gradEl.className = `${uid}_wrap`;
        _gradEl.innerHTML = `

          <svg xmlns="http://www.w3.org/2000/svg" class="${uid}_blursvg">
            <defs>
              <filter id="${uid}_goo">
                <feGaussianBlur in="SourceGraphic" stdDeviation="10" result="blur"/>
                <feColorMatrix in="blur" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 10 -5" result="goo"/>
                <feBlend in="SourceGraphic" in2="goo"/>
              </filter>
            </defs>
          </svg>
          <div class="${uid}_gc">
            <div class="${uid}_g1"></div>
            <div class="${uid}_g2"></div>
            <div class="${uid}_g3"></div>
            <div class="${uid}_g4"></div>
            <div class="${uid}_g5"></div>
            <div class="${uid}_gi"></div>
          </div>
        `;
        _container.insertBefore(_gradEl, _container.firstChild);
        _interEl = _gradEl.querySelector(`.${uid}_gi`);

        // Mouse tracking relative to container
        _curX = 0; _curY = 0; _tgX = 0; _tgY = 0;
        _mouseFn = (e) => {
          const rect = _container.getBoundingClientRect();
          _tgX = e.clientX - rect.left;
          _tgY = e.clientY - rect.top;
        };
        _container.addEventListener('mousemove', _mouseFn);

        const moveBlob = () => {
          if (!_interEl) return;
          _curX += (_tgX - _curX) / 20;
          _curY += (_tgY - _curY) / 20;
          _interEl.style.transform = `translate(${Math.round(_curX)}px, ${Math.round(_curY)}px)`;
          _gradRaf = requestAnimationFrame(moveBlob);
        };
        moveBlob();
      },
      frame() {
        // CSS handles animation; RAF loop runs separately for mouse blob
        if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      }
    });

    window._bgGradientCleanup = removeGradient;
  })();

  // ── 9. Scanlines ──────────────────────────────────────────
  register('scanlines', {
    setup() {},
    frame(t) {
      const W = _canvas.width, H = _canvas.height;
      _ctx.clearRect(0, 0, W, H);
      const accent = hexToRgb(getAccent());
      // Moving scanline band
      const bandY = ((t * 0.04) % (H + 60)) - 30;
      const grad = _ctx.createLinearGradient(0, bandY - 30, 0, bandY + 30);
      grad.addColorStop(0,   `rgba(${accent.r},${accent.g},${accent.b},0)`);
      grad.addColorStop(0.5, `rgba(${accent.r},${accent.g},${accent.b},0.06)`);
      grad.addColorStop(1,   `rgba(${accent.r},${accent.g},${accent.b},0)`);
      _ctx.fillStyle = grad;
      _ctx.fillRect(0, bandY - 30, W, 60);
      // Static horizontal lines
      _ctx.strokeStyle = `rgba(255,255,255,0.025)`;
      _ctx.lineWidth = 1;
      for (let y = 0; y < H; y += 4) {
        _ctx.beginPath(); _ctx.moveTo(0, y); _ctx.lineTo(W, y); _ctx.stroke();
      }
    }
  });

  // ── 10. Vortex (RunicFreak WebGL Navier-Stokes fluid sim) ─
  // From https://codepen.io/RunicFreak/pen/poYWXJJ
  // Full WebGL2 fluid simulation — interactive with mouse/touch
  (() => {
    let _fCanvas = null;
    let _fRaf = null;
    let _fResObs = null;
    let _fPointers = [];
    let _fGL = null;
    let _fExt = null;
    let _fDye, _fVelocity, _fDivergence, _fCurl, _fPressure;
    let _fPrograms = {};
    let _fMaterial = null;
    let _fLastTime = 0;
    let _fColorTimer = 0;
    let _fEvListeners = [];

    function _fAddEv(el, type, fn, opts) {
      el.addEventListener(type, fn, opts);
      _fEvListeners.push({ el, type, fn, opts });
    }

    function removeVortex() {
      if (_fRaf) { cancelAnimationFrame(_fRaf); _fRaf = null; }
      if (_fResObs) { _fResObs.disconnect(); _fResObs = null; }
      for (const { el, type, fn, opts } of _fEvListeners) el.removeEventListener(type, fn, opts);
      _fEvListeners = [];
      if (_fCanvas) { _fCanvas.remove(); _fCanvas = null; }
      _fGL = null; _fExt = null; _fPointers = [];
      _fDye = _fVelocity = _fDivergence = _fCurl = _fPressure = null;
      _fPrograms = {}; _fMaterial = null;
    }

    register('vortex', {
      setup() {
        removeVortex();

        _fCanvas = document.createElement('canvas');
        _fCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;border-radius:inherit;';
        _container.insertBefore(_fCanvas, _container.firstChild);

        // Size canvas
        _fCanvas.width  = _container.offsetWidth;
        _fCanvas.height = _container.offsetHeight;

        const cfg = {
          SIM_RESOLUTION: 128, DYE_RESOLUTION: 1024,
          DENSITY_DISSIPATION: 0.12, VELOCITY_DISSIPATION: 0.08,
          PRESSURE: 0.8, PRESSURE_ITERATIONS: 20,
          CURL: 4, SPLAT_RADIUS: 0.35, SPLAT_FORCE: 1500,
          SHADING: true, COLOR_UPDATE_SPEED: 2,
          TRANSPARENT: true,
        };

        // ── WebGL init ──
        const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
        let gl = _fCanvas.getContext('webgl2', params);
        const isWebGL2 = !!gl;
        if (!isWebGL2) gl = _fCanvas.getContext('webgl', params) || _fCanvas.getContext('experimental-webgl', params);
        if (!gl) { console.error('Vortex: WebGL not available'); return; }
        _fGL = gl;

        let halfFloat, supportLinearFiltering;
        if (isWebGL2) {
          gl.getExtension('EXT_color_buffer_float');
          supportLinearFiltering = gl.getExtension('OES_texture_float_linear');
        } else {
          halfFloat = gl.getExtension('OES_texture_half_float');
          supportLinearFiltering = gl.getExtension('OES_texture_half_float_linear');
        }
        if (!supportLinearFiltering) { cfg.DYE_RESOLUTION = 512; cfg.SHADING = false; }

        gl.clearColor(0, 0, 0, 1);
        const halfFloatTexType = isWebGL2 ? gl.HALF_FLOAT : halfFloat.HALF_FLOAT_OES;

        function getSupportedFormat(internalFormat, format, type) {
          if (!supportRenderTextureFormat(internalFormat, format, type)) {
            if (internalFormat === gl.R16F)  return getSupportedFormat(gl.RG16F,   gl.RG,   type);
            if (internalFormat === gl.RG16F) return getSupportedFormat(gl.RGBA16F, gl.RGBA, type);
            return null;
          }
          return { internalFormat, format };
        }
        function supportRenderTextureFormat(internalFormat, format, type) {
          const tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
          const fbo = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
          return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
        }

        let formatRGBA, formatRG, formatR;
        if (isWebGL2) {
          formatRGBA = getSupportedFormat(gl.RGBA16F, gl.RGBA, halfFloatTexType);
          formatRG   = getSupportedFormat(gl.RG16F,   gl.RG,   halfFloatTexType);
          formatR    = getSupportedFormat(gl.R16F,    gl.RED,  halfFloatTexType);
        } else {
          formatRGBA = getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);
          formatRG   = getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);
          formatR    = getSupportedFormat(gl.RGBA, gl.RGBA, halfFloatTexType);
        }
        _fExt = { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering };

        // ── Shader helpers ──
        function compileShader(type, source, keywords) {
          if (keywords) source = keywords.map(k => '#define ' + k + '\n').join('') + source;
          const s = gl.createShader(type);
          gl.shaderSource(s, source); gl.compileShader(s);
          if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
          return s;
        }
        function createProgram(vs, fs) {
          const p = gl.createProgram();
          gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
          if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.error(gl.getProgramInfoLog(p));
          return p;
        }
        function getUniforms(prog) {
          const u = {};
          const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
          for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(prog, i).name; u[name] = gl.getUniformLocation(prog, name); }
          return u;
        }

        // ── Shaders ──
        const baseVS = compileShader(gl.VERTEX_SHADER, `
          precision highp float;
          attribute vec2 aPosition; varying vec2 vUv,vL,vR,vT,vB; uniform vec2 texelSize;
          void main(){vUv=aPosition*.5+.5;vL=vUv-vec2(texelSize.x,0.);vR=vUv+vec2(texelSize.x,0.);vT=vUv+vec2(0.,texelSize.y);vB=vUv-vec2(0.,texelSize.y);gl_Position=vec4(aPosition,0.,1.);}
        `);
        const blurVS = compileShader(gl.VERTEX_SHADER, `
          precision highp float;
          attribute vec2 aPosition; varying vec2 vUv,vL,vR; uniform vec2 texelSize;
          void main(){vUv=aPosition*.5+.5;float o=1.33333333;vL=vUv-texelSize*o;vR=vUv+texelSize*o;gl_Position=vec4(aPosition,0.,1.);}
        `);
        const blurFS    = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying vec2 vUv,vL,vR;uniform sampler2D uTexture;void main(){vec4 s=texture2D(uTexture,vUv)*.29411764;s+=texture2D(uTexture,vL)*.35294117;s+=texture2D(uTexture,vR)*.35294117;gl_FragColor=s;}`);
        const copyFS    = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;uniform sampler2D uTexture;void main(){gl_FragColor=texture2D(uTexture,vUv);}`);
        const clearFS   = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv;uniform sampler2D uTexture;uniform float value;void main(){gl_FragColor=value*texture2D(uTexture,vUv);}`);
        const colorFS   = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;uniform vec4 color;void main(){gl_FragColor=color;}`);
        const splatFS   = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uTarget;uniform float aspectRatio;uniform vec3 color;uniform vec2 point;uniform float radius;void main(){vec2 p=vUv-point.xy;p.x*=aspectRatio;vec3 splat=exp(-dot(p,p)/radius)*color;vec3 base=texture2D(uTarget,vUv).xyz;gl_FragColor=vec4(base+splat,1.);}`);
        const advFS     = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv;uniform sampler2D uVelocity,uSource;uniform vec2 texelSize,dyeTexelSize;uniform float dt,dissipation;vec4 bilerp(sampler2D s,vec2 uv,vec2 ts){vec2 st=uv/ts-.5;vec2 iuv=floor(st);vec2 fuv=fract(st);vec4 a=texture2D(s,(iuv+vec2(.5,.5))*ts);vec4 b=texture2D(s,(iuv+vec2(1.5,.5))*ts);vec4 c=texture2D(s,(iuv+vec2(.5,1.5))*ts);vec4 d=texture2D(s,(iuv+vec2(1.5,1.5))*ts);return mix(mix(a,b,fuv.x),mix(c,d,fuv.x),fuv.y);}void main(){
          #ifdef MANUAL_FILTERING
          vec2 coord=vUv-dt*bilerp(uVelocity,vUv,texelSize).xy*texelSize;vec4 result=bilerp(uSource,coord,dyeTexelSize);
          #else
          vec2 coord=vUv-dt*texture2D(uVelocity,vUv).xy*texelSize;vec4 result=texture2D(uSource,coord);
          #endif
          float decay=1.+dissipation*dt;gl_FragColor=result/decay;}`, supportLinearFiltering ? null : ['MANUAL_FILTERING']);
        const divFS     = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv,vL,vR,vT,vB;uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).x,R=texture2D(uVelocity,vR).x,T=texture2D(uVelocity,vT).y,B=texture2D(uVelocity,vB).y;vec2 C=texture2D(uVelocity,vUv).xy;if(vL.x<0.)L=-C.x;if(vR.x>1.)R=-C.x;if(vT.y>1.)T=-C.y;if(vB.y<0.)B=-C.y;gl_FragColor=vec4(.5*(R-L+T-B),0.,0.,1.);}`);
        const curlFS    = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv,vL,vR,vT,vB;uniform sampler2D uVelocity;void main(){float L=texture2D(uVelocity,vL).y,R=texture2D(uVelocity,vR).y,T=texture2D(uVelocity,vT).x,B=texture2D(uVelocity,vB).x;gl_FragColor=vec4(.5*(R-L-T+B),0.,0.,1.);}`);
        const vortFS    = compileShader(gl.FRAGMENT_SHADER, `precision highp float;precision highp sampler2D;varying vec2 vUv,vL,vR,vT,vB;uniform sampler2D uVelocity,uCurl;uniform float curl,dt;void main(){float L=texture2D(uCurl,vL).x,R=texture2D(uCurl,vR).x,T=texture2D(uCurl,vT).x,B=texture2D(uCurl,vB).x,C=texture2D(uCurl,vUv).x;vec2 force=.5*vec2(abs(T)-abs(B),abs(R)-abs(L));force/=length(force)+.0001;force*=curl*C;force.y*=-1.;vec2 vel=texture2D(uVelocity,vUv).xy;vel+=force*dt;vel=min(max(vel,-1000.),1000.);gl_FragColor=vec4(vel,0.,1.);}`);
        const pressFS   = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv,vL,vR,vT,vB;uniform sampler2D uPressure,uDivergence;void main(){float L=texture2D(uPressure,vL).x,R=texture2D(uPressure,vR).x,T=texture2D(uPressure,vT).x,B=texture2D(uPressure,vB).x;float div=texture2D(uDivergence,vUv).x;gl_FragColor=vec4((L+R+B+T-div)*.25,0.,0.,1.);}`);
        const gradFS    = compileShader(gl.FRAGMENT_SHADER, `precision mediump float;precision mediump sampler2D;varying highp vec2 vUv,vL,vR,vT,vB;uniform sampler2D uPressure,uVelocity;void main(){float L=texture2D(uPressure,vL).x,R=texture2D(uPressure,vR).x,T=texture2D(uPressure,vT).x,B=texture2D(uPressure,vB).x;vec2 vel=texture2D(uVelocity,vUv).xy;vel.xy-=vec2(R-L,T-B);gl_FragColor=vec4(vel,0.,1.);}`);
        const displayFS = `precision highp float;precision highp sampler2D;varying vec2 vUv,vL,vR,vT,vB;uniform sampler2D uTexture,uDithering;uniform vec2 ditherScale,texelSize;vec3 linearToGamma(vec3 c){c=max(c,vec3(0));return max(1.055*pow(c,vec3(.416666667))-.055,vec3(0));}void main(){vec3 c=texture2D(uTexture,vUv).rgb;
          #ifdef SHADING
          vec3 lc=texture2D(uTexture,vL).rgb,rc=texture2D(uTexture,vR).rgb,tc=texture2D(uTexture,vT).rgb,bc=texture2D(uTexture,vB).rgb;float dx=length(rc)-length(lc),dy=length(tc)-length(bc);vec3 n=normalize(vec3(dx,dy,length(texelSize)));float diffuse=clamp(dot(n,vec3(0.,0.,1.))+.7,.7,1.);c*=diffuse;
          #endif
          float a=max(c.r,max(c.g,c.b));gl_FragColor=vec4(c,a);}`;

        // Programs
        function makeProgram(vs, fs) { const p = createProgram(vs, fs); return { program: p, uniforms: getUniforms(p), bind() { gl.useProgram(this.program); } }; }
        _fPrograms.blur      = makeProgram(blurVS, blurFS);
        _fPrograms.copy      = makeProgram(baseVS, copyFS);
        _fPrograms.clear     = makeProgram(baseVS, clearFS);
        _fPrograms.color     = makeProgram(baseVS, colorFS);
        _fPrograms.splat     = makeProgram(baseVS, splatFS);
        _fPrograms.advection = makeProgram(baseVS, advFS);
        _fPrograms.divergence= makeProgram(baseVS, divFS);
        _fPrograms.curl      = makeProgram(baseVS, curlFS);
        _fPrograms.vorticity = makeProgram(baseVS, vortFS);
        _fPrograms.pressure  = makeProgram(baseVS, pressFS);
        _fPrograms.gradSub   = makeProgram(baseVS, gradFS);

        // Display material (keyword-based)
        const displayPrograms = {};
        function getDisplayProgram(keywords) {
          const key = (keywords || []).join(',');
          if (!displayPrograms[key]) {
            const fs = compileShader(gl.FRAGMENT_SHADER, displayFS, keywords);
            displayPrograms[key] = makeProgram(baseVS, fs);
          }
          return displayPrograms[key];
        }
        _fMaterial = { bind(keywords) { this._prog = getDisplayProgram(keywords); gl.useProgram(this._prog.program); }, get uniforms() { return this._prog ? this._prog.uniforms : {}; } };

        // Blit setup
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,-1,1,1,1,1,-1]), gl.STATIC_DRAW);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0,1,2,0,2,3]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);

        function blit(target, clear = false) {
          if (target == null) { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
          else { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
          if (clear) { gl.clearColor(0,0,0,1); gl.clear(gl.COLOR_BUFFER_BIT); }
          gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }

        // FBO helpers
        function createFBO(w, h, internalFormat, format, type, param) {
          gl.activeTexture(gl.TEXTURE0);
          const tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
          gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
          const fbo = gl.createFramebuffer();
          gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
          gl.viewport(0, 0, w, h); gl.clear(gl.COLOR_BUFFER_BIT);
          return { texture: tex, fbo, width: w, height: h, texelSizeX: 1/w, texelSizeY: 1/h, attach(id) { gl.activeTexture(gl.TEXTURE0+id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
        }
        function createDoubleFBO(w, h, iF, f, t, p) {
          let f1 = createFBO(w,h,iF,f,t,p), f2 = createFBO(w,h,iF,f,t,p);
          return { width:w, height:h, texelSizeX:f1.texelSizeX, texelSizeY:f1.texelSizeY, get read(){return f1;}, set read(v){f1=v;}, get write(){return f2;}, set write(v){f2=v;}, swap(){let tmp=f1;f1=f2;f2=tmp;} };
        }
        function resizeFBO(target, w, h, iF, f, t, p) {
          const n = createFBO(w,h,iF,f,t,p);
          _fPrograms.copy.bind(); gl.uniform1i(_fPrograms.copy.uniforms.uTexture, target.attach(0)); blit(n); return n;
        }
        function resizeDoubleFBO(target, w, h, iF, f, t, p) {
          if (target.width===w && target.height===h) return target;
          target.read = resizeFBO(target.read, w, h, iF, f, t, p);
          target.write = createFBO(w, h, iF, f, t, p);
          target.width=w; target.height=h; target.texelSizeX=1/w; target.texelSizeY=1/h;
          return target;
        }

        function getResolution(res) {
          let ar = gl.drawingBufferWidth / gl.drawingBufferHeight;
          if (ar < 1) ar = 1/ar;
          const min = Math.round(res), max = Math.round(res * ar);
          return gl.drawingBufferWidth > gl.drawingBufferHeight ? {width:max,height:min} : {width:min,height:max};
        }

        function initFramebuffers() {
          const simRes = getResolution(cfg.SIM_RESOLUTION);
          const dyeRes = getResolution(cfg.DYE_RESOLUTION);
          const texType = _fExt.halfFloatTexType;
          const rgba = _fExt.formatRGBA, rg = _fExt.formatRG, r = _fExt.formatR;
          const filtering = _fExt.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
          gl.disable(gl.BLEND);
          _fDye      = _fDye      ? resizeDoubleFBO(_fDye,      dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering) : createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
          _fVelocity = _fVelocity ? resizeDoubleFBO(_fVelocity, simRes.width, simRes.height, rg.internalFormat,   rg.format,   texType, filtering) : createDoubleFBO(simRes.width, simRes.height, rg.internalFormat,   rg.format,   texType, filtering);
          _fDivergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
          _fCurl       = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
          _fPressure   = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
        }

        // Dithering texture — 1x1 white fallback (no external URL needed)
        const _fDitherTex = (() => {
          const tex = gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
          gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255]));
          return { texture: tex, width: 1, height: 1, attach(id) { gl.activeTexture(gl.TEXTURE0+id); gl.bindTexture(gl.TEXTURE_2D, tex); return id; } };
        })();

        initFramebuffers();
        if (cfg.SHADING) _fMaterial.bind(['SHADING']); else _fMaterial.bind([]);

        // ── Pointer helpers ──
        function scaleByPixelRatio(v) { return Math.floor(v * (window.devicePixelRatio || 1)); }
        function correctRadius(r) { const ar = _fCanvas.width/_fCanvas.height; if (ar > 1) r *= ar; return r; }
        function correctDeltaX(d) { const ar = _fCanvas.width/_fCanvas.height; if (ar < 1) d *= ar; return d; }
        function correctDeltaY(d) { const ar = _fCanvas.width/_fCanvas.height; if (ar > 1) d /= ar; return d; }

        function HSVtoRGB(h, s, v) {
          let r,g,b,i=Math.floor(h*6),f=h*6-i,p=v*(1-s),q=v*(1-f*s),t=v*(1-(1-f)*s);
          switch(i%6){case 0:r=v;g=t;b=p;break;case 1:r=q;g=v;b=p;break;case 2:r=p;g=v;b=t;break;case 3:r=p;g=q;b=v;break;case 4:r=t;g=p;b=v;break;case 5:r=v;g=p;b=q;break;}
          return {r,g,b};
        }
        function generateColor() { const c = HSVtoRGB(Math.random(),1,1); c.r*=0.15;c.g*=0.15;c.b*=0.15; return c; }
        function wrap(v,min,max) { const range=max-min; if(!range) return min; return (v-min)%range+min; }

        function Pointer() { this.id=-1;this.texcoordX=0;this.texcoordY=0;this.prevTexcoordX=0;this.prevTexcoordY=0;this.deltaX=0;this.deltaY=0;this.down=false;this.moved=false;this.color=[30,0,300]; }
        _fPointers = [new Pointer()];

        function updatePointerDown(ptr, id, posX, posY) {
          ptr.id=id;ptr.down=true;ptr.moved=false;
          ptr.texcoordX=posX/_fCanvas.width;ptr.texcoordY=1-posY/_fCanvas.height;
          ptr.prevTexcoordX=ptr.texcoordX;ptr.prevTexcoordY=ptr.texcoordY;
          ptr.deltaX=0;ptr.deltaY=0;ptr.color=generateColor();
        }
        function updatePointerMove(ptr, posX, posY, color) {
          ptr.prevTexcoordX=ptr.texcoordX;ptr.prevTexcoordY=ptr.texcoordY;
          ptr.texcoordX=posX/_fCanvas.width;ptr.texcoordY=1-posY/_fCanvas.height;
          ptr.deltaX=correctDeltaX(ptr.texcoordX-ptr.prevTexcoordX);
          ptr.deltaY=correctDeltaY(ptr.texcoordY-ptr.prevTexcoordY);
          ptr.moved=Math.abs(ptr.deltaX)>0||Math.abs(ptr.deltaY)>0;
          ptr.color=color;
        }

        function splat(x, y, dx, dy, color) {
          _fPrograms.splat.bind();
          gl.uniform1i(_fPrograms.splat.uniforms.uTarget, _fVelocity.read.attach(0));
          gl.uniform1f(_fPrograms.splat.uniforms.aspectRatio, _fCanvas.width/_fCanvas.height);
          gl.uniform2f(_fPrograms.splat.uniforms.point, x, y);
          gl.uniform3f(_fPrograms.splat.uniforms.color, dx, dy, 0);
          gl.uniform1f(_fPrograms.splat.uniforms.radius, correctRadius(cfg.SPLAT_RADIUS/100));
          blit(_fVelocity.write); _fVelocity.swap();
          gl.uniform1i(_fPrograms.splat.uniforms.uTarget, _fDye.read.attach(0));
          gl.uniform3f(_fPrograms.splat.uniforms.color, color.r, color.g, color.b);
          blit(_fDye.write); _fDye.swap();
        }
        function splatPointer(ptr) { splat(ptr.texcoordX, ptr.texcoordY, ptr.deltaX*cfg.SPLAT_FORCE, ptr.deltaY*cfg.SPLAT_FORCE, ptr.color); }
        function clickSplat(ptr) { const c=generateColor();c.r*=10;c.g*=10;c.b*=10;splat(ptr.texcoordX,ptr.texcoordY,10*(Math.random()-.5),30*(Math.random()-.5),c); }
        function seedSplats(count) {
          for (let i = 0; i < count; i++) {
            // Cool hues only: deep blue → indigo → violet → teal
            const hue = 0.55 + Math.random() * 0.35;
            const c = HSVtoRGB(hue, 0.6 + Math.random() * 0.3, 1);
            c.r *= 0.8; c.g *= 0.8; c.b *= 0.8;
            // Very gentle velocity — slow drift, not a burst
            const angle = Math.random() * Math.PI * 2;
            const speed = 60 + Math.random() * 120;
            splat(0.2 + Math.random() * 0.6, 0.2 + Math.random() * 0.6,
                  Math.cos(angle) * speed, Math.sin(angle) * speed, c);
          }
        }

        // ── Simulation step ──
        function step(dt) {
          gl.disable(gl.BLEND);
          const P = _fPrograms;
          P.curl.bind(); gl.uniform2f(P.curl.uniforms.texelSize,_fVelocity.texelSizeX,_fVelocity.texelSizeY); gl.uniform1i(P.curl.uniforms.uVelocity,_fVelocity.read.attach(0)); blit(_fCurl);
          P.vorticity.bind(); gl.uniform2f(P.vorticity.uniforms.texelSize,_fVelocity.texelSizeX,_fVelocity.texelSizeY); gl.uniform1i(P.vorticity.uniforms.uVelocity,_fVelocity.read.attach(0)); gl.uniform1i(P.vorticity.uniforms.uCurl,_fCurl.attach(1)); gl.uniform1f(P.vorticity.uniforms.curl,cfg.CURL); gl.uniform1f(P.vorticity.uniforms.dt,dt); blit(_fVelocity.write); _fVelocity.swap();
          P.divergence.bind(); gl.uniform2f(P.divergence.uniforms.texelSize,_fVelocity.texelSizeX,_fVelocity.texelSizeY); gl.uniform1i(P.divergence.uniforms.uVelocity,_fVelocity.read.attach(0)); blit(_fDivergence);
          P.clear.bind(); gl.uniform1i(P.clear.uniforms.uTexture,_fPressure.read.attach(0)); gl.uniform1f(P.clear.uniforms.value,cfg.PRESSURE); blit(_fPressure.write); _fPressure.swap();
          P.pressure.bind(); gl.uniform2f(P.pressure.uniforms.texelSize,_fVelocity.texelSizeX,_fVelocity.texelSizeY); gl.uniform1i(P.pressure.uniforms.uDivergence,_fDivergence.attach(0));
          for (let i=0;i<cfg.PRESSURE_ITERATIONS;i++) { gl.uniform1i(P.pressure.uniforms.uPressure,_fPressure.read.attach(1)); blit(_fPressure.write); _fPressure.swap(); }
          P.gradSub.bind(); gl.uniform2f(P.gradSub.uniforms.texelSize,_fVelocity.texelSizeX,_fVelocity.texelSizeY); gl.uniform1i(P.gradSub.uniforms.uPressure,_fPressure.read.attach(0)); gl.uniform1i(P.gradSub.uniforms.uVelocity,_fVelocity.read.attach(1)); blit(_fVelocity.write); _fVelocity.swap();
          P.advection.bind(); gl.uniform2f(P.advection.uniforms.texelSize,_fVelocity.texelSizeX,_fVelocity.texelSizeY);
          if (!_fExt.supportLinearFiltering) gl.uniform2f(P.advection.uniforms.dyeTexelSize,_fVelocity.texelSizeX,_fVelocity.texelSizeY);
          const velId=_fVelocity.read.attach(0); gl.uniform1i(P.advection.uniforms.uVelocity,velId); gl.uniform1i(P.advection.uniforms.uSource,velId); gl.uniform1f(P.advection.uniforms.dt,dt); gl.uniform1f(P.advection.uniforms.dissipation,cfg.VELOCITY_DISSIPATION); blit(_fVelocity.write); _fVelocity.swap();
          if (!_fExt.supportLinearFiltering) gl.uniform2f(P.advection.uniforms.dyeTexelSize,_fDye.texelSizeX,_fDye.texelSizeY);
          gl.uniform1i(P.advection.uniforms.uVelocity,_fVelocity.read.attach(0)); gl.uniform1i(P.advection.uniforms.uSource,_fDye.read.attach(1)); gl.uniform1f(P.advection.uniforms.dissipation,cfg.DENSITY_DISSIPATION); blit(_fDye.write); _fDye.swap();
        }

        function render() {
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.enable(gl.BLEND);
          const w=gl.drawingBufferWidth, h=gl.drawingBufferHeight;
          if (cfg.SHADING) _fMaterial.bind(['SHADING']); else _fMaterial.bind([]);
          if (cfg.SHADING) gl.uniform2f(_fMaterial.uniforms.texelSize, 1/w, 1/h);
          gl.uniform1i(_fMaterial.uniforms.uTexture, _fDye.read.attach(0));
          blit(null);
        }

        // ── Event listeners (scoped to container, pointer-events enabled on canvas) ──
        _fCanvas.style.pointerEvents = 'auto';

        _fAddEv(_fCanvas, 'mousedown', e => {
          const rect = _fCanvas.getBoundingClientRect();
          const posX = scaleByPixelRatio(e.clientX - rect.left);
          const posY = scaleByPixelRatio(e.clientY - rect.top);
          updatePointerDown(_fPointers[0], -1, posX, posY);
          clickSplat(_fPointers[0]);
        });

        let _firstMove = true;
        _fAddEv(_fCanvas, 'mousemove', e => {
          const rect = _fCanvas.getBoundingClientRect();
          const posX = scaleByPixelRatio(e.clientX - rect.left);
          const posY = scaleByPixelRatio(e.clientY - rect.top);
          if (_firstMove) { _firstMove = false; }
          updatePointerMove(_fPointers[0], posX, posY, _fPointers[0].color);
        });

        _fAddEv(_fCanvas, 'touchstart', e => {
          e.preventDefault();
          const rect = _fCanvas.getBoundingClientRect();
          for (let i=0;i<e.targetTouches.length;i++) {
            const posX = scaleByPixelRatio(e.targetTouches[i].clientX - rect.left);
            const posY = scaleByPixelRatio(e.targetTouches[i].clientY - rect.top);
            updatePointerDown(_fPointers[0], e.targetTouches[i].identifier, posX, posY);
          }
        }, { passive: false });

        _fAddEv(_fCanvas, 'touchmove', e => {
          e.preventDefault();
          const rect = _fCanvas.getBoundingClientRect();
          for (let i=0;i<e.targetTouches.length;i++) {
            const posX = scaleByPixelRatio(e.targetTouches[i].clientX - rect.left);
            const posY = scaleByPixelRatio(e.targetTouches[i].clientY - rect.top);
            updatePointerMove(_fPointers[0], posX, posY, _fPointers[0].color);
          }
        }, { passive: false });

        _fAddEv(_fCanvas, 'touchend', e => {
          for (let i=0;i<e.changedTouches.length;i++) _fPointers[0].down = false;
        });

        // ── Resize ──
        _fResObs = new ResizeObserver(() => {
          if (!_fCanvas || !_container) return;
          _fCanvas.width  = _container.offsetWidth;
          _fCanvas.height = _container.offsetHeight;
          if (_fGL) initFramebuffers();
        });
        _fResObs.observe(_container);

        // ── Main loop ──
        _fLastTime = Date.now(); _fColorTimer = 0;
        let _fSeeded = false;
        let _fAutoSplatTimer = 0;
        function fUpdate() {
          if (!_fGL) return;
          if (!_fSeeded) { _fSeeded = true; seedSplats(6); }
          const now = Date.now();
          let dt = Math.min((now - _fLastTime) / 1000, 0.016666);
          _fLastTime = now;

          // Resize check
          const cw = Math.floor(_fCanvas.clientWidth * (window.devicePixelRatio||1));
          const ch = Math.floor(_fCanvas.clientHeight * (window.devicePixelRatio||1));
          if (_fCanvas.width !== cw || _fCanvas.height !== ch) {
            _fCanvas.width = cw; _fCanvas.height = ch; initFramebuffers();
          }

          // Color update
          _fColorTimer += dt * cfg.COLOR_UPDATE_SPEED;
          if (_fColorTimer >= 1) { _fColorTimer = wrap(_fColorTimer, 0, 1); _fPointers[0].color = generateColor(); }

          // Apply inputs
          _fPointers.forEach(p => { if (p.moved) { p.moved=false; splatPointer(p); } });

          // Auto-splat to keep fluid alive when no interaction
          _fAutoSplatTimer += dt;
          if (_fAutoSplatTimer > 4.0) {
            _fAutoSplatTimer = 0;
            seedSplats(1);
          }

          step(dt);
          render();
          _fRaf = requestAnimationFrame(fUpdate);
        }
        _fRaf = requestAnimationFrame(fUpdate);
      },
      frame() {
        // WebGL runs its own loop; clear the 2D canvas overlay
        if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
      }
    });

    window._bgVortexCleanup = removeVortex;
  })();

  // ── 11. None (clear) ──────────────────────────────────────
  register('none', {
    setup() {},
    frame() { _ctx && _ctx.clearRect(0, 0, _canvas.width, _canvas.height); }
  });

  // ── 12. Neuro Noise (WebGL GLSL shader) ───────────────────
  // Based on https://codepen.io/ksenia-k/pen/vYwgrWv by Ksenia Kondrashova
  // Original shader by @zozuar
  (() => {
    let _glCanvas = null;
    let _gl = null;
    let _glUniforms = null;
    let _glPointer = { x: 0.5, y: 0.5, tX: 0.5, tY: 0.5 };
    let _glResizeObs = null;
    let _glEventsAttached = false;

    const VERT_SRC = `
      precision mediump float;
      varying vec2 vUv;
      attribute vec2 a_position;
      void main() {
        vUv = .5 * (a_position + 1.);
        gl_Position = vec4(a_position, 0.0, 1.0);
      }
    `;

    const FRAG_SRC = `
      precision mediump float;
      varying vec2 vUv;
      uniform float u_time;
      uniform float u_ratio;
      uniform vec2 u_pointer_position;
      uniform float u_scroll_progress;

      vec2 rotate(vec2 uv, float th) {
        return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv;
      }

      float neuro_shape(vec2 uv, float t, float p) {
        vec2 sine_acc = vec2(0.);
        vec2 res = vec2(0.);
        float scale = 8.;
        for (int j = 0; j < 15; j++) {
          uv = rotate(uv, 1.);
          sine_acc = rotate(sine_acc, 1.);
          vec2 layer = uv * scale + float(j) + sine_acc - t;
          sine_acc += sin(layer) + 2.4 * p;
          res += (.5 + .5 * cos(layer)) / scale;
          scale *= (1.2);
        }
        return res.x + res.y;
      }

      void main() {
        vec2 uv = .5 * vUv;
        uv.x *= u_ratio;

        vec2 pointer = vUv - u_pointer_position;
        pointer.x *= u_ratio;
        float p = clamp(length(pointer), 0., 1.);
        p = .5 * pow(1. - p, 2.);

        float t = .001 * u_time;
        vec3 color = vec3(0.);

        float noise = neuro_shape(uv, t, p);
        noise = 1.2 * pow(noise, 3.);
        noise += pow(noise, 10.);
        noise = max(.0, noise - .5);
        noise *= (1. - length(vUv - .5));

        color = normalize(vec3(.2, .5 + .4 * cos(3. * u_scroll_progress), .5 + .5 * sin(3. * u_scroll_progress)));
        color = color * noise;

        gl_FragColor = vec4(color, noise);
      }
    `;

    function initGL(canvas) {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return null;

      function makeShader(src, type) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          console.error('Neuro shader error:', gl.getShaderInfoLog(s));
          return null;
        }
        return s;
      }

      const prog = gl.createProgram();
      gl.attachShader(prog, makeShader(VERT_SRC, gl.VERTEX_SHADER));
      gl.attachShader(prog, makeShader(FRAG_SRC, gl.FRAGMENT_SHADER));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error('Neuro program error:', gl.getProgramInfoLog(prog));
        return null;
      }

      const uniforms = {};
      const uCount = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < uCount; i++) {
        const name = gl.getActiveUniform(prog, i).name;
        uniforms[name] = gl.getUniformLocation(prog, name);
      }

      const verts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
      gl.useProgram(prog);
      const pos = gl.getAttribLocation(prog, 'a_position');
      gl.enableVertexAttribArray(pos);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

      return { gl, uniforms };
    }

    function resizeGL() {
      if (!_glCanvas || !_container) return;
      const dpr = Math.min(window.devicePixelRatio, 2);
      _glCanvas.width  = _container.offsetWidth  * dpr;
      _glCanvas.height = _container.offsetHeight * dpr;
      if (_gl && _glUniforms) {
        _gl.uniform1f(_glUniforms.u_ratio, _glCanvas.width / _glCanvas.height);
        _gl.viewport(0, 0, _glCanvas.width, _glCanvas.height);
      }
    }

    function removeGL() {
      if (_glResizeObs) { _glResizeObs.disconnect(); _glResizeObs = null; }
      if (_glCanvas) { _glCanvas.remove(); _glCanvas = null; }
      _gl = null; _glUniforms = null;
    }

    function attachGLEvents(canvas) {
      if (_glEventsAttached) return;
      _glEventsAttached = true;
      const update = (x, y) => {
        const rect = canvas.getBoundingClientRect();
        _glPointer.tX = (x - rect.left) / rect.width;
        _glPointer.tY = (y - rect.top)  / rect.height;
      };
      canvas.addEventListener('pointermove', e => update(e.clientX, e.clientY));
      canvas.addEventListener('click',       e => update(e.clientX, e.clientY));
    }

    register('neuro', {
      setup() {
        // Remove old GL canvas if any
        removeGL();
        _glEventsAttached = false;

        _glCanvas = document.createElement('canvas');
        _glCanvas.style.cssText = `
          position:absolute;top:0;left:0;width:100%;height:100%;
          pointer-events:none;z-index:0;border-radius:inherit;
        `;
        _container.insertBefore(_glCanvas, _container.firstChild);

        const result = initGL(_glCanvas);
        if (!result) { console.error('WebGL not available for neuro effect'); return; }
        _gl = result.gl; _glUniforms = result.uniforms;

        resizeGL();
        _glResizeObs = new ResizeObserver(resizeGL);
        _glResizeObs.observe(_container);

        // pointer tracking on the container (not canvas — pointer-events:none)
        _container.addEventListener('pointermove', e => {
          const rect = _container.getBoundingClientRect();
          _glPointer.tX = (e.clientX - rect.left) / rect.width;
          _glPointer.tY = (e.clientY - rect.top)  / rect.height;
        });

        // Reset pointer to center
        _glPointer = { x: 0.5, y: 0.5, tX: 0.5, tY: 0.5 };
      },
      frame(t) {
        if (!_gl || !_glUniforms) return;
        // Clear the 2D canvas (we use GL canvas for this effect)
        if (_ctx) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);

        // Smooth pointer
        _glPointer.x += (_glPointer.tX - _glPointer.x) * 0.05;
        _glPointer.y += (_glPointer.tY - _glPointer.y) * 0.05;

        _gl.uniform1f(_glUniforms.u_time, t);
        _gl.uniform2f(_glUniforms.u_pointer_position, _glPointer.x, 1 - _glPointer.y);
        _gl.uniform1f(_glUniforms.u_scroll_progress, 0);
        _gl.drawArrays(_gl.TRIANGLE_STRIP, 0, 4);
      }
    });

    // Patch stop to also clean up GL canvas
    const _origStop = null; // will hook via apply override below
    window._bgNeuroCleanup = removeGL;
  })();

  // ── Public API ────────────────────────────────────────────
  function apply(name, container) {
    stopRaf();
    // Clean up GL/Three canvases when switching away
    if (_current === 'neuro'    && name !== 'neuro'    && window._bgNeuroCleanup)    window._bgNeuroCleanup();
    if (_current === 'neural'   && name !== 'neural'   && window._bgNeuralCleanup)   window._bgNeuralCleanup();
    if (_current === 'aurora'   && name !== 'aurora'   && window._bgAuroraCleanup)   window._bgAuroraCleanup();
    if (_current === 'gradient' && name !== 'gradient' && window._bgGradientCleanup) window._bgGradientCleanup();
    if (_current === 'vortex'   && name !== 'vortex'   && window._bgVortexCleanup)   window._bgVortexCleanup();
    _current = name;
    if (name === 'none') { if (_canvas) _ctx.clearRect(0,0,_canvas.width,_canvas.height); return; }
    ensureCanvas(container || _container || document.body);
    const anim = ANIMS[name];
    if (!anim) { console.warn('BgAnimations: unknown animation', name); return; }
    anim.setup();
    const startTime = performance.now();
    function tick(now) {
      anim.frame(now - startTime);
      _raf = requestAnimationFrame(tick);
    }
    _raf = requestAnimationFrame(tick);
  }

  function stop() {
    stopRaf();
    if (_canvas) _ctx.clearRect(0, 0, _canvas.width, _canvas.height);
    _current = null;
  }

  function init(container) {
    _container = container;
    ensureCanvas(container);
  }

  function list() { return Object.keys(ANIMS); }
  function current() { return _current; }

  return { init, apply, stop, list, current, register };
})();

// Make available globally
window.BgAnimations = BgAnimations;

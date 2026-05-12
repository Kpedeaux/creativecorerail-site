/* CoreRail motion utilities
   - Scroll reveal via IntersectionObserver
   - Magnetic effect on primary CTA
   - Nav scrolled-state toggle
   Respects prefers-reduced-motion. ~1.6 KB unminified. */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ── NAV scrolled state ──
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () { nav.classList.toggle('scrolled', window.scrollY > 10); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  if (reduced) return; // bail on the motion stuff

  // ── Scroll reveal ──
  if ('IntersectionObserver' in window) {
    var reveals = document.querySelectorAll('.reveal');
    if (reveals.length) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            io.unobserve(entry.target);
          }
        });
      }, { threshold: 0.15, rootMargin: '0px 0px -8% 0px' });
      reveals.forEach(function (el) { io.observe(el); });
    }
  } else {
    // Fallback: just reveal them.
    document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('is-in'); });
  }

  // ── Magnetic primary CTA ──
  // Only on devices that report a hover-capable fine pointer.
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.querySelectorAll('[data-magnetic]').forEach(function (btn) {
      var bounds, rafId;
      var STRENGTH = 0.22;   // 22% of cursor offset → max displacement
      var MAX = 8;           // hard cap in px
      var ENGAGE = 80;       // px outside the button to start engaging

      function onMove(e) {
        if (rafId) return;
        rafId = requestAnimationFrame(function () {
          rafId = null;
          if (!bounds) return;
          var cx = bounds.left + bounds.width / 2;
          var cy = bounds.top + bounds.height / 2;
          var dx = e.clientX - cx;
          var dy = e.clientY - cy;
          var dist = Math.hypot(dx, dy);
          var maxDist = Math.max(bounds.width, bounds.height) / 2 + ENGAGE;
          if (dist > maxDist) {
            btn.style.transform = '';
            return;
          }
          var tx = Math.max(-MAX, Math.min(MAX, dx * STRENGTH));
          var ty = Math.max(-MAX, Math.min(MAX, dy * STRENGTH));
          btn.style.transform = 'translate(' + tx.toFixed(2) + 'px, ' + ty.toFixed(2) + 'px)';
        });
      }
      function onEnter() { bounds = btn.getBoundingClientRect(); }
      function onLeave() {
        bounds = null;
        btn.style.transform = '';
      }
      btn.addEventListener('mouseenter', onEnter);
      btn.addEventListener('mousemove', onMove);
      btn.addEventListener('mouseleave', onLeave);
      window.addEventListener('scroll', function () { if (bounds) bounds = btn.getBoundingClientRect(); }, { passive: true });
      window.addEventListener('resize', function () { if (bounds) bounds = btn.getBoundingClientRect(); });
    });
  }
})();

/* ============================================================================
   SLIDE RUNTIME
   Scaling, navigation, theme, edit toggle, save. Shared by every lecture deck
   so a deck file is just its slides.

   core.js is deliberately NOT loaded by decks: it builds a navbar and a footer,
   runs fitHeadings() and draws the document field, none of which belong on a
   slide. The pieces a deck genuinely needs are re-implemented here.
   ============================================================================ */

(function(){
  var stage  = document.querySelector('.stage');
  var slides = [].slice.call(document.querySelectorAll('.slide'));
  if(!stage || !slides.length) return;

  var i = 0;
  var root = document.documentElement;
  // The published copy of a deck is read-only, like a published document.
  var PUBLIC = root.hasAttribute('data-public');

  /* --- Scale the 1920x1080 stage to the viewport ---------------------------
     Everything inside the stage is authored at full size, so the geometry
     stays 1:1 with the Figma frame no matter how big the window is. */
  // No scaling. The stage sizes itself in CSS (min(100vw,177.78vh) + aspect-ratio)
  // and everything inside is a percentage of it, so there is nothing to compute.
  function fit(){}

  /* --- Navigation ---------------------------------------------------------- */
  function show(n){
    i = Math.max(0, Math.min(slides.length - 1, n));
    slides.forEach(function(s, x){ s.classList.toggle('on', x === i); });
    var c = document.getElementById('counter');
    if(c) c.textContent = (i + 1) + ' / ' + slides.length;
    if(location.hash !== '#' + (i + 1)) history.replaceState(null, '', '#' + (i + 1));
  }
  function next(){ show(i + 1); }
  function prev(){ show(i - 1); }

  var editing = function(){ return root.getAttribute('data-edit') === 'on'; };

  document.addEventListener('keydown', function(e){
    if(!PUBLIC && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); saveDeck(); return; }
    // With editing on, the arrows belong to the caret.
    if(editing() && ['ArrowRight','ArrowLeft','ArrowUp','ArrowDown',' '].indexOf(e.key) > -1) return;
    switch(e.key){
      case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); next(); break;
      case 'ArrowLeft':  case 'PageUp':            e.preventDefault(); prev(); break;
      case 'Home': e.preventDefault(); show(0); break;
      case 'End':  e.preventDefault(); show(slides.length - 1); break;
      case 'f': case 'F':
        if(!editing()){ e.preventDefault(); toggleFull(); }
        break;
    }
  });

  // Click to advance, but never while editing and never on a link or button.
  stage.addEventListener('click', function(e){
    if(editing()) return;
    if(e.target.closest('a,button')) return;
    next();
  });

  function toggleFull(){
    if(document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
  }
  window.toggleFull = toggleFull;

  /* --- Theme, on the same data-theme contract as the course docs ------------ */
  function setTheme(t){
    root.setAttribute('data-theme', t);
    var b = document.getElementById('theme-btn');
    if(b) b.textContent = t === 'dark' ? 'Light' : 'Dark';
  }
  window.toggleTheme = function(){
    setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  };

  /* --- Edit toggle ---------------------------------------------------------
     Off by default: otherwise the arrow keys move a caret instead of the deck. */
  // The slide's text container, not its individual paragraphs. Marking each element instead
  // means you can only retype the words already there — there is no way to press Enter and add
  // a line, and anything the author forgot to mark is silently unwritable.
  var EDITABLE = '.slide .pad, .slide .text-half, .slide .cap';

  // A deck saved while editing bakes contenteditable into every element it was set on. Left in
  // place, those beat the container, so they are cleared before the container is set.
  function clearStale(){
    document.querySelectorAll('.slide [contenteditable]').forEach(function(el){
      if(!el.matches(EDITABLE)) el.removeAttribute('contenteditable');
    });
  }

  window.toggleEdit = function(){
    var on = editing();
    root.setAttribute('data-edit', on ? 'off' : 'on');
    clearStale();
    document.querySelectorAll(EDITABLE).forEach(function(el){
      el.setAttribute('contenteditable', on ? 'false' : 'true');
    });
    var b = document.getElementById('edit-btn');
    if(b) b.textContent = on ? 'Edit off' : 'Edit on';
  };

  /* --- The text menu --------------------------------------------------------
     Right-click a line while editing to give it one of the deck's type roles.
     Each role is the tag and class the stylesheet already draws, so a line made
     here is indistinguishable from one written into the file. */
  var ROLES = [
    ['Heading',      'h1', ''],
    ['Quote',        'h2', ''],
    ['Body',         'p',  ''],
    ['Note',         'p',  'note'],
    ['Kicker',       'p',  'kick'],
    ['Caption',      'p',  'cap'],
    ['Link line',    'p',  'link-line']
  ];

  // The line the click landed on. The nearest text element, so a title slide's wrapper divs
  // are stepped over rather than being replaced whole.
  var LINE = 'h1,h2,h3,h4,p,li,dt,dd,blockquote,figcaption';
  function blockAt(node, host){
    var el = node.closest(LINE);
    return (el && host.contains(el)) ? el : null;
  }

  function setRole(block, tag, cls){
    var el = document.createElement(tag);
    el.className = cls;
    el.innerHTML = block.innerHTML;
    block.parentNode.replaceChild(el, block);
    var r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    var sel = window.getSelection();
    sel.removeAllRanges(); sel.addRange(r);
  }

  // Accent colour on the selected words only, so a single term can be picked out of a line.
  function accentSelection(){
    var sel = window.getSelection();
    if(!sel.rangeCount || sel.isCollapsed) return;
    var span = document.createElement('span');
    span.className = 'fill';
    try { sel.getRangeAt(0).surroundContents(span); } catch(e){ /* selection crosses elements */ }
  }

  function closeMenu(){
    var m = document.querySelector('.text-menu');
    if(m) m.remove();
  }

  document.addEventListener('contextmenu', function(e){
    if(!editing()) return;
    var host = e.target.closest(EDITABLE);
    if(!host) return;
    var block = blockAt(e.target, host);
    if(!block) return;
    e.preventDefault();
    closeMenu();

    var m = document.createElement('div');
    m.className = 'text-menu';
    m.setAttribute('data-nosave', '');
    ROLES.forEach(function(r){
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = r[0];
      b.onclick = function(){ setRole(block, r[1], r[2]); closeMenu(); };
      m.appendChild(b);
    });
    m.appendChild(document.createElement('hr'));
    var a = document.createElement('button');
    a.type = 'button';
    a.textContent = 'Accent the selection';
    a.onclick = function(){ accentSelection(); closeMenu(); };
    m.appendChild(a);

    document.body.appendChild(m);
    var r = m.getBoundingClientRect();
    m.style.left = Math.min(e.clientX, window.innerWidth  - r.width  - 8) + 'px';
    m.style.top  = Math.min(e.clientY, window.innerHeight - r.height - 8) + 'px';
  });

  document.addEventListener('mousedown', function(e){
    if(!e.target.closest('.text-menu')) closeMenu();
  });
  document.addEventListener('keydown', function(e){ if(e.key === 'Escape') closeMenu(); });

  /* --- Save ---------------------------------------------------------------- */
  function saveDeck(){
    var clone = document.documentElement.cloneNode(true);
    clone.querySelectorAll('[data-nosave]').forEach(function(el){ el.remove(); });
    var html = '<!DOCTYPE html>\n' + clone.outerHTML;
    var blob = new Blob([html], {type:'text/html'});
    var d = new Date();
    var stamp = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    var name = (root.getAttribute('data-docname') || 'art3041-lecture') + '_' + stamp + '.html';
    var toDownloads = function(){
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    if(!window.showSaveFilePicker){ toDownloads(); return; }
    window.showSaveFilePicker({suggestedName:name,types:[{description:'HTML file',accept:{'text/html':['.html']}}]})
      .then(function(h){ return h.createWritable(); })
      .then(function(w){ return w.write(blob).then(function(){ return w.close(); }); })
      .catch(function(e){ if(!e || e.name !== 'AbortError') toDownloads(); });
  }
  window.saveDeck = saveDeck;
  window.nextSlide = next;
  window.prevSlide = prev;

  /* --- Drop media into a placeholder ---------------------------------------
     Drag an image (or a video) onto any .ph, or copy one and press ⌘V while
     hovering it. The file is stored as a data URL inside the markup, so it
     survives Save and travels with the single file.

     Images are re-encoded down to 2560px on the long edge before embedding.
     A phone photo is ~4000px and would add several megabytes of base64 per
     slide; 2560 is still more than a 1920 projector can show. */
  var MAX_EDGE = 2560, JPEG_Q = 0.85;

  function downscale(file, cb){
    if(file.type.indexOf('image/') !== 0 || file.type === 'image/svg+xml'){ readRaw(file, cb); return; }
    var fr = new FileReader();
    fr.onload = function(){
      var img = new Image();
      img.onload = function(){
        var k = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        if(k === 1 && file.size < 400000){ cb(fr.result, 'img'); return; }   // already small
        var c = document.createElement('canvas');
        c.width  = Math.round(img.width  * k);
        c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        // PNG keeps transparency; everything else is cheaper as JPEG.
        var type = (file.type === 'image/png') ? 'image/png' : 'image/jpeg';
        cb(c.toDataURL(type, JPEG_Q), 'img');
      };
      img.onerror = function(){ cb(fr.result, 'img'); };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  }
  function readRaw(file, cb){
    var fr = new FileReader();
    fr.onload = function(){ cb(fr.result, file.type.indexOf('video/') === 0 ? 'video' : 'img'); };
    fr.readAsDataURL(file);
  }

  /* The media area is known from the Figma contract, not measured from the DOM:
       .s-split      960 x 1080, at x=0 or x=960
       .s-full.media 1920 x 1080
     Everything is set inline in real pixels. No CSS class, percentage, grid track
     or object-fit is involved, so nothing upstream can change the result. */
  function applyMedia(ph){
    var el = ph.querySelector('img,video');
    var mode = ph.classList.contains('bleed') ? 'bleed'
             : ph.classList.contains('fill')  ? 'fill' : 'fit';
    if(el){
      var pb = ph.getBoundingClientRect(), ib = el.getBoundingClientRect();
      ph.setAttribute('data-applied', mode);
      report('slot ' + Math.round(pb.width) + 'x' + Math.round(pb.height) +
             '  img ' + Math.round(ib.width) + 'x' + Math.round(ib.height) +
             '  ' + mode + '  split:' + (ph.closest('.s-split') ? 'yes' : 'NO'));
    }
    return mode;
  }
  window.applyMedia = applyMedia;

  function place(ph, file){
    if(!file || !/^(image|video)\//.test(file.type)) return;
    downscale(file, function(url, kind){
      ph.querySelectorAll('img,video').forEach(function(el){ el.remove(); });
      ph.style.removeProperty('--media');
      var el;
      if(kind === 'video'){
        el = document.createElement('video');
        el.controls = true; el.loop = true; el.muted = true; el.playsInline = true;
        el.addEventListener('loadedmetadata', function(){
          ph.setAttribute('data-nw', el.videoWidth); ph.setAttribute('data-nh', el.videoHeight);
          applyMedia(ph);
        });
        el.src = url;
      } else {
        el = document.createElement('img');
        el.alt = '';
        el.addEventListener('load', function(){
          ph.setAttribute('data-nw', el.naturalWidth); ph.setAttribute('data-nh', el.naturalHeight);
          applyMedia(ph);
        });
        el.src = url;
      }
      ph.insertBefore(el, ph.firstChild);
      ph.classList.add('filled');
      ph.classList.remove('fit','bleed');
      ph.classList.add('fill');            // Fill is the default
      if(ph._syncTools) ph._syncTools();
    });
  }

  /* Slot controls. Named buttons; the active one is the mode actually applied.
     data-nosave, rebuilt on open. */
  function tools(ph){
    if(ph.querySelector('.ph-tools')) return;
    var split = ph.closest('.s-split');
    var t = document.createElement('div');
    t.className = 'ph-tools';
    t.setAttribute('data-nosave', '');

    function btn(label, title, fn){
      var b = document.createElement('button');
      b.type = 'button'; b.textContent = label; b.title = title;
      b.addEventListener('click', function(e){ e.stopPropagation(); fn(); sync(); requestAnimationFrame(function(){ applyMedia(ph); }); });
      t.appendChild(b);
      return b;
    }
    function mode(m){
      ph.classList.remove('fit','fill','bleed');
      ph.classList.add(m);
      applyMedia(ph);
    }
    var bFill  = btn('Fill',       'Spans the width; height follows the image',          function(){ mode('fill');  });
    var bFit   = btn('Fit',        'Whole frame visible, letterboxed',                  function(){ mode('fit');   });
    var bBleed = btn('Full bleed', 'Fill the whole half, cropping whatever does not fit', function(){ mode('bleed'); });
    if(split) btn('Flip', 'Move the media to the other side', function(){
      split.classList.toggle('flip');
      split.querySelectorAll('.ph').forEach(applyMedia);
    });
    btn('\u00d7', 'Remove', function(){
      ph.querySelectorAll('img,video').forEach(function(el){ el.remove(); });
      ph.removeAttribute('data-nw'); ph.removeAttribute('data-nh'); ph.removeAttribute('data-applied');
      ph.style.cssText = '';
      ph.classList.remove('filled','fit','fill','bleed');
    });

    function sync(){
      bFill .classList.toggle('on', ph.classList.contains('fill'));
      bFit  .classList.toggle('on', ph.classList.contains('fit'));
      bBleed.classList.toggle('on', ph.classList.contains('bleed'));
      var empty = !ph.classList.contains('filled');
      [bFill, bFit, bBleed].forEach(function(b){ b.disabled = empty; });
      t.lastChild.disabled = empty;
    }
    ph.appendChild(t);
    sync();
    ph._syncTools = sync;
  }

  var hovered = null;
  document.querySelectorAll('.ph').forEach(function(ph){
    ph.addEventListener('mouseenter', function(){ hovered = ph; });
    ph.addEventListener('mouseleave', function(){ if(hovered === ph) hovered = null; });
    ph.addEventListener('dragenter', function(e){ e.preventDefault(); ph.classList.add('over'); });
    ph.addEventListener('dragover',  function(e){ e.preventDefault(); ph.classList.add('over'); });
    ph.addEventListener('dragleave', function(e){ if(!ph.contains(e.relatedTarget)) ph.classList.remove('over'); });
    ph.addEventListener('drop', function(e){
      e.preventDefault(); e.stopPropagation();
      ph.classList.remove('over');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      place(ph, f);
    });
    if(ph.querySelector('img,video')){
      ph.classList.add('filled');
      if(!ph.matches('.fit,.fill,.bleed')) ph.classList.add('fill');
      var m = ph.querySelector('img,video');
      var run = function(){
        ph.setAttribute('data-nw', m.naturalWidth || m.videoWidth || 0);
        ph.setAttribute('data-nh', m.naturalHeight || m.videoHeight || 0);
        applyMedia(ph);
      };
      if(m.complete || m.videoWidth) run(); else m.addEventListener('load', run);
    }
    tools(ph);
  });

  // Dropping anywhere else would make the browser navigate away from the deck.
  window.addEventListener('dragover', function(e){ e.preventDefault(); });
  window.addEventListener('drop', function(e){ e.preventDefault(); });

  document.addEventListener('paste', function(e){
    if(!hovered || !e.clipboardData) return;
    var items = e.clipboardData.files;
    if(items && items.length){ e.preventDefault(); place(hovered, items[0]); }
  });

  /* --- Live readout, so a screenshot shows the real state ------------------- */
  function report(msg){
    var el = document.getElementById('readout');
    if(el) el.textContent = msg;
  }
  (function(){
    var link = [].slice.call(document.querySelectorAll('link[rel=stylesheet]'))
      .map(function(l){ return l.href.split('/').pop(); })
      .filter(function(n){ return n.indexOf('slides') === 0; })[0] || 'NO slides css';
    var v = getComputedStyle(root).getPropertyValue('--slides-css').trim() || 'none';
    var el = document.getElementById('build');
    if(el) el.textContent = link + '  ·  css v' + v;
  })();

  /* --- Is the stylesheet actually the current one? --------------------------
     file:// caches shared/*.css hard. A stale or missing slides.css produced
     three rounds of "the fix does not work" when the fix was already on disk.
     Say so on the page instead of leaving it to be guessed at. */
  (function(){
    var v = getComputedStyle(root).getPropertyValue('--slides-css').trim();
    if(v === '21') return;
    var w = document.createElement('div');
    w.setAttribute('data-nosave','');
    w.textContent = v ? ('slides.css is STALE (v' + v + ', expected v21) — hard reload')
                      : 'slides.css DID NOT LOAD — check the path';
    w.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99;padding:10px 16px;' +
      'background:#E4002B;color:#fff;font:600 14px/1.3 system-ui,sans-serif;letter-spacing:.04em;';
    document.body.appendChild(w);
  })();

  // In full screen the bar is tucked away so the image reaches the bottom edge.
  // Move the pointer into the bottom 70px to bring it back.
  document.addEventListener('mousemove', function(e){
    var bar = document.querySelector('.deck-bar');
    if(!bar) return;
    bar.classList.toggle('peek', e.clientY > window.innerHeight - 70);
  });

  /* --- The deck bar --------------------------------------------------------
     Built here, not written into the deck. It is data-nosave, so saveDeck strips
     it out — a deck saved from the browser used to come back with no controls at
     all and no way to get them back. */
  function buildDeckBar(){
    if(document.querySelector('.deck-bar')) return;
    var bar = document.createElement('div');
    bar.className = 'deck-bar';
    bar.setAttribute('data-nosave', '');
    bar.innerHTML =
      '<span id="build" hidden></span>' +
      '<span id="readout" hidden></span>' +
      '<div class="tools">' +
        '<button class="btn" type="button" onclick="prevSlide()" aria-label="Previous slide">\u2190</button>' +
        '<span class="counter" id="counter"></span>' +
        '<button class="btn" type="button" onclick="nextSlide()" aria-label="Next slide">\u2192</button>' +
        (PUBLIC ? '' : '<button class="btn" type="button" id="edit-btn" onclick="toggleEdit()">Edit off</button>') +
        '<button class="btn" type="button" id="theme-btn" onclick="toggleTheme()">Dark</button>' +
        '<button class="btn" type="button" onclick="toggleFull()">Full screen</button>' +
        (PUBLIC ? '' : '<button class="btn" type="button" onclick="saveDeck()">Save HTML</button>') +
      '</div>';
    document.body.appendChild(bar);
  }

  /* --- Start --------------------------------------------------------------- */
  buildDeckBar();
  window.addEventListener('resize', fit);
  fit();
  setTheme(root.getAttribute('data-theme') || 'light');
  root.setAttribute('data-edit', 'off');
  clearStale();
  document.querySelectorAll(EDITABLE).forEach(function(el){ el.setAttribute('contenteditable','false'); });
  var start = parseInt((location.hash || '').slice(1), 10);
  show(isNaN(start) ? 0 : start - 1);
})();

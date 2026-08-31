/* Shared behaviour, part 1: accent choice, frame + column drawing, link decoration,
   fitHeadings, copy buttons, save. Loads before each page's own script. */
// One accent per document, drawn from the three primaries and three secondaries.

// The published copy of a document carries data-public on <html>: it is read-only, so none of the
// authoring controls are built for it.
var PUBLIC = document.documentElement.hasAttribute('data-public');
// The docs ship with contenteditable on main.page so they can be written in the browser. The
// published copy is read-only, so it is turned off here rather than in every file.
if(PUBLIC){
  var _m = document.querySelector('main.page') || document.querySelector('.page');
  if(_m) _m.setAttribute('contenteditable','false');
}

var PALETTE=['--c1','--c2','--c3','--c4','--c5','--c6'];

// The six pure hues stay pure for the moving dots. The text accent is the same hue nudged in

// lightness until it clears WCAG AA (4.5:1) against the current ground, so yellow and orange stop

// failing on white and blue and violet stop failing on black. Recomputed on every theme switch.

var ACCENT_HUE=(function(){
  var root=document.documentElement;
  return getComputedStyle(root).getPropertyValue(PALETTE[(Math.random()*PALETTE.length)|0]).trim();
})();

function hexToRgb(h){ h=h.replace('#',''); if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
  return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }

function relLum(rgb){ var a=rgb.map(function(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); });
  return 0.2126*a[0]+0.7152*a[1]+0.0722*a[2]; }

function contrast(a,b){ var l1=relLum(a),l2=relLum(b); return (Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05); }

function rgbToHsl(r,g,b){ r/=255;g/=255;b/=255; var mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn,h=0,s=0,l=(mx+mn)/2;
  if(d){ s=l>0.5 ? d/(2-mx-mn) : d/(mx+mn);
    h = mx===r ? (g-b)/d+(g<b?6:0) : mx===g ? (b-r)/d+2 : (r-g)/d+4; h/=6; }
  return [h,s,l]; }

function hslToRgb(h,s,l){ if(!s){ var v=Math.round(l*255); return [v,v,v]; }
  function hue(p,q,t){ if(t<0)t++; if(t>1)t--; if(t<1/6)return p+(q-p)*6*t; if(t<1/2)return q; if(t<2/3)return p+(q-p)*(2/3-t)*6; return p; }
  var q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
  return [hue(p,q,h+1/3),hue(p,q,h),hue(p,q,h-1/3)].map(function(v){ return Math.round(v*255); }); }

// Step lightness toward whichever end raises contrast, keeping hue and chroma, until it clears 4.5:1.

function applyAccent(){
  var root=document.documentElement, cs=getComputedStyle(root);
  var bg=hexToRgb(cs.getPropertyValue('--bg').trim());
  var hsl=rgbToHsl.apply(null,hexToRgb(ACCENT_HUE));
  var dir = relLum(bg) > 0.5 ? -0.02 : 0.02;      // darken on a light ground, lighten on a dark one
  var rgb=hslToRgb(hsl[0],hsl[1],hsl[2]);
  for(var i=0;i<60 && contrast(rgb,bg)<4.5;i++){
    hsl[2]=hsl[2]+dir;
    if(hsl[2]<=0||hsl[2]>=1){ hsl[2]=Math.min(1,Math.max(0,hsl[2])); rgb=hslToRgb(hsl[0],hsl[1],hsl[2]); break; }
    rgb=hslToRgb(hsl[0],hsl[1],hsl[2]);
  }
  root.style.setProperty('--accent','#'+rgb.map(function(v){ return ('0'+v.toString(16)).slice(-2); }).join(''));
}

// Update only a button's label text node, so the hover-border SVG appended to it survives.

function setBtnLabel(b, txt){
  if(!b) return;
  var t=b.firstChild;
  if(t && t.nodeType===3) t.nodeValue=txt; else b.insertBefore(document.createTextNode(txt), b.firstChild);
}

// One place for the course facts: the footer and the printed masthead both read them.

var COURSE = {
  code:  'ART 3041',
  title: 'A.I. for Designers',
  term:  'Fall 2026',
  prof:  'Broderick Shoemaker',
  email: 'bshoemaker@ccny.cuny.edu',
  site:  'https://aifordesigners.net'
};

// Where this copy of the site sits. core.js is always at <root>/shared/core.js, so its own src gives
// the root whatever depth the document is at. Read at top level — currentScript is null in a callback.

var SITE_ROOT = (function(){
  var el = document.currentScript;
  return el && el.src ? el.src.replace(/shared\/core\.js.*$/, '') : location.href;
})();

// The drawn eye that stands in for the I. Used by the navbar wordmark's cycle and, held static,
// by the printed masthead.

var EYE_SVG='<svg class="eye" viewBox="0 0 26 20" aria-hidden="true"><path d="M1.5,12 Q13,-8 24.5,12 Q13,24 1.5,12 Z" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linejoin="round"/><circle class="eye-dot" cx="13" cy="8" r="4.4" fill="currentColor"/></svg>';

// --- The navigation bar -------------------------------------------------------
// One bar for every document, built here so a change lands everywhere at once.
// Per-doc configuration lives on <html>:
//   data-subtitle  the small line under the AIFD wordmark
//   data-tools     space-separated extras: "cols", "edit"  (Save and theme are always present)
//   data-public    the published copy: no Save HTML, no PDF, no authoring extras, no Cmd-S.
//                  Only the wordmark, the doc's own nav-extra links and the theme toggle.
// A document with its own links declares them in <template id="nav-extra">. They are
// placed inside .tools, so they sit inline on a wide screen and fall into the hamburger
// panel on a narrow one without any per-page CSS.
function buildToolbar(){
  if(document.querySelector('.toolbar')) return;                 // a saved copy may still carry one
  var root = document.documentElement;
  var sub  = root.getAttribute('data-subtitle') || 'ART 3041';
  var want = PUBLIC ? [] : (root.getAttribute('data-tools') || '').trim().split(/\s+/).filter(Boolean);

  var BTN = {
    cols: '<button class="btn-outline" id="cols-btn" type="button" onclick="toggleCols()">Columns off</button>',
    edit: '<button class="btn-outline" id="edit-btn" type="button" onclick="toggleEdit()">Edit off</button>'
  };
  var extra = document.getElementById('nav-extra');
  var slot  = want.map(function(t){ return BTN[t] ? '    ' + BTN[t] + '\n' : ''; }).join('')
            + (extra ? '    ' + extra.innerHTML.trim() + '\n' : '');
  var author = PUBLIC ? '' :
      '    <button class="btn-outline" type="button" onclick="saveDoc()">Save HTML</button>\n' +
      '    <button class="btn-outline" type="button" onclick="window.print()">PDF</button>\n';
  var hint = PUBLIC ? '' : '\n    <span class="hint">or press &#8984;/Ctrl + S</span>';

  var html = "<div class=\"toolbar\" data-nosave>\n  <a class=\"name\" href=\"%HOME%\" data-self aria-label=\"Home\"><span class=\"brand\">A<span class=\"bx-i\">I</span><span class=\"bx-f\">F</span><span class=\"bx-colon\" aria-hidden=\"true\"><i>:</i></span><span class=\"bx-d\">D</span><span class=\"bx-tail\" aria-hidden=\"true\"><i>esigners</i></span></span><span class=\"brand-sub\">%SUB%</span></a>\n  <button class=\"menu-btn nav-menu\" id=\"nav-menu\" type=\"button\" aria-label=\"Menu\" aria-expanded=\"false\" onclick=\"toggleNav()\">\n    <svg class=\"menu-glyph\" viewBox=\"0 0 40 40\" aria-hidden=\"true\">\n      <path d=\"M4,8 Q8,3.5 12,8 T20,8 T28,8 T36,8\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/>\n      <path d=\"M4,20 V16 H12 V24 H20 V16 H28 V24 H36 V20\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"/>\n      <circle cx=\"9\" cy=\"32\" r=\"2\" fill=\"currentColor\"/><circle cx=\"20\" cy=\"32\" r=\"2\" fill=\"currentColor\"/><circle cx=\"31\" cy=\"32\" r=\"2\" fill=\"currentColor\"/>\n    </svg>\n  </button>\n  <div class=\"tools\">\n%AUTHOR%%TOOLS%    <button class=\"theme-btn\" id=\"theme-btn\" type=\"button\" onclick=\"toggleTheme()\" aria-label=\"Toggle light and dark\">\n      <svg class=\"sun-glyph\" viewBox=\"0 0 24 24\" aria-hidden=\"true\">\n        <circle cx=\"12\" cy=\"12\" r=\"5\" fill=\"currentColor\"/>\n        <g stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\">\n          <line x1=\"12\" y1=\"1.5\" x2=\"12\" y2=\"4\"/><line x1=\"12\" y1=\"20\" x2=\"12\" y2=\"22.5\"/>\n          <line x1=\"1.5\" y1=\"12\" x2=\"4\" y2=\"12\"/><line x1=\"20\" y1=\"12\" x2=\"22.5\" y2=\"12\"/>\n          <line x1=\"4.6\" y1=\"4.6\" x2=\"6.4\" y2=\"6.4\"/><line x1=\"17.6\" y1=\"17.6\" x2=\"19.4\" y2=\"19.4\"/>\n          <line x1=\"19.4\" y1=\"4.6\" x2=\"17.6\" y2=\"6.4\"/><line x1=\"6.4\" y1=\"17.6\" x2=\"4.6\" y2=\"19.4\"/>\n        </g>\n      </svg>\n      <svg class=\"moon-glyph\" viewBox=\"0 0 24 24\" aria-hidden=\"true\">\n        <path d=\"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z\" fill=\"currentColor\"/>\n      </svg>\n    </button>%HINT%\n  </div>\n</div>".replace('%SUB%', sub).replace('%HOME%', SITE_ROOT + 'index.html').replace('%AUTHOR%', author).replace('%TOOLS%', slot).replace('%HINT%', hint);

  var host = document.createElement('div');
  host.innerHTML = html;
  var bar = host.firstElementChild;
  var main = document.querySelector('main.page') || document.querySelector('.page');
  if(main) main.parentNode.insertBefore(bar, main);
  else document.body.insertBefore(bar, document.body.firstChild);
}
buildToolbar();

// The printed masthead: the wordmark held in its A(eye)4D state, then the course line spread to the
// right edge, sitting above the h1. It has no screen form — print.css hides it — and it carries
// data-nosave, so a save never bakes it in.
function buildPrintHead(){
  var main = document.querySelector('main.page') || document.querySelector('.page');
  if(!main || document.querySelector('.print-head')) return;
  var sub  = document.documentElement.getAttribute('data-subtitle') || '';
  var cells = [COURSE.prof, COURSE.code];
  if(sub && sub !== COURSE.code) cells.push(sub);      // the doc's own name, when it has one
  cells.push(COURSE.term);
  var h = document.createElement('header');
  h.className = 'print-head';
  h.setAttribute('data-nosave', '');
  h.innerHTML = '<span class="print-mark">A' + EYE_SVG + '4D</span>' +
    cells.map(function(t){ return '<span>' + t + '</span>'; }).join('');
  // Facing forward, and held there: data-static keeps the pupil loop from looking around with it.
  var pupil = h.querySelector('.eye-dot');
  if(pupil){ pupil.setAttribute('data-static',''); pupil.setAttribute('cx',13); pupil.setAttribute('cy',10.5); }
  main.parentNode.insertBefore(h, main);
}
buildPrintHead();

// A PDF is emailed and downloaded far more often than it is printed, so its links have to work away
// from this folder — a relative href does nothing once the file is somewhere else. For the duration of
// the print, every in-site relative link is rewritten against the course address, then put back.
(function(){
  var touched = [];
  window.addEventListener('beforeprint', function(){
    var base = COURSE.site.replace(/\/+$/, '');
    document.querySelectorAll('.page a[href]').forEach(function(a){
      var h = a.getAttribute('href');
      if(!h || h.charAt(0) === '#' || /^[a-z][a-z0-9+.-]*:/i.test(h)) return;   // in-page, mailto, already absolute
      var abs = new URL(h, location.href).href;
      if(abs.indexOf(SITE_ROOT) !== 0) return;                                  // points outside the site folder
      touched.push([a, h]);
      a.setAttribute('href', base + '/' + abs.slice(SITE_ROOT.length));
    });
  });
  window.addEventListener('afterprint', function(){
    touched.forEach(function(p){ p[0].setAttribute('href', p[1]); });
    touched = [];
  });
})();

// The footer is identical on every document, so it is built here instead of being
// pasted into nine files. Outside .page (not editable) and data-nosave (never saved).
(function(){
  var main = document.querySelector('main.page') || document.querySelector('.page');
  if(!main || document.querySelector('.site-foot')) return;
  var f = document.createElement('footer');
  f.className = 'site-foot';
  f.setAttribute('data-nosave', '');
  f.innerHTML =
    '<p class="note">' + COURSE.code + ' &middot; ' + COURSE.title + ' &middot; ' + COURSE.term + '</p>' +
    '<p class="note">' + COURSE.prof + '</p>' +
    '<p class="note"><a href="mailto:' + COURSE.email + '">' + COURSE.email + '</a></p>';
  main.parentNode.insertBefore(f, main.nextSibling);
})();

/* ===== Promoted from the documents =============================================
   Everything below ran as an identical copy inside each HTML file. Edit here. */

function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  applyAccent();                     // ground changed, so re-fit the accent to it
  var tb=document.getElementById('theme-btn');
  if(tb){ tb.style.opacity=1;
    tb.style.color=getComputedStyle(document.documentElement).getPropertyValue(PALETTE[(Math.random()*PALETTE.length)|0]).trim(); }
}

function toggleNav(){
  var tb=document.querySelector('.toolbar'); if(!tb) return;
  var open = tb.getAttribute('data-nav')==='open';
  tb.setAttribute('data-nav', open ? 'closed' : 'open');
  var b=document.getElementById('nav-menu'); if(b) b.setAttribute('aria-expanded', open ? 'false' : 'true');
}

(function(){
  var brand=document.querySelector('.brand'); if(!brand) return;
  var bi=brand.querySelector('.bx-i'), bf=brand.querySelector('.bx-f');
  var col=brand.querySelector('.bx-colon'), tail=brand.querySelector('.bx-tail');
  if(!bi||!bf||!col||!tail) return;
  var ci=col.firstElementChild, ti=tail.firstElementChild;
  var EYE=EYE_SVG;
  // A lowercase i whose tittle is a blinking palette dot; drawn (not text) so its terminus lands on the caps' top.
  var IDOT='<svg class="ichar" viewBox="0 0 7 20" aria-hidden="true"><rect x="2.25" y="9" width="2.5" height="9.7" rx="1.25" fill="currentColor"/><circle class="i-dot" cx="3.5" cy="5.6" r="1.9" fill="currentColor"/></svg>';
  var V=[{i:'I',f:'F'},{i:EYE,f:'F'},{i:EYE,f:'4'},{i:'I',f:'4'},{i:IDOT,f:'F'},{i:IDOT,f:'4'}];
  var reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var cur=-1, revealed=false, busy=false;

  function setVariant(n){ cur=n; bi.innerHTML=V[n].i; bf.textContent=V[n].f; }
  function pick(){ var n; do{ n=(Math.random()*V.length)|0; }while(n===cur && V.length>1); return n; }
  function foldReveal(){ col.style.width='0'; ci.style.opacity=0; tail.style.width='0'; ti.style.opacity=0; revealed=false; }
  function playReveal(){
    if(busy) return; busy=true; revealed=true;
    col.style.width=ci.getBoundingClientRect().width.toFixed(1)+'px'; ci.style.opacity=1;                     // colon out, D pushed right
    setTimeout(function(){ tail.style.width=ti.getBoundingClientRect().width.toFixed(1)+'px'; ti.style.opacity=1; busy=false; }, 360); // esigners out, and stays
  }
  function swap(){                                // one outcome per swap: a static state, or (1 in 7) the reveal
    if(!reduce && (Math.random()*(V.length+1)|0)===V.length){ setVariant(pick()); playReveal(); }
    else { if(revealed) foldReveal(); setVariant(pick()); }
  }
  // Wait for the font so the reveal measures widths correctly and there is no first-paint weight flash.
  function initial(){ setVariant(1); }           // first load always shows A(eye)FD
  if(document.fonts && document.fonts.ready) document.fonts.ready.then(initial); else initial();
  brand.style.cursor='pointer';
  brand.addEventListener('click', function(){ if(!reduce){ if(revealed) foldReveal(); setVariant(pick()); playReveal(); } });
  function bind(){ document.querySelectorAll('.page a').forEach(function(a){
    if(a._brandSwap) return; a._brandSwap=1;
    a.addEventListener('mouseenter', swap); a.addEventListener('click', swap);
  }); }
  bind();
  document.addEventListener('input', bind);      // links added while editing get bound too
})();

// One clock for every animation on the page. Seven separate requestAnimationFrame loops each
// asked for 60fps and each mutated SVG geometry, which kept the compositor re-rasterising the
// whole document continuously — the cost showed up as WindowServer, not as JavaScript. One loop
// now drives them all, capped at 30fps (the waves travel slowly; the halved rate is not visible),
// and nothing runs at all while the tab is hidden.

var TICKS=[], MINDT=1/32, clockLast=null, clockOn=false;

function onTick(fn){ TICKS.push(fn); startClock(); }

function clock(now){
  if(!clockOn) return;
  if(clockLast===null) clockLast=now;
  var dt=(now-clockLast)/1000;
  if(dt>=MINDT){
    clockLast=now;
    dt=Math.min(dt,0.05);
    for(var i=0;i<TICKS.length;i++){ try{ TICKS[i](dt); }catch(e){} }
  }
  requestAnimationFrame(clock);
}

function startClock(){ if(clockOn) return; clockOn=true; clockLast=null; requestAnimationFrame(clock); }

document.addEventListener('visibilitychange', function(){
  if(document.hidden) clockOn=false; else startClock();
});

(function(){
  var cs=getComputedStyle(document.documentElement);
  var COLORS=['--c1','--c2','--c3','--c4','--c5','--c6'].map(function(v){return cs.getPropertyValue(v).trim();});
  var reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var on=true, next=0.5+Math.random(), color=COLORS[0];
  function tick(dt){
    var ds=document.querySelectorAll('.i-dot');
    if(!ds.length) return;
    if(reduce){ var a=cs.getPropertyValue('--accent').trim(); ds.forEach(function(d){ d.setAttribute('fill',a); d.setAttribute('opacity',1); }); return; }
    next-=dt;
    if(next<=0){ on=!on; next=on?(0.6+Math.random()*1.1):(0.12+Math.random()*0.3); if(on) color=COLORS[(Math.random()*COLORS.length)|0]; }
    var o=on?1:0.2; ds.forEach(function(d){ d.setAttribute('fill',color); d.setAttribute('opacity',o); });
  }
  onTick(tick);
})();

(function(){
  var btn=document.getElementById('nav-menu'); if(!btn) return;
  var tb=document.querySelector('.toolbar'); if(!tb) return;
  var glyph=btn.querySelector('.menu-glyph');
  var dots=glyph ? glyph.querySelectorAll('circle') : [];
  var cs=getComputedStyle(document.documentElement);
  var COLORS=['--c1','--c2','--c3','--c4','--c5','--c6'].map(function(v){return cs.getPropertyValue(v).trim();});
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var NS='http://www.w3.org/2000/svg';
  var wave=document.createElementNS(NS,'svg');
  wave.setAttribute('class','nav-wave'); wave.setAttribute('aria-hidden','true'); wave.setAttribute('preserveAspectRatio','none');
  var wpath=document.createElementNS(NS,'path'); wpath.setAttribute('fill','none'); wpath.setAttribute('stroke','currentColor'); wpath.setAttribute('stroke-width','1');
  wave.appendChild(wpath); btn.appendChild(wave);

  var BAMP=2.5, BLAM=18, BLAM_Q=84, WSPD=60, STEP=2;
  function wv(x){ var e=Math.sin(2*Math.PI*x/BLAM_Q), b=Math.sin(2*Math.PI*x/BLAM); return e>0?(b>0?1:b<0?-1:0):b; }
  var st=[]; for(var i=0;i<dots.length;i++) st.push({on:true,next:0.2+Math.random()*0.4,color:COLORS[0]});
  var scroll=0, wasOpen=null;

  function tick(dt){
    var open=tb.getAttribute('data-nav')==='open';
    if(!open && wasOpen===false) return;      // parked closed: nothing to repaint
    wasOpen=open;
    for(var i=0;i<dots.length;i++){
      if(!open){ dots[i].removeAttribute('fill'); dots[i].setAttribute('opacity','1'); continue; }
      var s=st[i]; s.next-=dt;
      if(s.next<=0){ s.on=!s.on; s.next=s.on?(0.3+Math.random()*0.7):(0.1+Math.random()*0.3); if(s.on) s.color=COLORS[(Math.random()*COLORS.length)|0]; }
      dots[i].setAttribute('fill', s.color); dots[i].setAttribute('opacity', s.on?1:0.2);
    }
    if(open){
      var W=btn.offsetWidth, H=btn.offsetHeight, y=H-0.5;
      wave.setAttribute('viewBox','0 0 '+W+' '+H);
      scroll+=WSPD*dt;
      var d='M0,'+(y+BAMP*wv(0-scroll)).toFixed(1);
      for(var x=STEP;x<=W;x+=STEP) d+=' L'+x+','+(y+BAMP*wv(x-scroll)).toFixed(1);
      wpath.setAttribute('d',d);
      wave.style.opacity=1;
    } else { wave.style.opacity=0; }
  }
  onTick(tick);
})();

(function(){
  var cs=getComputedStyle(document.documentElement);
  var COLORS=['--c1','--c2','--c3','--c4','--c5','--c6'].map(function(v){return cs.getPropertyValue(v).trim();});
  var reduce=window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Spots that keep the r=4.4 pupil inside the almond (viewBox 0 0 26 20).
  var SPOTS=[{x:13,y:8},{x:13,y:10.5},{x:9,y:13},{x:17,y:13}];
  var EASE=5.5;                                   // glide rate: ~0.5s to reach a new spot, never a snap
  var ti=0, x=SPOTS[0].x, y=SPOTS[0].y, tx=x, ty=y; // pos + eased target (pupil ships at 13,8 = SPOTS[0])
  var state='look', dwell=0.8+Math.random()*1.7+(Math.random()<0.3?1.5+Math.random()*3:0), blinks=1+((Math.random()*4)|0);
  var on=true, blinkT=0.4+Math.random()*0.4, color=COLORS[0];
  function pick(){                                // a new spot, never the current one
    var n; do{ n=(Math.random()*SPOTS.length)|0; }while(n===ti); ti=n;
    tx=SPOTS[n].x+(Math.random()-0.5)*1.2; ty=SPOTS[n].y+(Math.random()-0.5)*1.2; // <=0.6 jitter, still in bounds
  }
  function tick(dt){
    var dots=document.querySelectorAll('.eye-dot:not([data-static])');
    if(!dots.length) return;                                            // no eye showing: skip, don't error
    if(reduce){ var a=cs.getPropertyValue('--accent').trim(); dots.forEach(function(dot){ dot.setAttribute('fill',a); dot.setAttribute('opacity',1); dot.setAttribute('cx',13); dot.setAttribute('cy',10.5); }); return; }
    x+=(tx-x)*EASE*dt; y+=(ty-y)*EASE*dt;         // ease toward the target each frame, frame-rate independent
    if(state==='look'){
      dwell-=dt;
      if(blinks>0){                               // blink a few times while looking, then hold the eye open
        blinkT-=dt;
        if(blinkT<=0){ on=!on; if(on){ blinkT=0.28+Math.random()*0.4; color=COLORS[(Math.random()*COLORS.length)|0]; blinks--; } else blinkT=0.09+Math.random()*0.13; }
      } else on=true;
      if(dwell<=0 && on){ pick(); state='move'; } // leave only with the eye open, never mid-blink
    } else { on=true;                             // keep the eye open through the glide
      if(Math.abs(tx-x)<0.15 && Math.abs(ty-y)<0.15){ state='look'; dwell=0.8+Math.random()*1.7+(Math.random()<0.3?1.5+Math.random()*3:0); blinks=1+((Math.random()*4)|0); blinkT=0.4+Math.random()*0.4; }
    }
    var f=color, o=on?1:0.2, cx=x.toFixed(2), cy=y.toFixed(2);
    dots.forEach(function(dot){ dot.setAttribute('fill',f); dot.setAttribute('opacity',o); dot.setAttribute('cx',cx); dot.setAttribute('cy',cy); });
  }
  onTick(tick);
})();

// Scales every h1 so its text spans the full width of its container. Optical sizing

// changes the advance widths at the new size, so one ratio is not always enough;

// the loop corrects until the text fits or the floor is reached.

function fitHeadings(){
  document.querySelectorAll('h1 > span, .fit > span').forEach(function(span){
    var h1 = span.parentElement;
    var target = h1.clientWidth;
    if(!target) return;
    h1.style.fontSize = '100px';                       // measure at a known size
    var natural = span.getBoundingClientRect().width;
    if(!natural) return;
    var size = 100 * target / natural;
    for(var i=0;i<4;i++){
      h1.style.fontSize = Math.max(20, size) + 'px';
      var w = span.getBoundingClientRect().width;
      if(w <= target || size <= 20) break;
      size = size * target / w;
    }
  });
}

// Geometry shared with the link-point loop: where each link's line starts (--u-left) and ends

// (the terminus, = the anchor's own width). The hover point travels between the two.

var LINKGEOM = new WeakMap();

// Start each link's line at the LEFT EDGE of the first letter's stem — the vertical stroke, not the

// crossbar overhang. Text metrics only give the glyph's advance box, so instead render the first glyph

// large on a canvas and scan the lower half of the cap (below any crossbar) for the leftmost ink column:

// that column is the stem's left edge. Mapped back through the glyph's pen origin (the range's left) to

// the anchor, it becomes --u-left. Canvas uses the font's default instance, whose stem x matches the page.

function measureLinks(){
  var cv=measureLinks._cv || (measureLinks._cv=document.createElement('canvas'));
  var cx=cv.getContext('2d',{willReadFrequently:true});
  document.querySelectorAll('.page a').forEach(function(a){
    var tn=a.firstChild; if(!tn||tn.nodeType!==3){ a.style.removeProperty('--u-left'); LINKGEOM.delete(a); return; }
    var r=a.getBoundingClientRect();
    var rg=document.createRange(); rg.setStart(tn,0); rg.setEnd(tn,1);
    var fc=rg.getBoundingClientRect();
    var cs=getComputedStyle(a), fs=parseFloat(cs.fontSize)||16;
    var ch=(tn.data.match(/\S/)||['x'])[0];
    var SC=8, w=Math.ceil(fs*SC), h=Math.ceil(fs*SC*1.6), base=Math.round(fs*SC*1.15);
    if(cv.width!==w) cv.width=w; if(cv.height!==h) cv.height=h;
    cx.clearRect(0,0,w,h);
    cx.font=cs.fontWeight+' '+(fs*SC)+'px '+cs.fontFamily;
    cx.textBaseline='alphabetic'; cx.fillStyle='#000';
    cx.fillText(ch,0,base);
    var d=cx.getImageData(0,0,w,h).data, minX=w;
    var y0=Math.round(base-fs*SC*0.55), y1=Math.round(base-fs*SC*0.05);   // lower half of the cap, past the crossbar
    for(var y=y0;y<=y1;y++){
      var row=y*w*4;
      for(var x=0;x<minX;x++){ if(d[row+x*4+3]>100){ minX=x; break; } }
    }
    var stemLeft = minX<w ? minX/SC : 0;                                   // px from the glyph's pen origin
    var uLeft=Math.max(0,(fc.left+stemLeft)-r.left);
    a.style.setProperty('--u-left', uLeft.toFixed(1)+'px');
    LINKGEOM.set(a, {uLeft:uLeft, term:r.width});
  });
}

// The column a heading sits in changes width when the field collapses, which no

// resize event reports if the window itself did not change.

// The field. Interior columns are flat lines; the perimeter carries one waveform at

// very small amplitude, with stretches quantised to two levels. The points run the

// other way around it, and a node sits where a rule crosses a drawn boundary.

(function(){
  var page=document.querySelector('.page'), svg=document.querySelector('.frame');
  var cols=document.querySelector('.cols'), colg=document.getElementById('col-lines');
  var ln=document.getElementById('frame-line'), holder=document.getElementById('frame-dots');

  // The perimeter is drawn as a path of visible subpaths rather than as one polyline running the
  // whole document. The arc that is off screen costs nothing to leave out, so the per-frame cost is
  // the height of the window instead of the height of the page. A polyline cannot hold two disjoint
  // runs without a line joining them, hence the path.
  var lnPath=document.createElementNS('http://www.w3.org/2000/svg','path');
  lnPath.setAttribute('fill','none');
  lnPath.setAttribute('stroke','currentColor');
  lnPath.setAttribute('stroke-width','1');
  ln.parentNode.insertBefore(lnPath, ln);
  ln.setAttribute('opacity','0');
  if(!page||!svg||!ln||!holder||!cols||!colg) return;
  var COLN=12, BOUNDS=[3,6,9,10], AMP=3, LAM=100, SPD=20, PSPD=55, LAM_Q=520, STEP=4;
  function stepFor(p){ return 4; }   // the cost is the window now, so the wave keeps its full sampling
  var k=2*Math.PI/LAM, kQ=2*Math.PI/LAM_Q;
  // The border's character drifts along its length — local wavelength and amplitude both vary, so some
  // stretches run long and shallow while others bunch into tight, small ripples; never uniform all at once.
  // Two mismatched long periods keep the drift from repeating. KVAR is how far the wavelength swings.
  // The border sits loose by default; tight ripples happen only occasionally. loose() is the gentle
  // everyday wavelength drift; spike() is mostly ~0 with rare narrow peaks (the 4th power keeps the tight
  // extremes slightly rare); SPIKE sets how tight those peaks get (down to ~8px).
  var SPIKE=11.8, mW1=2*Math.PI/430, mW2=2*Math.PI/250, sW=2*Math.PI/540, aW1=2*Math.PI/330, aW2=2*Math.PI/190;
  var phase=0, pQ=0, W=0, H=0, P=0, DIV=12;
  var cs=getComputedStyle(document.documentElement);
  var COLORS=PALETTE.map(function(v){ return cs.getPropertyValue(v).trim(); });

  var NS='http://www.w3.org/2000/svg';
  var grads=document.getElementById('col-grads');
  var colLines=[], dots=[], nodes=[];

  // Each line gets its own gradient down its length, with a random number of stops at
  // random positions and random opacities. No two lines share a rhythm, and none of them
  // repeats down the page, so the field reads as twelve unequal hints rather than as a
  // ruled interval. Built once, so resizing does not reshuffle them.
  function mkGrad(id){
    var g=document.createElementNS(NS,'linearGradient');
    g.setAttribute('id',id);
    g.setAttribute('gradientUnits','userSpaceOnUse');   // a vertical line has no width to
    g.setAttribute('x1',0); g.setAttribute('x2',0);      // measure, so bounding box is out
    var offs=[0,1], n=4+((Math.random()*6)|0);
    for(var i=0;i<n;i++) offs.push(Math.random());
    offs.sort(function(a,b){ return a-b; });
    for(var j=0;j<offs.length;j++){
      var st=document.createElementNS(NS,'stop');
      st.setAttribute('offset', offs[j].toFixed(3));
      st.setAttribute('stop-color','currentColor');
      st.setAttribute('stop-opacity', (0.06 + Math.random()*0.49).toFixed(2));  // 0.06–0.55: a hint, kept under the band rules
      g.appendChild(st);
    }
    grads.appendChild(g);
    return g;
  }
  function mkLine(){
    var id='colgrad-'+colLines.length;
    var g=mkGrad(id);
    var l=document.createElementNS(NS,'line');
    l.setAttribute('stroke','url(#'+id+')'); l.setAttribute('stroke-width','1');
    colg.appendChild(l); l.grad=g; return l;
  }
  // Point count is chosen once per load, like the accent — anywhere from 1 to 7 travelling the border.
  var NDOTS=1+((Math.random()*7)|0);
  for(var i=0;i<NDOTS;i++){
    var c=document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('r','3'); holder.appendChild(c);
    dots.push({el:c, s:0, on:true, next:0.3+Math.random()*0.5});
  }
  var nodeg=document.createElementNS('http://www.w3.org/2000/svg','g');
  nodeg.setAttribute('id','frame-nodes');   // so CSS can drop the nodes when the field is hidden
  svg.appendChild(nodeg);

  // Horizontal band rules, drawn here rather than as flat CSS lines so their ends ride the perimeter
  // wave — the left/right endpoints follow off() on those edges, staying joined to the breathing border.
  var bandg=document.createElementNS(NS,'g');
  svg.insertBefore(bandg, holder);          // beneath the travelling points
  var bandLines=[], bandYs=[];
  document.documentElement.setAttribute('data-frame','on');   // retire the flat CSS band rules

  // Offset at right angles to whichever edge the point is on, pushed outward
  function loose(s){ return 0.71 + 0.24*Math.sin(mW1*s) + 0.05*Math.sin(mW2*s+1.3); }   // ~0.42..1.0 -> 100..240px
  function spike(s){ var u=0.5+0.5*Math.sin(sW*s+0.7); u=u*u; u=u*u; return u*u*u; }       // u^12: mostly ~0, rare sharp peaks
  function wnum(s){ return k*(loose(s) + SPIKE*spike(s)); }                              // local wavenumber, always > 0
  // amplitude rides its own slow drift, and drops where the wave tightens, so a tight burst stays small
  function ampAt(s){ var g=0.5+0.5*(0.6*Math.sin(aW1*s+2.0)+0.4*Math.sin(aW2*s+0.6)); return AMP*(0.35+0.65*g)*(1-0.55*spike(s)); }
  // Travelling phase = numeric integral of the wavenumber down the perimeter, so a wave whose wavelength
  // keeps changing still moves smoothly. Rebuilt whenever the perimeter length P changes (in layout()).
  var PTBL=null, PTds=1, PTN=0;
  function buildPhase(){ PTN=Math.max(128,Math.ceil(P/STEP)); PTds=P/PTN; PTBL=new Float64Array(PTN+1); var a=0;
    for(var i=0;i<PTN;i++){ PTBL[i]=a; a+=wnum(i*PTds)*PTds; } PTBL[PTN]=a; }
  function phi(s){ if(!PTBL) return k*s; s=((s%P)+P)%P; var t=s/PTds, i=t|0; return PTBL[i]+(PTBL[i+1]-PTBL[i])*(t-i); }
  function off(s){
    var sn=Math.sin(phi(s)-phase);
    return ampAt(s)*(Math.sin(kQ*s-pQ)>0 ? (sn>0?1:-1) : sn);
  }
  // Walk the perimeter clockwise from the top left corner
  function pt(s){
    var o=off(s);
    if(s<W)     return [s, -o];
    if(s<W+H)   return [W+o, s-W];
    if(s<2*W+H) return [W-(s-W-H), H+o];
    return [-o, H-(s-2*W-H)];
  }

  function layout(){
    var r=page.getBoundingClientRect();
    var w=Math.round(r.width), h=Math.round(r.height);
    var div=COLN;
    if(w===W && h===H && div===DIV) return;
    W=w; H=h; P=2*(W+H); DIV=div; STEP=stepFor(P);
    buildPhase();
    svg.setAttribute('viewBox','0 0 '+W+' '+H);
    cols.setAttribute('viewBox','0 0 '+W+' '+H);

    // Interior lines only — the edges belong to the frame
    while(colLines.length < DIV-1) colLines.push(mkLine());
    for(var i=0;i<colLines.length;i++){
      if(i < DIV-1){
        var x=Math.round(W*(i+1)/DIV)+0.5;                  // half pixel keeps 1px crisp
        colLines[i].xc=x;                                   // y1/y2 are set per frame in draw(), riding the edge wave
        colLines[i].setAttribute('x1',x); colLines[i].setAttribute('x2',x);
        colLines[i].setAttribute('opacity','1');
        colLines[i].grad.setAttribute('y1',0);            // the gradient spans the field
        colLines[i].grad.setAttribute('y2',H);
      } else {
        colLines[i].xc=null;
        colLines[i].setAttribute('opacity','0');
      }
    }

    // A node needs four rays: a band rule crossing a column line that is drawn.
    var bands=page.querySelectorAll(':scope > .band');
    var top=r.top, ys=[];
    for(var b=1;b<bands.length;b++) ys.push(Math.round(bands[b].getBoundingClientRect().top-top)+0.5);
    bandYs=ys;                                            // the band boundaries the wavy rules ride
    while(bandLines.length < ys.length){
      var bl=document.createElementNS(NS,'line');
      bl.setAttribute('stroke','currentColor'); bl.setAttribute('stroke-width','2');
      bandg.appendChild(bl); bandLines.push(bl);
    }
    for(var bi=0;bi<bandLines.length;bi++) bandLines[bi].setAttribute('opacity', bi<ys.length?'1':'0');
    var xs=[];
    for(var c2=0;c2<BOUNDS.length;c2++){
      var bx=W*BOUNDS[c2]/COLN;
      for(var d=1;d<DIV;d++){
        if(Math.abs(bx - W*d/DIV) < 0.75){ xs.push(Math.round(bx)+0.5); break; }
      }
    }
    var need=ys.length*xs.length;
    while(nodes.length<need){
      var n=document.createElementNS('http://www.w3.org/2000/svg','circle');
      n.setAttribute('r','3'); n.setAttribute('opacity','0'); nodeg.appendChild(n);
      nodes.push({el:n,on:false,next:0.5+Math.random()*6,live:false});
    }
    for(var j=0;j<nodes.length;j++){
      if(j<need){
        nodes[j].live=true;
        nodes[j].el.setAttribute('cx', xs[j % xs.length]);
        nodes[j].el.setAttribute('cy', ys[(j / xs.length)|0]);
      } else {
        nodes[j].live=false;
        nodes[j].el.setAttribute('opacity','0');
      }
    }
    for(var m=0;m<dots.length;m++) dots[m].s=P*m/dots.length;
    setSets();
  }

  // A set of candidates never strands one on its own row. Three to a row in the wide
  // layout, so a remainder of one means the last cell takes the full nine columns.
  function setSets(){
    document.querySelectorAll('.set').forEach(function(g){
      var items=Array.prototype.filter.call(g.children, function(c){
        return c.getBoundingClientRect().height > 0;
      });
      items.forEach(function(c){ c.classList.remove('last-item'); });
      var n=items.length;
      if(n>3 && n%3===1) items[n-1].classList.add('last-item');
    });
  }

  // One subpath, sampled at STEP, from arc position a to b.
  function arc(a,b,out){
    if(b<=a) return;
    var q=pt(a), d='M'+q[0].toFixed(1)+','+q[1].toFixed(1);
    for(var s=a+STEP;s<b;s+=STEP){ q=pt(s); d+='L'+q[0].toFixed(1)+','+q[1].toFixed(1); }
    q=pt(b); d+='L'+q[0].toFixed(1)+','+q[1].toFixed(1);
    out.push(d);
  }

  // The window's slice of the page, in page coordinates, with a step of slack at each end so a
  // segment is never short by a sample as it scrolls in.
  function perim(){
    var r=page.getBoundingClientRect();
    var vt=Math.max(0, -r.top - STEP), vb=Math.min(H, -r.top + (window.innerHeight||0) + STEP);
    var out=[];
    if(vt<=0) arc(0, W, out);                       // top edge
    if(vb>=H) arc(W+H, 2*W+H, out);                 // bottom edge
    arc(W+vt, W+vb, out);                           // right edge, the visible run of it
    arc(2*W+H+(H-vb), 2*W+H+(H-vt), out);           // left edge, which runs bottom to top
    return out.join('');
  }

  function draw(dt){
    lnPath.setAttribute('d', perim());

    for(var i=0;i<dots.length;i++){
      var p=dots[i];
      p.s-=PSPD*dt; if(p.s<0) p.s+=P;                         // against the wave
      p.next-=dt;
      if(p.next<=0){
        p.on=!p.on;
        p.next=p.on?(0.4+Math.random()*1.1):(0.1+Math.random()*0.35);
        if(p.on) p.el.setAttribute('fill',COLORS[(Math.random()*COLORS.length)|0]);
      }
      var c=pt(p.s);
      p.el.setAttribute('cx',c[0].toFixed(1));
      p.el.setAttribute('cy',c[1].toFixed(1));
      p.el.setAttribute('opacity',p.on?1:0);
    }
    for(var n=0;n<nodes.length;n++){
      var q2=nodes[n];
      if(!q2.live) continue;
      q2.next-=dt;
      if(q2.next<=0){
        q2.on=!q2.on;
        q2.next=q2.on?(0.1+Math.random()*0.5):(2+Math.random()*9);
        if(q2.on) q2.el.setAttribute('fill',COLORS[(Math.random()*COLORS.length)|0]);
        q2.el.setAttribute('opacity',q2.on?1:0);
      }
    }
    for(var bl2=0;bl2<bandYs.length;bl2++){                 // horizontal rules: ends follow the left/right edge wave
      var by=bandYs[bl2], e=bandLines[bl2]; if(!e) continue;
      e.setAttribute('x1',(-off(2*W+2*H-by)).toFixed(1)); e.setAttribute('y1',by);
      e.setAttribute('x2',(W+off(W+by)).toFixed(1));      e.setAttribute('y2',by);
    }
    for(var ci=0;ci<colLines.length;ci++){                  // vertical lines: ends follow the top/bottom edge wave
      var cl=colLines[ci]; if(cl.xc==null) continue;
      cl.setAttribute('y1',(-off(cl.xc)).toFixed(1));
      cl.setAttribute('y2',(H+off(2*W+H-cl.xc)).toFixed(1));
    }
  }
  function tick(dt){
    layout();
    phase+=k*SPD*dt; pQ+=kQ*SPD*dt;
    draw(dt);
  }
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){ layout(); draw(0); }
  else onTick(tick);
})();

// Each link carries a signal point at the end of its underline. It behaves like the perimeter

// point: a solid accent dot at the terminus. It used to blink the six the way the perimeter points do,

// but a page carrying many links then had a dozen of them flickering at once, which is what the eye

// goes to instead of the text — so the dot holds still and the colour is left to the CSS default

// (--dot-color/--dot-op are no longer set, and background falls back to var(--accent)). Motion is kept

// for hover alone: the point travels backwards from the terminus — leftward along the line — via

// --dot-x, riding the wave. Under reduced motion nothing moves at all.

(function(){
  var TSPD=55, DOT=6, WSPD=72, wsx=0;                    // dot px/s (right->left); dot dia; wave px/s (left->right)
  function links(){ return document.querySelectorAll('.page a'); }
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // The hover waveform, generated here so amplitude/frequency are tunable — a sine that quantises to square in
  // stretches, like the perimeter. The SAME samples build the mask SVG and place the dot, so they never drift.
  var BAND=10, CY=BAND/2, AMP=3.5, LAM=45, LAM_Q=360;   // band px, centre, amplitude px, wavelength px, envelope px
  var WAVE=[];
  for(var wx=0; wx<=360; wx+=2){
    var env=Math.sin(2*Math.PI*wx/LAM_Q), base=Math.sin(2*Math.PI*wx/LAM);
    var v=env>0 ? (base>0?1:base<0?-1:0) : base;          // square where the envelope is high, else sine
    WAVE.push(+(CY - AMP*v).toFixed(3));
  }
  (function(){                                            // paint the generated wave into --wave + set the band height
    var d='M0,'+WAVE[0]; for(var i=1;i<WAVE.length;i++) d+=' L'+(i*2)+','+WAVE[i];
    var svg="<svg xmlns='http://www.w3.org/2000/svg' width='360' height='"+BAND+"' viewBox='0 0 360 "+BAND+"' preserveAspectRatio='none'><path d='"+d+"' fill='none' stroke='#fff' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'/></svg>";
    var uri='url("data:image/svg+xml,'+encodeURIComponent(svg)+'")';
    document.querySelectorAll('.page a').forEach(function(el){ el.style.setProperty('--wave',uri); el.style.setProperty('--u-band',BAND+'px'); });
  })();
  function waveY(c){                                     // stroke y at mask coord c (px), wrapped, interpolated
    c=((c%360)+360)%360; var f=c/2, i=Math.floor(f), t=f-i;
    return WAVE[i]+(WAVE[(i+1)%WAVE.length]-WAVE[i])*t;
  }
  var state=new WeakMap(), active=false;
  function tick(dt){
    var any=!!document.querySelector('.page a:hover');
    if(!any && !active) return;                 // no link under the pointer: CSS holds the rest state
    active=any;
    wsx=(wsx + WSPD*dt) % 360;                                          // the wave scrolls left -> right
    links().forEach(function(a){
      var s=state.get(a);
      if(!s){ s={x:0,hover:false}; state.set(a,s); }
      var g=LINKGEOM.get(a);
      if(g && a.matches(':hover')){
        // Start at the terminus (its rest position) and travel backwards — leftward — riding the
        // wave's up/down.
        if(!s.hover){ s.hover=true; s.x=0; }
        var len=Math.max(1, g.term - g.uLeft);
        s.x=(s.x + TSPD*dt) % len;
        var cx=g.term - s.x;                                            // dot centre, anchor coords
        a.style.setProperty('--dot-x', (cx - DOT/2).toFixed(1)+'px');
        a.style.setProperty('--wsx', wsx.toFixed(1)+'px');
        a.style.setProperty('--dot-y', (waveY((cx - g.uLeft) - wsx) - CY).toFixed(2)+'px');  // sit on the stroke
      } else if(s.hover){                                                // back to rest: park at the terminus
        s.hover=false; s.x=0;
        a.style.removeProperty('--dot-x'); a.style.removeProperty('--dot-y');
      }
    });
  }
  onTick(tick);
})();

// Section 05: a long, live run of the signal — the same sine→square wave the border carries, drawn across

// the full width, with a point travelling it the other way and blinking the six.

(function(){
  var svg=document.getElementById('sig-wave'); if(!svg) return;
  var poly=svg.querySelector('polyline'), dot=svg.querySelector('circle');
  var COLORS=PALETTE.map(function(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); });
  var H=34, CY=H/2, AMP=11, LAM=104, LAM_Q=560, SPD=90, PSPD=55, STEP=5;
  var k=2*Math.PI/LAM, kQ=2*Math.PI/LAM_Q, phase=0, pQ=0, ps=0, W=0;
  var on=true, next=0.6+Math.random(), color=COLORS[0];
  function off(s){ var sn=Math.sin(k*s-phase); return AMP*(Math.sin(kQ*s-pQ)>0?(sn>0?1:-1):sn); }
  // On a narrowing resize the point keeps the x it had at the old width, and the svg draws
  // overflow-visible — so it paints outside the page until it walks back into range. Fold it in.
  function size(){ var w=Math.round(svg.clientWidth); if(w && w!==W){ W=w; svg.setAttribute('viewBox','0 0 '+W+' '+H); if(ps>W) ps%=W; } }
  function draw(dt){
    var d=[]; for(var x=0;x<=W;x+=STEP) d.push(x+','+(CY-off(x)).toFixed(1));
    poly.setAttribute('points', d.join(' '));
    ps-=PSPD*dt; if(ps<0) ps+=(W||1);                       // the point runs against the wave
    next-=dt;
    if(next<=0){ on=!on; next=on?(0.5+Math.random()*1.1):(0.12+Math.random()*0.35); if(on) color=COLORS[(Math.random()*COLORS.length)|0]; }
    dot.setAttribute('cx', ps.toFixed(1)); dot.setAttribute('cy',(CY-off(ps)).toFixed(1));
    dot.setAttribute('fill', color); dot.setAttribute('opacity', on?1:0);
  }
  function tick(dt){ size(); phase+=k*SPD*dt; pQ+=kQ*SPD*dt; draw(dt); }
  window.addEventListener('resize', size);
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches){ size(); draw(0); }
  else onTick(tick);
})();

// Section 06: the outline button. On hover its border is drawn live in an SVG — the bottom edge runs the

// sine→square wave, and the left/right edges ride up and down to meet it. A point circles the real border

// starting at the bottom-right and travelling against the wave, blinking the six, like the link point.

(function(){
  var btns=document.querySelectorAll('.btn-outline'); if(!btns.length) return;
  var NS='http://www.w3.org/2000/svg';
  var COLORS=PALETTE.map(function(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); });
  function pick(){ return COLORS[(Math.random()*COLORS.length)|0]; }
  var BAMP=3.5, BLAM=34, BLAM_Q=136, WSPD=64, PSPD=55, STEP=3;   // amp px, wavelength, envelope, wave px/s, point px/s
  function wv(x){ var e=Math.sin(2*Math.PI*x/BLAM_Q), b=Math.sin(2*Math.PI*x/BLAM); return e>0?(b>0?1:b<0?-1:0):b; }
  var items=[];
  btns.forEach(function(b){
    var svg=document.createElementNS(NS,'svg');
    svg.setAttribute('class','btn-frame'); svg.setAttribute('aria-hidden','true');
    if(b.closest('[contenteditable="true"]')) svg.setAttribute('contenteditable','false');
    var path=document.createElementNS(NS,'path'); path.setAttribute('fill','none'); path.setAttribute('stroke','currentColor'); path.setAttribute('stroke-width','1');
    var dot=document.createElementNS(NS,'circle'); dot.setAttribute('r','3'); dot.setAttribute('opacity','0');
    svg.appendChild(path); svg.appendChild(dot); b.appendChild(svg);
    items.push({b:b,svg:svg,path:path,dot:dot,hover:false,scroll:0,d:0,on:true,next:0,color:pick()});
  });
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  function tick(dt){
    items.forEach(function(it){
      if(!it.b.matches(':hover')){ if(it.hover){ it.hover=false; it.dot.setAttribute('opacity','0'); } return; }
      var W=it.b.offsetWidth, H=it.b.offsetHeight;
      it.svg.setAttribute('viewBox','0 0 '+W+' '+H);
      it.scroll+=WSPD*dt;
      var s=it.scroll, yR=H+BAMP*wv(W-s), yL=H+BAMP*wv(0-s);
      var d='M0,0 L'+W+',0 L'+W.toFixed(1)+','+yR.toFixed(1);   // top, then right edge down to the wave
      for(var x=W; x>=0; x-=STEP) d+=' L'+x.toFixed(1)+','+(H+BAMP*wv(x-s)).toFixed(1);   // the bottom wave
      d+=' L0,'+yL.toFixed(1)+' L0,0 Z';                        // left edge up to the wave, close the top
      it.path.setAttribute('d',d);
      if(!it.hover){ it.hover=true; it.color=pick(); it.on=true; it.next=0.5+Math.random(); it.d=W+yR; }  // begin at the bottom-right
      it.d+=PSPD*dt;                                            // clockwise = against the rightward wave
      it.next-=dt;
      if(it.next<=0){ it.on=!it.on; it.next=it.on?(0.5+Math.random()):(0.12+Math.random()*0.35); if(it.on) it.color=pick(); }
      var L=it.path.getTotalLength(), p=it.path.getPointAtLength(it.d % L);
      it.dot.setAttribute('cx',p.x.toFixed(1)); it.dot.setAttribute('cy',p.y.toFixed(1));
      it.dot.setAttribute('fill',it.color); it.dot.setAttribute('opacity',it.on?1:0);
    });
  }
  onTick(tick);
})();

// Type specs: let the "Google Sans Flex" specimen exercise its own axes — weight, width and roundness

// drift on separate sine clocks so the variable font shows what it does. opsz stays automatic.

(function(){
  var el=document.querySelector('.face'); if(!el) return;
  if(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var t=0;
  function tick(dt){
    t+=dt;
    var wght=Math.round(500+400*Math.sin(t*0.85));           // 100..900
    var wdth=Math.round(103+43*Math.sin(t*0.55+1.4));        // 60..146
    var rond=Math.round(50+50*Math.sin(t*1.25+2.7));         // 0..100
    el.style.fontVariationSettings='"wght" '+wght+',"wdth" '+wdth+',"ROND" '+rond;
  }
  onTick(tick);
})();

// Saves the current edited state of the page as a dated HTML file.

// --- Layout hooks -------------------------------------------------------------
// Shared code must never call a page's function directly: core.js loads first, so the
// page function would not exist yet. Instead a page pushes its own work onto RELAYOUT
// and this runs it, coalesced into one frame.
// Every link leaves the page it is on, so it opens in its own tab. In-page anchors and mailto:
// are left alone — a new tab for either is an empty tab.
function targetLinks(){
  document.querySelectorAll('a[href]').forEach(function(a){
    var h=a.getAttribute('href');
    if(!h || h.charAt(0)==='#' || /^mailto:/i.test(h) || a.hasAttribute('data-self')) return;
    a.target='_blank';
    a.rel='noopener';
  });
}
targetLinks();

var RELAYOUT = [fitHeadings, targetLinks];
var pending = false;
function refresh(){
  if(pending) return;
  pending = true;
  requestAnimationFrame(function(){
    pending = false;
    for(var i=0;i<RELAYOUT.length;i++){ try{ RELAYOUT[i](); }catch(e){} }
  });
}
window.addEventListener('load', refresh);
window.addEventListener('resize', refresh);
document.addEventListener('input', refresh);

// The wordmark is held at opacity 0 until the variable font has arrived, so the AIFD
// lockup never flashes in a fallback face. Four documents used to lack this and their
// wordmark simply never appeared once the CSS moved into core.css.
function markFontsReady(){ document.documentElement.classList.add('fonts-ready'); }
if(document.fonts && document.fonts.ready){
  document.fonts.ready.then(function(){ refresh(); measureLinks(); markFontsReady(); });
}
setTimeout(markFontsReady, 1800);   // fallback if the font never resolves
// A heading's column changes width when the field collapses even if the window did not.
if(window.ResizeObserver){ var ro = new ResizeObserver(refresh); var pg = document.querySelector('.page'); if(pg) ro.observe(pg); }

function toggleCols(){
  var r = document.documentElement;
  var off = r.getAttribute('data-cols') === 'off';
  r.setAttribute('data-cols', off ? 'on' : 'off');
  setBtnLabel(document.getElementById('cols-btn'), off ? 'Columns off' : 'Columns on');
}
function toggleEdit(){
  var m = document.querySelector('.page');
  if(!m) return;
  var on = m.getAttribute('contenteditable') === 'true';
  m.setAttribute('contenteditable', on ? 'false' : 'true');
  setBtnLabel(document.getElementById('edit-btn'), on ? 'Edit on' : 'Edit off');
}

document.addEventListener('keydown', function(e){
  if(!PUBLIC && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's'){ e.preventDefault(); saveDoc(); }
});

function saveDoc(){
  var clone = document.documentElement.cloneNode(true);
  clone.querySelectorAll('[data-nosave]').forEach(function(el){ el.remove(); });   // drop the toolbar
  clone.style.removeProperty('--accent');                                          // re-drawn on open
  clone.querySelectorAll('h1, .fit').forEach(function(el){ el.style.fontSize = ''; });  // recomputed on open
  clone.querySelectorAll('.page a').forEach(function(el){ ['--dot-op','--dot-color','--u-left','--dot-x','--dot-y','--wsx','--wave','--u-band'].forEach(function(p){ el.style.removeProperty(p); }); });  // link decoration re-measured on open
  clone.querySelectorAll('.btn-frame').forEach(function(el){ el.remove(); });                     // hover borders re-drawn on open
  clone.querySelectorAll('.face').forEach(function(el){ el.style.removeProperty('font-variation-settings'); });  // axes re-animated on open
  // Rebuild the field SVGs to their pristine markup so a save never bakes in (or duplicates)
  // the JS-generated band rules, dots and nodes; the script repopulates them on open.
  var frame=clone.querySelector('.frame');
  if(frame) frame.innerHTML='<polyline id="frame-line" fill="none" stroke="currentColor" stroke-width="1" points="0,0"></polyline><g id="frame-dots"></g>';
  var cols=clone.querySelector('.cols');
  if(cols) cols.innerHTML='<defs id="col-grads"></defs><g id="col-lines"></g>';
  var html = '<!DOCTYPE html>\n' + clone.outerHTML;
  var blob = new Blob([html], {type:'text/html'});
  var d = new Date();
  var stamp = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  var name = (document.documentElement.getAttribute('data-docname') || 'art3041') + '_' + stamp + '.html';
  var toDownloads = function(){
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  // Chrome and Edge can put up a real Save As dialog so the file can be filed where it belongs;
  // anywhere else, and on a cancelled dialog's error path, it lands in the download folder as before.
  if(!window.showSaveFilePicker){ toDownloads(); return; }
  window.showSaveFilePicker({suggestedName:name,types:[{description:'HTML file',accept:{'text/html':['.html']}}]})
    .then(function(h){ return h.createWritable(); })
    .then(function(w){ return w.write(blob).then(function(){ return w.close(); }); })
    .catch(function(e){ if(!e || e.name !== 'AbortError') toDownloads(); });
}

function toggleTheme(){
  setTheme(document.documentElement.getAttribute('data-theme')==='dark' ? 'light' : 'dark');
}

setTheme('light');

import '@fontsource-variable/noto-sans-arabic';
import './style.css';
import { CollegeScene } from './scene';
import { rooms, pois, floors, findRoute, floorFootprint, type Room, type Floor, type Point } from './data';
import { icon } from './icons';

type Segment = { floor: Floor; points: Point[] };
type Kind = Room['kind'] | 'all';
const state = {
  mode: 'exterior' as 'exterior' | 'interior', floor: 0 as Floor,
  dimension: '3d' as '2d' | '3d', query: '', category: 'all' as Kind,
  selected: null as string | null, route: null as Segment[] | null,
  accessible: true, collapsed: false, fallback: false,
};
const categories: Record<Room['kind'], { name: string; color: string }> = {
  lab: { name: 'معامل الحاسب', color: '#6faeb9' },
  classroom: { name: 'القاعات التدريبية', color: '#a3bb8a' },
  office: { name: 'المكاتب', color: '#7b92ab' },
  meeting: { name: 'قاعات الاجتماعات', color: '#b9a5c4' },
  library: { name: 'المكتبة', color: '#b49f87' },
  service: { name: 'الخدمات', color: '#78a99b' },
  sports: { name: 'المرافق الرياضية', color: '#bda2c1' },
  theater: { name: 'المسرح', color: '#bd9b83' },
};
const floorName = (floor: Floor) => floors.find(f => f.id === floor)!.name;
const esc = (text: string) => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;

$('#app').innerHTML = `
  <div class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="كليتي الذكية، العودة للمبنى الخارجي">
        <span class="logo-mark">${icon('building')}</span>
        <span><strong>كليتي الذكية<span class="brand-dot">.</span></strong><small>SMART COLLEGE</small></span>
      </a>
      <nav class="header-nav" aria-label="التنقل الرئيسي">
        <button class="nav-tab active" id="explore-tab">استكشفي الكلية</button>
        <button class="nav-tab" id="directory-tab">دليل المرافق</button>
        <button class="nav-tab" id="about-tab">عن المشروع</button>
      </nav>
      <div class="header-actions"><span class="live-status"><i></i> خريطة تفاعلية</span><button class="help-button" id="help-button">${icon('help')}<span>دليل الاستخدام</span></button></div>
    </header>
    <main class="workspace">
      <aside class="sidebar" aria-label="البحث والملاحة">
        <button class="sidebar-collapse" aria-label="طي لوحة البحث" aria-expanded="true"> <span class="sheet-handle"></span>${icon('down')}</button>
        <div class="sidebar-scroll">
          <div class="sidebar-top"><span class="eyebrow"><i></i> دليلك داخل الكلية</span><h1 class="sidebar-title">كل وجهة،<br>أقرب إليك<span>.</span></h1><p class="sidebar-description">من أول خطوة إلى وجهتك.<br>استكشفي المبنى، واعثري على طريقك بسهولة.</p></div>
          <div class="mode-tabs" role="group" aria-label="منطقة العرض"><button class="mode-tab active" data-mode="exterior">${icon('building')} المبنى الخارجي</button><button class="mode-tab" data-mode="interior">${icon('layers')} داخل المبنى</button></div>
          <label class="search-box" for="destination-search"><span class="search-icon">${icon('search')}</span><input id="destination-search" type="search" placeholder="ابحثي عن معمل، مكتب، أو قاعة…" autocomplete="off" aria-label="البحث عن وجهة"><button type="button" class="search-clear" hidden aria-label="مسح البحث">${icon('close')}</button><span class="search-key" aria-hidden="true">⌘ K</span></label>
          <div class="category-chips" aria-label="نوع المرفق"><button class="category-chip active" data-category="all">الكل</button><button class="category-chip" data-category="lab">المعامل</button><button class="category-chip" data-category="classroom">القاعات</button><button class="category-chip" data-category="office">المكاتب</button><button class="category-chip" data-category="service">الخدمات</button></div>
          <div id="sidebar-content"></div>
        </div>
        <footer class="sidebar-footer"><span class="source-icon">${icon('check')}</span><div><strong>ثلاثة أدوار. وجهات لا تُعد.</strong><p class="plan-note">التوزيع الداخلي مستند إلى المخطط المرفق</p></div><button id="source-info" class="icon-button" aria-label="معلومات المخطط">${icon('info')}</button></footer>
      </aside>
      <section class="map-area" aria-label="خريطة الكلية التفاعلية">
        <div id="canvas-host" class="canvas-host" role="region" aria-label="نموذج الكلية ثلاثي الأبعاد، استخدمي لوحة البحث وأزرار العرض للتنقل"></div>
        <div class="map-heading"><div class="map-breadcrumb">الحرم الجامعي <span>/</span> المبنى الرئيسي</div><h2>المبنى الرئيسي <span class="map-mode-badge" id="map-mode-badge">عرض خارجي</span></h2><div class="map-instruction">${icon('compass')} <span id="map-instruction">اسحبي للتدوير، ومرّري للتكبير</span></div></div>
        <div class="map-top-left"><div class="view-switch" role="group" aria-label="أبعاد الخريطة"><button data-dimension="2d" aria-pressed="false">2D</button><button class="active" data-dimension="3d" aria-pressed="true">${icon('layers')} 3D</button></div><button class="compass-button" aria-label="إعادة اتجاه الخريطة إلى الشمال"><span>N</span>${icon('compass')}</button></div>
        <div class="floor-switch" aria-label="اختيار الدور"><span class="floor-switch-title">الأدوار</span>${[...floors].reverse().map(f => `<button class="floor-button" data-floor="${f.id}" aria-label="عرض ${f.name}" aria-pressed="false"><b>${f.id === 0 ? 'G' : f.id}</b><span>${f.shortName}</span></button>`).join('')}</div>
        <div class="map-tools" aria-label="أدوات الخريطة"><button data-tool="zoom-in" aria-label="تكبير">${icon('plus')}</button><button data-tool="zoom-out" aria-label="تصغير">${icon('minus')}</button><span></span><button data-tool="rotate" aria-label="تدوير الخريطة">${icon('rotate')}</button><button data-tool="reset" aria-label="إعادة ضبط العرض">${icon('reset')}</button></div>
        <div class="map-bottom-card" id="welcome-card"><span class="building-tag">${icon('leaf')} مساحة للتعلّم. طريق للاكتشاف.</span><h2 class="feature-heading">أهلًا بكِ في كليتك<span>.</span></h2><p class="feature-description">ابدئي من المدخل الرئيسي، واستكشفي كل دور<br>بتجربة أقرب إلى المكان الحقيقي.</p><button class="primary-button" id="enter-building">ادخلي المبنى ${icon('arrow')}</button><span class="welcome-floor-count">${icon('layers')} ٣ أدوار متصلة</span></div>
        <div class="legend" id="interior-legend" hidden><span><i style="background:#9bbad5"></i> المعامل / المكاتب</span><span><i style="background:#c3d6a3"></i> القاعات</span><span><i style="background:#3688f8"></i> مسار الوصول</span></div>
        <div class="map-footer"><span>SMART COLLEGE</span><i></i> <span>واجهة خارجية تصورية · مخطط داخلي تقريبي</span></div>
        <button class="back-button map-back" id="exit-building" hidden>${icon('back')} العودة إلى الخارج</button>
      </section>
    </main>
  </div>
  <div id="modal-root"></div>
  <div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
`;

let scene: CollegeScene | null = null;
let fallbackZoom = 1;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string) {
  $('#toast').textContent = message;
  $('#toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500);
}

function updateView() {
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.classList.toggle('active', button.dataset.mode === state.mode));
  document.querySelectorAll<HTMLButtonElement>('[data-dimension]').forEach(button => {
    const active = button.dataset.dimension === state.dimension;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
    button.disabled = state.fallback && button.dataset.dimension === '3d';
  });
  document.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach(button => {
    const active = state.mode === 'interior' && Number(button.dataset.floor) === state.floor;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
  $('#welcome-card').hidden = state.mode === 'interior';
  $('#interior-legend').hidden = state.mode === 'exterior';
  $('#exit-building').hidden = state.mode === 'exterior';
  $('#map-mode-badge').textContent = state.mode === 'exterior' ? 'عرض خارجي' : floorName(state.floor);
  $('#map-instruction').textContent = state.dimension === '3d' ? 'اسحبي للتدوير، ومرّري للتكبير' : 'اسحبي لتحريك الخريطة، ومرّري للتكبير';
  if (!state.fallback && scene) {
    scene.setView(state.mode, state.floor, state.dimension);
    scene.setSelection(state.selected); scene.setRoute(state.route);
  } else if (state.fallback) renderFallback();
  renderSidebar();
}

function enterBuilding() {
  state.mode = 'interior'; state.floor = 0; state.selected = null; state.route = null;
  state.query = ''; $<HTMLInputElement>('#destination-search').value = ''; updateView();
  toast('أنتِ عند المدخل الرئيسي. اختاري وجهتك أو ابحثي عنها.');
}
function showExterior() {
  state.mode = 'exterior'; state.selected = null; state.route = null; state.query = '';
  $<HTMLInputElement>('#destination-search').value = ''; updateView();
}
function selectDestination(id: string) {
  const room = rooms.find(r => r.id === id);
  if (!room) return;
  state.selected = id; state.mode = 'interior'; state.floor = room.floor; state.route = null;
  updateView();
}
function selectPOI(id: string) {
  const poi = pois.find(p => p.id === id);
  if (!poi) return;
  if (poi.kind === 'entrance') { enterBuilding(); return; }
  openModal(`<div class="poi-detail"><span class="destination-icon ${poi.kind}">${icon(poi.kind)}</span><h3>${esc(poi.name)}</h3><p>${esc(poi.description)}</p><span class="detail-meta">${floorName(poi.floor)}</span>${poi.kind === 'elevator' || poi.kind === 'stairs' ? `<div class="poi-floors">${floors.map(f => `<button class="secondary-button" data-poi-floor="${f.id}">${f.name}</button>`).join('')}</div>` : ''}</div>`, 'تفاصيل المرفق');
  document.querySelectorAll<HTMLElement>('[data-poi-floor]').forEach(b => b.addEventListener('click', () => { closeModal(); state.floor = Number(b.dataset.poiFloor) as Floor; state.mode = 'interior'; updateView(); }));
}

function normalize(text: string) { return text.normalize('NFKD').replace(/[\u064B-\u065F]/g, '').replace(/[أإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').toLowerCase(); }
function resultRooms(): Room[] {
  let list = rooms.filter(room => (state.category === 'all' || room.kind === state.category) && (!state.query || normalize(room.name + ' ' + room.description + ' ' + floorName(room.floor)).includes(normalize(state.query))));
  if (!state.query && state.category === 'all') {
    if (state.mode === 'interior') list = list.filter(r => r.floor === state.floor);
    else {
      const featured = ['lab', 'library', 'office', 'meeting', 'classroom', 'sports'] as const;
      list = featured.map(kind => list.find(room => room.kind === kind)).filter((room): room is Room => !!room);
    }
  }
  return list;
}
function destinationCard(room: Room): string {
  return `<button class="destination-card" data-room="${esc(room.id)}" style="--category-color:${categories[room.kind].color}"><span class="destination-icon ${room.kind}">${icon(room.kind)}</span><span class="destination-content"><strong>${esc(room.name)}</strong><span>${floorName(room.floor)} <i>·</i> ${categories[room.kind].name}</span></span><span class="destination-arrow">${icon('chevron')}</span></button>`;
}

function renderSidebar() {
  $('.search-clear').hidden = !state.query;
  document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => button.classList.toggle('active', button.dataset.category === state.category));
  const selected = rooms.find(r => r.id === state.selected);
  if (selected) {
    const segments = state.route;
    $('#sidebar-content').innerHTML = `<div class="detail-panel">
      <button class="back-button" id="back-to-results">${icon('back')} جميع الوجهات</button>
      <div class="detail-heading"><span class="destination-icon ${selected.kind}" style="--category-color:${categories[selected.kind].color}">${icon(selected.kind)}</span><span class="detail-category">${categories[selected.kind].name}</span></div>
      <h2 class="detail-title">${esc(selected.name)}</h2><span class="detail-meta">${icon('layers')} ${floorName(selected.floor)} <span>·</span> ${icon('pin')} المبنى الرئيسي</span>
      <p class="detail-description">${esc(selected.description)}</p>
      <div class="route-start"><span class="route-dot"></span><div><small>نقطة الانطلاق</small><strong>المدخل الرئيسي · الدور الأرضي</strong></div></div>
      <label class="route-options"><input id="accessible-route" type="checkbox" ${state.accessible ? 'checked' : ''}>${icon('accessibility')} استخدام المصعد بين الأدوار</label>
      ${segments ? `<div class="route-summary"><div class="route-summary-heading">${icon('route')} <strong>مسارك جاهز</strong><span>${segments.length > 1 ? 'بين الأدوار' : 'نفس الدور'}</span></div><ol class="route-steps"><li>ابدئي من المدخل الرئيسي</li>${selected.floor > 0 ? `<li>اتبعي المسار الأزرق إلى ${state.accessible ? 'المصعد' : 'الدرج'}<br><small>انتقلي إلى ${floorName(selected.floor)}</small></li>` : ''}<li>اتبعي الممر إلى ${esc(selected.name)}</li></ol><div class="route-floor-buttons">${segments.map(segment => `<button data-route-floor="${segment.floor}" class="${state.floor === segment.floor ? 'active' : ''}">${floorName(segment.floor)}</button>`).join('')}</div><p class="route-disclaimer">مسار إرشادي على نموذج تقريبي؛ لا تُعرض مسافات لعدم وجود مقياس رسم.</p></div><button class="secondary-button clear-route-button" id="clear-route">${icon('close')} إلغاء المسار</button>` : `<button class="primary-button route-button" id="navigate-button">${icon('route')} أرشديني إلى هنا ${icon('arrow')}</button>`}
    </div>`;
    $('#back-to-results').addEventListener('click', () => { state.selected = null; state.route = null; updateView(); });
    $('#accessible-route').addEventListener('change', event => {
      state.accessible = (event.target as HTMLInputElement).checked;
      if (state.route) { state.route = findRoute(selected, undefined, state.accessible); updateView(); }
    });
    const navigate = document.getElementById('navigate-button');
    navigate?.addEventListener('click', () => {
      state.route = findRoute(selected, undefined, state.accessible); state.floor = 0;
      updateView(); toast('اتبعي المسار الأزرق. يمكنكِ عرض مسار كل دور من لوحة التوجيه.');
    });
    document.getElementById('clear-route')?.addEventListener('click', () => { state.route = null; updateView(); });
    document.querySelectorAll<HTMLButtonElement>('[data-route-floor]').forEach(button => button.addEventListener('click', () => { state.floor = Number(button.dataset.routeFloor) as Floor; updateView(); }));
    return;
  }
  const list = resultRooms();
  $('#sidebar-content').innerHTML = `<div class="section-heading"><h2>${state.query ? 'نتائج البحث' : state.mode === 'exterior' && state.category === 'all' ? 'وجهات تستحق الاكتشاف' : 'مرافق ' + (state.category === 'all' ? floorName(state.floor) : categories[state.category].name)}</h2><span class="results-count">${list.length} وجهات</span></div><div class="destination-list">${list.length ? list.map(destinationCard).join('') : `<div class="empty-state">${icon('search')}<h3>لم نعثر على هذه الوجهة</h3><p>جرّبي اسمًا آخر مثل «معمل» أو «مكتبة»،<br>أو اختاري نوعًا آخر من المرافق.</p><button class="secondary-button" id="reset-search">عرض كل الوجهات</button></div>`}</div>${state.mode === 'exterior' && !state.query && state.category === 'all' ? `<button class="all-facilities" id="all-facilities">عرض جميع مرافق الكلية <span>${rooms.length}</span> ${icon('arrow')}</button><div class="tip-card">${icon('pin')}<p><strong>كل شيء يبدأ بخطوة</strong><br>اضغطي على باب المبنى أو «ادخلي المبنى» لبدء جولتك.</p></div>` : ''}`;
  document.querySelectorAll<HTMLButtonElement>('[data-room]').forEach(button => button.addEventListener('click', () => selectDestination(button.dataset.room!)));
  document.getElementById('all-facilities')?.addEventListener('click', showDirectory);
  document.getElementById('reset-search')?.addEventListener('click', () => { state.query = ''; state.category = 'all'; $<HTMLInputElement>('#destination-search').value = ''; renderSidebar(); });
}

let previousFocus: HTMLElement | null = null;
function openModal(content: string, title: string) {
  previousFocus = document.activeElement as HTMLElement;
  $('#modal-root').innerHTML = `<div class="modal-shell"><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-header"><h2 id="modal-title">${title}</h2><button class="modal-close icon-button" aria-label="إغلاق">${icon('close')}</button></header><div class="modal-content">${content}</div></section></div>`;
  $('.modal-close').addEventListener('click', closeModal);
  $('.modal-shell').addEventListener('click', event => { if (event.target === event.currentTarget) closeModal(); });
  $('.modal-close').focus();
}
function closeModal() { $('#modal-root').innerHTML = ''; previousFocus?.focus(); }
function showDirectory() {
  openModal(`<p class="modal-intro">وجهتك في مكان واحد. اختاري أي مرفق لعرضه على الخريطة وبدء التوجيه.</p><div class="directory-grid">${floors.map(floor => `<section class="directory-floor"><h3>${icon('layers')} ${floor.name}<span>${rooms.filter(r => r.floor === floor.id).length} مرافق</span></h3>${rooms.filter(r => r.floor === floor.id).map(destinationCard).join('')}</section>`).join('')}</div>`, 'دليل مرافق الكلية');
  document.querySelectorAll<HTMLButtonElement>('.modal [data-room]').forEach(button => button.addEventListener('click', () => { closeModal(); selectDestination(button.dataset.room!); }));
}
function showAbout() {
  openModal(`<div class="about-hero">${icon('building')}<span class="eyebrow">SMART COLLEGE</span><h3>المكان مألوف.<br>الوصول أسهل.</h3><p>كليتي الذكية خريطة تفاعلية تربط المبنى الخارجي بالمرافق الداخلية، وتساعدكِ على اكتشاف وجهتك عبر الأدوار الثلاثة.</p></div><div class="about-note"><h3>${icon('info')} مصدر النموذج ودقته</h3><p>أعيد رسم توزيع الأدوار برمجيًا اعتمادًا على ملف «المخطط (1).pdf». ألوان الغرف ومواقعها مستندة إلى المخطط، أما الأبعاد والارتفاعات فهي تقريبية لعدم توفر قياسات هندسية.</p><p>الواجهة الخارجية وموضع باب الدخول تصوريان إلى أن تتوفر صورة المبنى والمدخل. أرقام الغرف المكررة أضيفت للتمييز في هذا النموذج، وليست أرقامًا رسمية للكلية.</p><a class="secondary-button source-link" href="${import.meta.env.BASE_URL}college-plan.pdf" target="_blank" rel="noopener">${icon('download')} عرض المخطط الأصلي</a></div>`, 'عن كليتي الذكية');
}
function showHelp() {
  openModal(`<p class="modal-intro">ابدئي من الخارج، ثم انتقلي إلى وجهتك في بضع خطوات.</p><ol class="help-steps"><li><span>١</span><div><h3>ادخلي من الباب الرئيسي</h3><p>اضغطي على علامة «المدخل الرئيسي» في المبنى أو زر «ادخلي المبنى».</p></div></li><li><span>٢</span><div><h3>استكشفي الدور</h3><p>اختاري الدور من الأزرار بجانب الخريطة. بدّلي بين 2D و3D، واسحبي للتدوير أو التحريك، واستخدمي + و− للتكبير.</p></div></li><li><span>٣</span><div><h3>ابحثي عن وجهتك</h3><p>اكتبي اسم المرفق، أو اختاريه من دليل المرافق، ثم اضغطي على «أرشديني إلى هنا».</p></div></li><li><span>٤</span><div><h3>اتبعي المسار الأزرق</h3><p>المسار يبدأ من المدخل الرئيسي. للوجهات في دور آخر، اختاري المصعد أو الدرج واعرضي كل جزء من المسار بأزرار الأدوار في لوحة التوجيه.</p></div></li></ol>`, 'دليل الاستخدام');
}

function renderFallback() {
  // A functional vector map stays available when the browser cannot create a WebGL context.
  if (state.mode === 'exterior') {
    $('#canvas-host').innerHTML = `<div class="fallback-map"><svg viewBox="-42 -43 84 90" aria-label="مخطط حدود المبنى"><polygon points="${floorFootprint.map(p => `${p.x},${p.z}`).join(' ')}" fill="#d7e2d0" stroke="#55765d" stroke-width=".7"/><path d="M28 -7h7" stroke="#3989ec" stroke-width="2"/><text x="0" y="20" text-anchor="middle" font-size="3" fill="#164c3d">المبنى الرئيسي</text></svg><button class="fallback-entrance primary-button">${icon('entrance')} المدخل الرئيسي ${icon('arrow')}</button><p class="fallback-notice">العرض ثنائي الأبعاد متاح لأن المتصفح لا يدعم WebGL.</p></div>`;
    $('.fallback-entrance').addEventListener('click', enterBuilding); return;
  }
  const activeRooms = rooms.filter(r => r.floor === state.floor);
  const activeRoute = state.route?.find(s => s.floor === state.floor);
  const svg = `<svg viewBox="-40 -42 80 86" aria-label="خريطة ${floorName(state.floor)}"><g transform="scale(${fallbackZoom})"><polygon points="${floorFootprint.map(p => `${p.x},${p.z}`).join(' ')}" fill="#f7f4eb" stroke="#99a797" stroke-width=".4"/>${activeRooms.map(room => `<g data-fallback-room="${room.id}" role="button" tabindex="0" aria-label="${esc(room.name)}"><${room.polygon ? 'polygon' : 'rect'} ${room.polygon ? `points="${room.polygon.map(p => `${p.x},${p.z}`).join(' ')}"` : `x="${room.x - room.width / 2}" y="${room.z - room.depth / 2}" width="${room.width}" height="${room.depth}"`} fill="${room.color}" stroke="${room.id === state.selected ? '#2e83f6' : '#95a392'}" stroke-width="${room.id === state.selected ? '.8' : '.3'}"/><text x="${room.x}" y="${room.z}" text-anchor="middle" dominant-baseline="middle" font-size="1.35" fill="#284336">${esc(room.name)}</text></g>`).join('')}${pois.filter(p => p.floor === state.floor).map(p => `<g role="button" tabindex="0" data-fallback-poi="${p.id}" aria-label="${esc(p.name)}"><circle cx="${p.x}" cy="${p.z}" r="1.3" fill="${p.kind === 'elevator' ? '#164c3d' : '#81968a'}"/><text x="${p.x}" y="${p.z + 2.4}" font-size="1.3" text-anchor="middle">${esc(p.name)}</text></g>`).join('')}${activeRoute ? `<polyline points="${activeRoute.points.map(p => `${p.x},${p.z}`).join(' ')}" fill="none" stroke="#3385f6" stroke-width=".9" stroke-linecap="round" stroke-linejoin="round"/>` : ''}<circle cx="21" cy="-7" r="1" fill="#3385f6"/></g></svg>`;
  $('#canvas-host').innerHTML = `<div class="fallback-map">${svg}<p class="fallback-notice">عرض 2D · WebGL غير متاح في هذا المتصفح</p></div>`;
  document.querySelectorAll<SVGElement>('[data-fallback-room], [data-fallback-poi]').forEach(element => {
    const select = () => element.dataset.fallbackRoom ? selectDestination(element.dataset.fallbackRoom) : selectPOI(element.dataset.fallbackPoi!);
    element.addEventListener('click', select); element.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(); } });
  });
}

$('#enter-building').addEventListener('click', enterBuilding);
$('#exit-building').addEventListener('click', showExterior);
$('.brand').addEventListener('click', event => { event.preventDefault(); showExterior(); });
$('#explore-tab').addEventListener('click', () => { closeModal(); showExterior(); });
$('#directory-tab').addEventListener('click', showDirectory);
$('#about-tab').addEventListener('click', showAbout);
$('#source-info').addEventListener('click', showAbout);
$('#help-button').addEventListener('click', showHelp);
$('.compass-button').addEventListener('click', () => scene?.reset());
$('#destination-search').addEventListener('input', event => { state.query = (event.target as HTMLInputElement).value; state.selected = null; state.route = null; scene?.setSelection(null); scene?.setRoute(null); renderSidebar(); if (state.fallback) renderFallback(); });
$('.search-clear').addEventListener('click', () => { state.query = ''; $<HTMLInputElement>('#destination-search').value = ''; renderSidebar(); $('#destination-search').focus(); });
document.querySelectorAll<HTMLButtonElement>('[data-category]').forEach(button => button.addEventListener('click', () => { state.category = button.dataset.category as Kind; state.selected = null; state.route = null; scene?.setSelection(null); scene?.setRoute(null); renderSidebar(); if (state.fallback) renderFallback(); }));
document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach(button => button.addEventListener('click', () => button.dataset.mode === 'exterior' ? showExterior() : enterBuilding()));
document.querySelectorAll<HTMLButtonElement>('[data-dimension]').forEach(button => button.addEventListener('click', () => { state.dimension = button.dataset.dimension as '2d' | '3d'; updateView(); }));
document.querySelectorAll<HTMLButtonElement>('[data-floor]').forEach(button => button.addEventListener('click', () => { state.floor = Number(button.dataset.floor) as Floor; state.mode = 'interior'; updateView(); }));
document.querySelectorAll<HTMLButtonElement>('[data-tool]').forEach(button => button.addEventListener('click', () => {
  switch (button.dataset.tool) {
    case 'zoom-in': state.fallback ? (fallbackZoom = Math.min(fallbackZoom + .15, 1.8), renderFallback()) : scene?.zoom(1); break;
    case 'zoom-out': state.fallback ? (fallbackZoom = Math.max(fallbackZoom - .15, .6), renderFallback()) : scene?.zoom(-1); break;
    case 'rotate': if (state.dimension === '2d') toast('التدوير متاح في العرض ثلاثي الأبعاد.'); else scene?.rotate(); break;
    case 'reset': if (state.fallback) { fallbackZoom = 1; renderFallback(); } else scene?.reset(); break;
  }
}));
$('.sidebar-collapse').addEventListener('click', () => {
  state.collapsed = !state.collapsed; $('.sidebar').classList.toggle('collapsed', state.collapsed);
  $('.sidebar-collapse').setAttribute('aria-expanded', String(!state.collapsed));
  $('.sidebar-collapse').setAttribute('aria-label', state.collapsed ? 'توسيع لوحة البحث' : 'طي لوحة البحث');
});
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if (state.collapsed) {
      state.collapsed = false; $('.sidebar').classList.remove('collapsed');
      $('.sidebar-collapse').setAttribute('aria-expanded', 'true');
      $('.sidebar-collapse').setAttribute('aria-label', 'طي لوحة البحث');
    }
    $('#destination-search').focus();
  }
  if (event.key === 'Escape') closeModal();
  if (event.key === 'Tab' && document.querySelector('.modal')) {
    const focusable = Array.from(document.querySelectorAll<HTMLElement>('.modal button, .modal a, .modal input, .modal [tabindex="0"]'));
    const first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
});

try {
  scene = new CollegeScene($('#canvas-host'), { onEnter: enterBuilding, onSelect: (id, type) => type === 'room' ? selectDestination(id) : selectPOI(id), onError: () => {
    state.fallback = true; state.dimension = '2d';
    queueMicrotask(() => { scene?.dispose(); scene = null; updateView(); });
  } });
} catch {
  state.fallback = true; state.dimension = '2d';
}
updateView();

// Expose non-sensitive state for functional browser checks and assistive integrations.
Object.defineProperty(window, 'smartCollege', { value: {
  get state() { return { ...state }; },
  get facilityCount() { return rooms.length; },
} });

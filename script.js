// ===== 渐变色 Banner 轮播 =====
let currentBanner = 0;
const bannerSlides = document.querySelectorAll('.banner-slide');
const bannerDots = document.querySelectorAll('.banner-dot');
let bannerAutoPlay;

function showBanner(index) {
  if (bannerSlides.length === 0) return;
  if (index >= bannerSlides.length) index = 0;
  if (index < 0) index = bannerSlides.length - 1;
  currentBanner = index;
  bannerSlides.forEach(s => s.classList.remove('active'));
  bannerDots.forEach(d => d.classList.remove('active'));
  bannerSlides[currentBanner].classList.add('active');
  bannerDots[currentBanner].classList.add('active');
}

function changeBanner(dir) {
  showBanner(currentBanner + dir);
  resetBannerAutoPlay();
}

function goToBanner(index) {
  showBanner(index);
  resetBannerAutoPlay();
}

function startBannerAutoPlay() {
  bannerAutoPlay = setInterval(() => showBanner(currentBanner + 1), 4000);
}

function resetBannerAutoPlay() {
  clearInterval(bannerAutoPlay);
  startBannerAutoPlay();
}

if (bannerSlides.length > 0) startBannerAutoPlay();

// ===== 相册配置：替换 src 为你的照片路径，更新 caption =====
const CAROUSEL_PHOTOS = [
  {
    src: 'images/photo1.jpg',
    fallback: 'images/photo1.svg',
    alt: '徐志成相册照片 1',
    caption: '记录日常的光与影 — 占位说明，可改为你的拍摄地点或日期',
  },
  {
    src: 'images/photo2.jpg',
    fallback: 'images/photo2.svg',
    alt: '徐志成相册照片 2',
    caption: '热爱生活，热爱创造 — 替换照片后修改此处说明文字',
  },
];

// ===== 照片轮播 =====
(function initPhotoCarousel() {
  const track = document.getElementById('carouselTrack');
  const dotsContainer = document.getElementById('carouselDots');
  const thumbsContainer = document.getElementById('carouselThumbs');
  const captionEl = document.getElementById('carouselCaption');
  const counterEl = document.getElementById('carouselCounter');
  const viewport = document.getElementById('carouselViewport');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');

  if (!track || !CAROUSEL_PHOTOS.length) return;

  let currentIndex = 0;
  let autoPlayTimer = null;
  let resumeAutoPlayTimer = null;
  let touchStartX = 0;
  let touchDeltaX = 0;
  let isDragging = false;

  CAROUSEL_PHOTOS.forEach((photo, index) => {
    const slide = document.createElement('div');
    slide.className = 'carousel-slide' + (index === 0 ? ' active' : '');
    slide.dataset.index = String(index);

    const img = document.createElement('img');
    img.src = photo.src;
    img.alt = photo.alt;
    img.loading = index === 0 ? 'eager' : 'lazy';
    img.decoding = 'async';
    img.onerror = function onImgError() {
      if (photo.fallback && img.src !== photo.fallback) {
        img.src = photo.fallback;
      }
    };
    slide.appendChild(img);
    track.appendChild(slide);

    const dot = document.createElement('button');
    dot.type = 'button';
    dot.className = 'dot' + (index === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `第 ${index + 1} 张`);
    dot.addEventListener('click', () => goToSlide(index));
    dotsContainer.appendChild(dot);

    const thumb = document.createElement('button');
    thumb.type = 'button';
    thumb.className = 'carousel-thumb' + (index === 0 ? ' active' : '');
    thumb.setAttribute('role', 'tab');
    thumb.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
    thumb.setAttribute('aria-label', photo.caption || `缩略图 ${index + 1}`);

    const thumbImg = document.createElement('img');
    thumbImg.src = photo.src;
    thumbImg.alt = '';
    thumbImg.onerror = function onThumbError() {
      if (photo.fallback && thumbImg.src !== photo.fallback) {
        thumbImg.src = photo.fallback;
      }
    };
    thumb.appendChild(thumbImg);
    thumb.addEventListener('click', () => goToSlide(index));
    thumbsContainer.appendChild(thumb);
  });

  const slides = () => track.querySelectorAll('.carousel-slide');
  const dots = () => dotsContainer.querySelectorAll('.dot');
  const thumbs = () => thumbsContainer.querySelectorAll('.carousel-thumb');

  function updateUI(index) {
    const slideList = slides();
    const dotList = dots();
    const thumbList = thumbs();

    slideList.forEach((s, i) => s.classList.toggle('active', i === index));
    dotList.forEach((d, i) => d.classList.toggle('active', i === index));
    thumbList.forEach((t, i) => {
      t.classList.toggle('active', i === index);
      t.setAttribute('aria-selected', i === index ? 'true' : 'false');
    });

    if (captionEl) {
      captionEl.textContent = CAROUSEL_PHOTOS[index].caption || '';
    }
    if (counterEl) {
      counterEl.textContent = `${index + 1} / ${CAROUSEL_PHOTOS.length}`;
    }
  }

  function goToSlide(index) {
    const len = CAROUSEL_PHOTOS.length;
    currentIndex = ((index % len) + len) % len;
    updateUI(currentIndex);
    pauseThenResumeAutoPlay();
  }

  function changeSlide(direction) {
    goToSlide(currentIndex + direction);
  }

  function startAutoPlay() {
    clearInterval(autoPlayTimer);
    autoPlayTimer = setInterval(() => {
      goToSlide(currentIndex + 1);
    }, 5000);
  }

  function pauseThenResumeAutoPlay() {
    clearInterval(autoPlayTimer);
    clearTimeout(resumeAutoPlayTimer);
    resumeAutoPlayTimer = setTimeout(startAutoPlay, 10000);
  }

  prevBtn?.addEventListener('click', () => changeSlide(-1));
  nextBtn?.addEventListener('click', () => changeSlide(1));

  viewport?.addEventListener(
    'touchstart',
    (e) => {
      touchStartX = e.touches[0].clientX;
      touchDeltaX = 0;
      clearInterval(autoPlayTimer);
    },
    { passive: true }
  );

  viewport?.addEventListener(
    'touchmove',
    (e) => {
      touchDeltaX = e.touches[0].clientX - touchStartX;
    },
    { passive: true }
  );

  viewport?.addEventListener('touchend', () => {
    const threshold = 50;
    if (touchDeltaX > threshold) changeSlide(-1);
    else if (touchDeltaX < -threshold) changeSlide(1);
    else pauseThenResumeAutoPlay();
    touchDeltaX = 0;
  });

  viewport?.addEventListener('mousedown', (e) => {
    isDragging = true;
    touchStartX = e.clientX;
    touchDeltaX = 0;
    clearInterval(autoPlayTimer);
    viewport.classList.add('is-dragging');
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    touchDeltaX = e.clientX - touchStartX;
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    viewport.classList.remove('is-dragging');
    const threshold = 50;
    if (touchDeltaX > threshold) changeSlide(-1);
    else if (touchDeltaX < -threshold) changeSlide(1);
    else pauseThenResumeAutoPlay();
    touchDeltaX = 0;
  });

  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('photoCarousel')) return;
    if (e.key === 'ArrowLeft') changeSlide(-1);
    if (e.key === 'ArrowRight') changeSlide(1);
  });

  updateUI(0);
  startAutoPlay();
})();

// ===== 导航栏滚动效果 =====
const navbar = document.querySelector('.navbar');

window.addEventListener('scroll', () => {
  if (!navbar) return;
  if (window.scrollY > 50) {
    navbar.style.boxShadow = '0 2px 30px rgba(0,0,0,0.1)';
  } else {
    navbar.style.boxShadow = '0 2px 20px rgba(0,0,0,0.06)';
  }
});

// ===== 滚动淡入 =====
const observerOptions = {
  threshold: 0.15,
  rootMargin: '0px 0px -50px 0px',
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.style.opacity = '1';
      entry.target.style.transform = 'translateY(0)';
    }
  });
}, observerOptions);

document.querySelectorAll('.about-section, .portfolio-section, .contact-section').forEach((section) => {
  section.style.opacity = '0';
  section.style.transform = 'translateY(30px)';
  section.style.transition = 'opacity 0.8s ease, transform 0.8s ease';
  observer.observe(section);
});

document.querySelectorAll('.nav-links a[href^="#"]').forEach((link) => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const target = document.querySelector(link.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

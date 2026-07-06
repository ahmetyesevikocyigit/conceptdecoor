(function () {
  const contentUrl = "/data/site-content.json";

  const escapeHtml = (value = "") =>
    String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");

  const imageSrc = (path = "") => {
    if (!path) return "";
    if (/^(https?:|data:|\/)/.test(path)) return path;
    const depth = window.location.pathname.split("/").filter(Boolean).length;
    const prefix = depth ? "../".repeat(depth) : "";
    return prefix + path;
  };

  const activeItems = (items) => (Array.isArray(items) ? items.filter((item) => item.active !== false) : []);

  const blogUrl = (post, fromRoot = false) => `${fromRoot ? "" : "../"}${post.slug}/`;

  function setMeta(selector, attributes) {
    let node = document.head.querySelector(selector);
    if (!node) {
      node = document.createElement(selector.startsWith("link") ? "link" : "meta");
      const match = selector.match(/\[(name|property|rel)="([^"]+)"\]/);
      if (match) node.setAttribute(match[1], match[2]);
      document.head.appendChild(node);
    }
    Object.entries(attributes).forEach(([key, value]) => node.setAttribute(key, value));
  }

  function renderBody(content) {
    return String(content || "")
      .split(/\n{2,}/)
      .filter(Boolean)
      .map((block) => {
        const value = block.trim();
        if (value.startsWith("## ")) return `<h2>${escapeHtml(value.slice(3))}</h2>`;
        return `<p>${escapeHtml(value)}</p>`;
      })
      .join("");
  }

  async function loadContent() {
    const response = await fetch(contentUrl, { cache: "no-store" });
    if (!response.ok) throw new Error("content load failed");
    return response.json();
  }

  function renderReviews(reviews) {
    const track = document.querySelector(".reviews-track");
    if (!track) return;
    const items = activeItems(reviews);
    if (!items.length) return;
    const cards = items.concat(items).map((review) => `
      <article class="review-card">
        <div class="review-top"><span class="avatar">${escapeHtml(review.initials || review.name?.slice(0, 2) || "CD")}</span><div><div class="review-name">${escapeHtml(review.name)}</div>${review.rating ? `<div class="review-meta">${"★".repeat(Math.max(1, Math.min(5, Number(review.rating) || 5)))}</div>` : ""}</div></div>
        <p>${escapeHtml(review.text)}</p>
      </article>
    `).join("");
    track.innerHTML = cards;
  }

  function renderHeroSlider(slides) {
    const slider = document.querySelector(".hero-slider");
    if (!slider) return;
    const items = activeItems(slides);
    if (!items.length) return;
    const images = items.map((slide, index) => `
      <img class="${index === 0 ? "active" : ""}" src="${escapeHtml(imageSrc(slide.image))}" alt="${escapeHtml(index === 0 ? slide.alt || slide.title || "" : "")}" data-alt="${escapeHtml(slide.alt || slide.title || "")}" ${index === 0 ? 'decoding="async" fetchpriority="high"' : 'aria-hidden="true" loading="lazy" decoding="async"'}>
    `).join("");
    const controls = items.length > 1 ? `
      <div class="hero-slider-controls" aria-label="Hero görselleri">
        ${items.map((_, index) => `<button class="hero-slider-dot" type="button" aria-label="${index + 1}. görseli göster" aria-pressed="${index === 0 ? "true" : "false"}"></button>`).join("")}
      </div>
    ` : "";
    slider.innerHTML = images + controls;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const heroSlides = [...slider.querySelectorAll("img")];
    const heroDots = [...slider.querySelectorAll(".hero-slider-dot")];
    let activeHeroSlide = 0;
    const showHeroSlide = (nextIndex) => {
      activeHeroSlide = nextIndex;
      heroSlides.forEach((slide, index) => {
        const isActive = index === activeHeroSlide;
        slide.classList.toggle("active", isActive);
        slide.alt = isActive ? slide.dataset.alt || slide.alt : "";
        slide.toggleAttribute("aria-hidden", !isActive);
      });
      heroDots.forEach((dot, index) => dot.setAttribute("aria-pressed", String(index === activeHeroSlide)));
    };
    heroDots.forEach((dot, index) => dot.addEventListener("click", () => showHeroSlide(index)));
    if (!reduceMotion && heroSlides.length > 1) {
      window.setInterval(() => showHeroSlide((activeHeroSlide + 1) % heroSlides.length), 5200);
    }
  }

  function renderHomeBlogs(posts) {
    const wrap = document.querySelector("#surec .blog-posts");
    if (!wrap) return;
    const items = activeItems(posts);
    if (!items.length) return;
    wrap.innerHTML = items.map((post) => `
      <article class="blog-card">
        <img src="${escapeHtml(imageSrc(post.image))}" alt="${escapeHtml(post.alt || post.title)}" loading="lazy" decoding="async">
        <div><h3>${escapeHtml(post.title)}</h3><p>${escapeHtml(post.summary)}</p><a href="${escapeHtml(`blog/${post.slug}/`)}">Devamını oku</a></div>
      </article>
    `).join("");
  }

  function renderProjects(projects) {
    const wrap = document.querySelector("#projeler .projects");
    if (!wrap) return;
    const items = activeItems(projects);
    if (!items.length) return;
    wrap.innerHTML = items.map((project) => `
      <article class="project">
        <div class="thumb"><img src="${escapeHtml(imageSrc(project.image))}" alt="${escapeHtml(project.alt || project.title)}" loading="lazy" decoding="async"></div>
        <div><h3>${escapeHtml(project.title)}</h3><p>${escapeHtml(project.description)}</p></div>
      </article>
    `).join("");
  }

  function renderBlogList(posts) {
    const wrap = document.querySelector(".blog-list");
    if (!wrap) return;
    const items = activeItems(posts);
    if (!items.length) return;
    wrap.innerHTML = items.map((post, index) => `
      <article class="blog-card">
        <img src="${escapeHtml(imageSrc(post.image))}" alt="${escapeHtml(post.alt || post.title)}" ${index ? 'loading="lazy"' : 'fetchpriority="high"'} decoding="async">
        <div><h2>${escapeHtml(post.title)}</h2><p>${escapeHtml(post.summary)}</p><a href="${escapeHtml(blogUrl(post, true))}">Devamını oku</a></div>
      </article>
    `).join("");
  }

  function renderDynamicBlog(posts) {
    const root = document.querySelector("[data-blog-detail]");
    if (!root) return;
    const params = new URLSearchParams(window.location.search);
    const parts = window.location.pathname.split("/").filter(Boolean);
    const slug = params.get("slug") || parts[parts.length - 1];
    const post = activeItems(posts).find((item) => item.slug === slug) || activeItems(posts)[0];
    if (!post) return;
    const seoTitle = post.seoTitle || `${post.title} | Concept Mobilya Blog`;
    const seoDescription = post.seoDescription || post.summary || "";
    const canonicalUrl = `${window.location.origin}/blog/${post.slug}/`;
    document.title = seoTitle.includes("Concept Mobilya") ? seoTitle : `${seoTitle} | Concept Mobilya`;
    setMeta('meta[name="description"]', { content: seoDescription });
    if (post.focusKeyword) setMeta('meta[name="keywords"]', { content: post.focusKeyword });
    setMeta('link[rel="canonical"]', { href: canonicalUrl });
    setMeta('meta[property="og:title"]', { content: document.title });
    setMeta('meta[property="og:description"]', { content: seoDescription });
    setMeta('meta[property="og:url"]', { content: canonicalUrl });
    setMeta('meta[property="og:image"]', { content: new URL(imageSrc(post.image), window.location.href).href });
    setMeta('meta[name="twitter:title"]', { content: document.title });
    setMeta('meta[name="twitter:description"]', { content: seoDescription });
    setMeta('meta[name="twitter:image"]', { content: new URL(imageSrc(post.image), window.location.href).href });
    const paragraphs = renderBody(post.body || post.summary || "");
    root.innerHTML = `
      <p class="breadcrumb"><a href="../../">Ana sayfa</a> / <a href="../">Blog</a></p>
      <div class="article-card">
        <img src="${escapeHtml(imageSrc(post.image))}" alt="${escapeHtml(post.alt || post.title)}" decoding="async" fetchpriority="high">
        <div class="article-body">
          <h1>${escapeHtml(post.title)}</h1>
          <p class="summary">${escapeHtml(post.summary)}</p>
          ${paragraphs}
          <a class="article-cta" href="../../#iletisim">Teklif al</a><br>
          <a class="back-link" href="../">Tüm blog yazıları</a>
        </div>
      </div>
    `;
  }

  loadContent()
    .then((content) => {
      renderHeroSlider(content.heroSlides);
      renderReviews(content.reviews);
      renderHomeBlogs(content.blogPosts);
      renderProjects(content.projects);
      renderBlogList(content.blogPosts);
      renderDynamicBlog(content.blogPosts);
    })
    .catch(() => {
      // Static fallback content remains visible if the JSON is unavailable.
    });
})();

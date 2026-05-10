$(document).ready(function () {

    // RSS'leri JSON'a çevirmek için kullandığımız aracı servis
    const RSS2JSON = 'https://api.rss2json.com/v1/api.json?rss_url=';

    // Takip listemizdeki ana akım teknoloji siteleri
    const RSS_FEEDS = [
        'https://shiftdelete.net/feed',
        'https://www.webtekno.com/rss.xml',
        'https://www.technopat.net/feed/',
        'https://www.donanimhaber.com/rss/haber/',
        'https://chip.com.tr/feed/',
        'https://siberbulten.com/feed/',
        'https://webrazzi.com/feed/',
        'https://www.log.com.tr/feed/'
    ];

    // RSS tarafında sorun çıkarsa haberleri buradan çekeceğiz
    const GNEWS_KEY = 'eb0194160cd8112d7089a97a9f317964';
    const GNEWS_BASE = 'https://gnews.io/api/v4/search';
    const GNEWS_QUERIES = [
        { category: 'AI & Veri Bilimi', query: 'yapay zeka OR ChatGPT OR makine öğrenimi' },
        { category: 'Yazılım & Sistemler', query: 'yazılım geliştirme OR kuantum bilgisayar' },
        { category: 'Siber Güvenlik', query: 'siber güvenlik OR hacker OR veri ihlali' }
    ];

    // Verileri her seferinde çekmemek için 1 saatlik önbellek süresi belirledik
    const CACHE_KEY = 'tn_news_v7';
    const CACHE_TTL = 60 * 60 * 1000;
    const MAX_AGE_DAYS = 30; // 30 günden eski haberleri listeye almıyoruz

    // Sitenin o anki durumuyla ilgili değişkenlerimiz
    let allNews = [];
    let activeCategory = 'all';
    let activeSearch = '';
    let visibleLimit = 12; // İlk açılışta 12 haber gösteriyoruz
    let bookmarkedUrls = JSON.parse(localStorage.getItem('tn_bookmarks')) || [];

    // Gece modu ayarları
    function applyTheme(theme) {
        $('html').attr('data-theme', theme);
        const icon = $('#darkModeToggle i');
        if (theme === 'dark') {
            icon.removeClass('fa-moon').addClass('fa-sun');
        } else {
            icon.removeClass('fa-sun').addClass('fa-moon');
        }
    }

    // Kullanıcının tercih ettiği temayı hafızadan geri çağırıyoruz
    const savedTheme = localStorage.getItem('tn-theme') || 'light';
    applyTheme(savedTheme);

    $('#darkModeToggle').click(function () {
        const next = $('html').attr('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(next);
        localStorage.setItem('tn-theme', next);
    });

    // Kaydırma hareketine göre navbar gölgesini açıp kapatıyoruz
    $(window).on('scroll', function () {
        $('#siteNavbar').toggleClass('scrolled', $(this).scrollTop() > 10);
    });

    // Telefonlarda yan menüyü açan buton
    $('#mobileMenuBtn').click(function () {
        $('#mobileDrawer').toggleClass('open');
    });

    // Arama kutusunu temizleme fonksiyonu
    function clearSearch() {
        activeSearch = '';
        $('#searchInput').val('');
        $('#searchClearBtn').removeClass('visible');
        visibleLimit = 12;
        applyFilters();
    }

    // Arama kutusuna bir şey yazıldığında anlık sonuç getirme
    $('#searchInput').on('input', function () {
        activeSearch = $(this).val().toLowerCase().trim();
        visibleLimit = 12;
        applyFilters();

        if (activeSearch) {
            $('#searchClearBtn').addClass('visible');
        } else {
            $('#searchClearBtn').removeClass('visible');
        }
    });

    // Klavye tuşları için (Enter onaylar, Esc aramayı temizler)
    $('#searchInput').on('keydown', function (e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            $(this).blur();
        }
        if (e.key === 'Escape') {
            clearSearch();
            $(this).blur();
            $('#siteNavbar').removeClass('mobile-search-active');
        }
    });

    $('#searchClearBtn').click(function () {
        clearSearch();
        $('#searchInput').focus();
    });

    // Kategori butonlarına tıklandığında listeyi güncelleme
    $(document).on('click', '.nav-cat-link', function (e) {
        e.preventDefault();
        const filter = $(this).data('filter');
        $('.nav-cat-link').removeClass('active');
        $(`.nav-cat-link[data-filter="${filter}"]`).addClass('active');
        activeCategory = filter;
        visibleLimit = 12;
        applyFilters();
        $('#mobileDrawer').removeClass('open');
    });

    // Haber başlığına göre otomatik kategori atama mantığı
    function guessCategory(title, description, sourceName) {
        const text = ((title || '') + ' ' + (description || '')).toLowerCase();
        const src = (sourceName || '').toLowerCase();

        if (src.includes('siber')) return 'Siber Güvenlik';

        const secWords = ['siber güvenlik', 'hacker', 'hack', 'saldırı', 'veri ihlali', 'malware', 'virüs'];
        const aiWords = ['yapay zeka', 'chatgpt', 'gpt', 'makine öğren', ' ai ', 'openai'];

        if (secWords.some(w => text.includes(w))) return 'Siber Güvenlik';
        if (aiWords.some(w => text.includes(w))) return 'AI & Veri Bilimi';
        return 'Yazılım & Sistemler';
    }

    // Haberin tarihini kontrol eden yardımcı fonksiyon
    function isFresh(dateStr) {
        const articleDate = new Date(dateStr);
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
        return articleDate >= cutoff;
    }

    // Tüm RSS kaynaklarından verileri toplayıp birleştiriyoruz
    function fetchFromRSS() {
        return new Promise(function (resolve) {
            const results = [];
            let completed = 0;

            RSS_FEEDS.forEach(function (feedUrl) {
                $.ajax({
                    url: RSS2JSON + encodeURIComponent(feedUrl) + '&count=10',
                    method: 'GET',
                    timeout: 8000,
                    success: function (data) {
                        if (data.status === 'ok' && data.items && data.items.length > 0) {
                            data.items.forEach(function (item) {
                                if (!isFresh(item.pubDate)) return;

                                const cleanDesc = item.description
                                    ? $('<div>').html(item.description).text().trim().slice(0, 220)
                                    : '';
                                const sourceName = data.feed.title || 'Teknoloji';
                                results.push({
                                    source: { name: sourceName },
                                    title: item.title,
                                    description: cleanDesc,
                                    url: item.link,
                                    urlToImage: item.thumbnail || item.enclosure?.link || getFallbackImage(item.title),
                                    publishedAt: item.pubDate,
                                    category: guessCategory(item.title, cleanDesc, sourceName)
                                });
                            });
                        }
                    },
                    error: function () { console.warn('RSS alınamadı:', feedUrl); },
                    complete: function () {
                        completed++;
                        if (completed === RSS_FEEDS.length) resolve(results);
                    }
                });
            });
        });
    }

    // RSS başarısız olursa GNews API'den anahtar kelimelerle haber çekiyoruz
    function fetchFromGNews() {
        return new Promise(function (resolve) {
            const results = [];
            const from = new Date();
            from.setDate(from.getDate() - MAX_AGE_DAYS);
            const fromStr = from.toISOString().split('T')[0];

            const requests = GNEWS_QUERIES.map(function (cat) {
                return $.ajax({
                    url: GNEWS_BASE,
                    method: 'GET',
                    timeout: 8000,
                    data: { q: cat.query, lang: 'tr', max: 3, from: fromStr, sortby: 'publishedAt', apikey: GNEWS_KEY },
                    success: function (response) {
                        (response.articles || []).forEach(function (a) {
                            if (!isFresh(a.publishedAt)) return;
                            const sourceName = a.source.name || 'GNews';
                            results.push({
                                source: { name: sourceName },
                                title: a.title,
                                description: a.description,
                                url: a.url,
                                urlToImage: a.image || getFallbackImage(a.title),
                                publishedAt: a.publishedAt,
                                category: cat.category
                            });
                        });
                    }
                });
            });
            $.when.apply($, requests).always(function () { resolve(results); });
        });
    }

    // Görseli olmayan haberlere kategoriye uygun Unsplash resmi atıyoruz
    function getFallbackImage(title) {
        const text = (title || '').toLowerCase();
        const secImgs = ['https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=800'];
        const aiImgs = ['https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=800'];
        const swImgs = ['https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=800'];

        function pickByHash(arr) {
            let hash = 0;
            for (let i = 0; i < (title || '').length; i++) hash += (title || '').charCodeAt(i);
            return arr[hash % arr.length];
        }

        if (text.includes('güvenlik') || text.includes('hacker') || text.includes('siber')) return pickByHash(secImgs);
        if (text.includes('yapay') || text.includes('zeka') || text.includes(' ai ')) return pickByHash(aiImgs);
        return pickByHash(swImgs);
    }

    // Ana veri yükleme süreci
    function fetchNews() {
        showLoader();

        // Önce hafızaya (cache) bakıp hızlıca yüklüyoruz
        try {
            const cached = JSON.parse(localStorage.getItem(CACHE_KEY));
            if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
                allNews = cached.articles;
                renderNews(allNews);
                applyFilters();
                return;
            }
        } catch (e) { }

        // Önce RSS sonra yedek API deneniyor
        fetchFromRSS().then(function (rssArticles) {
            if (rssArticles.length >= 3) {
                saveAndRender(rssArticles, 'RSS Feed\'lerden');
                return;
            }

            fetchFromGNews().then(function (gnewsArticles) {
                if (gnewsArticles.length >= 1) {
                    saveAndRender(gnewsArticles, 'GNews API\'den');
                    return;
                }
                showError();
            });
        });
    }

    // Haberleri hafızaya kaydedip ekrana gönderen kısım
    function saveAndRender(articles, sourceLabel) {
        allNews = articles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
        try {
            localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), articles: allNews }));
        } catch (e) { }
        renderNews(allNews);
        applyFilters();
    }

    // İnternet veya kaynak sorunu olursa kullanıcıyı bilgilendiriyoruz
    function showError() {
        $('#newsContainer').html(`
            <div class="col-12" style="grid-column:1/-1;">
                <div style="text-align:center; padding:80px 24px;">
                    <h3>Haberler Şu An Yüklenemiyor</h3>
                    <button onclick="location.reload()" class="load-more-btn">Tekrar Dene</button>
                </div>
            </div>
        `);
    }

    // Arama ve kategorilere göre kartları gizleyip gösteriyoruz
    function applyFilters() {
        let visibleCount = 0;
        let totalMatched = 0;

        $('#newsContainer .news-card').each(function () {
            const cat = $(this).data('category');
            const title = $(this).data('title');
            const desc = $(this).data('desc');
            const url = $(this).data('url');

            let catMatch = (activeCategory === 'all') || (cat === activeCategory);
            if (activeCategory === 'favorites') catMatch = bookmarkedUrls.includes(url);

            const searchMatch = !activeSearch || title.includes(activeSearch) || desc.includes(activeSearch);

            if (catMatch && searchMatch) {
                totalMatched++;
                if (visibleCount < visibleLimit) {
                    $(this).show();
                    visibleCount++;
                } else {
                    $(this).hide();
                }
            } else {
                $(this).hide();
            }
        });

        if (totalMatched > visibleLimit) {
            $('#loadMoreContainer').show();
        } else {
            $('#loadMoreContainer').hide();
        }

        if (visibleCount === 0 && allNews.length > 0) {
            $('#emptyState').show();
        } else {
            $('#emptyState').hide();
        }
    }

    // "Daha Fazla" butonuna basınca 12 yeni kart gösteriyoruz
    $('#loadMoreBtn').click(function () {
        visibleLimit += 12;
        applyFilters();
    });

    // Haber kartlarını HTML olarak oluşturma
    function showLoader() {
        $('#loader').show();
        $('#emptyState').hide();
    }

    function getCategoryBadgeClass(category) {
        if (category === 'AI & Veri Bilimi') return 'badge-ai';
        if (category === 'Yazılım & Sistemler') return 'badge-sw';
        if (category === 'Siber Güvenlik') return 'badge-sec';
        return '';
    }

    function renderNews(newsArray) {
        const container = $('#newsContainer');
        container.find('.news-card').remove();
        $('#loader').hide();

        if (newsArray.length === 0) {
            $('#emptyState').show();
            return;
        }

        $.each(newsArray, function (index, article) {
            const date = new Date(article.publishedAt);
            const formattedDate = date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });

            // Okuma süresini kelime sayısından hesaplıyoruz
            const wordCount = (article.title + ' ' + (article.description || '')).split(' ').length;
            const readTime = Math.max(1, Math.ceil(wordCount / 100)) + ' dk';

            const isBookmarked = bookmarkedUrls.includes(article.url);

            container.append(`
                <article class="news-card"
                    data-category="${article.category}"
                    data-title="${article.title.toLowerCase().replace(/"/g, '&quot;')}"
                    data-desc="${(article.description || '').toLowerCase().replace(/"/g, '&quot;')}"
                    data-url="${article.url}">
                    <div class="card-img-wrapper">
                        <button class="bookmark-btn ${isBookmarked ? 'active' : ''}" data-url="${article.url}">
                            <i class="${isBookmarked ? 'fa-solid' : 'fa-regular'} fa-bookmark"></i>
                        </button>
                        <span class="category-badge ${getCategoryBadgeClass(article.category)}">${article.category}</span>
                        <img src="${article.urlToImage || getFallbackImage(article.title)}" class="news-img" loading="lazy">
                    </div>
                    <div class="card-content">
                        <div class="card-source-row">
                            <span class="card-source">${article.source.name}</span>
                            <span class="card-date">${formattedDate} &bull; ${readTime}</span>
                        </div>
                        <h2 class="card-title">${article.title}</h2>
                        <p class="card-desc">${article.description || ''}</p>
                        <div class="card-actions-row">
                            <a href="${article.url}" class="card-cta" target="_blank">Habere Git</a>
                        </div>
                    </div>
                </article>
            `);
        });
    }

    // Haberi kaydetme veya favorilerden çıkarma
    $(document).on('click', '.bookmark-btn', function () {
        const url = $(this).data('url');
        const icon = $(this).find('i');

        if (bookmarkedUrls.includes(url)) {
            bookmarkedUrls = bookmarkedUrls.filter(u => u !== url);
            $(this).removeClass('active');
            icon.removeClass('fa-solid').addClass('fa-regular');
        } else {
            bookmarkedUrls.push(url);
            $(this).addClass('active');
            icon.removeClass('fa-regular').addClass('fa-solid');
        }

        localStorage.setItem('tn_bookmarks', JSON.stringify(bookmarkedUrls));
        if (activeCategory === 'favorites') applyFilters();
    });

    // Yukarı çık butonu için scroll takibi
    $(window).scroll(function () {
        if ($(this).scrollTop() > 400) {
            $('#scrollTopBtn').addClass('visible');
        } else {
            $('#scrollTopBtn').removeClass('visible');
        }
    });

    $('#scrollTopBtn').click(function () {
        $('html, body').animate({ scrollTop: 0 }, 'fast');
    });

    // Mobil arama butonu işlevselliği
    $('#mobileSearchBtn').click(function () {
        const navbar = $('#siteNavbar');
        navbar.toggleClass('mobile-search-active');
        
        if (navbar.hasClass('mobile-search-active')) {
            $('#searchInput').focus();
        }
    });

    // Arama dışında bir yere tıklanırsa mobil arama modundan çık
    $(document).click(function (e) {
        if ($('#siteNavbar').hasClass('mobile-search-active')) {
            if (!$(e.target).closest('#navSearchBox').length && 
                !$(e.target).closest('#mobileSearchBtn').length &&
                !$(e.target).closest('#siteNavbar').length) {
                $('#siteNavbar').removeClass('mobile-search-active');
            }
        }
    });

    // Arama inputu ESC tuşuna basılırsa mobil moddan çık
    // (Zaten yukarıdaki keydown handler'da yapılıyor)

    // Her şey yüklendikten sonra haberleri getirerek başlatıyoruz
    fetchNews();
});

// ESC tuşu basılırsa mobil arama modundan çık (global olarak)
$(document).on('keydown', function(e) {
    if (e.key === 'Escape') {
        $('#siteNavbar').removeClass('mobile-search-active');
    }
});
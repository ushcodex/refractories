import html
import json
import os
import shutil
from string import Template
from urllib.parse import quote

REPO = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(REPO, 'data', 'awards.json')
PUBLIC_AWARDS = os.path.join(REPO, 'public', 'awards')
SITE = 'https://u19ce.pages.dev'

MEDAL_SVG = '''
  <svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="60" cy="60" r="54" stroke="currentColor" stroke-width="1.5" opacity=".35"/>
    <circle cx="60" cy="60" r="44" stroke="currentColor" stroke-width="1" opacity=".25"/>
    <path d="M60 20l10.2 20.7 22.8 3.3-16.5 16.1 3.9 22.7L60 71.9 39.6 82.8l3.9-22.7-16.5-16.1 22.8-3.3L60 20z" fill="currentColor" opacity=".95"/>
    <path d="M44 92l-8 18 24-8 24 8-8-18" stroke="currentColor" stroke-width="2" opacity=".4"/>
  </svg>
'''

TEMPLATE = Template('''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
  <meta name="description" content="$category: $title — $recipient. The Refractories, Class of 2024.">
  <meta name="theme-color" content="#07070c">

  <meta property="og:title" content="$title — $recipient | The Refractories">
  <meta property="og:description" content="$citation">
  <meta property="og:url" content="$canonical">
  <meta property="og:type" content="article">

  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="$title — $recipient | The Refractories">
  <meta name="twitter:description" content="$citation">

  <title>$title — $recipient | The Refractories</title>

  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🏅</text></svg>">
  <link rel="canonical" href="$canonical">
  <link rel="stylesheet" href="/css/styles.css">
  <link rel="stylesheet" href="/css/awards.css">
</head>
<body class="award-page">
  <nav class="nav" role="navigation">
    <div class="nav-inner">
      <a href="/" class="nav-brand">
        <span class="brand-icon">🔥</span>
        <span>
          The Refractories
          <span class="brand-sub">Class of 2024</span>
        </span>
      </a>
      <div class="nav-links">
        <a href="/" class="nav-link">Gallery</a>
        <a href="/yearbook.html" class="nav-link">Yearbook</a>
        <a href="/certificates.html" class="nav-link">Certificates</a>
        <a href="/awards.html" class="nav-link active">Awards</a>
        <a href="/superlatives.html" class="nav-link">Superlatives</a>
        <a href="/upload.html" class="nav-link">Upload</a>
      </div>
    </div>
  </nav>

  <main class="award-main">
    <div class="award-shell">
      <a href="/awards.html" class="award-back">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        Back to all awards
      </a>

      <article class="award-card $category_class">
        <span class="award-corner award-corner--tl" aria-hidden="true"></span>
        <span class="award-corner award-corner--tr" aria-hidden="true"></span>
        <span class="award-corner award-corner--bl" aria-hidden="true"></span>
        <span class="award-corner award-corner--br" aria-hidden="true"></span>

        <div class="award-topline">
          <span>The Refractories</span>
          <span>Class of 2024</span>
        </div>

        <div class="award-medal">$medal</div>
        <p class="award-kicker">$category</p>
        <h1 class="award-title">$title</h1>
        $period_block
        <p class="award-presented">Presented to</p>
        <h2 class="award-recipient">$recipient</h2>
        <div class="award-rule"></div>
        <blockquote class="award-citation">$citation</blockquote>

        <div class="award-bottom">
          <div class="award-signature">
            <span class="award-signature-line"></span>
            <strong>The Refractories</strong>
            <small>Class of 2024</small>
          </div>
          <div class="award-seal">
            <span>2024</span>
            <small>The Refractories</small>
          </div>
          <div class="award-signature">
            <span class="award-signature-line"></span>
            <strong>Chemical Engineering</strong>
            <small>Ahmadu Bello University</small>
          </div>
        </div>
      </article>

      <div class="award-actions no-print">
        <button type="button" class="btn btn-primary" id="print-award">Print / Save as PDF</button>
        <button type="button" class="btn btn-secondary" id="copy-award-link">Copy link</button>
        <a class="btn btn-secondary" href="https://api.whatsapp.com/send?text=$share_text%20$share_url" target="_blank" rel="noopener noreferrer">WhatsApp</a>
        <a class="btn btn-secondary" href="https://twitter.com/intent/tweet?text=$share_text&amp;url=$share_url" target="_blank" rel="noopener noreferrer">X (Twitter)</a>
      </div>
      <p class="award-note no-print">This E-Award is a digital keepsake from The Refractories, Class of 2024.</p>
    </div>
  </main>

  <footer class="award-footer no-print">
    <p>The Refractories · Chemical Engineering Class of 2024 · Ahmadu Bello University, Zaria</p>
  </footer>

  <script>
    document.getElementById('print-award').addEventListener('click', function () {
      window.print();
    });

    document.getElementById('copy-award-link').addEventListener('click', async function () {
      var button = document.getElementById('copy-award-link');
      try {
        await navigator.clipboard.writeText(window.location.href);
        var old = button.textContent;
        button.textContent = 'Copied!';
        setTimeout(function () { button.textContent = old; }, 2000);
      } catch (error) {
        window.prompt('Copy this link:', window.location.href);
      }
    });
  </script>
</body>
</html>
''')


def esc(value):
    return html.escape(str(value), quote=True)


def main():
    with open(DATA_PATH, encoding='utf-8') as f:
        awards = json.load(f)

    os.makedirs(PUBLIC_AWARDS, exist_ok=True)
    shutil.copyfile(DATA_PATH, os.path.join(PUBLIC_AWARDS, 'data.json'))

    for award in awards:
        slug = award['slug']
        canonical = f'{SITE}/awards/{slug}'
        period_block = (
            f'<p class="award-period">{esc(award["period"])}</p>'
            if award.get('period')
            else ''
        )
        share_text = quote(
            f'{award["title"]} — {award["recipient"]} | The Refractories Class of 2024',
            safe='',
        )
        page = TEMPLATE.substitute(
            category=esc(award['category']),
            category_class='award-card--merit' if award['category_key'] == 'merit' else '',
            title=esc(award['title']),
            period_block=period_block,
            recipient=esc(award['recipient']),
            citation=esc(award['citation']),
            canonical=canonical,
            share_text=share_text,
            share_url=quote(canonical, safe=''),
            medal=MEDAL_SVG.strip(),
        )

        directory = os.path.join(PUBLIC_AWARDS, slug)
        os.makedirs(directory, exist_ok=True)
        with open(os.path.join(directory, 'index.html'), 'w', encoding='utf-8') as f:
            f.write(page)
        with open(os.path.join(PUBLIC_AWARDS, f'{slug}.html'), 'w', encoding='utf-8') as f:
            f.write(page)

    print(f'Generated {len(awards)} E-Award pages in public/awards/')


if __name__ == '__main__':
    main()

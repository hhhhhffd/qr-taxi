"""Platform router — /go/{slug} smart redirect.

Scans the User-Agent and either:
- Redirects WeChat users straight to /we/?slug=...
- Returns an HTML page that tries to open the Telegram deep-link first,
  then falls back to the web app /?slug=... after 1.5 s.
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.location import Location

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Platform Router"])

_WECHAT_UA_MARKER = "MicroMessenger"

_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>APARU — открываем приложение…</title>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
    }}
    .card {{
      background: #fff;
      border-radius: 20px;
      padding: 40px 32px;
      text-align: center;
      max-width: 360px;
      width: 100%;
      box-shadow: 0 4px 24px rgba(0,0,0,.08);
    }}
    .logo {{ font-size: 48px; margin-bottom: 16px; }}
    h1 {{ font-size: 22px; font-weight: 700; color: #111; margin-bottom: 8px; }}
    p  {{ font-size: 15px; color: #666; line-height: 1.5; margin-bottom: 28px; }}
    .btn {{
      display: block;
      width: 100%;
      padding: 14px;
      border-radius: 14px;
      border: none;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      margin-bottom: 12px;
    }}
    .btn-tg  {{ background: #2AABEE; color: #fff; }}
    .btn-web {{ background: #f0f0f0; color: #333; }}
    .spinner {{
      width: 32px; height: 32px;
      border: 3px solid #e0e0e0;
      border-top-color: #2AABEE;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 24px;
    }}
    @keyframes spin {{ to {{ transform: rotate(360deg); }} }}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🚕</div>
    <h1>APARU Такси</h1>
    <p>Открываем приложение…</p>
    <div class="spinner" id="spinner"></div>
    <a class="btn btn-tg" id="btn-tg" href="{tg_url}">Открыть в Telegram</a>
    <a class="btn btn-web" id="btn-web" href="{web_url}">Открыть в браузере</a>
  </div>
  <script>
    var tgUrl  = "{tg_url}";
    var webUrl = "{web_url}";
    var slug   = "{slug}";
    var tgOpened = false;

    function onTgOpened() {{
      if (tgOpened) return;
      tgOpened = true;
      clearTimeout(fallbackTimer);
      // Show "you can close this tab" message in case window.close() is blocked
      var p = document.querySelector('p');
      if (p) p.textContent = 'Telegram открыт. Можете закрыть эту вкладку.';
      document.getElementById('spinner').style.display = 'none';
      setTimeout(function () {{ window.close(); }}, 300);
    }}

    // Detect tab going to background when Telegram opens
    document.addEventListener('visibilitychange', function () {{
      if (document.hidden) onTgOpened();
    }});
    window.addEventListener('blur', function () {{
      setTimeout(function () {{ if (document.hidden) onTgOpened(); }}, 100);
    }});

    // Immediately try to open Telegram app via deep-link.
    // Works on mobile when Telegram is installed.
    window.location.href = tgUrl;

    // After 1.5 s assume Telegram is not installed → go to web app.
    var fallbackTimer = setTimeout(function () {{
      if (!tgOpened) {{
        document.getElementById('spinner').style.display = 'none';
        window.location.replace(webUrl);
      }}
    }}, 1500);

    // If user manually clicks either button, cancel the auto-timer.
    document.getElementById('btn-tg').addEventListener('click', function () {{
      clearTimeout(fallbackTimer);
      window.location.href = tgUrl;
    }});
    document.getElementById('btn-web').addEventListener('click', function () {{
      clearTimeout(fallbackTimer);
    }});
  </script>
</body>
</html>
"""


@router.get("/go", response_class=HTMLResponse, response_model=None, include_in_schema=False)
@router.get("/go/", response_class=HTMLResponse, response_model=None, include_in_schema=False)
async def platform_router_query_param(
    slug: Optional[str] = Query(default=None),
) -> RedirectResponse | HTMLResponse:
    """/go?slug=xxx  и  /go/?slug=xxx → 301 → /go/{slug}.

    Позволяет использовать оба формата URL в QR-кодах и ссылках.
    Если slug не передан — 400.
    """
    if not slug:
        return HTMLResponse(content="<h1>Не указан slug</h1>", status_code=400)
    return RedirectResponse(url=f"/go/{slug}", status_code=301)


@router.get("/go/{slug}", response_class=HTMLResponse, response_model=None)
async def platform_router(
    slug: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse | RedirectResponse:
    """Smart QR landing: route to WeChat H5, Telegram Mini App, or web app.

    Decision tree:
    1. ``MicroMessenger`` in User-Agent → 302 to ``/we/?slug={slug}``
    2. Otherwise → HTML page that deep-links into Telegram, falls back to ``/``
       after 1.5 s via JS.

    A 404 is returned when the slug does not exist or is inactive so that
    invalid QR stickers fail visibly rather than silently routing nowhere.
    """
    ua = request.headers.get("user-agent", "")

    # Validate slug exists (prevents routing to dead locations)
    result = await db.execute(
        select(Location.id).where(Location.slug == slug, Location.is_active.is_(True))
    )
    if result.scalar_one_or_none() is None:
        logger.warning("platform_router: unknown or inactive slug=%s", slug)
        return HTMLResponse(
            content="<h1>Локация не найдена</h1>",
            status_code=404,
        )

    logger.info("platform_router slug=%s ua_fragment=%s", slug, ua[:80])

    # WeChat built-in browser
    if _WECHAT_UA_MARKER in ua:
        return RedirectResponse(url=f"/we/?slug={slug}", status_code=302)

    tg_url  = f"tg://resolve?domain={settings.BOT_USERNAME}&start={slug}"
    web_url = f"/?slug={slug}"

    html = _HTML_TEMPLATE.format(slug=slug, tg_url=tg_url, web_url=web_url)
    return HTMLResponse(content=html)

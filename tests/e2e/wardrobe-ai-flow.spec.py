"""E2E Fase 3: detección IA + procesamiento de fondo.

Cubre:
  1. Login → armario → añadir prenda con imagen.
  2. Click "Detectar con IA" → verifica progreso, éxito y que la etiqueta
     detectada (color primario) rellena el formulario.
  3. Guarda la prenda y navega al detalle.
  4. Click "Mejorar fondo" → verifica overlay, éxito y que la vista pasa a
     "clean" con un <img> renderizado (data-view=clean).
  5. Limpieza: elimina la prenda.

Modo mock/passthrough: sin LOVABLE_API_KEY el server fn de detección
devuelve un resultado simulado y el de fondo hace passthrough del
original. Perfecto para E2E sin depender del proveedor real.
"""
import asyncio
import base64
import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright, expect

# TTL mínimo aceptable para las signed URLs de /bg/. El cliente firma con
# 1 año (60*60*24*365 = 31_536_000); exigimos ≥180 días para detectar
# regresiones que acorten la expiración y provoquen roturas prematuras
# de imágenes cacheadas en BD.
MIN_SIGNED_URL_TTL_S = 60 * 60 * 24 * 180


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def assert_signed_url_ttl(url: str, min_ttl_s: int, *, label: str) -> int:
    """Extrae el token JWT del signed URL de Supabase Storage y valida TTL.

    Devuelve el TTL efectivo (exp - iat) en segundos.
    """
    qs = urllib.parse.urlparse(url).query
    params = urllib.parse.parse_qs(qs)
    token_vals = params.get("token") or []
    assert token_vals and token_vals[0], f"[{label}] signed URL sin token: {url}"
    token = token_vals[0]
    parts = token.split(".")
    assert len(parts) == 3, f"[{label}] token no es un JWT (segments={len(parts)}): {token[:40]}…"
    try:
        payload = json.loads(_b64url_decode(parts[1]))
    except Exception as e:
        raise AssertionError(f"[{label}] no se pudo decodificar payload JWT: {e}")
    exp = payload.get("exp")
    iat = payload.get("iat")
    assert isinstance(exp, (int, float)), f"[{label}] JWT sin exp numérico: {payload}"
    now = int(time.time())
    remaining = int(exp) - now
    assert remaining >= min_ttl_s, (
        f"[{label}] signed URL expira en {remaining}s (< mínimo {min_ttl_s}s). "
        f"Revisa el SIGNED_TTL_S del cliente y no acortes la expiración de /bg/."
    )
    ttl = int(exp) - int(iat) if isinstance(iat, (int, float)) else remaining
    assert ttl >= min_ttl_s, (
        f"[{label}] TTL firmado {ttl}s (< mínimo {min_ttl_s}s). payload={payload}"
    )
    return ttl

BASE = "http://localhost:8080"
SUPABASE_URL = "https://pcujmfhkyppmcahhgmmb.supabase.co"
APIKEY = "sb_publishable_MGPlNp2vWCxd7ObFpi9dMg_LE9udqcQ"
SCREENS = Path(__file__).parent / "screenshots" / "wardrobe-ai-flow"
SCREENS.mkdir(parents=True, exist_ok=True)

EMAIL = os.environ["TEST_EMAIL"]
PASSWORD = os.environ["TEST_PASSWORD"]

PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8cfc0f01f0005000180fe8a5b930000000049454e44ae426082"
)
IMG_PATH = "/tmp/wiw-e2e-ai.png"
Path(IMG_PATH).write_bytes(PNG_1x1)

ITEM_NAME = f"E2E IA {int(time.time())}"


async def login(page):
    await page.goto(f"{BASE}/auth", wait_until="networkidle")
    await page.wait_for_function(
        "() => !!document.querySelector('form') && !document.querySelector('button[type=submit]')?.disabled",
        timeout=10000,
    )
    await page.get_by_label("Email").fill(EMAIL)
    await page.get_by_label("Contraseña").fill(PASSWORD)
    await page.wait_for_timeout(300)
    await page.get_by_role("button", name="Entrar").click()
    await page.wait_for_function(
        "() => Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'))",
        timeout=15000,
    )


def rest_get(path, token):
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        headers={"apikey": APIKEY, "Authorization": f"Bearer {token}"},
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        return json.loads(r.read())


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        errors = []
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))

        # 1) Login
        await login(page)
        print("logged in, url:", page.url)

        # 2) Ir a añadir prenda
        await page.goto(f"{BASE}/wardrobe/add", wait_until="networkidle")
        await page.screenshot(path=str(SCREENS / "1_add_form.png"))

        # 3) Subir imagen
        await page.locator('input[type="file"]').set_input_files(IMG_PATH)
        await expect(page.locator("form img").first).to_be_visible(timeout=5000)

        # Botón "Detectar con IA" aparece cuando hay imagen válida
        detect_btn = page.get_by_role("button", name=re.compile("Detectar con IA"))
        await expect(detect_btn).to_be_visible(timeout=5000)
        await page.screenshot(path=str(SCREENS / "2_before_detect.png"))

        # 4) Click detectar → panel de status
        await detect_btn.click()
        status = page.locator('[role="status"][data-stage]')
        await expect(status).to_be_visible(timeout=5000)
        # Debe pasar por preparing/analyzing y terminar en success (mock ~700-1500ms).
        stages_seen = set()
        deadline = time.time() + 8
        last_stage = None
        while time.time() < deadline:
            s = await status.get_attribute("data-stage")
            if s:
                stages_seen.add(s)
                last_stage = s
                if s == "success":
                    break
                if s == "error":
                    raise AssertionError(f"AI detection ended in error: {await status.inner_text()}")
            await page.wait_for_timeout(80)
        assert last_stage == "success", f"expected success, got {last_stage}, seen={stages_seen}"
        assert "analyzing" in stages_seen or "preparing" in stages_seen, \
            f"never saw progress stages, only: {stages_seen}"
        print("AI detection stages seen:", stages_seen)
        await page.screenshot(path=str(SCREENS / "3_detect_success.png"))

        # 5) La etiqueta IA (color primario "negro" del mock) llenó el input color
        color_val = await page.locator('input#color').input_value()
        assert color_val == "negro", f"expected color input filled with mock 'negro', got {color_val!r}"
        # Categoría select debe estar en "tops" (mock por defecto)
        # Verificamos vía el trigger del Select (muestra la etiqueta)
        cat_trigger = page.locator('[role="combobox"]').first
        cat_text = (await cat_trigger.inner_text()).strip().lower()
        assert "tops" in cat_text or "prenda" in cat_text, f"category not applied: {cat_text!r}"
        print("AI label applied to form: color=negro, category=", cat_text)

        # 6) Guardar
        await page.get_by_label("Nombre").fill(ITEM_NAME)
        await page.get_by_role("button", name=re.compile("Guardar")).click()
        await page.wait_for_url("**/wardrobe", timeout=20000)
        await page.wait_for_load_state("networkidle")

        # 7) Abrir detalle
        access_token = await page.evaluate(
            "() => { const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')); "
            "return k ? JSON.parse(localStorage.getItem(k)).access_token : null; }"
        )
        rows = rest_get(
            f"/rest/v1/clothing_items?name=eq.{urllib.request.quote(ITEM_NAME)}"
            "&select=id,storage_path,image_url,color,category&limit=1",
            access_token,
        )
        assert rows, f"item {ITEM_NAME!r} not found in DB"
        item = rows[0]
        assert item["color"] == "negro", f"DB row color not persisted: {item}"
        assert item["category"] == "tops", f"DB row category not persisted: {item}"
        item_id = item["id"]
        print("saved item id:", item_id)

        await page.goto(f"{BASE}/wardrobe/{item_id}", wait_until="networkidle")
        img = page.locator("main img").first
        await expect(img).to_be_visible(timeout=5000)
        assert (await img.get_attribute("data-view")) == "original", \
            "should start as original (no bg version yet)"
        await page.screenshot(path=str(SCREENS / "4_detail_original.png"))

        # 8) Mejorar fondo — pre-check estricto: las columnas DEBEN existir.
        #    Si faltan, fallamos con un mensaje accionable para detectar
        #    regresiones de migraciones (phase3_background_removal.sql y
        #    phase3_background_processed_at.sql).
        col_check = urllib.request.Request(
            f"{SUPABASE_URL}/rest/v1/clothing_items"
            "?select=background_removed_storage_path,background_processed_at&limit=1",
            headers={"apikey": APIKEY, "Authorization": f"Bearer {access_token}"},
        )
        try:
            with urllib.request.urlopen(col_check, timeout=10) as r:
                r.read()
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "ignore")
            raise AssertionError(
                "MIGRATION MISSING: faltan columnas de fondo en public.clothing_items "
                "(background_removed_storage_path / background_processed_at). Aplica "
                "migrations/phase3_background_removal.sql y "
                "migrations/phase3_background_processed_at.sql antes de correr este E2E. "
                f"Detalle PostgREST: {body}"
            )

        # Snapshot previo: la fila recién creada no debe tener estado de fondo.
        pre_rows = rest_get(
            f"/rest/v1/clothing_items?id=eq.{item_id}"
            "&select=background_removed_storage_path,background_removed_image_url,background_processed_at",
            access_token,
        )
        pre = pre_rows[0]
        assert pre["background_removed_storage_path"] is None, f"pre storage_path no es null: {pre}"
        assert pre["background_removed_image_url"] is None, f"pre image_url no es null: {pre}"
        assert pre["background_processed_at"] is None, f"pre processed_at no es null: {pre}"

        # Marca temporal para acotar el timestamp posterior (con 2s de margen
        # por drift de reloj cliente/servidor).
        from datetime import datetime, timezone, timedelta
        click_started_at = datetime.now(timezone.utc) - timedelta(seconds=2)


        if True:

            bg_btn = page.get_by_role("button", name=re.compile("Mejorar fondo|Reprocesar"))
            await expect(bg_btn).to_be_visible(timeout=5000)

            # --- Instrumentación: contamos llamadas a server functions durante
            # el procesamiento y mutaciones de src en el <img data-view="clean">.
            server_fn_calls: list[str] = []

            def _on_request(req):
                url = req.url
                if req.method == "POST" and "/_serverFn/" in url:
                    server_fn_calls.append(url)

            page.on("request", _on_request)

            # Observer que cuenta cuántas veces se asigna/actualiza el src del
            # <img data-view="clean"> (creación + cambios posteriores).
            await page.evaluate(
                """
                () => {
                  window.__cleanSrcSets = [];
                  const record = (el) => {
                    const src = el.getAttribute('src') || '';
                    const last = window.__cleanSrcSets[window.__cleanSrcSets.length - 1];
                    if (src && src !== last) window.__cleanSrcSets.push(src);
                  };
                  const scan = () => {
                    document.querySelectorAll('main img[data-view="clean"]').forEach(record);
                  };
                  window.__cleanObs = new MutationObserver(() => scan());
                  window.__cleanObs.observe(document.body, {
                    subtree: true, childList: true, attributes: true,
                    attributeFilter: ['src', 'data-view'],
                  });
                  scan();
                }
                """
            )

            await bg_btn.click()
            # Overlay "Procesando fondo…" debe aparecer (passthrough puede ser rápido)
            try:
                await expect(page.get_by_text("Procesando fondo…")).to_be_visible(timeout=3000)
            except Exception:
                pass

            await page.wait_for_function(
                "() => !!document.querySelector('main img[data-view=\"clean\"]')",
                timeout=25000,
            )

            # Verifica el <img> en modo clean cargado desde signed URL bajo /bg/
            clean_img = page.locator('main img[data-view="clean"]')
            await expect(clean_img).to_be_visible()
            src = await clean_img.get_attribute("src")
            assert src, "clean img has no src"
            assert "/object/sign/wardrobe-images/" in src, \
                f"expected signed URL from wardrobe-images bucket, got {src}"
            assert "/bg/" in src, f"expected /bg/ subprefix in signed URL, got {src}"
            assert "token=" in src, f"expected signed URL token param, got {src}"
            img_ttl = assert_signed_url_ttl(src, MIN_SIGNED_URL_TTL_S, label="clean img src")
            print(f"clean img signed URL TTL OK: {img_ttl}s (min {MIN_SIGNED_URL_TTL_S}s)")
            natural = await clean_img.evaluate(
                "(el) => ({ w: el.naturalWidth, h: el.naturalHeight, complete: el.complete })"
            )
            assert natural["complete"] and natural["w"] > 0, f"clean img did not load: {natural}"

            # Fetch de la signed URL: debe devolver 200 sin auth (URL firmada)
            try:
                with urllib.request.urlopen(src, timeout=10) as r:
                    assert r.status == 200, f"signed URL not 200: {r.status}"
                    ctype = r.headers.get("content-type", "")
                    assert ctype.startswith("image/"), f"unexpected content-type: {ctype}"
                    print("signed URL fetch OK, content-type:", ctype)
            except urllib.error.HTTPError as e:
                raise AssertionError(f"signed URL fetch failed: {e.code} {e.reason}")
            print("bg-clean img rendered from signed URL, natural=", natural)
            await page.screenshot(path=str(SCREENS / "5_detail_clean.png"))

            # --- Aserciones de idempotencia UI/red -----------------------------
            # Margen para detectar re-renders o llamadas duplicadas (StrictMode,
            # refetch reactivo, etc.) tras el éxito.
            await page.wait_for_timeout(1500)
            src_after = await clean_img.get_attribute("src")
            assert src_after == src, (
                "clean img src cambió tras el éxito (esperado 1 sola actualización).\n"
                f"  antes: {src}\n  después: {src_after}"
            )
            src_sets = await page.evaluate("() => window.__cleanSrcSets || []")
            assert len(src_sets) == 1, (
                f"clean img src se asignó {len(src_sets)} veces (esperado 1). "
                f"Historial: {src_sets}"
            )
            print("clean img src set exactamente 1 vez: OK")

            page.remove_listener("request", _on_request)
            # Solo una llamada a la server function de procesamiento debe
            # haberse disparado por el click en "Mejorar fondo".
            assert len(server_fn_calls) == 1, (
                f"esperado 1 POST a /_serverFn/ tras click en 'Mejorar fondo', "
                f"observados {len(server_fn_calls)}: {server_fn_calls}"
            )
            print("server fn POSTs durante procesado: 1 (OK)")

            # Verifica en BD que se persistieron path + signed URL + timestamp
            rows2 = rest_get(
                f"/rest/v1/clothing_items?id=eq.{item_id}"
                "&select=background_removed_storage_path,background_removed_image_url,background_processed_at",
                access_token,
            )
            r0 = rows2[0]
            assert r0["background_removed_storage_path"], f"storage_path not persisted: {r0}"
            assert "/bg/" in r0["background_removed_storage_path"], \
                f"bg path not under /bg/: {r0}"
            assert r0["background_removed_image_url"], \
                f"background_removed_image_url not persisted: {r0}"
            db_url = r0["background_removed_image_url"]
            assert "/object/sign/wardrobe-images/" in db_url and "/bg/" in db_url \
                and "token=" in db_url, \
                f"persisted image_url is not a signed /bg/ URL: {db_url}"
            db_ttl = assert_signed_url_ttl(db_url, MIN_SIGNED_URL_TTL_S, label="DB image_url")
            print(f"DB signed URL TTL OK: {db_ttl}s (min {MIN_SIGNED_URL_TTL_S}s)")

            # background_processed_at debe estar seteado y ser posterior al
            # inicio del click. Los tres campos de estado deben quedar
            # consistentes (todos poblados a la vez).
            processed_at_raw = r0["background_processed_at"]
            assert processed_at_raw, (
                f"background_processed_at no se persistió tras el procesamiento: {r0}"
            )
            # PostgREST devuelve ISO con offset; normaliza 'Z' → '+00:00'.
            processed_at = datetime.fromisoformat(
                processed_at_raw.replace("Z", "+00:00")
            )
            now_utc = datetime.now(timezone.utc) + timedelta(seconds=2)
            assert click_started_at <= processed_at <= now_utc, (
                f"background_processed_at fuera de ventana esperada.\n"
                f"  click_started_at={click_started_at.isoformat()}\n"
                f"  processed_at    ={processed_at.isoformat()}\n"
                f"  now_utc         ={now_utc.isoformat()}"
            )
            print(f"background_processed_at OK: {processed_at.isoformat()}")
            first_processed_at = processed_at

            print("DB persisted bg path:", r0["background_removed_storage_path"])
            print("DB persisted bg signed URL OK")

            # Toggle Original / Sin fondo funciona
            await page.get_by_role("tab", name="Original").click()
            assert (await page.locator("main img").first.get_attribute("data-view")) == "original"
            await page.get_by_role("tab", name="Sin fondo").click()
            assert (await page.locator("main img").first.get_attribute("data-view")) == "clean"
            print("toggle Original/Sin fondo OK")

        # 9) Limpieza
        await page.get_by_label("Eliminar").click()
        await page.wait_for_url("**/wardrobe", timeout=15000)
        print("item deleted")

        # Errores de consola no fatales — reportar sin romper si no son
        # críticos del flujo probado.
        if errors:
            noise = [e for e in errors if "background_removed_storage_path" not in e]
            if noise:
                print("BROWSER ERRORS (non-fatal):")
                for e in noise[-20:]:
                    print(" -", e)

        await browser.close()

    print("OK: detección IA + procesamiento de fondo verdes.")


asyncio.run(main())

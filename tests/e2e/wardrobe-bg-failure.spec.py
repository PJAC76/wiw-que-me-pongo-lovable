"""E2E Fase 3 (fallo): procesamiento de fondo con error del server fn.

Verifica el comportamiento cuando la llamada a `processBackgroundFn` falla:

  1. La UI muestra el estado de error (toast) y NO renderiza `<img data-view="clean">`.
  2. NO se produce actualización parcial en BD: los tres campos de estado del
     fondo (`background_removed_storage_path`, `background_removed_image_url`,
     `background_processed_at`) deben permanecer `NULL`.
  3. Un reintento posterior (con la ruta ya sin interceptar) debe funcionar
     con normalidad y poblar los tres campos de forma atómica — así
     validamos que un fallo previo no deja al item en estado corrupto.

Estrategia: usamos `page.route` para interceptar el POST a
`/_serverFn/...processBackground...` en la vista de detalle y responderlo
con un 500 (fetch nativo → error del server fn en el cliente).
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

BASE = "http://localhost:8080"
SUPABASE_URL = "https://pcujmfhkyppmcahhgmmb.supabase.co"
APIKEY = "sb_publishable_MGPlNp2vWCxd7ObFpi9dMg_LE9udqcQ"
SCREENS = Path(__file__).parent / "screenshots" / "wardrobe-bg-failure"
SCREENS.mkdir(parents=True, exist_ok=True)

EMAIL = os.environ["TEST_EMAIL"]
PASSWORD = os.environ["TEST_PASSWORD"]

PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8cfc0f01f0005000180fe8a5b930000000049454e44ae426082"
)
IMG_PATH = "/tmp/wiw-e2e-bg-fail.png"
Path(IMG_PATH).write_bytes(PNG_1x1)

ITEM_NAME = f"E2E BG FAIL {int(time.time())}"


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


def bg_state(item_id, token):
    rows = rest_get(
        f"/rest/v1/clothing_items?id=eq.{item_id}"
        "&select=background_removed_storage_path,background_removed_image_url,background_processed_at",
        token,
    )
    assert rows, f"item {item_id} desapareció"
    return rows[0]


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 844})
        page = await ctx.new_page()
        errors: list[str] = []
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))

        await login(page)

        # Crear una prenda mínima vía UI (sin depender de detección IA para
        # aislar el escenario de fallo del procesamiento de fondo).
        await page.goto(f"{BASE}/wardrobe/add", wait_until="networkidle")
        await page.locator('input[type="file"]').set_input_files(IMG_PATH)
        await expect(page.locator("form img").first).to_be_visible(timeout=5000)
        await page.get_by_label("Nombre").fill(ITEM_NAME)
        await page.get_by_role("button", name=re.compile("Guardar")).click()
        await page.wait_for_url("**/wardrobe", timeout=20000)
        await page.wait_for_load_state("networkidle")

        access_token = await page.evaluate(
            "() => { const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')); "
            "return k ? JSON.parse(localStorage.getItem(k)).access_token : null; }"
        )
        rows = rest_get(
            f"/rest/v1/clothing_items?name=eq.{urllib.parse.quote(ITEM_NAME)}&select=id&limit=1",
            access_token,
        )
        assert rows, f"item {ITEM_NAME!r} no encontrado en BD tras guardar"
        item_id = rows[0]["id"]
        print("item creado:", item_id)

        # Pre-check: estado de fondo debe estar totalmente vacío.
        pre = bg_state(item_id, access_token)
        assert pre == {
            "background_removed_storage_path": None,
            "background_removed_image_url": None,
            "background_processed_at": None,
        }, f"estado previo inesperado: {pre}"

        await page.goto(f"{BASE}/wardrobe/{item_id}", wait_until="networkidle")
        original_img = page.locator("main img").first
        await expect(original_img).to_be_visible(timeout=5000)
        assert (await original_img.get_attribute("data-view")) == "original"

        # --- Intercepción: forzamos que el POST al server fn de fondo falle
        # con 500. Cualquier otro `/_serverFn/*` en esta vista se deja pasar.
        intercepted: list[str] = []

        async def _fail_bg(route, request):
            url = request.url
            if request.method == "POST" and "/_serverFn/" in url and (
                "processBackground" in url or "process-background" in url or "process_background" in url
            ):
                intercepted.append(url)
                await route.fulfill(
                    status=500,
                    content_type="application/json",
                    body=json.dumps({
                        "error": {
                            "name": "BackgroundProcessError",
                            "code": "model_error",
                            "message": "Simulated backend failure (E2E)",
                        }
                    }),
                )
            else:
                await route.continue_()

        await page.route("**/_serverFn/**", _fail_bg)

        bg_btn = page.get_by_role("button", name=re.compile("Mejorar fondo|Reprocesar"))
        await expect(bg_btn).to_be_visible(timeout=5000)
        await bg_btn.click()

        # Esperamos a que la mutación termine (botón deja de estar en pending).
        # No debemos ver aparecer nunca <img data-view="clean">.
        deadline = time.time() + 15
        clean_seen = False
        while time.time() < deadline:
            if await page.locator('main img[data-view="clean"]').count() > 0:
                clean_seen = True
                break
            # El botón vuelve a habilitarse cuando la mutación resuelve.
            disabled = await bg_btn.is_disabled()
            if not disabled and len(intercepted) >= 1:
                break
            await page.wait_for_timeout(100)

        await page.screenshot(path=str(SCREENS / "1_after_failure.png"))

        assert intercepted, (
            "no se interceptó ninguna llamada al server fn de fondo — revisa "
            "el nombre del endpoint (processBackgroundFn)."
        )
        assert not clean_seen, (
            "apareció <img data-view=\"clean\"> pese al fallo del server fn — "
            "la UI no debe renderizar la variante 'sin fondo' si el procesado falló."
        )
        assert await page.locator('main img[data-view="clean"]').count() == 0, \
            "clean img presente en DOM tras fallo"

        # La vista debe seguir mostrando la original.
        assert (await page.locator("main img").first.get_attribute("data-view")) == "original", \
            "tras el fallo, la vista debe permanecer en 'original'"

        # --- Verificación de integridad en BD: los 3 campos siguen NULL.
        post_fail = bg_state(item_id, access_token)
        assert post_fail["background_removed_storage_path"] is None, (
            f"storage_path se escribió pese al fallo: {post_fail}"
        )
        assert post_fail["background_removed_image_url"] is None, (
            f"image_url se escribió pese al fallo (update parcial): {post_fail}"
        )
        assert post_fail["background_processed_at"] is None, (
            f"processed_at se marcó pese al fallo — un fallo NO debe marcar "
            f"la prenda como procesada: {post_fail}"
        )
        print("integridad BD tras fallo: los 3 campos siguen NULL (OK)")

        # --- Reintento tras retirar la intercepción: debe funcionar y poblar
        # los tres campos atómicamente. Así confirmamos que un fallo previo
        # no bloquea futuros intentos ni deja estado corrupto.
        await page.unroute("**/_serverFn/**")

        await bg_btn.click()
        await page.wait_for_function(
            "() => !!document.querySelector('main img[data-view=\"clean\"]')",
            timeout=25000,
        )
        post_ok = bg_state(item_id, access_token)
        assert post_ok["background_removed_storage_path"], f"reintento no persistió path: {post_ok}"
        assert post_ok["background_removed_image_url"], f"reintento no persistió image_url: {post_ok}"
        assert post_ok["background_processed_at"], f"reintento no marcó processed_at: {post_ok}"
        print("reintento tras fallo OK: estado atómico completo")

        # Limpieza
        await page.goto(f"{BASE}/wardrobe/{item_id}", wait_until="networkidle")
        await page.get_by_label("Eliminar").click()
        await page.wait_for_url("**/wardrobe", timeout=15000)

        if errors:
            noise = [e for e in errors if "Simulated backend failure" not in e]
            if noise:
                print("BROWSER ERRORS (non-fatal):")
                for e in noise[-20:]:
                    print(" -", e)

        await browser.close()

    print("OK: fallo de procesamiento de fondo sin corrupción de estado.")


asyncio.run(main())

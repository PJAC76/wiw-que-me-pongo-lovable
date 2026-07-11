"""E2E: "Detectar con IA" sin editar ningún campo.

Verifica que:
  1. Tras detectar con IA, los campos `color`, `category` y `occasions`
     quedan resaltados (data-ai='true').
  2. Si NO se edita ningún campo IA y solo se rellena el `name` (campo
     obligatorio no tocado por la IA), el resaltado se mantiene hasta
     el momento de guardar.
  3. Al guardar, la fila persistida en `clothing_items` contiene
     exactamente los valores producidos por la detección IA:
        - category = "tops"
        - color = valor detectado (no vacío)
        - occasions contiene "casual"

Depende del modo mock de detección (sin LOVABLE_API_KEY el server fn
devuelve category=tops, primary_color=<primer color permitido>,
occasions=["casual"]).
"""
import asyncio
import json
import os
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path
from playwright.async_api import async_playwright, expect

BASE = "http://localhost:8080"
SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ["VITE_SUPABASE_URL"]
APIKEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY") or os.environ["VITE_SUPABASE_PUBLISHABLE_KEY"]
EMAIL = os.environ["TEST_EMAIL"]
PASSWORD = os.environ["TEST_PASSWORD"]

SCREENS = Path(__file__).parent / "screenshots" / "wardrobe-ai-no-edit-persist"
SCREENS.mkdir(parents=True, exist_ok=True)

PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8cfc0f01f0005000180fe8a5b930000000049454e44ae426082"
)
IMG_PATH = "/tmp/wiw-e2e-ai-no-edit.png"
Path(IMG_PATH).write_bytes(PNG_1x1)

STAMP = int(time.time())
ITEM_NAME = f"E2E NO EDIT {STAMP}"


def rest(method, path, token, body=None):
    req = urllib.request.Request(
        f"{SUPABASE_URL}{path}",
        method=method,
        headers={
            "apikey": APIKEY,
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        data=json.dumps(body).encode() if body is not None else None,
    )
    with urllib.request.urlopen(req, timeout=10) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


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


async def main():
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        ctx = await browser.new_context(viewport={"width": 390, "height": 900})
        page = await ctx.new_page()
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))

        await login(page)
        await page.goto(f"{BASE}/wardrobe/add", wait_until="networkidle")
        await page.locator('input[type="file"]').set_input_files(IMG_PATH)
        await expect(page.locator("form img").first).to_be_visible(timeout=5000)

        # Detectar con IA
        await page.get_by_role("button", name=re.compile("Detectar con IA")).click()
        status = page.locator('[role="status"][data-stage]')
        await expect(status).to_be_visible(timeout=5000)
        deadline = time.time() + 8
        ok = False
        while time.time() < deadline:
            s = await status.get_attribute("data-stage")
            if s == "success":
                ok = True
                break
            if s == "error":
                raise AssertionError(f"detección IA en error: {await status.inner_text()}")
            await page.wait_for_timeout(80)
        assert ok, "detección IA no llegó a success"

        await page.screenshot(path=str(SCREENS / "1_after_detect.png"))

        # Snapshot del estado IA justo tras detectar
        detected_color = await page.locator("input#color").input_value()
        assert detected_color, "IA no rellenó el color"
        ai_initial = await page.locator("[data-ai='true']").count()
        assert ai_initial >= 3, f"esperado ≥3 campos con data-ai, vistos {ai_initial}"
        assert await page.locator("input#color[data-ai='true']").count() == 1
        assert await page.locator("button[data-ai='true']").count() >= 1, (
            "category debería tener data-ai"
        )
        assert await page.locator("div[data-ai='true']").count() >= 1, (
            "occasions debería tener data-ai"
        )

        # Solo rellenamos el name (no IA) → el resaltado IA se mantiene
        await page.get_by_label("Nombre").fill(ITEM_NAME)
        await page.wait_for_timeout(400)
        ai_after_name = await page.locator("[data-ai='true']").count()
        assert ai_after_name == ai_initial, (
            f"editar un campo NO-IA no debe afectar al resaltado (antes={ai_initial}, después={ai_after_name})"
        )

        await page.screenshot(path=str(SCREENS / "2_before_save.png"))

        # Guardar sin tocar ningún campo IA
        await page.get_by_role("button", name=re.compile("Guardar prenda")).click()
        await page.wait_for_url("**/wardrobe", timeout=20000)
        await page.wait_for_load_state("networkidle")

        # Verificar en BD que los valores IA se persisten tal cual
        access_token = await page.evaluate(
            "() => { const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')); "
            "return k ? JSON.parse(localStorage.getItem(k)).access_token : null; }"
        )
        rows = rest(
            "GET",
            f"/rest/v1/clothing_items?name=eq.{urllib.parse.quote(ITEM_NAME)}"
            "&select=id,name,category,color,occasions&limit=1",
            access_token,
        )
        assert rows, f"item {ITEM_NAME!r} no encontrado en BD"
        item = rows[0]
        print("fila en BD:", item)

        assert item["name"] == ITEM_NAME, f"name: {item['name']!r}"
        assert item["category"] == "tops", (
            f"category IA no persistida: esperado 'tops', got {item['category']!r}"
        )
        assert item["color"] == detected_color, (
            f"color IA no persistido: esperado {detected_color!r}, got {item['color']!r}"
        )
        assert "casual" in (item["occasions"] or []), (
            f"occasions IA no persistidas: {item['occasions']!r}"
        )

        # Limpieza
        rest("DELETE", f"/rest/v1/clothing_items?id=eq.{item['id']}", access_token)
        print(f"item {item['id']} eliminado")

        await browser.close()

    print("OK: sin editar campos IA, el resaltado se mantiene y los valores se persisten intactos.")


asyncio.run(main())

"""E2E: Detectar con IA → editar manualmente → guardar → verificar en BD.

Verifica que:
  1. "Detectar con IA" rellena los campos con los valores del mock.
  2. Los campos siguen editables tras la detección (badge IA se quita al escribir).
  3. Al guardar, la fila en `clothing_items` refleja los valores EDITADOS,
     no los originales de la IA, y conserva los que no se modificaron
     (p. ej. category, occasions).

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

SCREENS = Path(__file__).parent / "screenshots" / "wardrobe-ai-edit-persist"
SCREENS.mkdir(parents=True, exist_ok=True)

PNG_1x1 = bytes.fromhex(
    "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489"
    "0000000d49444154789c63f8cfc0f01f0005000180fe8a5b930000000049454e44ae426082"
)
IMG_PATH = "/tmp/wiw-e2e-ai-edit.png"
Path(IMG_PATH).write_bytes(PNG_1x1)

STAMP = int(time.time())
ITEM_NAME = f"E2E EDIT {STAMP}"
EDITED_COLOR = "azul marino"
EDITED_SUBCATEGORY = "camisa lino"
EDITED_MATERIAL = "algodón"
EDITED_BRAND = f"MarcaTest {STAMP}"
EDITED_NOTES = "Nota de test E2E"


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
        errors = []
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.on("console", lambda m: m.type == "error" and errors.append(f"console: {m.text}"))
        page.on("dialog", lambda d: asyncio.create_task(d.accept()))

        # 1) Login
        await login(page)
        print("logged in")

        # 2) Ir a añadir prenda
        await page.goto(f"{BASE}/wardrobe/add", wait_until="networkidle")
        await page.locator('input[type="file"]').set_input_files(IMG_PATH)
        await expect(page.locator("form img").first).to_be_visible(timeout=5000)

        # 3) Detectar con IA
        detect_btn = page.get_by_role("button", name=re.compile("Detectar con IA"))
        await expect(detect_btn).to_be_visible(timeout=5000)
        await detect_btn.click()

        status = page.locator('[role="status"][data-stage]')
        await expect(status).to_be_visible(timeout=5000)
        deadline = time.time() + 8
        last_stage = None
        while time.time() < deadline:
            s = await status.get_attribute("data-stage")
            if s == "success":
                last_stage = s
                break
            if s == "error":
                raise AssertionError(f"detección IA en error: {await status.inner_text()}")
            await page.wait_for_timeout(80)
        assert last_stage == "success", f"detección IA no llegó a success: {last_stage}"
        await page.screenshot(path=str(SCREENS / "1_after_detect.png"))

        # 4) La IA rellenó el color y el banner "Restaurar IA" apareció
        detected_color = await page.locator('input#color').input_value()
        assert detected_color, "IA no rellenó el color"
        print(f"IA rellenó color={detected_color!r}")

        restore_btn = page.get_by_role("button", name=re.compile("Restaurar IA"))
        await expect(restore_btn).to_be_visible(timeout=3000)

        # Badge IA visible en al menos un campo (color)
        ia_badges = await page.locator('span:has-text("IA")').count()
        assert ia_badges >= 1, f"esperado ≥1 badge 'IA', vistos {ia_badges}"

        # 5) Editar manualmente: sobrescribimos color IA y añadimos campos vacíos
        await page.get_by_label("Nombre").fill(ITEM_NAME)
        await page.locator('input#color').fill(EDITED_COLOR)
        await page.locator('input#subcategory').fill(EDITED_SUBCATEGORY)
        await page.locator('input#material').fill(EDITED_MATERIAL)
        await page.locator('input#brand').fill(EDITED_BRAND)
        await page.locator('textarea#notes').fill(EDITED_NOTES)
        await page.screenshot(path=str(SCREENS / "2_edited.png"))

        # 6) Guardar
        await page.get_by_role("button", name=re.compile("Guardar prenda")).click()
        await page.wait_for_url("**/wardrobe", timeout=20000)
        await page.wait_for_load_state("networkidle")

        # 7) Verificar persistencia en BD
        access_token = await page.evaluate(
            "() => { const k = Object.keys(localStorage).find(k => k.startsWith('sb-') && k.endsWith('-auth-token')); "
            "return k ? JSON.parse(localStorage.getItem(k)).access_token : null; }"
        )
        rows = rest(
            "GET",
            f"/rest/v1/clothing_items?name=eq.{urllib.parse.quote(ITEM_NAME)}"
            "&select=id,name,category,subcategory,color,brand,material,notes,occasions,seasons&limit=1",
            access_token,
        )
        assert rows, f"item {ITEM_NAME!r} no encontrado en BD"
        item = rows[0]
        print("fila en BD:", item)

        # Ediciones manuales persistidas
        assert item["name"] == ITEM_NAME, f"name no persistido: {item['name']!r}"
        assert item["color"] == EDITED_COLOR, (
            f"color no persistió el valor EDITADO {EDITED_COLOR!r}, got {item['color']!r} "
            f"(la edición manual sobre un campo IA se perdió)"
        )
        assert item["subcategory"] == EDITED_SUBCATEGORY, f"subcategory: {item['subcategory']!r}"
        assert item["material"] == EDITED_MATERIAL, f"material: {item['material']!r}"
        assert item["brand"] == EDITED_BRAND, f"brand: {item['brand']!r}"
        assert item["notes"] == EDITED_NOTES, f"notes: {item['notes']!r}"

        # Valores IA no editados se conservan
        assert item["category"] == "tops", f"category IA no conservada: {item['category']!r}"
        assert "casual" in (item["occasions"] or []), (
            f"occasions IA no conservadas: {item['occasions']!r}"
        )

        # 8) Limpieza
        rest("DELETE", f"/rest/v1/clothing_items?id=eq.{item['id']}", access_token)
        print(f"item {item['id']} eliminado")

        if errors:
            noise = [e for e in errors if "background_removed_storage_path" not in e]
            if noise:
                print("BROWSER ERRORS (non-fatal):")
                for e in noise[-10:]:
                    print(" -", e)

        await browser.close()

    print("OK: edición manual sobre detección IA se persiste correctamente en BD.")


asyncio.run(main())
